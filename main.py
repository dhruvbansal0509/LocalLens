import json
import math
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import io
import numpy as np
from PIL import Image, UnidentifiedImageError

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "locallens.db"

PRIMARY_OVERPASS = os.getenv(
    "OVERPASS_URL",
    "https://overpass-api.de/api/interpreter"
)
FALLBACK_OVERPASS = "https://overpass-api.de/api/interpreter"

SUPPORTED_RADII = {250, 500, 1000, 1500, 2000}

CORS(
    app,
    resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:8085",
                "http://127.0.0.1:8085",
            ]
        }
    },
)

# Categories with a direct OpenStreetMap tag mapping.
CATEGORY_TAG_RULES = {
    "food.caf": [("amenity", "cafe")],
    "food.bakery": [("shop", "bakery")],
    "food.restaurant": [("amenity", "restaurant")],
    "food.quick-service-restaurant": [("amenity", "fast_food")],
    "food.takeaway": [("amenity", "fast_food")],
    "food.tea-and-coffee-shop": [("amenity", "cafe")],
    "food.sweet-shop": [("shop", "confectionery")],
    "food.ice-cream-shop": [
        ("shop", "ice_cream"),
        ("amenity", "ice_cream"),
    ],
    "retail.clothing": [("shop", "clothes")],
    "retail.footwear": [("shop", "shoes")],
    "retail.grocery": [
        ("shop", "greengrocer"),
        ("shop", "supermarket"),
        ("shop", "convenience"),
    ],
    "retail.supermarket": [("shop", "supermarket")],
    "retail.convenience-store": [("shop", "convenience")],
    "retail.pharmacy": [
        ("shop", "chemist"),
        ("amenity", "pharmacy"),
    ],
    "retail.electronics": [("shop", "electronics")],
    "retail.mobile-shop": [("shop", "mobile_phone")],
    "retail.cosmetics": [("shop", "cosmetics")],
    "retail.furnishing": [("shop", "furniture")],
    "health.gym": [("leisure", "fitness_centre")],
    "health.yoga-studio": [("sport", "yoga")],
    "health.salon": [("shop", "hairdresser")],
    "health.spa": [("leisure", "spa")],
    "health.physiotherapy-centre": [
        ("healthcare", "physiotherapist")
    ],
    "health.diagnostics": [("healthcare", "laboratory")],
    "education.preschool": [("amenity", "kindergarten")],
    "education.daycare": [("amenity", "childcare")],
    "education.training-institute": [("amenity", "training")],
    "professional.coworking-space": [("office", "coworking")],
    "professional.consulting-office": [("office", "consulting")],
    "professional.marketing-agency": [
        ("office", "advertising_agency")
    ],
    "professional.accounting": [("office", "accountant")],
    "professional.real-estate": [("office", "estate_agent")],
    "professional.travel-office": [("shop", "travel_agency")],
    "neighbourhood.pet-care": [("shop", "pet")],
    "neighbourhood.laundry": [("shop", "laundry")],
    "neighbourhood.repair-shop": [("shop", "repair")],
    "neighbourhood.automobile-service": [("shop", "car_repair")],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_db():
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Database not found: {DB_PATH}. Run init_db.py first."
        )

    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def distance_m(lat1, lon1, lat2, lon2):
    """Calculate straight-line distance in metres using Haversine."""
    earth_radius = 6_371_000

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(delta_lambda / 2) ** 2
    )

    return 2 * earth_radius * math.asin(
        math.sqrt(min(1.0, a))
    )


def validate_coordinates(lat, lon):
    if not math.isfinite(lat) or not math.isfinite(lon):
        raise ValueError("Coordinates must be finite numbers.")

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Coordinates are out of range.")


def category_matches(category_id, tags):
    return any(
        tags.get(key) == value
        for key, value in CATEGORY_TAG_RULES.get(category_id, [])
    )


def is_transport(tags):
    return bool(
        tags.get("public_transport")
        or tags.get("railway") in {
            "station", "halt", "tram_stop"
        }
        or tags.get("highway") == "bus_stop"
    )


def is_amenity(tags):
    return any(
        key in tags
        for key in (
            "amenity",
            "healthcare",
            "leisure",
            "education",
            "sport",
        )
    )


def classify_place(tags, category_id=None):
    if category_id and category_matches(category_id, tags):
        return "competitor"

    if is_transport(tags):
        return "transport"

    if is_amenity(tags):
        return "amenity"

    return "business"


def general_place_kind(tags):
    """Category-independent type stored in SQLite."""
    if is_transport(tags):
        return "transport"

    if is_amenity(tags):
        return "amenity"

    return "business"


def osm_category(tags):
    for key in (
        "shop",
        "amenity",
        "office",
        "craft",
        "healthcare",
        "leisure",
        "public_transport",
        "railway",
        "highway",
        "tourism",
        "sport",
        "education",
    ):
        if key in tags:
            return f"{key}={tags[key]}"

    return "other"


def build_overpass_query(lat, lon, radius):
    """Build a bounded query for named geographic points."""
    selectors = [
        '["shop"]["name"]',
        '["amenity"]["name"]',
        '["office"]["name"]',
        '["craft"]["name"]',
        '["healthcare"]["name"]',
        '["leisure"]["name"]',
        '["public_transport"]["name"]',
        '["railway"]["name"]',
        '["highway"="bus_stop"]["name"]',
        '["tourism"]["name"]',
        '["sport"]["name"]',
        '["education"]["name"]',
    ]

    clauses = [
        f"nwr(around:{radius},{lat},{lon}){selector};"
        for selector in selectors
    ]

    return (
        "[out:json][timeout:30];\n(\n"
        + "\n".join(clauses)
        + "\n);\nout center tags;"
    )


