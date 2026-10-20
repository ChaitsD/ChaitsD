import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "maygrey-browser-"));
const port = Number(process.env.E2E_PORT || 3199),
  base = `http://127.0.0.1:${port}`;
process.env.DATABASE_PATH = join(temp, "store.sqlite");
process.env.UPLOAD_DIR = join(temp, "uploads");
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
process.env.APP_ORIGIN = base;
process.env.PAYMENT_MODE = "mock";
const { app, apiLimiter } = await import("../server/app.js");
const { run, one, all, db } = await import("../server/db.js");
const { hashPassword } = await import("../server/security.js");
const adminPassword = randomBytes(20).toString("hex");
run(
  "INSERT INTO admin_users(id,name,email,password_hash) VALUES(?,?,?,?)",
  "browser-admin",
  "Browser Admin",
  "admin@example.test",
  await hashPassword(adminPassword),
);
const server = app.listen(port, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
let browser;
const errors = [];
function pass(label) {
  console.log("PASS " + label);
}
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (r.status() >= 500)
      errors.push(r.status() + " " + new URL(r.url()).pathname);
    if (process.env.DEBUG_ACCEPTANCE && r.status() >= 400)
      console.log("HTTP", r.status(), new URL(r.url()).pathname);
  });
  async function go(path) {
    await page.goto(base + path);
    await page.locator("header").waitFor();
    await page.locator("h1").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  await go("/");
  assert.match(await page.locator("h1").innerText(), /SOMEWHERE/);
  await page.screenshot({ path: join(temp, "homepage.png"), fullPage: true });
  pass("Phase 1 homepage retained");
  await go("/shop");
  assert.equal(await page.locator(".product-card").count(), 4);
  await page
    .getByRole("button", { name: "Save Broken Statue to wishlist" })
    .click();
  await page.getByRole("button", { name: "SAVED (1)" }).click();
  assert.equal(await page.locator(".product-card").count(), 1);
  pass("Shop and guest wishlist");
  await go("/product/mg-001");
  assert.equal(await page.locator(".sizes button").count(), 4);
  assert.equal(
    await page.locator(".sizes").getByText("XXL", { exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "View back", exact: true }).click();
  assert.match(
    await page.locator(".main-image img").getAttribute("src"),
    /back/,
  );
  await page.getByRole("button", { name: "ADD TO BAG", exact: true }).click();
  assert.equal(
    await page.getByRole("alert").innerText(),
    "Choose your size to continue.",
  );
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "ADD TO BAG", exact: true }).click();
  await page.getByRole("dialog", { name: "Shopping bag" }).waitFor();
  await page.getByRole("link", { name: "VIEW YOUR BAG" }).click();
  await page.getByText("₹2,998.00", { exact: true }).first().waitFor();
  pass("Gallery, required size, quantity and server-priced cart");
  await page.getByRole("link", { name: "CHECKOUT — TEST MODE" }).click();
  await page.getByLabel("Coupon code").fill("MAYGREY10");
  await page.getByRole("button", { name: "APPLY", exact: true }).click();
  await page.getByText("MAYGREY10 applied").waitFor();
  await page.getByLabel("Full name", { exact: true }).fill("Browser Customer");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByLabel("Email", { exact: true }).fill("buyer@example.test");
  await page.getByLabel("Address", { exact: true }).fill("12 Concrete Street");
  await page.getByLabel("City", { exact: true }).fill("Mumbai");
  await page.getByLabel("State", { exact: true }).fill("Maharashtra");
  await page.getByLabel("PIN code", { exact: true }).fill("400001");
  await page.getByLabel("Simulate payment result").selectOption("failure");
  await page.locator(".check-field input[type=checkbox]").check();
  await page
    .getByRole("button", { name: "PLACE TEST ORDER", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Mock payment failed" })
    .waitFor();
  assert.equal(one("SELECT count(*) n FROM orders").n, 0);
  await page.getByLabel("Simulate payment result").selectOption("success");
  await page
    .getByRole("button", { name: "PLACE TEST ORDER", exact: true })
    .click();
  await page.waitForURL("**/orders/**");
  await page.getByRole("heading", { name: "YOU’RE IN." }).waitFor();
  assert.equal(one("SELECT total FROM orders").total, 279720);
  const orderId = one("SELECT id FROM orders").id;
  await page.reload();
  await page.getByRole("heading", { name: "YOU’RE IN." }).waitFor();
  pass(
    "Coupon, failed mock payment, guest checkout, private reloadable confirmation",
  );
  await go("/admin");
  await page.getByLabel("Admin email").fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "SIGN IN TO ADMIN" }).click();
  await page.getByRole("heading", { name: "AT A GLANCE." }).waitFor();
  pass("Protected admin sign-in and analytics");
  await page
    .getByRole("navigation", { name: "Admin navigation" })
    .getByRole("link", { name: "products", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Broken Statue" })
    .getByRole("button", { name: "EDIT", exact: true })
    .click();
  await page.getByLabel("Product name", { exact: true }).fill("Broken Statue");
  await page.getByLabel("Regular price / MRP (₹)").fill("1699");
  await page.getByLabel("Optional sale price (₹)").fill("1399");
  await page.getByLabel("Enable sale").check();
  await page.getByLabel("Stock", { exact: true }).nth(1).fill("0");
  const uploadedImage = await page.screenshot();
  await page.locator(".upload-field input[type=file]").first().setInputFiles({
    name: "product-test.png",
    mimeType: "image/png",
    buffer: uploadedImage,
  });
  await page.locator(".upload-field img").first().waitFor();
  await page.waitForFunction(() =>
    document
      .querySelector(".upload-field img")
      ?.getAttribute("src")
      ?.startsWith("/uploads/"),
  );
  await page.getByRole("button", { name: "SAVE PRODUCT", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Product saved" }).waitFor();
  assert.equal(
    one("SELECT regular_price FROM products WHERE id='mg-001'").regular_price,
    169900,
  );
  assert.equal(
    one("SELECT unit_price FROM order_items LIMIT 1").unit_price,
    149900,
  );
  pass(
    "Admin image upload, price and inventory editing; historical order price preserved",
  );
  await page
    .getByRole("navigation", { name: "Admin navigation" })
    .getByRole("link", { name: "coupons", exact: true })
    .click();
  await page.getByRole("button", { name: "ADD COUPON", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("TEST25");
  await page.getByLabel("Percentage (1–100)").fill("25");
  await page.getByLabel("Minimum order (₹)").fill("1000");
  await page.getByLabel("Maximum discount (₹, optional)").fill("200");
  await page.getByLabel("Applies to").selectOption("products");
  await page.getByLabel("Broken Statue", { exact: true }).check();
  await page.getByRole("button", { name: "SAVE COUPON", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Coupon saved" }).waitFor();
  pass("Admin scoped coupon creation");
  await page
    .getByRole("navigation", { name: "Admin navigation" })
    .getByRole("link", { name: "settings", exact: true })
    .click();
  await page.getByLabel("Flat shipping (₹)").fill("49");
  await page
    .getByLabel("Free shipping threshold after discounts (₹)")
    .fill("1999");
  await page.getByLabel("Enable cash on delivery (test orders only)").check();
  await page.getByText("FAQ", { exact: true }).click();
  await page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "FAQ" }) })
    .getByLabel("Policy copy")
    .fill("TEST FAQ — Editable in admin. Guest checkout is supported.");
  await page
    .getByRole("button", { name: "SAVE SETTINGS", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "settings saved" })
    .waitFor();
  pass("Editable shipping, COD and policy content");
  await page
    .getByRole("navigation", { name: "Admin navigation" })
    .getByRole("link", { name: "orders", exact: true })
    .click();
  await page.getByRole("button", { name: "MANAGE", exact: true }).click();
  await page.getByLabel("Order status").selectOption("Packed");
  await page.getByLabel("Courier name").fill("Test Courier");
  await page.getByLabel("Tracking number").fill("TEST001");
  await page
    .getByLabel("Tracking URL (HTTPS)")
    .fill("https://example.com/track/TEST001");
  await page.getByRole("button", { name: "SAVE ORDER", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Order updated" }).waitFor();
  assert.equal(
    one("SELECT status FROM orders WHERE id=?", orderId).status,
    "Packed",
  );
  pass("Admin order status and shipment details");
  await go("/product/mg-001");
  assert.equal(
    await page.getByRole("button", { name: "M", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.locator(".price-display del").innerText(),
    "₹1,699.00",
  );
  assert.equal(await page.locator(".discount").innerText(), "18% OFF");
  pass("Storefront sale presentation and zero-stock prevention");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/shop",
    "/product/mg-003",
    "/about",
    "/lookbook",
    "/cart",
    "/account",
    "/shipping-policy",
    "/returns-exchange",
    "/privacy-policy",
    "/terms-conditions",
    "/faq",
    "/size-guide",
    "/admin",
    "/admin/products",
    "/admin/coupons",
    "/admin/orders",
    "/admin/settings",
  ]) {
    await go(route);
    await page.evaluate(() =>
      Promise.all([...document.images].map((i) => i.decode().catch(() => {}))),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      "Mobile overflow " + route,
    );
    assert.equal(
      await page
        .locator("img")
        .evaluateAll((xs) => xs.every((i) => i.complete && i.naturalWidth > 0)),
      true,
      "Broken media " + route,
    );
  }
  pass(
    "18 storefront/admin/policy pages without mobile overflow or broken images",
  );
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/shop",
      "/product/mg-001",
      "/about",
      "/lookbook",
      "/admin/settings",
    ]) {
      await go(route);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        "Overflow " + width + " " + route,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  pass("320px and tablet layouts");
  await go("/admin/products");
  await page
    .getByRole("row")
    .filter({ hasText: "Broken Statue" })
    .getByRole("button", { name: "EDIT", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: join(temp, "admin-mobile.png"),
    fullPage: true,
  });
  pass("Mobile product editor");
  await go("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "LOOKBOOK", exact: true })
    .click();
  await page.waitForURL("**/lookbook");
  pass("Mobile navigation retained");
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const customer = await customerContext.newPage();
  customer.on("pageerror", (e) => errors.push(e.message));
  await customer.goto(base + "/account");
  await customer
    .getByRole("button", { name: "NEW HERE? CREATE AN ACCOUNT" })
    .click();
  await customer.getByLabel("Full name").fill("New Customer");
  await customer.getByLabel("Email", { exact: true }).fill("new@example.test");
  await customer
    .getByLabel("Password (12+ characters)")
    .fill("browser-customer-password");
  await customer
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await customer.getByRole("heading", { name: "HEY, NEW." }).waitFor();
  await customer.goto(base + "/shop");
  await customer
    .getByRole("button", { name: "Save Chrome Flower to wishlist" })
    .click();
  await customer.reload();
  await customer
    .getByRole("button", { name: "Remove Chrome Flower from wishlist" })
    .waitFor();
  pass("Customer signup and synced wishlist");
  await customer.goto(base + "/product/mg-001");
  await customer.getByRole("button", { name: "S", exact: true }).click();
  await customer.getByRole("button", { name: "BUY NOW", exact: true }).click();
  await customer.waitForURL("**/checkout");
  await customer.getByLabel("Coupon code").fill("TEST25");
  await customer.getByRole("button", { name: "APPLY", exact: true }).click();
  await customer.getByText("TEST25 applied").waitFor();
  await customer.getByLabel("Phone", { exact: true }).fill("9876543210");
  await customer
    .getByLabel("Address", { exact: true })
    .fill("14 Concrete Street");
  await customer.getByLabel("City", { exact: true }).fill("Mumbai");
  await customer.getByLabel("State", { exact: true }).fill("Maharashtra");
  await customer.getByLabel("PIN code", { exact: true }).fill("400001");
  await customer.getByLabel("Save this address to my account").check();
  await customer.getByLabel("Payment method").selectOption("cod");
  await customer.getByLabel("I understand this is a test order").check();
  assert.equal(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await customer
    .getByRole("button", { name: "PLACE TEST ORDER", exact: true })
    .click();
  await customer.waitForURL("**/orders/**");
  await customer.getByRole("heading", { name: "YOU’RE IN." }).waitFor();
  assert.equal(
    one("SELECT total FROM orders WHERE address LIKE '%new@example.test%'")
      .total,
    124800,
  );
  await customer.goto(base + "/account");
  await customer.locator(".account-order").waitFor();
  assert.equal(await customer.locator(".address-grid>div").count(), 1);
  await customer.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await customer.getByRole("heading", { name: "WELCOME BACK." }).waitFor();
  pass(
    "Mobile Buy Now, capped scoped coupon, COD, current price, saved address, order history and logout",
  );
  // Independent acceptance cohort: the automated navigation burst intentionally
  // exceeds normal human traffic. Reset this fixture's in-memory counter; the
  // unmodified production limits are exercised separately in acceptance.test.js.
  await apiLimiter.resetKey("127.0.0.1");
  // Acceptance scenarios added after the Phase 2 regression flow.
  const watch = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  watch.on("pageerror", (e) => errors.push(e.message));
  await watch.goto(base + "/shop");
  await watch.locator(".product-card").first().waitFor();
  await go("/admin/products");
  await page.getByRole("button", { name: "ADD PRODUCT", exact: true }).click();
  await page
    .getByLabel("Product name", { exact: true })
    .fill("Acceptance Piece");
  await page.getByLabel("SKU", { exact: true }).fill("MG-ACCEPT");
  await page.getByLabel("Regular price / MRP (₹)").fill("2000");
  for (let i = 0; i < 4; i++)
    await page.getByLabel("Stock", { exact: true }).nth(i).fill("2");
  await page.getByLabel("Feature on homepage").check();
  await page.getByRole("button", { name: "SAVE PRODUCT", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Product saved" }).waitFor();
  const piece = one("SELECT id FROM products WHERE sku='MG-ACCEPT'").id;
  assert.equal((await watch.request.get(base + "/api/catalog")).status(), 200);
  assert.equal(
    one("SELECT status FROM products WHERE id=?", piece).status,
    "draft",
  );
  assert.equal(
    await watch
      .getByRole("heading", { name: "Acceptance Piece", exact: true })
      .count(),
    0,
  );
  async function editPiece() {
    await page
      .getByRole("row")
      .filter({ hasText: "Acceptance Piece" })
      .getByRole("button", { name: "EDIT", exact: true })
      .click();
  }
  async function savePiece() {
    await page
      .getByRole("button", { name: "SAVE PRODUCT", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Product saved" })
      .waitFor();
  }
  await editPiece();
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await savePiece();
  await watch
    .getByRole("heading", { name: "Acceptance Piece", exact: true })
    .waitFor({ timeout: 5000 });
  await editPiece();
  await page.getByLabel("Regular price / MRP (₹)").fill("2100");
  const changed = Date.now();
  await savePiece();
  await watch
    .locator(".product-card")
    .filter({ hasText: "Acceptance Piece" })
    .getByText("₹2,100.00", { exact: true })
    .waitFor({ timeout: 5000 });
  console.log(
    "Observed cross-tab price refresh in " + (Date.now() - changed) + " ms",
  );
  await editPiece();
  await page.getByLabel("Status", { exact: true }).selectOption("draft");
  await savePiece();
  await watch
    .getByRole("heading", { name: "Acceptance Piece", exact: true })
    .waitFor({ state: "detached", timeout: 5000 });
  await editPiece();
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await savePiece();
  await watch
    .getByRole("heading", { name: "Acceptance Piece", exact: true })
    .waitFor({ timeout: 5000 });
  pass(
    "Create/edit/hide/publish product, size inventory and immediate cross-tab price updates",
  );
  await go("/admin/coupons");
  async function createCoupon(code, { fixed = false, expiry = false } = {}) {
    await page.getByRole("button", { name: "ADD COUPON", exact: true }).click();
    await page.getByLabel("Code", { exact: true }).fill(code);
    if (fixed) {
      await page.getByLabel("Discount type").selectOption("fixed");
      await page.getByLabel("Fixed discount (₹)").fill("5000");
    }
    if (expiry)
      await page
        .getByLabel("Expires (your local time)")
        .fill("2001-01-01T12:00");
    await page
      .getByRole("button", { name: "SAVE COUPON", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Coupon saved" })
      .waitFor();
  }
  await createCoupon("ACE10");
  await createCoupon("ACEFIX", { fixed: true });
  await createCoupon("ACEEXPIRED", { expiry: true });
  pass("Percentage, fixed INR and expiring coupon creation through admin");
  await watch.goto(base + "/product/" + piece);
  await watch.getByRole("button", { name: "S", exact: true }).click();
  await watch.getByRole("button", { name: "ADD TO BAG", exact: true }).click();
  await watch.getByRole("link", { name: "VIEW YOUR BAG" }).click();
  await watch.reload();
  await watch.locator(".cart-item").waitFor();
  async function applyWatch(code) {
    await watch.getByLabel("Coupon code", { exact: true }).fill(code);
    await watch.getByRole("button", { name: "APPLY", exact: true }).click();
  }
  await applyWatch("ACE10");
  await watch.getByText("ACE10 applied").waitFor();
  await watch
    .locator(".cart-total-row")
    .filter({ hasText: "DISCOUNT" })
    .getByText("-₹210.00", { exact: true })
    .waitFor();
  await watch.getByRole("link", { name: "CHECKOUT — TEST MODE" }).click();
  await watch.getByText("ACE10 applied").waitFor();
  await watch.getByText("-₹210.00", { exact: true }).waitFor();
  await watch.reload();
  await watch.getByText("ACE10 applied").waitFor();
  await watch.goto(base + "/cart");
  await applyWatch("ACEFIX");
  await watch.getByText("ACEFIX applied").waitFor();
  await watch
    .locator(".cart-total-row")
    .filter({ hasText: "DISCOUNT" })
    .getByText("-₹2,100.00", { exact: true })
    .waitFor();
  await go("/admin/settings");
  await page.getByLabel("Flat shipping (₹)").fill("0");
  await page
    .getByLabel("Free shipping threshold after discounts (₹)")
    .fill("0");
  await page
    .getByRole("button", { name: "SAVE SETTINGS", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "settings saved" })
    .waitFor();
  await watch
    .locator(".cart-total-row")
    .filter({ hasText: "TOTAL — TEST ORDER" })
    .getByText("₹0.00", { exact: true })
    .waitFor({ timeout: 5000 });
  await watch.getByRole("link", { name: "CHECKOUT — TEST MODE" }).click();
  await watch
    .locator(".checkout-totals>div")
    .last()
    .getByText("₹0.00", { exact: true })
    .waitFor();
  await watch.getByRole("button", { name: "REMOVE", exact: true }).click();
  await applyWatch("ACEEXPIRED");
  await watch.getByRole("alert").filter({ hasText: "expired" }).waitFor();
  await applyWatch("ACE10");
  await watch.getByText("ACE10 applied").waitFor();
  await watch
    .locator(".checkout-totals>div")
    .last()
    .getByText("₹1,890.00", { exact: true })
    .waitFor();
  pass(
    "Cart/checkout coupon persistence, exact percentage/fixed totals, expiry rejection and zero floor",
  );
  for (const [label, value] of [
    ["Full name", "Acceptance Buyer"],
    ["Phone", "9876543210"],
    ["Email", "acceptance-browser@example.test"],
    ["Address", "17 Test Lane"],
    ["City", "Mumbai"],
    ["State", "Maharashtra"],
    ["PIN code", "400001"],
  ])
    await watch.getByLabel(label, { exact: true }).fill(value);
  await watch.getByLabel("I understand this is a test order").check();
  await watch
    .getByRole("button", { name: "PLACE TEST ORDER", exact: true })
    .click();
  await watch.waitForURL("**/orders/**");
  await watch.getByRole("heading", { name: "YOU’RE IN." }).waitFor();
  const acceptedOrder = watch.url().split("/").at(-1);
  assert.match(acceptedOrder, /^TEST-MG-/);
  const snapshot = one("SELECT * FROM orders WHERE id=?", acceptedOrder);
  assert.equal(snapshot.total, 189000);
  assert.equal(snapshot.payment_mode, "mock");
  assert.equal(snapshot.payment_status, "mock_paid");
  assert.equal(
    one(
      "SELECT i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE product_id=? AND size=?",
      piece,
      "S",
    ).stock,
    1,
  );
  await go("/admin/orders");
  await page
    .getByRole("row")
    .filter({ hasText: acceptedOrder })
    .getByText("TEST ORDER — mock_paid", { exact: true })
    .waitFor();
  await page
    .getByRole("row")
    .filter({ hasText: acceptedOrder })
    .getByRole("button", { name: "MANAGE", exact: true })
    .click();
  await page.getByLabel("Order status").selectOption("Cancelled");
  await page.getByRole("button", { name: "SAVE ORDER", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Order updated" }).waitFor();
  await page
    .getByRole("row")
    .filter({ hasText: acceptedOrder })
    .getByRole("button", { name: "MANAGE", exact: true })
    .click();
  await page.getByRole("button", { name: "SAVE ORDER", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Order updated" }).waitFor();
  assert.equal(
    one(
      "SELECT i.stock FROM inventory i JOIN product_variants v ON v.id=i.variant_id WHERE product_id=? AND size=?",
      piece,
      "S",
    ).stock,
    2,
  );
  await watch
    .getByRole("button", { name: "REFRESH STATUS", exact: true })
    .click();
  await watch.getByText("Cancelled", { exact: true }).waitFor();
  pass(
    "Mock order ID/totals/stock/admin record and exactly-once browser cancellation restock",
  );
  await customer.getByLabel("Email", { exact: true }).fill("new@example.test");
  await customer
    .getByLabel("Password", { exact: true })
    .fill("browser-customer-password");
  await customer.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await customer.getByRole("heading", { name: "HEY, NEW." }).waitFor();
  await customer.reload();
  await customer.locator(".account-order").waitFor();
  assert.equal(await customer.locator(".address-grid>div").count(), 1);
  await customer.goto(base + "/shop");
  await Promise.all([
    customer.waitForResponse(
      (r) =>
        r.url().endsWith("/api/account/wishlist") &&
        r.request().method() === "PUT",
    ),
    customer
      .getByRole("button", { name: "Remove Chrome Flower from wishlist" })
      .click(),
  ]);
  await customer.reload();
  await customer
    .getByRole("button", { name: "Save Chrome Flower to wishlist" })
    .waitFor();
  const wishSaved = customer.waitForResponse(
    (r) =>
      r.url().endsWith("/api/account/wishlist") &&
      r.request().method() === "PUT",
  );
  await customer
    .getByRole("button", { name: "Save After Rain to wishlist" })
    .click();
  await wishSaved;
  const userA = one(
    "SELECT id FROM customers WHERE email='new@example.test'",
  ).id;
  run(
    "UPDATE sessions SET expires_at=? WHERE user_id=?",
    Date.now() - 1,
    userA,
  );
  await customer.goto(base + "/account");
  await customer.getByRole("heading", { name: "WELCOME BACK." }).waitFor();
  await customer
    .getByRole("button", { name: "NEW HERE? CREATE AN ACCOUNT" })
    .click();
  await customer.getByLabel("Full name").fill("Other Customer");
  await customer
    .getByLabel("Email", { exact: true })
    .fill("other@example.test");
  await customer
    .getByLabel("Password (12+ characters)")
    .fill("other-browser-password");
  await customer
    .getByRole("button", { name: "CREATE ACCOUNT", exact: true })
    .click();
  await customer.getByRole("heading", { name: "HEY, OTHER." }).waitFor();
  assert.deepEqual(
    all(
      "SELECT product_id FROM wishlist WHERE customer_id=?",
      one("SELECT id FROM customers WHERE email='other@example.test'").id,
    ),
    [],
  );
  const otherTab = await customer.context().newPage();
  await otherTab.goto(base + "/account");
  await otherTab.getByRole("heading", { name: "HEY, OTHER." }).waitFor();
  await customer.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await otherTab
    .getByRole("heading", { name: "WELCOME BACK." })
    .waitFor({ timeout: 5000 });
  await otherTab.close();
  pass(
    "Account refresh/relogin, wishlist removal persistence, expired-session isolation and cross-tab logout",
  );
  await apiLimiter.resetKey("127.0.0.1");
  // Follow every distinct internal anchor exposed by the supported pages.
  const targets = new Set([
    "/forgot-password",
    "/reset-password?token=invalid-test-token",
  ]);
  for (const route of [
    "/",
    "/shop",
    "/product/mg-001",
    "/about",
    "/lookbook",
    "/cart",
    "/account",
    "/admin",
    "/admin/products",
    "/admin/collections",
    "/admin/coupons",
    "/admin/orders",
    "/admin/settings",
    "/shipping-policy",
    "/returns-exchange",
    "/privacy-policy",
    "/terms-conditions",
    "/faq",
    "/size-guide",
  ]) {
    await go(route);
    for (const href of await page
      .locator("a[href]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("href")))) {
      const url = new URL(href, locationOrigin());
      if (url.origin === base) targets.add(url.pathname + url.search);
      else assert.equal(url.protocol, "https:");
    }
  }
  function locationOrigin() {
    return base;
  }
  for (const target of targets) {
    await go(target);
    assert.equal(
      await page
        .getByRole("heading", { name: "SOMEWHERE ELSE.", exact: true })
        .count(),
      0,
      "Broken link " + target,
    );
  }
  pass(
    "All " +
      targets.size +
      " distinct internal link targets resolve; external anchors use HTTPS",
  );
  await go("/admin/products");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row")
    .filter({ hasText: "Acceptance Piece" })
    .getByRole("button", { name: "DELETE", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Product deleted" })
    .waitFor();
  assert.ok(
    one("SELECT deleted_at FROM products WHERE id=?", piece).deleted_at,
  );
  assert.equal(
    one("SELECT count(*) n FROM order_items WHERE order_id=?", acceptedOrder).n,
    1,
  );
  await go("/admin");
  const authCookie = (await page.context().cookies()).find(
    (c) => c.name === "mg_session",
  );
  await page.getByRole("button", { name: "SIGN OUT", exact: true }).click();
  await page
    .getByRole("button", { name: "SIGN IN TO ADMIN", exact: true })
    .waitFor();
  await go("/admin/orders");
  await page
    .getByRole("button", { name: "SIGN IN TO ADMIN", exact: true })
    .waitFor();
  const denied = await page.request.get(base + "/api/admin/orders", {
    headers: { Cookie: "mg_session=" + authCookie.value },
  });
  assert.equal(denied.status(), 403);
  pass(
    "Product deletion preserves orders; admin logout revokes cookie and protects deep routes",
  );
  await watch.close();
  assert.deepEqual(errors, []);
  pass("No browser runtime errors");
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  db.close();
  rmSync(temp, { recursive: true, force: true });
}
