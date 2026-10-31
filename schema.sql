-- LocalLens database schema

CREATE TABLE IF NOT EXISTS business_categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    group_name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    name TEXT,
    kind TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    observed_at TEXT,
    last_imported_at TEXT,
    UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_places_category
ON places(category);

CREATE INDEX IF NOT EXISTS idx_places_coordinates
ON places(latitude, longitude);

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    custom_description TEXT,
    location_label TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_m INTEGER NOT NULL,
    result_json TEXT NOT NULL,
    score REAL,
    coverage TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (category_id)
        REFERENCES business_categories(id)
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('analysis', 'comparison')),
    title TEXT NOT NULL,
    category_label TEXT NOT NULL,
    location_label TEXT NOT NULL,
    score REAL,
    coverage TEXT NOT NULL,
    analyses_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_import_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset TEXT NOT NULL,
    rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    message TEXT
);

CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    status INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
);