class ApiProblem(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiProblem)
def handle_api_problem(error):
    return jsonify({"error": error.message}), error.status


def fetch_places(lat, lon, radius, category_id=None):
    """
    Query Overpass with a fallback for temporary server errors.

    HTTP 429 is respected: we do not switch endpoints to bypass
    a provider's rate limit.
    """
    query = build_overpass_query(lat, lon, radius)

    endpoints = [PRIMARY_OVERPASS]

    if FALLBACK_OVERPASS.rstrip("/") != PRIMARY_OVERPASS.rstrip("/"):
        endpoints.append(FALLBACK_OVERPASS)

    response = None
    last_error = None

    for index, endpoint in enumerate(endpoints):
        try:
            candidate = requests.post(
                endpoint,
                data={"data": query},
                headers={
                    "User-Agent": (
                        "LocalLens-Academic/1.0 "
                        "(local student project)"
                    ),
                    "Accept": "application/json",
                },
                timeout=(5, 45),
            )

        except requests.Timeout:
            app.logger.warning(
                "Overpass endpoint timed out: %s", endpoint
            )
            last_error = ApiProblem(
                504, "Geographic data request timed out."
            )

            if index + 1 < len(endpoints):
                continue

            raise last_error

        except requests.RequestException:
            app.logger.exception(
                "Overpass connection failed: %s", endpoint
            )
            last_error = ApiProblem(
                503, "Geographic data service is unreachable."
            )

            if index + 1 < len(endpoints):
                continue

            raise last_error

        if candidate.status_code == 429:
            app.logger.warning(
                "Overpass rate limit reached at %s", endpoint
            )
            raise ApiProblem(
                429,
                "Geographic data is rate-limited. "
                "Wait before trying again."
            )

        if candidate.status_code >= 500:
            app.logger.warning(
                "Overpass endpoint %s returned HTTP %s: %s",
                endpoint,
                candidate.status_code,
                candidate.text[:250].replace("\n", " "),
            )

            last_error = ApiProblem(
                503,
                "Geographic data service is temporarily unavailable."
            )

            if index + 1 < len(endpoints):
                continue

            raise last_error

        if not candidate.ok:
            app.logger.warning(
                "Overpass rejected query: HTTP %s: %s",
                candidate.status_code,
                candidate.text[:250].replace("\n", " "),
            )
            raise ApiProblem(
                502,
                f"Geographic provider rejected the query "
                f"(HTTP {candidate.status_code}). "
                "Check the PyCharm terminal for details."
            )

        response = candidate
        break

    if response is None:
        raise last_error or ApiProblem(
            503, "Geographic data service is unavailable."
        )

    try:
        elements = response.json()["elements"]
    except (ValueError, KeyError, TypeError) as exc:
        app.logger.warning(
            "Overpass returned invalid JSON: %s",
            response.text[:250],
        )
        raise ApiProblem(
            502, "Geographic data response was invalid."
        ) from exc

    retrieved_at = now_iso()
    by_source_id = {}

    for element in elements:
        tags = element.get("tags") or {}
        center = element.get("center") or {}

        item_lat = element.get("lat", center.get("lat"))
        item_lon = element.get("lon", center.get("lon"))

        if item_lat is None or item_lon is None:
            continue

        try:
            item_lat = float(item_lat)
            item_lon = float(item_lon)
            validate_coordinates(item_lat, item_lon)
        except (ValueError, TypeError):
            continue

        distance = distance_m(
            lat, lon, item_lat, item_lon
        )

        if distance > radius:
            continue

        source_id = (
            f"{element.get('type', 'unknown')}/"
            f"{element.get('id', '')}"
        )

        if source_id.endswith("/"):
            continue

        name = (
            tags.get("name")
            or tags.get("name:en")
            or tags.get("brand")
        )

        by_source_id[source_id] = {
            "id": source_id,
            "source": "openstreetmap",
            "source_id": source_id,
            "name": name,
            "kind": classify_place(tags, category_id),
            "category": osm_category(tags),
            "lat": item_lat,
            "lon": item_lon,
            "distance_m": round(distance),
            "_stored_kind": general_place_kind(tags),
        }

    ordered = sorted(
        by_source_id.values(),
        key=lambda item: item["distance_m"],
    )

    truncated = len(ordered) > 500

    return ordered[:500], retrieved_at, truncated


def save_places(places, retrieved_at):
    with closing(get_db()) as conn:
        conn.executemany(
            """
            INSERT INTO places
                (source, source_id, name, kind, category,
                 latitude, longitude, last_imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, source_id) DO UPDATE SET
                name = excluded.name,
                kind = excluded.kind,
                category = excluded.category,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                last_imported_at = excluded.last_imported_at
            """,
            [
                (
                    "openstreetmap",
                    place["source_id"],
                    place["name"],
                    place["_stored_kind"],
                    place["category"],
                    place["lat"],
                    place["lon"],
                    retrieved_at,
                )
                for place in places
            ],
        )

        conn.commit()


def public_place(place):
    return {
        key: value
        for key, value in place.items()
        if not key.startswith("_")
    }


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "version": "1.0.0",
        "time": now_iso(),
    })


