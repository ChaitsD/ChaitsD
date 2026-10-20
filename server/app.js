import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import { catalogEvents, notifyCatalog } from "./events.js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { all, one, run, transaction, setting, setSetting } from "./db.js";
import {
  auth,
  requireUser,
  requireAdmin,
  issueSession,
  hashPassword,
  verifyPassword,
  fail,
  email,
  text,
  integer,
  bool,
  date,
  password,
  safeMedia,
  token,
  digest,
  shippingAddress,
} from "./security.js";
import { productView, quote, orderView } from "./commerce.js";
import { authorizeTestPayment } from "./payments.js";
export const app = express();
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN)
  throw Error("APP_ORIGIN is required in production.");
const origin = process.env.APP_ORIGIN || "http://localhost:5173";
let parsedOrigin;
try {
  parsedOrigin = new URL(origin);
} catch {
  throw Error("APP_ORIGIN must be a valid origin.");
}
if (
  parsedOrigin.origin !== origin ||
  parsedOrigin.username ||
  parsedOrigin.password ||
  !["http:", "https:"].includes(parsedOrigin.protocol) ||
  (production && parsedOrigin.protocol !== "https:")
)
  throw Error(
    "APP_ORIGIN must be a canonical HTTPS origin in production (no path or credentials).",
  );
const uploadDir = resolve(process.env.UPLOAD_DIR || ".data/uploads");
mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            mediaSrc: ["'self'"],
            connectSrc: ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
  }),
);
export const apiLimiter = rateLimit({
  windowMs: 60000,
  limit: 300,
  handler: (req, res) =>
    res.status(429).json({ error: "Too many requests. Please retry later." }),
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.use("/api", apiLimiter);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (req.headers["x-mg-request"] !== "1")
      return res
        .status(403)
        .json({ error: "Same-origin request header required." });
    const from = req.headers.origin;
    if (from && from !== origin)
      return res.status(403).json({ error: "Origin not allowed." });
    if (!req.is("application/json") && !req.is("multipart/form-data"))
      return res
        .status(415)
        .json({ error: "JSON or multipart request required." });
  }
  next();
});
app.use(express.json({ limit: "128kb" }));
app.use("/api", (req, res, next) => {
  if (req.is("multipart/form-data") && req.path !== "/admin/uploads")
    return res
      .status(415)
      .json({ error: "Multipart is supported only for media uploads." });
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.is("multipart/form-data") &&
    (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
  )
    return res.status(400).json({ error: "A JSON object is required." });
  next();
});
app.use("/api", (req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (req.path === "/checkout" || req.path.startsWith("/admin/"))
  )
    res.on("finish", () => {
      if (res.statusCode < 300 && req.path !== "/admin/uploads")
        notifyCatalog();
    });
  next();
});
app.use("/api", auth);
app.use(
  "/uploads",
  express.static(uploadDir, {
    dotfiles: "deny",
    setHeaders: (res) => {
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    },
  }),
  (req, res) => res.status(404).json({ error: "Media not found." }),
);
app.get("/api/catalog/events", catalogEvents);
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  handler: (req, res) =>
    res
      .status(429)
      .json({
        error:
          "Too many authentication or checkout attempts. Please retry later.",
      }),
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const audit = (req, action, id) =>
  run(
    "INSERT INTO audit_log(id,admin_id,action,entity_id) VALUES(?,?,?,?)",
    randomUUID(),
    req.user.id,
    action,
    id,
  );
