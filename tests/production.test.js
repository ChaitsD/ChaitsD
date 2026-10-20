import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const temp = mkdtempSync(join(tmpdir(), "mg-prod-"));
process.env.NODE_ENV = "production";
process.env.APP_ORIGIN = "https://maygrey.example.test";
process.env.DATABASE_PATH = join(temp, "db.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
process.env.PAYMENT_MODE = "mock";
const { app } = await import("../server/app.js");
const { db, run } = await import("../server/db.js");
const { hashPassword } = await import("../server/security.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port;
await test("Production configuration security headers and cookie flags (local server only)", async () => {
  try {
    run(
      "INSERT INTO admin_users(id,name,email,password_hash) VALUES(?,?,?,?)",
      "prod-admin",
      "Admin",
      "admin@example.test",
      await hashPassword("production-test-password"),
    );
    const res = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MG-Request": "1",
        Origin: process.env.APP_ORIGIN,
      },
      body: JSON.stringify({
        admin: true,
        email: "admin@example.test",
        password: "production-test-password",
      }),
    });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie");
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"])
      assert.ok(cookie.includes(flag));
    assert.match(
      res.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    assert.match(res.headers.get("strict-transport-security"), /max-age/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-powered-by"), null);
    const c = await fetch(base + "/api/auth/me", {
      headers: { Cookie: cookie.split(";")[0] },
    });
    const user = (await c.json()).user;
    assert.equal(user.role, "admin");
    assert.equal(user.password_hash, undefined);
    const forbidden = await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MG-Request": "1",
        Origin: "https://evil.example",
      },
      body: "{}",
    });
    assert.equal(forbidden.status, 403);
    const preflight = await fetch(base + "/api/admin/products", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Headers": "x-mg-request",
      },
    });
    assert.equal(preflight.headers.get("access-control-allow-origin"), null);
    for (const name of readdirSync("dist/assets").filter((n) =>
      n.endsWith(".js"),
    )) {
      const code = readFileSync(join("dist/assets", name), "utf8");
      assert.equal(code.includes(process.env.SESSION_SECRET), false);
      assert.equal(code.includes("RAZORPAY_KEY_SECRET"), false);
    }
    console.log(
      "Verified Secure/HttpOnly cookies, CSP, HSTS, no-store, no CORS trust and no frontend secrets. No deployment or real HTTPS termination was performed.",
    );
  } finally {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
