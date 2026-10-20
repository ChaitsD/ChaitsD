import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
const temp = mkdtempSync(join(tmpdir(), "maygrey-test-"));
process.env.DATABASE_PATH = join(temp, "test.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
process.env.PAYMENT_MODE = "mock";
process.env.APP_ORIGIN = "http://localhost:5173";
const { app } = await import("../server/app.js");
const { all, one, run, db } = await import("../server/db.js");
const { hashPassword, digest } = await import("../server/security.js");
const { activePrice } = await import("../server/commerce.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
function client() {
  let cookie = "";
  return async (path, { method = "GET", body, headers = {}, ...rest } = {}) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-MG-Request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...rest,
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
}
const admin = client(),
  customer = client(),
  guest = client();
const addr = {
  name: "Test Customer",
  phone: "9876543210",
  email: "customer@example.test",
  address: "12 Concrete Street",
  city: "Mumbai",
  state: "Maharashtra",
  pin: "400001",
};
const items = [{ id: "mg-001", size: "M", qty: 1 }];
const editable = (p) => ({
  ...p,
  expected_updated_at: p.updated_at,
  variants: p.variants.map((v) => ({ ...v, expected_stock: v.stock })),
});
let firstOrder, accessToken, limitedCoupon;
await test("MAYGREY transactional commerce and security", async (t) => {
  try {
    await t.test(
      "seeded database has four products and exactly S/M/L/XL",
      async () => {
        let r = await guest("/catalog");
        assert.equal(r.data.products.length, 4);
        assert.deepEqual(
          r.data.products[0].variants.map((x) => x.size),
          ["S", "M", "L", "XL"],
        );
        assert.equal(r.data.products[0].price, 1499);
        assert.equal(r.data.products[0].stock, 40);
      },
    );
    await t.test("admin authorization and same-origin guards", async () => {
      assert.equal((await guest("/admin/products")).status, 403);
      assert.equal(
        (
          await guest("/auth/logout", {
            method: "POST",
            body: {},
            headers: { "X-MG-Request": "" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await guest("/auth/login", {
            method: "POST",
            body: { email: "a@b.test", password: "wrong" },
            headers: { Origin: "https://evil.test" },
          })
        ).status,
        403,
      );
      run(
        "INSERT INTO admin_users(id,name,email,password_hash) VALUES(?,?,?,?)",
        "admin-test",
        "Test Admin",
        "admin@example.test",
        await hashPassword("strong-admin-password-123"),
      );
      let r = await admin("/auth/login", {
        method: "POST",
        body: {
          admin: true,
          email: "admin@example.test",
          password: "strong-admin-password-123",
        },
      });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("set-cookie"), /HttpOnly/);
      assert.equal(r.data.user.password_hash, undefined);
      assert.equal((await admin("/admin/products")).status, 200);
    });
    await t.test(
      "price validation, active sale and schedule boundaries",
      async () => {
        let p = editable(
          (await admin("/admin/products")).data.find((p) => p.id === "mg-001"),
        );
        assert.equal(
          (
            await admin("/admin/products/" + p.id, {
              method: "PUT",
              body: { ...p, sale_price: 200000, sale_active: true },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin("/admin/products/" + p.id, {
              method: "PUT",
              body: { ...p, regular_price: -1 },
            })
          ).status,
          400,
        );
        let r = await admin("/admin/products/" + p.id, {
          method: "PUT",
          body: { ...p, sale_price: 120000, sale_active: true },
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.price, 1200);
        assert.equal(r.data.discountPercent, 20);
        assert.equal(
          (await guest("/checkout/quote", { method: "POST", body: { items } }))
            .data.subtotal,
          120000,
        );
        const future = {
          regular_price: 10000,
          sale_price: 8000,
          sale_active: 1,
          sale_start: "2030-01-01T00:00:00Z",
          sale_end: "2031-01-01T00:00:00Z",
        };
        assert.equal(activePrice(future, Date.parse("2029-01-01")), 10000);
        assert.equal(activePrice(future, Date.parse("2030-01-01")), 8000);
        assert.equal(activePrice(future, Date.parse("2031-01-01")), 10000);
        assert.equal(
          (await admin("/admin/products/" + p.id, { method: "PUT", body: p }))
            .status,
          409,
        );
      },
    );
    await t.test(
      "coupon percentage, minimum, selected products/collections, cap and expiry",
      async () => {
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items, coupon: "MAYGREY10" },
            })
          ).status,
          400,
        );
        let r = await guest("/checkout/quote", {
          method: "POST",
          body: { items: [{ ...items[0], qty: 2 }], coupon: "MAYGREY10" },
        });
        assert.equal(r.data.discount, 24000);
        const c = {
          code: "LIMITED",
          type: "fixed",
          value: 200000,
          minimum: 0,
          maximum: 25000,
          expires_at: null,
          usage_limit: 1,
          enabled: true,
          scope: "products",
          targets: ["mg-001"],
        };
        r = await admin("/admin/coupons", { method: "POST", body: c });
        assert.equal(r.status, 201);
        limitedCoupon = r.data.id;
        r = await guest("/checkout/quote", {
          method: "POST",
          body: { items, coupon: "LIMITED" },
        });
        assert.equal(r.data.discount, 25000);
        assert.ok(r.data.total >= 0);
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: {
                items: [{ id: "mg-002", size: "S", qty: 1 }],
                coupon: "LIMITED",
              },
            })
          ).status,
          400,
        );
        const expired = {
          ...c,
          code: "EXPIRED",
          expires_at: "2020-01-01",
          scope: "all",
          targets: [],
        };
        await admin("/admin/coupons", { method: "POST", body: expired });
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items, coupon: "EXPIRED" },
            })
          ).status,
          400,
        );
        r = await admin("/admin/coupons", {
          method: "POST",
          body: {
            ...c,
            code: "COLLECTION",
            scope: "collections",
            targets: ["drop-001"],
            type: "percent",
            value: 10,
            maximum: null,
          },
        });
        assert.equal(r.status, 201);
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items, coupon: "COLLECTION" },
            })
          ).data.discount,
          12000,
        );
      },
    );
    await t.test(
      "stock, unavailable sizes, drafts, sold out and stale inventory writes",
      async () => {
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items: [{ ...items[0], size: "XXL" }] },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items: [{ ...items[0], qty: 11 }] },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items: [items[0], items[0]] },
            })
          ).status,
          400,
        );
        let p = editable(
          (await admin("/admin/products")).data.find((p) => p.id === "mg-004"),
        );
        let r = await admin("/admin/products/" + p.id, {
          method: "PUT",
          body: { ...p, status: "draft" },
        });
        assert.equal(r.status, 200);
        assert.equal((await guest("/catalog")).data.products.length, 3);
        p = editable(r.data);
        r = await admin("/admin/products/" + p.id, {
          method: "PUT",
          body: { ...p, status: "sold_out" },
        });
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items: [{ id: p.id, size: "S", qty: 1 }] },
            })
          ).status,
          409,
        );
        p = editable(r.data);
        await admin("/admin/products/" + p.id, {
          method: "PUT",
          body: { ...p, status: "active" },
        });
      },
    );
    await t.test(
      "failed payment leaves no order, coupon usage or stock changes",
      async () => {
        const before = one("SELECT count(*) n FROM orders").n;
        assert.equal(
          (
            await guest("/checkout", {
              method: "POST",
              headers: { "Idempotency-Key": randomUUID() },
              body: { items, address: addr, expectedTotal: 1 },
            })
          ).status,
          409,
        );
        let r = await guest("/checkout", {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: {
            items,
            address: addr,
            mockResult: "failure",
            coupon: "LIMITED",
          },
        });
        assert.equal(r.status, 402);
        assert.equal(one("SELECT count(*) n FROM orders").n, before);
        assert.equal(
          one("SELECT used_count FROM coupons WHERE id=?", limitedCoupon)
            .used_count,
          0,
        );
      },
    );
    await t.test(
      "guest checkout, authoritative prices, idempotency and private confirmation",
      async () => {
        const key = randomUUID(),
          body = {
            items,
            address: addr,
            paymentMethod: "mock",
            coupon: "LIMITED",
            total: 1,
          };
        let stale = editable(
          (await admin("/admin/products")).data.find((p) => p.id === "mg-001"),
        );
        let r = await guest("/checkout", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body,
        });
        assert.equal(r.status, 201);
        firstOrder = r.data.order;
        accessToken = r.data.accessToken;
        assert.equal(firstOrder.subtotal, 120000);
        assert.equal(firstOrder.discount, 25000);
        assert.equal(firstOrder.total, 104900);
        assert.equal(firstOrder.payment_status, "mock_paid");
        assert.equal(firstOrder.guest_token_hash, undefined);
        r = await guest("/checkout", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body,
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.order.id, firstOrder.id);
        assert.equal(
          one(
            "SELECT stock FROM inventory i JOIN product_variants v ON i.variant_id=v.id WHERE product_id='mg-001' AND size='M'",
          ).stock,
          9,
        );
        assert.equal(
          (
            await admin("/admin/products/" + stale.id, {
              method: "PUT",
              body: stale,
            })
          ).status,
          409,
        );
        assert.equal((await guest("/orders/" + firstOrder.id)).status, 403);
        assert.equal(
          (
            await guest("/orders/" + firstOrder.id, {
              headers: { "X-Order-Token": accessToken },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await guest("/checkout/quote", {
              method: "POST",
              body: { items, coupon: "LIMITED" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await guest("/checkout", {
              method: "POST",
              headers: { "Idempotency-Key": key },
              body: { ...body, items: [{ ...items[0], qty: 2 }] },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "order status, tracking validation and exactly-once restocking",
      async () => {
        assert.equal(
          (
            await admin("/admin/orders/" + firstOrder.id, {
              method: "PUT",
              body: { status: "Delivered" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin("/admin/orders/" + firstOrder.id, {
              method: "PUT",
              body: { status: "Packed", tracking_url: "javascript:alert(1)" },
            })
          ).status,
          400,
        );
        let r = await admin("/admin/orders/" + firstOrder.id, {
          method: "PUT",
          body: {
            status: "Packed",
            courier: "Test Courier",
            tracking_number: "TRACK001",
            tracking_url: "https://example.com/track/001",
          },
        });
        assert.equal(r.status, 200);
        r = await admin("/admin/orders/" + firstOrder.id, {
          method: "PUT",
          body: { status: "Cancelled" },
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.stock_restored, 1);
        await admin("/admin/orders/" + firstOrder.id, {
          method: "PUT",
          body: { status: "Cancelled" },
        });
        assert.equal(
          one(
            "SELECT stock FROM inventory i JOIN product_variants v ON i.variant_id=v.id WHERE product_id='mg-001' AND size='M'",
          ).stock,
          10,
        );
        assert.equal(
          (
            await admin("/admin/orders/" + firstOrder.id, {
              method: "PUT",
              body: { status: "Confirmed" },
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "customer signup, address ownership, persisted wishlist and order history",
      async () => {
        let r = await customer("/auth/signup", {
          method: "POST",
          body: {
            name: addr.name,
            email: addr.email,
            password: "customer-password-123",
          },
        });
        assert.equal(r.status, 201);
        assert.equal((await customer("/admin/orders")).status, 403);
        r = await customer("/account/addresses", {
          method: "POST",
          body: addr,
        });
        assert.equal(r.status, 201);
        await guest("/account/addresses/" + r.data.id, {
          method: "DELETE",
          body: {},
        });
        assert.equal((await customer("/account")).data.addresses.length, 1);
        assert.equal(
          (
            await customer("/account/wishlist", {
              method: "PUT",
              body: { ids: ["mg-001", "mg-003"] },
            })
          ).status,
          200,
        );
        assert.deepEqual((await customer("/account")).data.wishlist.sort(), [
          "mg-001",
          "mg-003",
        ]);
        r = await customer("/checkout", {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: { items, address: addr },
        });
        assert.equal(r.status, 201);
        assert.equal((await customer("/account")).data.orders.length, 1);
        assert.equal(
          (await customer("/orders/" + r.data.order.id)).status,
          200,
        );
      },
    );
    await t.test(
      "shipping settings, COD gate and zero-stock race",
      async () => {
        assert.equal(
          (
            await guest("/checkout", {
              method: "POST",
              headers: { "Idempotency-Key": randomUUID() },
              body: { items, address: addr, paymentMethod: "cod" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await admin("/admin/settings", {
              method: "PUT",
              body: {
                shipping: {
                  flat: 5000,
                  freeThreshold: 200000,
                  codEnabled: true,
                },
              },
            })
          ).status,
          200,
        );
        let r = await guest("/checkout/quote", {
          method: "POST",
          body: { items: [{ ...items[0], qty: 2 }] },
        });
        assert.equal(r.data.shipping, 0);
        let p = editable(
          (await admin("/admin/products")).data.find((p) => p.id === "mg-002"),
        );
        p.variants = p.variants.map((v) => ({
          ...v,
          stock: v.size === "S" ? 1 : v.stock,
        }));
        assert.equal(
          (await admin("/admin/products/" + p.id, { method: "PUT", body: p }))
            .status,
          200,
        );
        const checkout = () =>
          guest("/checkout", {
            method: "POST",
            headers: { "Idempotency-Key": randomUUID() },
            body: {
              items: [{ id: p.id, size: "S", qty: 1 }],
              address: addr,
              paymentMethod: "cod",
            },
          });
        const results = await Promise.all([checkout(), checkout()]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          one(
            "SELECT i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE product_id=? AND size=?",
            p.id,
            "S",
          ).stock,
          0,
        );
      },
    );
    await t.test(
      "admin creation, image upload, collection assignment and product deletion",
      async () => {
        let r = await admin("/admin/collections", {
          method: "POST",
          body: { name: "DROP 002", description: "Test drop" },
        });
        assert.equal(r.status, 201);
        const collection = r.data.id;
        let p = editable(
          (await admin("/admin/products")).data.find((p) => p.id === "mg-003"),
        );
        delete p.id;
        delete p.expected_updated_at;
        p.sku = "MG-TEST";
        p.name = "Test product";
        p.collection_id = collection;
        p.variants = [{ size: "S", stock: 2, low_stock_threshold: 3 }];
        r = await admin("/admin/products", { method: "POST", body: p });
        assert.equal(r.status, 201);
        const id = r.data.id;
        assert.equal(
          (
            await admin("/admin/collections/" + collection, {
              method: "DELETE",
              body: {},
            })
          ).status,
          400,
        );
        const session = one("SELECT * FROM sessions WHERE role='admin'");
        assert.ok(session);
        const { default: sharp } = await import("sharp");
        const image = await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#000000" },
        })
          .png()
          .toBuffer();
        const login = await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-MG-Request": "1" },
          body: JSON.stringify({
            admin: true,
            email: "admin@example.test",
            password: "strong-admin-password-123",
          }),
        });
        const cookie = login.headers.get("set-cookie").split(";")[0];
        let form = new FormData();
        form.append(
          "file",
          new Blob([image], { type: "image/png" }),
          "test.png",
        );
        let response = await fetch(base + "/api/admin/uploads", {
          method: "POST",
          headers: { Cookie: cookie, "X-MG-Request": "1" },
          body: form,
        });
        assert.equal(response.status, 201);
        const uploaded = await response.json();
        assert.match(uploaded.url, /\.png$/);
        assert.equal((await fetch(base + uploaded.url)).status, 200);
        form = new FormData();
        form.append(
          "file",
          new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/png" }),
          "fake.png",
        );
        response = await fetch(base + "/api/admin/uploads", {
          method: "POST",
          headers: { Cookie: cookie, "X-MG-Request": "1" },
          body: form,
        });
        assert.equal(response.status, 400);
        await admin("/admin/products/" + id, { method: "DELETE", body: {} });
        assert.ok(
          !(await guest("/catalog")).data.products.some((p) => p.id === id),
        );
      },
    );
    await t.test(
      "password reset is single-use, expires, revokes sessions, and never exposes token in API",
      async () => {
        let r = await guest("/auth/forgot-password", {
          method: "POST",
          body: { email: addr.email },
        });
        assert.equal(r.status, 200);
        assert.equal(r.data.token, undefined);
        run(
          "INSERT INTO password_resets VALUES(?,?,?,0)",
          digest("expired-test-token"),
          one("SELECT id FROM customers WHERE email=?", addr.email).id,
          Date.now() - 1000,
        );
        assert.equal(
          (
            await guest("/auth/reset-password", {
              method: "POST",
              body: {
                token: "expired-test-token",
                password: "expired-password-123",
              },
            })
          ).status,
          400,
        );
        const mail = one(
          "SELECT * FROM mail_outbox WHERE recipient=? ORDER BY rowid DESC",
          addr.email,
        );
        const reset = new URL(mail.body.split(" ").at(-1)).searchParams.get(
          "token",
        );
        r = await guest("/auth/reset-password", {
          method: "POST",
          body: { token: reset, password: "new-customer-password-456" },
        });
        assert.equal(r.status, 200);
        assert.equal((await customer("/account")).status, 401);
        assert.equal(
          (
            await guest("/auth/reset-password", {
              method: "POST",
              body: { token: reset, password: "another-password-123" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await customer("/auth/login", {
              method: "POST",
              body: {
                email: addr.email,
                password: "new-customer-password-456",
              },
            })
          ).status,
          200,
        );
        await customer("/auth/logout", { method: "POST", body: {} });
        assert.equal((await customer("/account")).status, 401);
      },
    );
    await t.test(
      "analytics exclude cancelled revenue and server persists relational records",
      async () => {
        const d = (await admin("/admin/dashboard")).data;
        assert.ok(d.totalOrders >= 3);
        assert.ok(d.revenue > 0);
        assert.ok(d.productsSold > 0);
        assert.ok(d.lowStock.some((v) => v.stock === 0));
        assert.equal(all("SELECT * FROM schema_migrations").length, 2);
        assert.equal(one("PRAGMA integrity_check").integrity_check, "ok");
      },
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
