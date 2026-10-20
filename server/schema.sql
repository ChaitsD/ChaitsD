PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', fabric TEXT NOT NULL DEFAULT '',
 gsm INTEGER NOT NULL DEFAULT 240 CHECK(gsm > 0), fit TEXT NOT NULL DEFAULT '', care TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, tone TEXT NOT NULL,
 regular_price INTEGER NOT NULL CHECK(regular_price > 0), sale_price INTEGER CHECK(sale_price >= 0 AND sale_price <= regular_price), sale_active INTEGER NOT NULL DEFAULT 0,
 sale_start TEXT, sale_end TEXT, status TEXT NOT NULL CHECK(status IN ('active','draft','sold_out')), featured INTEGER NOT NULL DEFAULT 0,
 collection_id TEXT REFERENCES collections(id), images TEXT NOT NULL DEFAULT '{}', deleted_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), sku TEXT NOT NULL UNIQUE, color TEXT NOT NULL, size TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, UNIQUE(product_id,size));
CREATE TABLE IF NOT EXISTS inventory (variant_id TEXT PRIMARY KEY REFERENCES product_variants(id), stock INTEGER NOT NULL CHECK(stock >= 0), low_stock_threshold INTEGER NOT NULL DEFAULT 3 CHECK(low_stock_threshold >= 0));
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','customer')), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS addresses (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS wishlist (customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES products(id), PRIMARY KEY(customer_id,product_id));
CREATE TABLE IF NOT EXISTS coupons (
 id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE COLLATE NOCASE, type TEXT NOT NULL CHECK(type IN ('percent','fixed')), value INTEGER NOT NULL CHECK(value > 0),
 minimum INTEGER NOT NULL DEFAULT 0 CHECK(minimum >= 0), maximum INTEGER CHECK(maximum >= 0), expires_at TEXT, usage_limit INTEGER CHECK(usage_limit > 0), used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count >= 0),
 enabled INTEGER NOT NULL DEFAULT 1, scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all','products','collections')), targets TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id), guest_token_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Pending','Confirmed','Packed','Shipped','Delivered','Cancelled','Returned')), address TEXT NOT NULL,
 subtotal INTEGER NOT NULL CHECK(subtotal >= 0), discount INTEGER NOT NULL CHECK(discount >= 0 AND discount <= subtotal), shipping INTEGER NOT NULL CHECK(shipping >= 0), total INTEGER NOT NULL CHECK(total = subtotal - discount + shipping),
 coupon_id TEXT REFERENCES coupons(id), coupon_code TEXT, payment_method TEXT NOT NULL, payment_status TEXT NOT NULL,
 courier TEXT NOT NULL DEFAULT '', tracking_number TEXT NOT NULL DEFAULT '', tracking_url TEXT NOT NULL DEFAULT '', stock_restored INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id), variant_id TEXT NOT NULL REFERENCES product_variants(id), name TEXT NOT NULL, sku TEXT NOT NULL, color TEXT NOT NULL, size TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), unit_price INTEGER NOT NULL CHECK(unit_price >= 0));
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, delivered_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS policies (slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admin_users(id), action TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
