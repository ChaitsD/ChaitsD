import { createHmac, timingSafeEqual } from "node:crypto";
import { fail } from "./security.js";
// Provider boundary: never trust a browser claim of a live payment. A future Razorpay
// adapter must create an INR order, verify signature + captured amount/currency,
// then call transactional fulfillment once per provider payment ID.
export function authorizeTestPayment({ method, result, codEnabled }) {
  if ((process.env.PAYMENT_MODE || "mock") !== "mock")
    fail(
      "Live Razorpay capture and webhook fulfillment are not connected. Use mock payment mode.",
      503,
    );
  if (!["mock", "cod"].includes(method)) fail("Invalid payment method.");
  if (method === "cod" && !codEnabled) fail("Cash on delivery is disabled.");
  if (result !== undefined && !["success", "failure"].includes(result))
    fail("Invalid mock payment outcome.");
  if (result === "failure")
    fail(
      "Mock payment failed. No charge, order or stock change was made.",
      402,
    );
  return method === "cod" ? "test_cod_pending" : "mock_paid";
}
export function verifyRazorpaySignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) fail("Razorpay is not configured.", 503);
  if (!/^[0-9a-f]{64}$/i.test(signature || "")) return false;
  const expected = createHmac("sha256", secret)
    .update(orderId + "|" + paymentId)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function verifyRazorpayWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) fail("Razorpay webhook is not configured.", 503);
  if (!/^[0-9a-f]{64}$/i.test(signature || "")) return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(rawBody).digest(),
    Buffer.from(signature, "hex"),
  );
}
