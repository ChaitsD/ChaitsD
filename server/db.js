import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export const dbPath = resolve(
  process.env.DATABASE_PATH || ".data/maygrey.sqlite",
);
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(dbPath);
chmodSync(dbPath, 0o600);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
// Additive migration: every existing order was created by the mock-only adapter.
if (
  !db
    .prepare("PRAGMA table_info(orders)")
    .all()
    .some((c) => c.name === "payment_mode")
)
  db.exec(
    "ALTER TABLE orders ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'mock' CHECK(payment_mode='mock')",
  );
db.exec(`CREATE TRIGGER IF NOT EXISTS mock_orders_insert BEFORE INSERT ON orders WHEN NEW.payment_status NOT IN ('mock_paid','test_cod_pending','mock_reversed') OR NEW.payment_method NOT IN ('mock','cod') BEGIN SELECT RAISE(ABORT,'Only explicit test payments are supported'); END;
CREATE TRIGGER IF NOT EXISTS mock_orders_update BEFORE UPDATE OF payment_status,payment_method ON orders WHEN NEW.payment_status NOT IN ('mock_paid','test_cod_pending','mock_reversed') OR NEW.payment_method NOT IN ('mock','cod') BEGIN SELECT RAISE(ABORT,'Only explicit test payments are supported'); END;
INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);`);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
export function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const setting = (key) =>
  JSON.parse(
    one("SELECT value FROM settings WHERE key=?", key)?.value || "null",
  );
export const setSetting = (key, value) =>
  run(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    key,
    JSON.stringify(value),
  );
if (!one("SELECT 1 FROM settings WHERE key=?", "seeded"))
  transaction(() => {
    run(
      "INSERT INTO collections VALUES(?,?,?)",
      "drop-001",
      "DROP 001 — SOMEWHERE BETWEEN",
      "Four expressions. One state of mind.",
    );
    const seeds = [
      [
        "Broken Statue",
        1499,
        "Washed black",
        "#333331",
        "Something whole. Something broken. A study in becoming, printed on a washed black oversized silhouette.",
      ],
      [
        "After Rain",
        1499,
        "Bone",
        "#c8c3b5",
        "The quiet after everything. A weathered botanical print on bone cotton, made for the spaces in between.",
      ],
      [
        "Chrome Flower",
        1599,
        "Charcoal",
        "#555552",
        "Softness with an edge. An abstract metallic bloom against charcoal, where the organic meets the industrial.",
      ],
      [
        "False Memory",
        1599,
        "Faded grey",
        "#93918a",
        "A place you almost remember. Distorted typography and faded textures, built for a future that feels familiar.",
      ],
    ];
    seeds.forEach(([name, price, color, tone, description], i) => {
      const id = `mg-00${i + 1}`,
        sku = `MG-00${i + 1}`;
      run(
        `INSERT INTO products(id,sku,name,description,fabric,gsm,fit,care,color,tone,regular_price,status,featured,collection_id,images) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        sku,
        name,
        description,
        "100% cotton (provisional)",
        240,
        "Oversized, dropped shoulder",
        "Wash cold inside out. Dry in shade. Do not bleach or iron on print.",
        color,
        tone,
        price * 100,
        "active",
        1,
        "drop-001",
        JSON.stringify(
          Object.fromEntries(
            ["front", "back", "detail"].map((v) => [
              v,
              `/media/${id}-${v}.svg`,
            ]),
          ),
        ),
      );
      ["S", "M", "L", "XL"].forEach((size) => {
        let vid = randomUUID();
        run(
          "INSERT INTO product_variants VALUES(?,?,?,?,?,1)",
          vid,
          id,
          `${sku}-${size}`,
          color,
          size,
        );
        run("INSERT INTO inventory(variant_id,stock) VALUES(?,?)", vid, 10);
      });
    });
    run(
      "INSERT INTO coupons(id,code,type,value,minimum,enabled) VALUES(?,?,?,?,?,1)",
      randomUUID(),
      "MAYGREY10",
      "percent",
      10,
      149900,
    );
    setSetting("shipping", {
      flat: 9900,
      freeThreshold: 299900,
      codEnabled: false,
    });
    setSetting("campaign", {
      poster: "/media/campaign-placeholder.svg",
      mp4: null,
      webm: null,
    });
    setSetting("lookbook", [
      "/media/editorial-01.svg",
      "/media/editorial-02.svg",
      "/media/editorial-03.svg",
    ]);
    for (const [slug, title, body] of [
      [
        "shipping-policy",
        "Shipping Policy",
        "DRAFT POLICY — Please review before launch.\nOrders are currently placed in test mode only. Shipping is calculated at checkout using the store’s flat rate and free shipping threshold. Delivery timelines will be published before real orders open.",
      ],
      [
        "returns-exchange",
        "Returns & Exchange",
        "DRAFT POLICY — Please review before launch.\nReturn windows, eligibility, exchanges and return shipping fees will be confirmed before launch. Keep items unworn with original tags. Contact details will be added before real orders open.",
      ],
      [
        "privacy-policy",
        "Privacy Policy",
        "DRAFT POLICY — Please review before launch.\nAccount details, addresses and order data are stored to operate this store. Passwords are hashed and sessions use secure cookies in production. Contact, retention periods and legal privacy terms must be completed before launch.",
      ],
      [
        "terms-conditions",
        "Terms & Conditions",
        "DRAFT POLICY — Please review before launch.\nThis site is operating in test payment mode. No real charge is made. Product specifications and media remain provisional. Final purchase terms and business identity will be published before launch.",
      ],
      [
        "faq",
        "FAQ",
        "Is payment real?\nNo. Checkout is clearly marked test mode and does not collect card or UPI details.\n\nHow do I choose my size?\nSee the Size Guide and select your size on the product page.\n\nCan I checkout without an account?\nYes. Guest checkout is available. Save your order confirmation on this device.",
      ],
      [
        "size-guide",
        "Size Guide",
        "Provisional oversized measurements in inches. Confirm final production measurements before launch.\nS — Chest 42 / Length 27\nM — Chest 44 / Length 28\nL — Chest 46 / Length 29\nXL — Chest 48 / Length 30\nSelect your usual size for an oversized fit.",
      ],
    ])
      run("INSERT INTO policies VALUES(?,?,?)", slug, title, body);
    setSetting("seeded", true);
  });
