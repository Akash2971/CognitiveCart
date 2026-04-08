CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  size TEXT,
  price REAL,
  calories INTEGER,
  protein REAL,
  fat REAL,
  saturated_fat REAL,
  sugar REAL,
  sodium REAL,
  ingredients TEXT,
  certifications TEXT
);

CREATE TABLE IF NOT EXISTS raw_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  raw_brand TEXT,
  raw_text TEXT,
  product_id INTEGER REFERENCES products(id),
  matched INTEGER NOT NULL DEFAULT 0,
  confidence REAL,
  detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);
