CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS reviews_status_published_idx ON reviews(status, published_at DESC);
