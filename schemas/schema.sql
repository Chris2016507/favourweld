-- FAVOURWELD ELECTRONICS business records schema for Cloudflare D1.
-- Safe for repeat application: does not drop existing tables or sample data.

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  joined_date TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS repair_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  equipment_type TEXT NOT NULL,
  brand_model TEXT,
  reported_fault TEXT NOT NULL,
  diagnosis TEXT,
  repair_notes TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','diagnosing','awaiting_approval','awaiting_parts','in_repair','ready','collected','cancelled')),
  estimated_cost INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  final_cost INTEGER NOT NULL DEFAULT 0 CHECK (final_cost >= 0),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  collected_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_jobs_customer ON repair_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON repair_jobs(status);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER,
  repair_job_id INTEGER,
  invoice_type TEXT NOT NULL DEFAULT 'invoice' CHECK (invoice_type IN ('invoice','cash_sale','estimate')),
  subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  amount_paid INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('draft','unpaid','part_paid','paid','void')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (repair_job_id) REFERENCES repair_jobs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total INTEGER NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','mpesa','intasend','flutterwave')),
  method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','mpesa','card','bank','other')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  provider_reference TEXT UNIQUE,
  merchant_request_id TEXT,
  checkout_request_id TEXT,
  receipt_number TEXT,
  payer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  raw_callback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_checkout ON payments(checkout_request_id);

-- Authentication records store password hashes only, never plaintext passwords.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','staff','customer')),
  customer_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS business_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  category TEXT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  recorded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON business_expenses(created_at);
