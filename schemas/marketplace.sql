CREATE TABLE IF NOT EXISTS marketplace_sellers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL UNIQUE,store_name TEXT NOT NULL,description TEXT,location TEXT,phone TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended')),verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN(0,1)),
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS marketplace_products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,seller_id INTEGER NOT NULL,name TEXT NOT NULL,description TEXT,category TEXT,price REAL NOT NULL,moq INTEGER NOT NULL DEFAULT 1,stock INTEGER NOT NULL DEFAULT 0,image_url TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','rejected')),created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 FOREIGN KEY(seller_id) REFERENCES marketplace_sellers(id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_status ON marketplace_products(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller ON marketplace_products(seller_id);
CREATE TABLE IF NOT EXISTS marketplace_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_number TEXT NOT NULL UNIQUE,buyer_id INTEGER NOT NULL,total REAL NOT NULL,currency TEXT NOT NULL DEFAULT 'KES',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','processing','shipped','completed','cancelled')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN('unpaid','pending','paid','failed','refunded')),
 created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS marketplace_order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,seller_id INTEGER NOT NULL,quantity INTEGER NOT NULL,unit_price REAL NOT NULL,line_total REAL NOT NULL,
 FOREIGN KEY(order_id) REFERENCES marketplace_orders(id),FOREIGN KEY(product_id) REFERENCES marketplace_products(id),FOREIGN KEY(seller_id) REFERENCES marketplace_sellers(id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_buyer ON marketplace_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_order ON marketplace_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_order_items_seller ON marketplace_order_items(seller_id);