@app.get("/api/categories")
def categories():
    try:
        with closing(get_db()) as conn:
            rows = conn.execute(
                """
                SELECT id, label, group_name, description
                FROM business_categories
                WHERE is_active = 1
                ORDER BY group_name, label
                """
            ).fetchall()

        return jsonify({
            "categories": [
                {
                    "id": row["id"],
                    "label": row["label"],
                    "group": row["group_name"],
                    "description": row["description"],
                }
                for row in rows
            ]
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Category lookup failed")
        return jsonify({
            "error": "Could not retrieve categories."
        }), 500


@app.get("/api/places")
def places_endpoint():
    try:
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
        radius = int(request.args.get("radius", "500"))

    except (KeyError, TypeError, ValueError):
        return jsonify({
            "error": "Provide valid lat, lon and radius parameters."
        }), 400

    try:
        validate_coordinates(lat, lon)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if radius not in SUPPORTED_RADII:
        return jsonify({
            "error": "Unsupported search radius."
        }), 400

    category_id = request.args.get("category", "").strip() or None

    if category_id:
        try:
            with closing(get_db()) as conn:
                row = conn.execute(
                    """
                    SELECT 1
                    FROM business_categories
                    WHERE id = ? AND is_active = 1
                    """,
                    (category_id,),
                ).fetchone()

            if not row:
                return jsonify({
                    "error": "Unknown business category."
                }), 400

        except (sqlite3.Error, FileNotFoundError):
            app.logger.exception("Category validation failed")
            return jsonify({
                "error": "Could not validate the business category."
            }), 500

    try:
        found_places, retrieved_at, truncated = fetch_places(
            lat, lon, radius, category_id
        )
        save_places(found_places, retrieved_at)

    except ApiProblem as exc:
        return jsonify({"error": exc.message}), exc.status

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not save geographic records")
        return jsonify({
            "error": "Places were retrieved but could not be saved locally."
        }), 500

    return jsonify({
        "places": [
            public_place(place) for place in found_places
        ],
        "source": {
            "name": "OpenStreetMap / Overpass API",
            "attribution": "© OpenStreetMap contributors",
            "url": "https://www.openstreetmap.org/copyright",
            "retrieved_at": retrieved_at,
            "granularity": "Mapped points of interest",
        },
        "truncated": truncated,
    })


def calculate_component_scores(
    competitor_count,
    amenity_count,
    transport_count,
    competition_preference,
    category_supported,
):
    if competition_preference == "avoid":
        competition_value = max(
            0, 100 - 15 * competitor_count
        )
        competition_explanation = (
            f"{competitor_count} mapped category matches found. "
            "Fewer matches score higher under the avoid-competition preference."
        )

    elif competition_preference == "cluster":
        competition_value = min(
            100, 15 * competitor_count
        )
        competition_explanation = (
            f"{competitor_count} mapped category matches found. "
            "More matches score higher under the clustering preference."
        )

    else:
        competition_value = max(
            0, 100 - 15 * abs(competitor_count - 3)
        )
        competition_explanation = (
            f"{competitor_count} mapped category matches found. "
            "This initial neutral heuristic favours a moderate mapped cluster."
        )

    return [
        {
            "key": "competition",
            "label": "Competition fit",
            "available": category_supported,
            "default_weight": 30,
            "applied_weight": None,
            "value": (
                round(competition_value, 1)
                if category_supported else None
            ),
            "explanation": (
                competition_explanation
                if category_supported
                else (
                    "No direct OpenStreetMap category mapping is configured."
                )
            ),
        },
        {
            "key": "amenities",
            "label": "Amenities and business ecosystem",
            "available": True,
            "default_weight": 25,
            "applied_weight": None,
            "value": round(min(100, amenity_count * 5), 1),
            "explanation": (
                f"{amenity_count} mapped amenity points found. "
                "This prototype assigns five points per mapped amenity, "
                "capped at 100. It is not a validated measure."
            ),
        },
        {
            "key": "accessibility",
            "label": "Accessibility",
            "available": True,
            "default_weight": 25,
            "applied_weight": None,
            "value": round(min(100, transport_count * 20), 1),
            "explanation": (
                f"{transport_count} mapped transport points found. "
                "This is a proximity proxy, not route time or service quality."
            ),
        },
        {
            "key": "demographics",
            "label": "Demographic suitability",
            "available": False,
            "default_weight": 20,
            "applied_weight": None,
            "value": None,
            "explanation": (
                "No suitable demographic dataset has been imported. "
                "This component is excluded."
            ),
        },
    ]


@app.post("/api/analyze")
def analyze_location():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON request body is required."
        }), 400

    category_id = str(data.get("category_id", "")).strip()
    location = data.get("location")
    preferences = data.get("preferences") or {}

    if not category_id or not isinstance(location, dict):
        return jsonify({
            "error": "category_id and location are required."
        }), 400

    if not isinstance(preferences, dict):
        return jsonify({
            "error": "preferences must be an object."
        }), 400

    try:
        lat = float(location["lat"])
        lon = float(location["lon"])
        radius = int(data["radius_m"])
        validate_coordinates(lat, lon)

    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({
            "error": str(exc) or "Invalid location or radius."
        }), 400

    if radius not in SUPPORTED_RADII:
        return jsonify({
            "error": "Unsupported search radius."
        }), 400

    competition_preference = preferences.get(
        "competition", "neutral"
    )

    if competition_preference not in {
        "avoid", "neutral", "cluster"
    }:
        return jsonify({
            "error": "Invalid competition preference."
        }), 400

    label = str(location.get("label") or "").strip()

    if not label:
        return jsonify({
            "error": "A selected location label is required."
        }), 400

    custom_description = data.get("custom_description")

    try:
        with closing(get_db()) as conn:
            category = conn.execute(
                """
                SELECT id, label
                FROM business_categories
                WHERE id = ? AND is_active = 1
                """,
                (category_id,),
            ).fetchone()

        if not category:
            return jsonify({
                "error": "Unknown business category."
            }), 400

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Category validation failed")
        return jsonify({
            "error": "Could not validate the business category."
        }), 500

    try:
        found_places, retrieved_at, truncated = fetch_places(
            lat, lon, radius, category_id
        )
        save_places(found_places, retrieved_at)

    except ApiProblem as exc:
        return jsonify({"error": exc.message}), exc.status

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not save geographic records")
        return jsonify({
            "error": "Could not save geographic data locally."
        }), 500

    competitors = sum(
        p["kind"] == "competitor" for p in found_places
    )
    amenities = sum(
        p["kind"] == "amenity" for p in found_places
    )
    transport = sum(
        p["kind"] == "transport" for p in found_places
    )

    category_supported = category_id in CATEGORY_TAG_RULES

    components = calculate_component_scores(
        competitors,
        amenities,
        transport,
        competition_preference,
        category_supported,
    )

    available_components = [
        component for component in components
        if component["available"]
    ]

    available_weight = sum(
        component["default_weight"]
        for component in available_components
    )

    # Conservative prototype rule: do not score a sparse response.
    if (
        len(found_places) >= 5
        and len(available_components) >= 2
        and available_weight > 0
    ):
        total_score = 0.0

        for component in available_components:
            weight = (
                component["default_weight"]
                / available_weight * 100
            )
            component["applied_weight"] = round(weight, 2)
            total_score += (
                float(component["value"]) * weight / 100
            )

        score = {
            "status": "scored",
            "value": round(total_score, 1),
            "components": components,
            "renormalised": available_weight != 100,
            "method": (
                "Initial heuristic based on mapped competitor matches, "
                "amenities and transport points. Missing indicators are "
                "excluded and remaining weights renormalised. "
                "Not a validated business-success predictor."
            ),
        }

    else:
        score = {
            "status": "insufficient_data",
            "reason": (
                "This prototype requires at least five mapped places "
                "and two supported components before showing a score. "
                "Mapped coverage may still be incomplete."
            ),
            "components": components,
        }

    coverage_level = (
        "good" if len(found_places) >= 40
        else "partial" if len(found_places) >= 10
        else "limited" if len(found_places) >= 1
        else "insufficient"
    )

    coverage = {
        "level": coverage_level,
        "available": ["OpenStreetMap mapped places"],
        "missing": ["Suitable demographic data"],
        "note": (
            "This reflects the amount of mapped evidence returned, "
            "not the completeness of all businesses in the area."
        ),
    }

    if category_supported:
        coverage["available"].append(
            "Configured category-specific tag matching"
        )
    else:
        coverage["missing"].append(
            "Category-specific competitor mapping"
        )

    transport_distances = [
        place["distance_m"]
        for place in found_places
        if place["kind"] == "transport"
    ]

    public_places = [
        public_place(place) for place in found_places
    ]

    result = {
        "id": str(uuid.uuid4()),
        "created_at": retrieved_at,
        "category": {
            "id": category["id"],
            "label": category["label"],
        },
        "custom_description": custom_description,
        "location": {
            "label": label,
            "lat": lat,
            "lon": lon,
        },
        "radius_m": radius,
        "counts": {
            "competitors": competitors,
            "amenities": amenities,
            "transport": transport,
            "total": len(public_places),
        },
        "places": public_places,
        "accessibility": [
            {
                "key": "transport_count",
                "label": "Mapped transport points",
                "value": transport,
                "unit": "points",
                "source": "OpenStreetMap",
                "note": "Counts mapped objects within the radius only.",
            },
            {
                "key": "nearest_transport_distance",
                "label": "Nearest mapped transport point",
                "value": (
                    min(transport_distances)
                    if transport_distances else None
                ),
                "unit": "m",
                "source": "OpenStreetMap",
                "note": (
                    "Straight-line distance, not walking or driving distance."
                ),
            },
        ],
        "demographics": [],
        "coverage": coverage,
        "score": score,
        "sources": [{
            "name": "OpenStreetMap / Overpass API",
            "attribution": "© OpenStreetMap contributors",
            "url": "https://www.openstreetmap.org/copyright",
            "retrieved_at": retrieved_at,
            "granularity": (
                "Mapped points of interest within selected radius"
            ),
        }],
        "warnings": [
            "OpenStreetMap records may be incomplete or outdated.",
            "Zero mapped matches does not prove no businesses exist.",
            "No suitable demographic dataset has been imported.",
            "Scores are prototype heuristics, not validated predictors.",
            *(
                ["No mapped places were returned for this query."]
                if not public_places else []
            ),
            *(
                ["Category-specific competitor matching is not configured."]
                if not category_supported else []
            ),
            *(
                ["Results were capped at 500 places."]
                if truncated else []
            ),
        ],
    }

    try:
        with closing(get_db()) as conn:
            conn.execute(
                """
                INSERT INTO analyses
                    (id, category_id, custom_description,
                     location_label, latitude, longitude, radius_m,
                     result_json, score, coverage, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result["id"],
                    category_id,
                    custom_description,
                    label,
                    lat,
                    lon,
                    radius,
                    json.dumps(result, ensure_ascii=False),
                    (
                        score["value"]
                        if score["status"] == "scored"
                        else None
                    ),
                    coverage["level"],
                    retrieved_at,
                ),
            )
            conn.commit()

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not persist analysis")
        return jsonify({
            "error": "The analysis could not be saved locally."
        }), 500

    return jsonify(result)

def report_summary(row):
    return {
        "id": row["id"],
        "kind": row["kind"],
        "title": row["title"],
        "category_label": row["category_label"],
        "location_label": row["location_label"],
        "created_at": row["created_at"],
        "score": row["score"],
        "coverage": row["coverage"],
    }


def get_analysis_summary(analysis):
    category = analysis.get("category") or {}
    location = analysis.get("location") or {}
    score_data = analysis.get("score") or {}
    coverage_data = analysis.get("coverage") or {}

    numeric_score = (
        score_data.get("value")
        if score_data.get("status") == "scored"
        else None
    )

    return {
        "category_label": category.get("label") or "Unknown category",
        "location_label": location.get("label") or "Unknown location",
        "score": numeric_score,
        "coverage": coverage_data.get("level") or "insufficient",
    }


def create_report_record(kind, title, analyses):
    if kind not in {"analysis", "comparison"}:
        raise ValueError("kind must be 'analysis' or 'comparison'.")

    if not isinstance(analyses, list) or not analyses:
        raise ValueError("At least one analysis is required.")

    if kind == "analysis" and len(analyses) != 1:
        raise ValueError("An analysis report requires exactly one analysis.")

    if kind == "comparison" and not 2 <= len(analyses) <= 3:
        raise ValueError("A comparison requires two or three analyses.")

    for item in analyses:
        if not isinstance(item, dict):
            raise ValueError("Each analysis must be a JSON object.")
        if not isinstance(item.get("category"), dict):
            raise ValueError("An analysis is missing its category.")
        if not isinstance(item.get("location"), dict):
            raise ValueError("An analysis is missing its location.")

    summaries = [get_analysis_summary(item) for item in analyses]

    if kind == "analysis":
        category_label = summaries[0]["category_label"]
        location_label = summaries[0]["location_label"]
        numeric_score = summaries[0]["score"]
        coverage = summaries[0]["coverage"]
    else:
        category_label = (
            summaries[0]["category_label"]
            if all(
                s["category_label"] == summaries[0]["category_label"]
                for s in summaries
            )
            else "Multiple business categories"
        )
        location_label = " vs. ".join(
            s["location_label"] for s in summaries
        )
        # Do not average unrelated location scores into a misleading
        # overall comparison score.
        numeric_score = None

        coverage_order = {
            "good": 0,
            "partial": 1,
            "limited": 2,
            "insufficient": 3,
        }
        coverage = max(
            (s["coverage"] for s in summaries),
            key=lambda value: coverage_order.get(value, 3),
        )

    report_id = str(uuid.uuid4())
    created_at = now_iso()
    clean_title = str(title or "").strip()

    if not clean_title:
        clean_title = (
            f"{category_label} analysis"
            if kind == "analysis"
            else f"Comparison of {len(analyses)} locations"
        )

    with closing(get_db()) as conn:
        conn.execute(
            """
            INSERT INTO reports
                (id, kind, title, category_label, location_label,
                 score, coverage, analyses_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                kind,
                clean_title,
                category_label,
                location_label,
                numeric_score,
                coverage,
                json.dumps(analyses, ensure_ascii=False),
                created_at,
            ),
        )
        conn.commit()

    return report_id


