import { all, one, setting } from "./db.js";
import { fail, integer, text } from "./security.js";
export function activePrice(p, now = Date.now()) {
  return p.sale_active &&
    p.sale_price !== null &&
    (!p.sale_start || Date.parse(p.sale_start) <= now) &&
    (!p.sale_end || Date.parse(p.sale_end) > now)
    ? p.sale_price
    : p.regular_price;
}
export function productView(p) {
  const variants = all(
    "SELECT v.*,i.stock,i.low_stock_threshold FROM product_variants v JOIN inventory i ON i.variant_id=v.id WHERE product_id=? AND active=1 ORDER BY v.rowid",
    p.id,
  );
  const current = activePrice(p);
  return {
    ...p,
    images: JSON.parse(p.images),
    code: p.sku,
    price: current / 100,
    regularPrice: p.regular_price / 100,
    salePrice: p.sale_price === null ? null : p.sale_price / 100,
    discountPercent: Math.round(
      ((p.regular_price - current) * 100) / p.regular_price,
    ),
    variants,
    stock: variants.reduce((s, v) => s + v.stock, 0),
    featured: !!p.featured,
    sale_active: !!p.sale_active,
  };
}
export function quote(items, code) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    fail("Your bag must contain 1–50 different items.");
  const seen = new Set();
  const lines = items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      fail("Invalid bag item.");
    const p = one(
      "SELECT * FROM products WHERE id=? AND deleted_at IS NULL",
      text(item.id, "Product ID", 100),
    );
    if (!p || p.status !== "active")
      fail("A product is unavailable. Please update your bag.", 409);
    const v = one(
      "SELECT v.*,i.stock FROM product_variants v JOIN inventory i ON i.variant_id=v.id WHERE product_id=? AND size=? AND active=1",
      p.id,
      text(item.size, "Size", 20),
    );
    if (!v) fail(`${p.name}: selected size is unavailable.`, 409);
    if (seen.has(v.id)) fail("Duplicate bag item.");
    seen.add(v.id);
    const qty = integer(item.qty, "quantity", 1, 99);
    if (qty > v.stock)
      fail(`${p.name} / ${v.size}: only ${v.stock} in stock.`, 409);
    return {
      product_id: p.id,
      variant_id: v.id,
      name: p.name,
      sku: v.sku,
      color: v.color,
      size: v.size,
      quantity: qty,
      unit_price: activePrice(p),
      collection_id: p.collection_id,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
    fail("Order total is too large.");
  let discount = 0,
    coupon = null;
  if (code) {
    coupon = one(
      "SELECT * FROM coupons WHERE code=? COLLATE NOCASE",
      text(code, "Coupon", 40),
    );
    if (!coupon || !coupon.enabled) fail("This coupon is invalid or disabled.");
    if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now())
      fail("This coupon has expired.");
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit)
      fail("This coupon has reached its usage limit.");
    if (subtotal < coupon.minimum)
      fail(`This coupon requires a minimum order of ₹${coupon.minimum / 100}.`);
    const targets = JSON.parse(coupon.targets);
    const eligible = lines
      .filter(
        (l) =>
          coupon.scope === "all" ||
          targets.includes(
            coupon.scope === "products" ? l.product_id : l.collection_id,
          ),
      )
      .reduce((s, l) => s + l.unit_price * l.quantity, 0);
    if (!eligible) fail("This coupon does not apply to the items in your bag.");
    discount =
      coupon.type === "percent"
        ? Math.floor((eligible * coupon.value) / 100)
        : coupon.value;
    discount = Math.min(discount, eligible, coupon.maximum ?? Infinity);
  }
  const shippingSettings = setting("shipping");
  const shipping =
    subtotal - discount >= shippingSettings.freeThreshold
      ? 0
      : shippingSettings.flat;
  return {
    lines,
    subtotal,
    discount,
    shipping,
    total: Math.max(0, subtotal - discount + shipping),
    coupon: coupon?.code || null,
    couponId: coupon?.id || null,
    codEnabled: shippingSettings.codEnabled,
  };
}
export function orderView(o) {
  const { guest_token_hash, idempotency_key, request_hash, ...safe } = o;
  return {
    ...safe,
    isTest: o.payment_mode === "mock",
    address: JSON.parse(o.address),
    items: all("SELECT * FROM order_items WHERE order_id=?", o.id),
  };
}