app.get("/api/health", (req, res) =>
  res.json({
    ok: !!one("SELECT 1"),
    paymentMode: process.env.PAYMENT_MODE || "mock",
  }),
);
app.get("/api/catalog", (req, res) =>
  res.json({
    products: all(
      "SELECT * FROM products WHERE status!='draft' AND deleted_at IS NULL ORDER BY rowid",
    ).map(productView),
    collections: all("SELECT * FROM collections"),
    media: { campaign: setting("campaign"), lookbook: setting("lookbook") },
    shipping: setting("shipping"),
    policies: all("SELECT * FROM policies"),
    paymentMode: process.env.PAYMENT_MODE || "mock",
  }),
);
app.get("/api/auth/me", (req, res) => res.json({ user: req.user || null }));
app.post("/api/auth/signup", loginLimit, async (req, res) => {
  const name = text(req.body.name, "Name", 150),
    e = email(req.body.email),
    pw = password(req.body.password);
  if (one("SELECT id FROM customers WHERE email=?", e))
    fail("An account with this email already exists.", 409);
  const id = randomUUID();
  const hash = await hashPassword(pw);
  try {
    run(
      "INSERT INTO customers(id,name,email,password_hash) VALUES(?,?,?,?)",
      id,
      name,
      e,
      hash,
    );
  } catch {
    fail("An account with this email already exists.", 409);
  }
  res
    .status(201)
    .json({ user: issueSession(res, { id, name, email: e }, "customer", req) });
});
app.post("/api/auth/login", loginLimit, async (req, res) => {
  const e = email(req.body.email),
    pw = req.body.password,
    role = req.body.admin === true ? "admin" : "customer";
  text(pw, "Password", 128);
  const table = role === "admin" ? "admin_users" : "customers";
  const user = one(`SELECT * FROM ${table} WHERE email=?`, e);
  const valid = await verifyPassword(
    pw,
    user?.password_hash ||
      "00000000000000000000000000000000:" + "00".repeat(64),
  );
  if (!valid || !user) fail("Email or password is incorrect.", 401);
  res.json({
    user: issueSession(
      res,
      { id: user.id, name: user.name, email: user.email },
      role,
      req,
    ),
  });
});
app.post("/api/auth/logout", (req, res) => {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("mg_session="))
    ?.slice(11);
  if (raw) run("DELETE FROM sessions WHERE token_hash=?", digest(raw));
  res.clearCookie("mg_session", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: production,
  });
  res.json({ ok: true });
});
app.post("/api/auth/forgot-password", loginLimit, (req, res) => {
  const e = email(req.body.email);
  const user = one("SELECT id FROM customers WHERE email=?", e);
  if (user)
    transaction(() => {
      run("DELETE FROM password_resets WHERE customer_id=?", user.id);
      const raw = token();
      run(
        "INSERT INTO password_resets VALUES(?,?,?,0)",
        digest(raw),
        user.id,
        Date.now() + 30 * 60000,
      );
      run(
        "INSERT INTO mail_outbox(id,recipient,subject,body) VALUES(?,?,?,?)",
        randomUUID(),
        e,
        "Reset your MAYGREY password",
        `Reset your password within 30 minutes: ${origin}/reset-password?token=${raw}`,
      );
    });
  res.json({
    message:
      "If an account exists, a reset email has been queued. Email delivery is not connected in test mode.",
  });
});
app.post("/api/auth/reset-password", loginLimit, async (req, res) => {
  const raw = text(req.body.token, "Reset token", 100),
    pw = password(req.body.password);
  const hash = await hashPassword(pw);
  transaction(() => {
    const record = one(
      "SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>?",
      digest(raw),
      Date.now(),
    );
    if (!record) fail("Reset link is invalid or expired.");
    run(
      "UPDATE customers SET password_hash=? WHERE id=?",
      hash,
      record.customer_id,
    );
    run("UPDATE password_resets SET used=1 WHERE token_hash=?", digest(raw));
    run("DELETE FROM sessions WHERE user_id=?", record.customer_id);
  });
  res.json({ ok: true });
});
app.get("/api/account", requireUser, (req, res) => {
  if (req.user.role !== "customer") fail("Customer account required.", 403);
  res.json({
    user: req.user,
    addresses: all(
      "SELECT * FROM addresses WHERE customer_id=?",
      req.user.id,
    ).map((x) => ({ ...x, data: JSON.parse(x.data) })),
    orders: all(
      "SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC,rowid DESC",
      req.user.id,
    ).map(orderView),
    wishlist: all(
      "SELECT product_id FROM wishlist WHERE customer_id=?",
      req.user.id,
    ).map((x) => x.product_id),
  });
});
app.post("/api/account/addresses", requireUser, (req, res) => {
  if (req.user.role !== "customer") fail("Customer account required.", 403);
  const address = shippingAddress(req.body);
  if (
    one("SELECT count(*) n FROM addresses WHERE customer_id=?", req.user.id)
      .n >= 20
  )
    fail("Maximum 20 saved addresses.");
  const id = randomUUID();
  run(
    "INSERT INTO addresses VALUES(?,?,?)",
    id,
    req.user.id,
    JSON.stringify(address),
  );
  res.status(201).json({ id });
});
app.delete("/api/account/addresses/:id", requireUser, (req, res) => {
  run(
    "DELETE FROM addresses WHERE id=? AND customer_id=?",
    req.params.id,
    req.user.id,
  );
  res.json({ ok: true });
});
app.put("/api/account/wishlist", requireUser, (req, res) => {
  if (req.user.role !== "customer") fail("Customer account required.", 403);
  const ids = req.body.ids;
  if (
    !Array.isArray(ids) ||
    ids.length > 200 ||
    ids.some((id) => typeof id !== "string")
  )
    fail("Invalid wishlist.");
  transaction(() => {
    run("DELETE FROM wishlist WHERE customer_id=?", req.user.id);
    for (const id of new Set(ids))
      if (one("SELECT id FROM products WHERE id=? AND deleted_at IS NULL", id))
        run("INSERT INTO wishlist VALUES(?,?)", req.user.id, id);
  });
  res.json({ ok: true });
});
app.post("/api/checkout/quote", (req, res) =>
  res.json(quote(req.body.items, req.body.coupon)),
);
app.post("/api/checkout", loginLimit, (req, res) => {
  const key = text(req.headers["idempotency-key"], "Idempotency key", 100);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key)) fail("Invalid idempotency key.");
  const address = shippingAddress(req.body.address);
  const method = req.body.paymentMethod || "mock";
  const requestHash = digest(
    JSON.stringify({
      items: req.body.items,
      coupon: req.body.coupon || "",
      address,
      method,
      customer: req.user?.role === "customer" ? req.user.id : null,
    }),
  );
  const existing = one("SELECT * FROM orders WHERE idempotency_key=?", key);
  if (existing) {
    if (existing.request_hash !== requestHash)
      fail("This checkout key was used for a different request.", 409);
    const access = digest("guest:" + key);
    return res.json({ order: orderView(existing), accessToken: access });
  }
  if ((process.env.PAYMENT_MODE || "mock") !== "mock")
    fail("Live payment processing is not connected. Use mock mode.", 503);
  if (!["mock", "cod"].includes(method)) fail("Invalid payment method.");
  if (req.body.mockResult === "failure")
    fail(
      "Mock payment failed. No charge, order or stock change was made.",
      402,
    );
  const result = transaction(() => {
    const q = quote(req.body.items, req.body.coupon);
    if (
      req.body.expectedTotal !== undefined &&
      integer(req.body.expectedTotal, "expected total") !== q.total
    )
      fail(
        "The total changed. Review the updated price and shipping, then place your test order again.",
        409,
      );
    const paymentStatus = authorizeTestPayment({
      method,
      result: req.body.mockResult,
      codEnabled: q.codEnabled,
    });
    const id =
      "TEST-MG-" +
      new Date().toISOString().slice(0, 10).replaceAll("-", "") +
      "-" +
      randomUUID().toUpperCase();
    const access = digest("guest:" + key);
    run(
      `INSERT INTO orders(id,customer_id,guest_token_hash,idempotency_key,request_hash,status,address,subtotal,discount,shipping,total,coupon_id,coupon_code,payment_method,payment_status) VALUES(?,?,?,?,?,'Confirmed',?,?,?,?,?,?,?,?,?)`,
      id,
      req.user?.role === "customer" ? req.user.id : null,
      digest(access),
      key,
      requestHash,
      JSON.stringify(address),
      q.subtotal,
      q.discount,
      q.shipping,
      q.total,
      q.couponId,
      q.coupon,
      method,
      paymentStatus,
    );
    for (const l of q.lines) {
      const changed = run(
        "UPDATE inventory SET stock=stock-? WHERE variant_id=? AND stock>=?",
        l.quantity,
        l.variant_id,
        l.quantity,
      );
      if (!changed.changes) fail("Stock changed. Please try again.", 409);
      run(
        "INSERT INTO order_items VALUES(?,?,?,?,?,?,?,?,?,?)",
        randomUUID(),
        id,
        l.product_id,
        l.variant_id,
        l.name,
        l.sku,
        l.color,
        l.size,
        l.quantity,
        l.unit_price,
      );
    }
    if (q.couponId)
      run("UPDATE coupons SET used_count=used_count+1 WHERE id=?", q.couponId);
    return {
      order: orderView(one("SELECT * FROM orders WHERE id=?", id)),
      accessToken: access,
    };
  });
  res.status(201).json(result);
});
app.get("/api/orders/:id", (req, res) => {
  const o = one("SELECT * FROM orders WHERE id=?", req.params.id);
  if (!o) fail("Order not found.", 404);
  const owns =
    req.user?.role === "admin" ||
    (req.user?.role === "customer" && o.customer_id === req.user.id);
  const access = req.headers["x-order-token"];
  if (!owns && (!access || digest(access) !== o.guest_token_hash))
    fail("Order access denied.", 403);
  res.json(orderView(o));
});
app.use("/api/admin", requireAdmin);
app.get("/api/admin/dashboard", (req, res) =>
  res.json({
    totalOrders: one("SELECT count(*) n FROM orders").n,
    revenue: one(
      "SELECT coalesce(sum(total),0) n FROM orders WHERE status NOT IN ('Cancelled','Returned')",
    ).n,
    productsSold: one(
      "SELECT coalesce(sum(quantity),0) n FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status NOT IN ('Cancelled','Returned')",
    ).n,
    recentOrders: all(
      "SELECT * FROM orders ORDER BY created_at DESC,rowid DESC LIMIT 10",
    ).map(orderView),
    lowStock: all(
      "SELECT p.name,v.size,v.sku,i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id WHERE v.active=1 AND p.deleted_at IS NULL AND i.stock<=i.low_stock_threshold ORDER BY i.stock",
    ),
    testMode: true,
  }),
);
app.get("/api/admin/products", (req, res) =>
  res.json(
    all(
      "SELECT * FROM products WHERE deleted_at IS NULL ORDER BY rowid DESC",
    ).map(productView),
  ),
);
function saveProduct(req, id) {
  const b = req.body;
  const sku = text(b.sku, "SKU", 60);
  if (!/^[a-zA-Z0-9_-]+$/.test(sku))
    fail("SKU may contain letters, numbers, hyphens and underscores.");
  const name = text(b.name, "Name", 150),
    description = text(b.description, "Description", 5000, false),
    fabric = text(b.fabric, "Fabric", 500, false),
    gsm = integer(b.gsm, "GSM", 1, 2000),
    fit = text(b.fit, "Fit", 500, false),
    care = text(b.care, "Care", 2000, false),
    color = text(b.color, "Color", 100),
    tone = text(b.tone, "Tone", 7);
  if (!/^#[0-9a-f]{6}$/i.test(tone)) fail("Invalid color swatch.");
  const regular = integer(b.regular_price, "MRP in paise", 1, 100000000),
    sale =
      b.sale_price === null || b.sale_price === ""
        ? null
        : integer(b.sale_price, "sale price in paise", 0, regular),
    saleActive = bool(b.sale_active);
  if (saleActive && sale === null)
    fail("Set a sale price before enabling the sale.");
  const start = date(b.sale_start),
    end = date(b.sale_end);
  if (start && end && start >= end) fail("Sale end must be after sale start.");
  if (!["active", "draft", "sold_out"].includes(b.status))
    fail("Invalid product status.");
  if (
    b.collection_id &&
    !one("SELECT id FROM collections WHERE id=?", b.collection_id)
  )
    fail("Collection not found.");
  if (!b.images || typeof b.images !== "object")
    fail("Product images required.");
  const images = JSON.stringify(
    Object.fromEntries(
      ["front", "back", "detail"].map((v) => [v, safeMedia(b.images[v])]),
    ),
  );
  if (
    !Array.isArray(b.variants) ||
    !b.variants.length ||
    b.variants.length > 20
  )
    fail("Add 1–20 sizes.");
  const sizes = new Set();
  const variants = b.variants.map((v) => {
    const size = text(v.size, "Size", 15).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(size) || sizes.has(size))
      fail("Sizes must be unique letters or numbers.");
    sizes.add(size);
    return {
      size,
      expected_stock: v.expected_stock,
      stock: integer(v.stock, "stock", 0, 100000),
      threshold: integer(
        v.low_stock_threshold ?? 3,
        "low stock threshold",
        0,
        100000,
      ),
    };
  });
  const dup = one("SELECT id FROM products WHERE sku=? AND id!=?", sku, id);
  if (dup) fail("SKU already exists.", 409);
  transaction(() => {
    const current = one("SELECT updated_at FROM products WHERE id=?", id);
    if (current && b.expected_updated_at !== current.updated_at)
      fail(
        "This product changed since you opened it. Reload products before saving.",
        409,
      );
    run(
      `INSERT INTO products(id,sku,name,description,fabric,gsm,fit,care,color,tone,regular_price,sale_price,sale_active,sale_start,sale_end,status,featured,collection_id,images) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,name=excluded.name,description=excluded.description,fabric=excluded.fabric,gsm=excluded.gsm,fit=excluded.fit,care=excluded.care,color=excluded.color,tone=excluded.tone,regular_price=excluded.regular_price,sale_price=excluded.sale_price,sale_active=excluded.sale_active,sale_start=excluded.sale_start,sale_end=excluded.sale_end,status=excluded.status,featured=excluded.featured,collection_id=excluded.collection_id,images=excluded.images,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      id,
      sku,
      name,
      description,
      fabric,
      gsm,
      fit,
      care,
      color,
      tone,
      regular,
      sale,
      saleActive,
      start,
      end,
      b.status,
      bool(b.featured),
      b.collection_id || null,
      images,
    );
    run("UPDATE product_variants SET active=0 WHERE product_id=?", id);
    for (const v of variants) {
      const old = one(
        "SELECT id FROM product_variants WHERE product_id=? AND size=?",
        id,
        v.size,
      );
      if (old) {
        const stock = one(
          "SELECT stock FROM inventory WHERE variant_id=?",
          old.id,
        ).stock;
        if (v.expected_stock !== stock)
          fail(
            "Inventory changed since you opened this product. Reload before saving.",
            409,
          );
      }
      const vid = old?.id || randomUUID();
      run(
        "INSERT INTO product_variants(id,product_id,sku,color,size,active) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET sku=excluded.sku,color=excluded.color,active=1",
        vid,
        id,
        `${sku}-${v.size}`,
        color,
        v.size,
      );
      run(
        "INSERT INTO inventory VALUES(?,?,?) ON CONFLICT(variant_id) DO UPDATE SET stock=excluded.stock,low_stock_threshold=excluded.low_stock_threshold",
        vid,
        v.stock,
        v.threshold,
      );
    }
    audit(req, "save_product", id);
  });
  return productView(one("SELECT * FROM products WHERE id=?", id));
}
app.post("/api/admin/products", (req, res) =>
  res.status(201).json(saveProduct(req, "mg-" + randomUUID().slice(0, 12))),
);
app.put("/api/admin/products/:id", (req, res) => {
  if (
    !one(
      "SELECT id FROM products WHERE id=? AND deleted_at IS NULL",
      req.params.id,
    )
  )
    fail("Product not found.", 404);
  res.json(saveProduct(req, req.params.id));
});
app.delete("/api/admin/products/:id", (req, res) => {
  transaction(() => {
    run(
      "UPDATE products SET deleted_at=CURRENT_TIMESTAMP,status='draft' WHERE id=?",
      req.params.id,
    );
    audit(req, "delete_product", req.params.id);
  });
  res.json({ ok: true });
});
app.get("/api/admin/collections", (req, res) =>
  res.json(all("SELECT * FROM collections")),
);
app.post("/api/admin/collections", (req, res) => {
  const id = randomUUID(),
    name = text(req.body.name, "Collection name", 150),
    description = text(req.body.description || "", "Description", 1000, false);
  run("INSERT INTO collections VALUES(?,?,?)", id, name, description);
  audit(req, "add_collection", id);
  res.status(201).json({ id, name, description });
});
app.put("/api/admin/collections/:id", (req, res) => {
  run(
    "UPDATE collections SET name=?,description=? WHERE id=?",
    text(req.body.name, "Collection name", 150),
    text(req.body.description || "", "Description", 1000, false),
    req.params.id,
  );
  audit(req, "edit_collection", req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/collections/:id", (req, res) => {
  if (one("SELECT id FROM products WHERE collection_id=?", req.params.id))
    fail("Move products out of this collection before deleting it.");
  const uses = all(
    "SELECT targets FROM coupons WHERE scope='collections'",
  ).some((c) => JSON.parse(c.targets).includes(req.params.id));
  if (uses) fail("Remove this collection from coupons before deleting it.");
  run("DELETE FROM collections WHERE id=?", req.params.id);
  audit(req, "delete_collection", req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/coupons", (req, res) =>
  res.json(
    all("SELECT * FROM coupons ORDER BY rowid DESC").map((c) => ({
      ...c,
      enabled: !!c.enabled,
      targets: JSON.parse(c.targets),
    })),
  ),
);
function saveCoupon(req, id) {
  const b = req.body,
    code = text(b.code, "Coupon code", 40).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) fail("Invalid coupon code.");
  if (
    !["percent", "fixed"].includes(b.type) ||
    !["all", "products", "collections"].includes(b.scope)
  )
    fail("Invalid coupon type or scope.");
  const value = integer(
      b.value,
      "discount value",
      1,
      b.type === "percent" ? 100 : 100000000,
    ),
    minimum = integer(b.minimum, "minimum order"),
    maximum =
      b.maximum === null ? null : integer(b.maximum, "maximum discount"),
    expiry = date(b.expires_at),
    limit =
      b.usage_limit === null
        ? null
        : integer(b.usage_limit, "usage limit", 1, 1000000);
  if (!Array.isArray(b.targets) || b.targets.length > 100)
    fail("Invalid coupon targets.");
  const targets = [...new Set(b.targets)];
  if (b.scope !== "all") {
    if (!targets.length)
      fail("Choose at least one eligible product or collection.");
    for (const id of targets)
      if (
        typeof id !== "string" ||
        !one(
          `SELECT id FROM ${b.scope === "products" ? "products" : "collections"} WHERE id=?`,
          id,
        )
      )
        fail("Invalid coupon target.");
  }
  const old = one("SELECT used_count FROM coupons WHERE id=?", id);
  if (limit !== null && limit < (old?.used_count || 0))
    fail("Usage limit cannot be below current usage.");
  run(
    `INSERT INTO coupons(id,code,type,value,minimum,maximum,expires_at,usage_limit,enabled,scope,targets) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,type=excluded.type,value=excluded.value,minimum=excluded.minimum,maximum=excluded.maximum,expires_at=excluded.expires_at,usage_limit=excluded.usage_limit,enabled=excluded.enabled,scope=excluded.scope,targets=excluded.targets`,
    id,
    code,
    b.type,
    value,
    minimum,
    maximum,
    expiry,
    limit,
    bool(b.enabled),
    b.scope,
    JSON.stringify(targets),
  );
  audit(req, "save_coupon", id);
  return { id };
}
app.post("/api/admin/coupons", (req, res) =>
  res.status(201).json(saveCoupon(req, randomUUID())),
);
app.put("/api/admin/coupons/:id", (req, res) => {
  if (!one("SELECT id FROM coupons WHERE id=?", req.params.id))
    fail("Coupon not found.", 404);
  res.json(saveCoupon(req, req.params.id));
});
app.delete("/api/admin/coupons/:id", (req, res) => {
  run("UPDATE coupons SET enabled=0 WHERE id=?", req.params.id);
  audit(req, "disable_coupon", req.params.id);
  res.json({ ok: true });
});
app.get("/api/admin/orders", (req, res) =>
  res.json(
    all("SELECT * FROM orders ORDER BY created_at DESC,rowid DESC").map(
      orderView,
    ),
  ),
);
const transitions = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Delivered", "Returned"],
  Delivered: ["Returned"],
  Cancelled: [],
  Returned: [],
};
app.put("/api/admin/orders/:id", (req, res) => {
  const b = req.body;
  transaction(() => {
    const o = one("SELECT * FROM orders WHERE id=?", req.params.id);
    if (!o) fail("Order not found.", 404);
    if (b.status !== o.status && !transitions[o.status].includes(b.status))
      fail(`Cannot move an order from ${o.status} to ${b.status}.`);
    const courier = text(b.courier || "", "Courier", 100, false),
      tracking = text(b.tracking_number || "", "Tracking number", 150, false),
      url = text(b.tracking_url || "", "Tracking URL", 1000, false);
    if (url) {
      let u;
      try {
        u = new URL(url);
      } catch {
        fail("Tracking URL must be a valid HTTPS URL.");
      }
      if (u.protocol !== "https:") fail("Tracking URL must use HTTPS.");
    }
    if (["Cancelled", "Returned"].includes(b.status) && !o.stock_restored) {
      for (const item of all(
        "SELECT * FROM order_items WHERE order_id=?",
        o.id,
      ))
        run(
          "UPDATE inventory SET stock=stock+? WHERE variant_id=?",
          item.quantity,
          item.variant_id,
        );
      run("UPDATE orders SET stock_restored=1 WHERE id=?", o.id);
    }
    run(
      "UPDATE orders SET status=?,courier=?,tracking_number=?,tracking_url=?,payment_status=CASE WHEN ? IN ('Cancelled','Returned') THEN 'mock_reversed' ELSE payment_status END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      b.status,
      courier,
      tracking,
      url,
      b.status,
      o.id,
    );
    audit(req, "update_order", o.id);
  });
  res.json(orderView(one("SELECT * FROM orders WHERE id=?", req.params.id)));
});
app.get("/api/admin/settings", (req, res) =>
  res.json({
    shipping: setting("shipping"),
    campaign: setting("campaign"),
    lookbook: setting("lookbook"),
    policies: all("SELECT * FROM policies"),
  }),
);
app.put("/api/admin/settings", (req, res) => {
  const b = req.body;
  transaction(() => {
    if (b.shipping) {
      const s = b.shipping;
      setSetting("shipping", {
        flat: integer(s.flat, "flat shipping"),
        freeThreshold: integer(s.freeThreshold, "free shipping threshold"),
        codEnabled: !!bool(s.codEnabled),
      });
    }
    if (
      b.campaign &&
      ((safeMedia(b.campaign.mp4, "video") &&
        !b.campaign.mp4.endsWith(".mp4")) ||
        (safeMedia(b.campaign.webm, "video") &&
          !b.campaign.webm.endsWith(".webm")))
    )
      fail("Campaign video must match its MP4 or WebM slot.");
    if (b.campaign)
      setSetting("campaign", {
        poster:
          safeMedia(b.campaign.poster) || "/media/campaign-placeholder.svg",
        mp4: safeMedia(b.campaign.mp4, "video"),
        webm: safeMedia(b.campaign.webm, "video"),
      });
    if (b.lookbook) {
      if (!Array.isArray(b.lookbook) || b.lookbook.length !== 3)
        fail("Choose three lookbook images.");
      setSetting(
        "lookbook",
        b.lookbook.map(
          (x, i) => safeMedia(x) || `/media/editorial-0${i + 1}.svg`,
        ),
      );
    }
    if (b.policies) {
      if (!Array.isArray(b.policies) || b.policies.length !== 6)
        fail("All six policy pages required.");
      for (const p of b.policies) {
        if (!one("SELECT slug FROM policies WHERE slug=?", p.slug))
          fail("Unknown policy.");
        run(
          "UPDATE policies SET title=?,body=? WHERE slug=?",
          text(p.title, "Policy title", 150),
          text(p.body, "Policy copy", 20000),
          p.slug,
        );
      }
    }
    audit(req, "update_settings", "site");
  });
  res.json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
});
app.post("/api/admin/uploads", upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) fail("Choose a file.");
  const b = f.buffer;
  let extension = null;
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    extension = "png";
  else if (b[0] === 255 && b[1] === 216 && b[2] === 255) extension = "jpg";
  else if (
    b.subarray(0, 4).toString() === "RIFF" &&
    b.subarray(8, 12).toString() === "WEBP"
  )
    extension = "webp";
  else if (
    b.subarray(4, 8).toString() === "ftyp" &&
    /^(isom|iso[2-9]|mp4[12]|avc1|M4V |qt  )$/.test(
      b.subarray(8, 12).toString(),
    )
  )
    extension = "mp4";
  else if (
    b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
    b.subarray(0, 4096).includes(Buffer.from("webm"))
  )
    extension = "webm";
  if (!extension)
    fail(
      "Upload a valid PNG, JPEG, WebP, MP4 or WebM file. SVG uploads are not accepted.",
    );
  if (["png", "jpg", "webp"].includes(extension) && f.size > 10 * 1024 * 1024)
    fail("Images must be under 10 MB.");
  let content = b;
  if (["png", "jpg", "webp"].includes(extension)) {
    try {
      content = await sharp(b, {
        limitInputPixels: 25000000,
        failOn: "warning",
      })
        .rotate()
        .toBuffer();
    } catch {
      fail("Image is corrupt, truncated or exceeds 25 megapixels.");
    }
  }
  const name = randomUUID() + "." + extension;
  writeFileSync(resolve(uploadDir, name), content, { mode: 0o600, flag: "wx" });
  res.status(201).json({
    url: "/uploads/" + name,
    type: ["mp4", "webm"].includes(extension) ? "video" : "image",
  });
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use((req, res, next) =>
  req.path.split("/").some((p) => p.startsWith("."))
    ? res.status(404).end()
    : next(),
);
const dist = resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) => res.sendFile(resolve(dist, "index.html")));
}
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code !== "LIMIT_FILE_SIZE")
    return res
      .status(400)
      .json({ error: "Upload one file in the file field." });
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({
      error: "File is too large (80 MB video / 10 MB image maximum).",
    });
  const known = err.message?.includes("UNIQUE constraint");
  const status = err.status || (known ? 409 : 500);
  if (status >= 500 && !err.status)
    console.error("Server failure:", err.code || err.name);
  res.status(status).json({
    error: known
      ? "This value already exists. Choose a unique name or code."
      : status >= 500
        ? "Server operation failed. Please try again."
        : err.message || "Invalid request.",
  });
});