@app.get("/api/reports")
def list_reports():
    try:
        with closing(get_db()) as conn:
            rows = conn.execute(
                """
                SELECT id, kind, title, category_label, location_label,
                       created_at, score, coverage
                FROM reports
                ORDER BY created_at DESC
                """
            ).fetchall()

        return jsonify({
            "reports": [report_summary(row) for row in rows]
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not list reports")
        return jsonify({"error": "Could not retrieve saved reports."}), 500


@app.get("/api/reports/<report_id>")
def get_report(report_id):
    try:
        with closing(get_db()) as conn:
            row = conn.execute(
                """
                SELECT id, kind, title, category_label, location_label,
                       created_at, score, coverage, analyses_json
                FROM reports
                WHERE id = ?
                """,
                (report_id,),
            ).fetchone()

        if not row:
            return jsonify({"error": "Report not found."}), 404

        result = report_summary(row)

        try:
            result["analyses"] = json.loads(row["analyses_json"])
        except (ValueError, TypeError):
            app.logger.exception("Invalid saved report JSON")
            return jsonify({"error": "The saved report data is invalid."}), 500

        return jsonify(result)

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not retrieve report")
        return jsonify({"error": "Could not retrieve the report."}), 500


@app.post("/api/reports")
def save_report():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON request body is required."}), 400

    kind = data.get("kind")
    title = data.get("title", "")
    analyses = data.get("analyses")

    try:
        report_id = create_report_record(kind, title, analyses)
        return jsonify({"id": report_id}), 201

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not save report")
        return jsonify({"error": "Could not save the report."}), 500


@app.delete("/api/reports/<report_id>")
def delete_report(report_id):
    try:
        with closing(get_db()) as conn:
            cursor = conn.execute(
                "DELETE FROM reports WHERE id = ?",
                (report_id,),
            )
            conn.commit()

        if cursor.rowcount == 0:
            return jsonify({"error": "Report not found."}), 404

        return "", 204

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not delete report")
        return jsonify({"error": "Could not delete the report."}), 500


@app.post("/api/compare")
def compare_locations():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A JSON request body is required."}), 400

    analyses = data.get("analyses")
    title = data.get("title", "")

    try:
        if not isinstance(analyses, list) or not 2 <= len(analyses) <= 3:
            raise ValueError("Select two or three analyses to compare.")

        for item in analyses:
            if not isinstance(item, dict):
                raise ValueError("Each analysis must be a JSON object.")

        notes = []

        category_labels = {
            (item.get("category") or {}).get("label")
            for item in analyses
        }
        if len(category_labels) > 1:
            notes.append(
                "The locations use different business categories. "
                "Their scores should not be ranked as directly comparable."
            )

        locations = [
            (item.get("location") or {}).get("label", "Unknown location")
            for item in analyses
        ]
        if len(set(locations)) > 1:
            notes.append(
                "Mapped-data coverage may differ between locations."
            )

        for index, item in enumerate(analyses, start=1):
            coverage_data = item.get("coverage") or {}
            score_data = item.get("score") or {}

            if score_data.get("status") != "scored":
                notes.append(
                    f"Location {index} does not have a numeric Location Fit Score."
                )

            if coverage_data.get("level") in {"limited", "insufficient"}:
                notes.append(
                    f"Location {index} has limited geographic data coverage."
                )

            if item.get("demographics") == []:
                notes.append(
                    f"Location {index} has no demographic indicators."
                )

        report_id = create_report_record(
            "comparison",
            title,
            analyses,
        )

        return jsonify({
            "report_id": report_id,
            "comparability_notes": notes,
        }), 201

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not compare locations")
        return jsonify({"error": "Could not save the comparison."}), 500


@app.get("/api/dashboard")
def dashboard():
    try:
        with closing(get_db()) as conn:
            recent_rows = conn.execute(
                """
                SELECT id, kind, title, category_label, location_label,
                       created_at, score, coverage
                FROM reports
                ORDER BY created_at DESC
                LIMIT 10
                """
            ).fetchall()

            analysis_count = conn.execute(
                "SELECT COUNT(*) FROM analyses"
            ).fetchone()[0]

            comparison_count = conn.execute(
                "SELECT COUNT(*) FROM reports WHERE kind = 'comparison'"
            ).fetchone()[0]

        return jsonify({
            "recent": [report_summary(row) for row in recent_rows],
            "totals": {
                "analyses": analysis_count,
                "comparisons": comparison_count,
            },
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Could not load dashboard")
        return jsonify({"error": "Could not load the dashboard."}), 500

import importlib.util


def check_local_models():
    hf_model_id = "sentence-transformers/all-MiniLM-L6-v2"
    hf_cache = (
        Path.home()
        / ".cache"
        / "huggingface"
        / "hub"
        / "models--sentence-transformers--all-MiniLM-L6-v2"
    )

    hf_installed = (
        importlib.util.find_spec("sentence_transformers") is not None
    )

    yolo_installed = (
        importlib.util.find_spec("ultralytics") is not None
    )

    yolo_paths = [
        BASE_DIR / "yolo11n.pt",
        Path.home() / ".cache" / "ultralytics" / "yolo11n.pt",
    ]
    yolo_weights_exist = any(path.exists() for path in yolo_paths)

    hf_ready = hf_installed and hf_cache.exists()
    yolo_ready = yolo_installed and yolo_weights_exist

    return [
        {
            "name": hf_model_id,
            "purpose": "Suggest business categories from text descriptions",
            "state": (
                "available" if hf_ready else "not_downloaded"
            ),
            "detail": (
                "Package and model cache detected."
                if hf_ready
                else (
                    "Local package or model cache is missing. "
                    "The model has not been verified for inference."
                )
            ),
        },
        {
            "name": "Ultralytics YOLO11n",
            "purpose": "Detect supported objects in a site photograph",
            "state": (
                "available" if yolo_ready else "not_downloaded"
            ),
            "detail": (
                "Package and model weights detected."
                if yolo_ready
                else (
                    "Local package or model weights are missing. "
                    "Inference has not been verified."
                )
            ),
        },
    ]


def latest_saved_place_timestamp():
    try:
        with closing(get_db()) as conn:
            row = conn.execute(
                "SELECT MAX(last_imported_at) FROM places"
            ).fetchone()
            return row[0] if row else None
    except (sqlite3.Error, FileNotFoundError):
        return None


@app.get("/api/status")
def application_status():
    checked_at = now_iso()
    last_import = latest_saved_place_timestamp()

    if not PRIMARY_OVERPASS:
        geo_state = "not_configured"
        geo_detail = "No geographic data endpoint is configured."
    elif last_import:
        geo_state = "available"
        geo_detail = (
            "Previous geographic records are saved locally. "
            "Current provider availability is checked during live requests."
        )
    else:
        geo_state = "unavailable"
        geo_detail = (
            "The endpoint is configured, but no successful saved "
            "geographic retrieval has been recorded in this database."
        )

    return jsonify({
        "geographic_data": {
            "state": geo_state,
            "detail": geo_detail,
            "last_checked": last_import or checked_at,
        },
        "demographic_datasets": [],
        "models": check_local_models(),
        "sources": [
            {
                "name": "OpenStreetMap / Overpass API",
                "attribution": "© OpenStreetMap contributors",
                "url": "https://www.openstreetmap.org/copyright",
                "retrieved_at": last_import,
                "granularity": "Mapped points of interest",
            }
        ],
    })


@app.get("/api/admin/summary")
def admin_summary():
    try:
        with closing(get_db()) as conn:
            counts = {
                "analyses": conn.execute(
                    "SELECT COUNT(*) FROM analyses"
                ).fetchone()[0],
                "reports": conn.execute(
                    "SELECT COUNT(*) FROM reports"
                ).fetchone()[0],
                "comparisons": conn.execute(
                    "SELECT COUNT(*) FROM reports WHERE kind = 'comparison'"
                ).fetchone()[0],
                "places": conn.execute(
                    "SELECT COUNT(*) FROM places"
                ).fetchone()[0],
                "categories": conn.execute(
                    "SELECT COUNT(*) FROM business_categories"
                ).fetchone()[0],
                "imports": conn.execute(
                    "SELECT COUNT(*) FROM data_import_logs"
                ).fetchone()[0],
                "errors": conn.execute(
                    "SELECT COUNT(*) FROM api_logs"
                ).fetchone()[0],
            }

            analysis_rows = conn.execute(
                """
                SELECT a.id, a.location_label, a.created_at, a.score,
                       a.coverage, c.label AS category_label
                FROM analyses a
                LEFT JOIN business_categories c
                    ON c.id = a.category_id
                ORDER BY a.created_at DESC
                LIMIT 10
                """
            ).fetchall()

            report_rows = conn.execute(
                """
                SELECT id, kind, title, category_label, location_label,
                       created_at, score, coverage
                FROM reports
                ORDER BY created_at DESC
                LIMIT 10
                """
            ).fetchall()

        recent_analyses = [
            {
                "id": row["id"],
                "kind": "analysis",
                "title": (
                    f'{row["category_label"] or "Analysis"} '
                    f'in {row["location_label"]}'
                ),
                "category_label": row["category_label"] or "Unknown",
                "location_label": row["location_label"],
                "created_at": row["created_at"],
                "score": row["score"],
                "coverage": row["coverage"],
            }
            for row in analysis_rows
        ]

        recent_reports = [
            report_summary(row) for row in report_rows
        ]

        last_import = latest_saved_place_timestamp()

        return jsonify({
            "counts": counts,
            "recent_analyses": recent_analyses,
            "recent_reports": recent_reports,
            "geo_health": {
                "state": (
                    "available" if last_import else "unavailable"
                ),
                "detail": (
                    "Previously retrieved geographic records exist."
                    if last_import
                    else "No successful geographic retrieval is recorded."
                ),
                "checked_at": last_import or now_iso(),
            },
            "models": check_local_models(),
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Admin summary query failed")
        return jsonify({
            "error": "Could not load administration summary."
        }), 500


@app.get("/api/admin/imports")
def admin_imports():
    try:
        with closing(get_db()) as conn:
            rows = conn.execute(
                """
                SELECT id, dataset, rows, status, started_at,
                       finished_at, message
                FROM data_import_logs
                ORDER BY id DESC
                LIMIT 100
                """
            ).fetchall()

        return jsonify({
            "imports": [dict(row) for row in rows]
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Admin import log query failed")
        return jsonify({
            "error": "Could not retrieve import history."
        }), 500


@app.get("/api/admin/errors")
def admin_errors():
    try:
        with closing(get_db()) as conn:
            rows = conn.execute(
                """
                SELECT id, endpoint, status, message, created_at
                FROM api_logs
                ORDER BY id DESC
                LIMIT 100
                """
            ).fetchall()

        return jsonify({
            "errors": [dict(row) for row in rows]
        })

    except (sqlite3.Error, FileNotFoundError):
        app.logger.exception("Admin error log query failed")
        return jsonify({
            "error": "Could not retrieve API error history."
        }), 500

# --------------------------------------------------
# Hugging Face: business category interpretation
# --------------------------------------------------

HF_MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"

_hf_model = None


def get_hf_model():
    """Load the public Hugging Face model once, on first use."""
    global _hf_model

    if _hf_model is None:
        from sentence_transformers import SentenceTransformer

        app.logger.info("Loading Hugging Face model: %s", HF_MODEL_ID)

        _hf_model = SentenceTransformer(
            HF_MODEL_ID,
            device="cpu",
        )

        app.logger.info("Hugging Face model loaded successfully.")

    return _hf_model


@app.post("/api/interpret-business")
def interpret_business():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON request body is required."
        }), 400

    description = data.get("description")

    if not isinstance(description, str):
        return jsonify({
            "error": "Provide a business description."
        }), 400

    description = description.strip()

    if len(description) < 3:
        return jsonify({
            "error": "Please enter a longer business description."
        }), 400

    if len(description) > 500:
        return jsonify({
            "error": "Business descriptions must be 500 characters or fewer."
        }), 400

    try:
        # Retrieve the actual categories from SQLite.
        with closing(get_db()) as conn:
            rows = conn.execute(
                """
                SELECT id, label, group_name, description
                FROM business_categories
                WHERE is_active = 1
                  AND id != 'custom'
                ORDER BY id
                """
            ).fetchall()

        if not rows:
            return jsonify({
                "error": "No business categories are available."
            }), 503

        model = get_hf_model()

        # Give the model meaningful category context.
        category_texts = [
            (
                f"Business category: {row['label']}. "
                f"Sector: {row['group_name']}. "
                f"{row['description'] or ''}"
            )
            for row in rows
        ]

        # Generate embeddings locally on the computer.
        query_embedding = model.encode(
            description,
            convert_to_tensor=True,
            normalize_embeddings=True,
        )

        category_embeddings = model.encode(
            category_texts,
            convert_to_tensor=True,
            normalize_embeddings=True,
        )

        # Normalised embeddings make their dot product
        # equivalent to cosine similarity.
        similarities = (
            category_embeddings @ query_embedding
        ).detach().cpu().tolist()

        ranked = sorted(
            zip(rows, similarities),
            key=lambda item: item[1],
            reverse=True,
        )[:3]

        suggestions = [
            {
                "category_id": row["id"],
                "label": row["label"],
                "similarity": round(float(similarity), 4),
            }
            for row, similarity in ranked
        ]

        return jsonify({
            "suggestions": suggestions,
            "explanation": (
                "These categories were ranked by semantic similarity "
                "between your description and the available business "
                "categories. Similarity values are not probabilities. "
                "Review the suggestions before selecting a category."
            ),
            "model": HF_MODEL_ID,
        })

    except sqlite3.Error:
        app.logger.exception(
            "Could not retrieve categories for interpretation."
        )
        return jsonify({
            "error": "Could not retrieve business categories."
        }), 500

    except Exception:
        app.logger.exception(
            "Hugging Face category interpretation failed."
        )
        return jsonify({
            "error": (
                "Category interpretation failed. Check the PyCharm "
                "terminal for details."
            )
        }), 503

# --------------------------------------------------
# Ultralytics: local visual site audit
# --------------------------------------------------

YOLO_MODEL_NAME = "yolo11n.pt"
_yolo_model = None

MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB


def get_yolo_model():
    """Load YOLO once and reuse it for subsequent requests."""
    global _yolo_model

    if _yolo_model is None:
        from ultralytics import YOLO

        app.logger.info("Loading Ultralytics model: %s", YOLO_MODEL_NAME)
        _yolo_model = YOLO(YOLO_MODEL_NAME)
        app.logger.info("Ultralytics model loaded successfully.")

    return _yolo_model


@app.post("/api/visual-audit")
def visual_audit():
    uploaded_file = request.files.get("image")

    if uploaded_file is None:
        return jsonify({"error": "Please upload an image using the image field."}), 400

    if not uploaded_file.filename:
        return jsonify({"error": "No image file was selected."}), 400

    # Reject oversized requests before reading the file.
    if request.content_length and request.content_length > MAX_IMAGE_BYTES + 1024 * 1024:
        return jsonify({"error": "The upload is too large. Maximum image size is 8 MB."}), 413

    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    extension = Path(uploaded_file.filename).suffix.lower()

    if extension not in allowed_extensions:
        return jsonify({
            "error": "Use a JPG, JPEG, PNG or WEBP image."
        }), 415

    try:
        image_bytes = uploaded_file.read(MAX_IMAGE_BYTES + 1)

        if len(image_bytes) > MAX_IMAGE_BYTES:
            return jsonify({
                "error": "The upload is too large. Maximum image size is 8 MB."
            }), 413

        # Validate the actual image contents rather than trusting its extension.
        with Image.open(io.BytesIO(image_bytes)) as check_image:
            check_image.verify()

        with Image.open(io.BytesIO(image_bytes)) as image:
            image = image.convert("RGB")
            width, height = image.size

            if width < 32 or height < 32:
                return jsonify({
                    "error": "The image is too small for a useful visual audit."
                }), 400

            if width * height > 25_000_000:
                return jsonify({
                    "error": "The image dimensions are too large. Resize it and try again."
                }), 413

            image_array = np.asarray(image)

    except (UnidentifiedImageError, OSError, ValueError):
        return jsonify({
            "error": "The uploaded file is not a valid supported image."
        }), 400

    try:
        model = get_yolo_model()

        # Inference runs locally on the CPU; no hosted inference key is needed.
        results = model.predict(
            source=image_array,
            device="cpu",
            conf=0.25,
            verbose=False,
        )

        result = results[0]
        detections = []

        if result.boxes is not None:
            for box in result.boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                coordinates = box.xyxy[0].cpu().tolist()

                detections.append({
                    "label": str(result.names[class_id]),
                    "confidence": round(confidence, 4),
                    "box": [
                        round(float(coordinates[0]), 2),
                        round(float(coordinates[1]), 2),
                        round(float(coordinates[2]), 2),
                        round(float(coordinates[3]), 2),
                    ],
                })

        detections.sort(
            key=lambda item: item["confidence"],
            reverse=True,
        )

        return jsonify({
            "width": width,
            "height": height,
            "detections": detections,
            "model": YOLO_MODEL_NAME,
            "notes": [
                "Detections are based on one photograph and the pretrained model's supported object classes.",
                "A photograph cannot establish typical footfall, customer demand or business success.",
                "No uploaded image is intentionally saved to disk by this endpoint.",
            ],
        })

    except Exception:
        app.logger.exception("Visual site audit failed")
        return jsonify({
            "error": (
                "Visual analysis failed. Check the PyCharm terminal "
                "for model download or inference details."
            )
        }), 503

if __name__ == "__main__":
    # Local-only academic development server.
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
    )