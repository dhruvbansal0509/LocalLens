from pathlib import Path
import re
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "locallens.db"
SCHEMA_PATH = BASE_DIR / "schema.sql"

CATEGORY_GROUPS = [
    ("food", "Food and beverage", [
        "Café", "Bakery", "Restaurant", "Quick-service restaurant",
        "Takeaway", "Cloud kitchen", "Juice bar", "Tea and coffee shop",
        "Sweet shop", "Ice-cream shop",
    ]),
    ("retail", "Retail", [
        "Clothing", "Footwear", "Grocery", "Supermarket",
        "Convenience store", "Pharmacy", "Electronics", "Mobile shop",
        "Cosmetics", "Furnishing", "Specialist retail",
    ]),
    ("health", "Health and personal care", [
        "Gym", "Yoga studio", "Salon", "Spa", "Wellness centre",
        "Physiotherapy centre", "Diagnostics",
    ]),
    ("education", "Education", [
        "Coaching", "Tuition", "Preschool", "Daycare",
        "Training institute", "Skill centre", "Music or dance academy",
    ]),
    ("professional", "Professional services", [
        "Coworking space", "Consulting office", "Marketing agency",
        "Accounting", "Real estate", "Travel office",
    ]),
    ("neighbourhood", "Neighbourhood services", [
        "Pet care", "Laundry", "Repair shop",
        "Automobile service", "Event services",
    ]),
]


def slugify(label):
    return re.sub(
        r"[^a-z0-9]+", "-", label.lower()
    ).strip("-")


def initialise_database():
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Missing schema file: {SCHEMA_PATH}")

    conn = sqlite3.connect(DB_PATH)

    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            SCHEMA_PATH.read_text(encoding="utf-8")
        )

        categories = []

        for group_id, group_label, labels in CATEGORY_GROUPS:
            for label in labels:
                category_id = f"{group_id}.{slugify(label)}"

                categories.append((
                    category_id,
                    label,
                    group_label,
                    f"Business category: {label}",
                ))

        categories.append((
            "custom",
            "Custom business type",
            "Custom",
            "User-defined business category",
        ))

        conn.executemany(
            """
            INSERT OR IGNORE INTO business_categories
                (id, label, group_name, description)
            VALUES (?, ?, ?, ?)
            """,
            categories,
        )

        conn.commit()

        table_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM sqlite_master
            WHERE type = 'table'
              AND name NOT LIKE 'sqlite_%'
            """
        ).fetchone()[0]

        category_count = conn.execute(
            "SELECT COUNT(*) FROM business_categories"
        ).fetchone()[0]

        print("LocalLens database initialised successfully.")
        print(f"Database: {DB_PATH}")
        print(f"Tables created: {table_count}")
        print(f"Business categories: {category_count}")

    finally:
        conn.close()


if __name__ == "__main__":
    initialise_database()