CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  project TEXT NOT NULL,
  project_detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  stripe_session_id TEXT PRIMARY KEY,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  order_number TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  customer_email TEXT,
  lead_id TEXT,
  project TEXT,
  project_detail TEXT,
  amount_total INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  paid_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON orders(paid_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
