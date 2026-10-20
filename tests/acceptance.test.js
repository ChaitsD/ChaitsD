import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
const temp = mkdtempSync(join(tmpdir(), "mg-acceptance-"));
process.env.DATABASE_PATH = join(temp, "store.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.PAYMENT_MODE = "mock";
process.env.TRUST_PROXY = "0";
const { app } = await import("../server/app.js");
const { one, all, run, db } = await import("../server/db.js");
const { hashPassword, digest } = await import("../server/security.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
const headers = { "Content-Type": "application/json", "X-MG-Request": "1" };
function client() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async req(path, { method = "GET", body, extra = {} } = {}) {
      const r = await fetch(base + "/api" + path, {
        method,
        headers: { ...headers, Cookie: cookie, ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      return { status: r.status, data: await r.json(), headers: r.headers };
    },
  };
}
const admin = client(),
  guest = client(),
  customer = client();
const address = {
  name: "Acceptance Buyer",
  email: "acceptance@example.test",
  phone: "9876543210",
  address: "12 Test Street",
  city: "Mumbai",
  state: "Maharashtra",
  pin: "400001",
};
const items = [{ id: "mg-001", size: "S", qty: 1 }];
const editable = (p) => ({
  ...p,
  expected_updated_at: p.updated_at,
  variants: p.variants.map((v) => ({ ...v, expected_stock: v.stock })),
});
await test("Acceptance security and commerce regressions", async (t) => {
  try {
    run(
      "INSERT INTO admin_users(id,name,email,password_hash) VALUES(?,?,?,?)",
      "acceptance-admin",
      "Admin",
      "admin@example.test",
      await hashPassword("  admin-password-with-spaces  "),
    );
    await t.test(
      "passwords retain spaces, login rotates old session and logout revokes it",
      async () => {
        let r = await admin.req("/auth/login", {
          method: "POST",
          body: {
            admin: true,
            email: "admin@example.test",
            password: "  admin-password-with-spaces  ",
          },
        });
        assert.equal(r.status, 200);
        const old = admin.cookie;
        await admin.req("/auth/login", {
          method: "POST",
          body: {
            admin: true,
            email: "admin@example.test",
            password: "  admin-password-with-spaces  ",
          },
        });
        assert.notEqual(old, admin.cookie);
        assert.equal(
          (await guest.req("/admin/orders", { extra: { Cookie: old } })).status,
          403,
        );
        const current = admin.cookie;
        await admin.req("/auth/logout", { method: "POST", body: {} });
        assert.equal(
          (await guest.req("/admin/orders", { extra: { Cookie: current } }))
            .status,
          403,
        );
        await admin.req("/auth/login", {
          method: "POST",
          body: {
            admin: true,
            email: "admin@example.test",
            password: "  admin-password-with-spaces  ",
          },
        });
      },
    );
    await t.test(
      "expired, forged and customer sessions cannot access admin CRUD",
      async () => {
        await customer.req("/auth/signup", {
          method: "POST",
          body: {
            name: "Customer",
            email: address.email,
            password: "customer-password-123",
          },
        });
        for (const [path, method, body] of [
          ["/admin/products", "GET"],
          ["/admin/products", "POST", {}],
          ["/admin/products/mg-001", "PUT", {}],
          ["/admin/products/mg-001", "DELETE", {}],
          ["/admin/settings", "PUT", {}],
          ["/admin/orders", "GET"],
        ])
          assert.equal(
            (await customer.req(path, { method, body })).status,
            403,
          );
        assert.equal(
          (
            await guest.req("/admin/orders", {
              extra: { Cookie: "mg_session=forged" },
            })
          ).status,
          403,
        );
        const raw = customer.cookie.split("=")[1];
        run(
          "UPDATE sessions SET expires_at=? WHERE token_hash=?",
          Date.now() - 1,
          digest(raw),
        );
        assert.equal((await customer.req("/account")).status, 401);
      },
    );
    await t.test(
      "malformed JSON, bags, sale prices, quantities and coupon values rejected without mutation",
      async () => {
        let r = await guest.req("/checkout/quote", {
          method: "POST",
          body: null,
        });
        assert.equal(r.status, 400);
        for (const bag of [
          [null],
          [{ ...items[0], qty: -1 }],
          [{ ...items[0], qty: 1.2 }],
          [{ ...items[0], id: "' OR 1=1 --" }],
        ])
          assert.ok(
            (
              await guest.req("/checkout/quote", {
                method: "POST",
                body: { items: bag },
              })
            ).status < 500,
          );
        r = await admin.req("/admin/coupons", {
          method: "POST",
          body: {
            code: "TOOMUCH",
            type: "percent",
            value: 101,
            minimum: 0,
            maximum: null,
            expires_at: null,
            usage_limit: null,
            enabled: true,
            scope: "all",
            targets: [],
          },
        });
        assert.equal(r.status, 400);
        assert.equal(
          one("SELECT id FROM coupons WHERE code=?", "TOOMUCH"),
          undefined,
        );
      },
    );
    await t.test(
      "upload authorization, valid decoding, spoof/truncation rejection, size limits and public media headers",
      async () => {
        async function upload(
          buffer,
          cookie = admin.cookie,
          name = "../../evil.png",
        ) {
          const form = new FormData();
          form.append("file", new Blob([buffer], { type: "image/png" }), name);
          const r = await fetch(base + "/api/admin/uploads", {
            method: "POST",
            headers: { Cookie: cookie, "X-MG-Request": "1" },
            body: form,
          });
          return { status: r.status, data: await r.json() };
        }
        const image = await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#fff" },
        })
          .png()
          .toBuffer();
        assert.equal((await upload(image, "")).status, 403);
        assert.equal(
          (await upload(Buffer.from('<svg onload="alert(1)"/>'))).status,
          400,
        );
        assert.equal(
          (await upload(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).status,
          400,
        );
        assert.equal(
          (await upload(Buffer.concat([image, Buffer.alloc(10 * 1024 * 1024)])))
            .status,
          400,
        );
        const result = await upload(image);
        assert.equal(result.status, 201);
        assert.match(result.data.url, /^\/uploads\/[a-f0-9-]+\.png$/);
        const asset = await fetch(base + result.data.url);
        assert.equal(asset.headers.get("x-content-type-options"), "nosniff");
        assert.match(asset.headers.get("content-security-policy"), /sandbox/);
        assert.ok((await asset.arrayBuffer()).byteLength > 0);
        const webp = await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#777" },
        })
          .webp()
          .toBuffer();
        const validWebp = await upload(webp);
        assert.equal(validWebp.status, 201);
        assert.match(validWebp.data.url, /\.webp$/);
        const jpeg = await sharp({
          create: { width: 2, height: 2, channels: 3, background: "#000" },
        })
          .jpeg()
          .withMetadata({ exif: { IFD0: { Artist: "Private test metadata" } } })
          .toBuffer();
        const clean = await upload(jpeg);
        assert.equal(clean.status, 201);
        assert.match(clean.data.url, /\.jpg$/);
        const decoded = await sharp(
          Buffer.from(await (await fetch(base + clean.data.url)).arrayBuffer()),
        ).metadata();
        assert.equal(decoded.exif, undefined);
        assert.equal((await fetch(base + "/uploads/missing.png")).status, 404);
        assert.equal(
          statSync(
            join(process.env.UPLOAD_DIR, result.data.url.split("/").at(-1)),
          ).mode & 0o777,
          0o600,
        );
      },
    );
    await t.test(
      "coupons clamp at zero, fixed discounts, expiry and disabled code behavior",
      async () => {
        const seed = {
          type: "fixed",
          value: 999999,
          minimum: 0,
          maximum: null,
          usage_limit: null,
          expires_at: null,
          enabled: true,
          scope: "all",
          targets: [],
        };
        for (const c of [
          { ...seed, code: "ZERO" },
          { ...seed, code: "FIXED", value: 10000 },
          { ...seed, code: "EXPIRED", expires_at: "2001-01-01T00:00:00Z" },
          { ...seed, code: "DISABLED", enabled: false },
        ])
          assert.equal(
            (await admin.req("/admin/coupons", { method: "POST", body: c }))
              .status,
            201,
          );
        await admin.req("/admin/settings", {
          method: "PUT",
          body: { shipping: { flat: 0, freeThreshold: 0, codEnabled: false } },
        });
        let q = (
          await guest.req("/checkout/quote", {
            method: "POST",
            body: { items, coupon: "ZERO" },
          })
        ).data;
        assert.equal(q.discount, 149900);
        assert.equal(q.total, 0);
        q = (
          await guest.req("/checkout/quote", {
            method: "POST",
            body: { items, coupon: "FIXED" },
          })
        ).data;
        assert.equal(q.total, 139900);
        for (const coupon of ["EXPIRED", "DISABLED"])
          assert.equal(
            (
              await guest.req("/checkout/quote", {
                method: "POST",
                body: { items, coupon },
              })
            ).status,
            400,
          );
      },
    );
    await t.test(
      "multi-line failure rolls back order and all size stocks; orders have immutable test identity",
      async () => {
        const stock = () =>
          all(
            "SELECT v.size,i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE v.product_id='mg-001' ORDER BY v.rowid",
          );
        const before = stock();
        const count = one("SELECT count(*) n FROM orders").n;
        run(
          `CREATE TRIGGER acceptance_late_failure BEFORE INSERT ON order_items WHEN NEW.size='M' BEGIN SELECT RAISE(ABORT,'Injected late write failure'); END`,
        );
        try {
          const late = await guest.req("/checkout", {
            method: "POST",
            extra: { "Idempotency-Key": randomUUID() },
            body: {
              items: [items[0], { id: "mg-001", size: "M", qty: 1 }],
              address,
            },
          });
          assert.equal(late.status, 500);
          assert.equal(
            late.data.error,
            "Server operation failed. Please try again.",
          );
          assert.deepEqual(stock(), before);
          assert.equal(one("SELECT count(*) n FROM orders").n, count);
          assert.equal(one("SELECT count(*) n FROM order_items").n, 0);
        } finally {
          run("DROP TRIGGER acceptance_late_failure");
        }
        let r = await guest.req("/checkout", {
          method: "POST",
          extra: { "Idempotency-Key": randomUUID() },
          body: {
            items: [items[0], { id: "mg-001", size: "M", qty: 99 }],
            address,
          },
        });
        assert.equal(r.status, 409);
        assert.deepEqual(stock(), before);
        assert.equal(one("SELECT count(*) n FROM orders").n, count);
        r = await guest.req("/checkout", {
          method: "POST",
          extra: { "Idempotency-Key": randomUUID() },
          body: {
            items: ["S", "M", "L", "XL"].map((size) => ({
              id: "mg-001",
              size,
              qty: 1,
            })),
            address,
          },
        });
        assert.equal(r.status, 201);
        assert.match(r.data.order.id, /^TEST-MG-/);
        assert.equal(r.data.order.isTest, true);
        assert.equal(r.data.order.payment_mode, "mock");
        for (const row of stock()) assert.equal(row.stock, 9);
        const order = r.data.order;
        assert.equal(order.total, 599600);
        assert.equal(
          (await admin.req("/admin/orders")).data.some(
            (o) => o.id === order.id && o.isTest,
          ),
          true,
        );
        await admin.req("/admin/orders/" + order.id, {
          method: "PUT",
          body: { status: "Cancelled" },
        });
        await admin.req("/admin/orders/" + order.id, {
          method: "PUT",
          body: { status: "Cancelled" },
        });
        assert.deepEqual(stock(), before);
        assert.throws(
          () =>
            run("UPDATE orders SET payment_status='paid' WHERE id=?", order.id),
          /Only explicit test/,
        );
      },
    );
    await t.test("delivered returns restore stock exactly once", async () => {
      const before = one(
        "SELECT i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE product_id='mg-001' AND size='S'",
      ).stock;
      const result = await guest.req("/checkout", {
        method: "POST",
        extra: { "Idempotency-Key": randomUUID() },
        body: { items, address },
      });
      assert.equal(result.status, 201);
      const id = result.data.order.id;
      for (const status of [
        "Packed",
        "Shipped",
        "Delivered",
        "Returned",
        "Returned",
      ])
        assert.equal(
          (
            await admin.req("/admin/orders/" + id, {
              method: "PUT",
              body: { status },
            })
          ).status,
          200,
        );
      assert.equal(
        one(
          "SELECT i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE product_id='mg-001' AND size='S'",
        ).stock,
        before,
      );
      assert.equal(
        one("SELECT payment_status FROM orders WHERE id=?", id).payment_status,
        "mock_reversed",
      );
    });
    await t.test(
      "one customer cannot read orders or delete addresses belonging to another",
      async () => {
        const a = client(),
          b = client();
        assert.equal(
          (
            await a.req("/auth/login", {
              method: "POST",
              body: { email: address.email, password: "customer-password-123" },
            })
          ).status,
          200,
        );
        const saved = await a.req("/account/addresses", {
          method: "POST",
          body: address,
        });
        assert.equal(saved.status, 201);
        const placed = await a.req("/checkout", {
          method: "POST",
          extra: { "Idempotency-Key": randomUUID() },
          body: { items, address },
        });
        assert.equal(placed.status, 201);
        assert.equal(
          (
            await b.req("/auth/signup", {
              method: "POST",
              body: {
                name: "Other Customer",
                email: "other-security@example.test",
                password: "other-customer-password",
              },
            })
          ).status,
          201,
        );
        assert.equal(
          (await b.req("/orders/" + placed.data.order.id)).status,
          403,
        );
        await b.req("/account/addresses/" + saved.data.id, {
          method: "DELETE",
          body: {},
        });
        assert.equal((await a.req("/account")).data.addresses.length, 1);
        assert.equal((await b.req("/account")).data.orders.length, 0);
      },
    );
    await t.test(
      "live mode refuses new orders even if Razorpay-looking fields are submitted",
      async () => {
        const count = one("SELECT count(*) n FROM orders").n;
        process.env.PAYMENT_MODE = "razorpay";
        const r = await guest.req("/checkout", {
          method: "POST",
          extra: { "Idempotency-Key": randomUUID() },
          body: {
            items,
            address,
            razorpay_payment_id: "pretend-paid",
            paymentStatus: "paid",
          },
        });
        assert.equal(r.status, 503);
        assert.equal(one("SELECT count(*) n FROM orders").n, count);
        process.env.PAYMENT_MODE = "mock";
      },
    );
    await t.test(
      "no credentials, tokens or PII in public catalog; hidden files never served",
      async () => {
        const r = await guest.req("/catalog");
        const serialized = JSON.stringify(r.data);
        for (const secret of [
          process.env.SESSION_SECRET,
          "password_hash",
          "guest_token_hash",
          "acceptance@example.test",
        ])
          assert.equal(serialized.includes(secret), false);
        assert.equal((await fetch(base + "/.env")).status, 404);
        assert.equal((await fetch(base + "/.data/store.sqlite")).status, 404);
        assert.equal(statSync(process.env.DATABASE_PATH).mode & 0o777, 0o600);
      },
    );
    await t.test(
      "login rate limit returns JSON 429 and cannot be bypassed with forged forwarded IP",
      async () => {
        let blocked = false;
        for (let i = 0; i < 22; i++) {
          const r = await guest.req("/auth/login", {
            method: "POST",
            body: {
              email: "nobody@example.test",
              password: "incorrect-password",
            },
            extra: { "X-Forwarded-For": "192.0.2." + (i + 1) },
          });
          if (r.status === 429) {
            blocked = true;
            assert.match(r.data.error, /Too many/);
            assert.ok(r.headers.get("retry-after"));
            break;
          }
          assert.equal(r.status, 401);
        }
        assert.equal(blocked, true);
      },
    );
    await t.test("global API rate limit returns JSON 429", async () => {
      let blocked = false;
      for (let i = 0; i < 310; i++) {
        const r = await guest.req("/health");
        if (r.status === 429) {
          blocked = true;
          assert.match(r.data.error, /Too many/);
          break;
        }
      }
      assert.equal(blocked, true);
    });
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
