import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { one, run } from "./db.js";
const scrypt = promisify(scryptCallback);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  throw Error(
    "Set SESSION_SECRET to at least 32 random characters in the server environment.",
  );
export const token = () => randomBytes(32).toString("hex");
export const digest = (value) =>
  createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt +
    ":" +
    (await scrypt(password, salt, 64, scryptOptions)).toString("hex")
  );
}
export async function verifyPassword(password, hash) {
  try {
    const [salt, key] = hash.split(":");
    const actual = await scrypt(password, salt, 64, scryptOptions);
    return timingSafeEqual(actual, Buffer.from(key, "hex"));
  } catch {
    return false;
  }
}
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export const email = (value) => {
  if (typeof value === "string") value = value.trim();
  if (
    typeof value !== "string" ||
    !/^\S+@\S+\.\S+$/.test(value) ||
    value.length > 254
  )
    fail("Enter a valid email address.");
  return value.trim().toLowerCase();
};
export const text = (value, name, max = 5000, required = true) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    fail(`${name} is required and must be under ${max} characters.`);
  return value.trim();
};
export const integer = (v, name, min = 0, max = 100000000) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`Invalid ${name}.`);
  return v;
};
export const bool = (v) => {
  if (typeof v !== "boolean") fail("Expected true or false.");
  return v ? 1 : 0;
};
export const date = (v) => {
  if (!v) return null;
  if (typeof v !== "string" || !Number.isFinite(Date.parse(v)))
    fail("Invalid date.");
  return new Date(v).toISOString();
};
export const password = (v) =>
  text(v, "Password", 128).length >= 12
    ? v
    : fail("Use a password with at least 12 characters.");
export function safeMedia(value, kind = "image") {
  if (!value) return null;
  if (
    typeof value !== "string" ||
    !/^\/(media|uploads)\/[a-zA-Z0-9._-]+$/.test(value) ||
    !new RegExp(
      kind === "video" ? "\\.(mp4|webm)$" : "\\.(svg|jpg|jpeg|png|webp|avif)$",
      "i",
    ).test(value)
  )
    fail("Choose a valid uploaded media file.");
  return value;
}
export function auth(req, res, next) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((x) => x.trim().split("=")),
  );
  const raw = cookies.mg_session;
  const session =
    raw &&
    one(
      "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
      digest(raw),
      Date.now(),
    );
  if (session) {
    const table = session.role === "admin" ? "admin_users" : "customers";
    const user = one(
      `SELECT id,name,email FROM ${table} WHERE id=?`,
      session.user_id,
    );
    if (user) req.user = { ...user, role: session.role };
  }
  next();
}
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "Admin access required." });
  next();
}
export function issueSession(res, user, role, req) {
  const previous = (req?.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("mg_session="))
    ?.slice(11);
  if (previous)
    run("DELETE FROM sessions WHERE token_hash=?", digest(previous));
  const raw = token();
  run("DELETE FROM sessions WHERE expires_at<?", Date.now());
  run(
    "INSERT INTO sessions VALUES(?,?,?,?)",
    digest(raw),
    user.id,
    role,
    Date.now() + 7 * 86400000,
  );
  res.cookie("mg_session", raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 86400000,
    path: "/",
  });
  return { ...user, role };
}
export function shippingAddress(v) {
  if (!v || typeof v !== "object") fail("Shipping address required.");
  const a = {};
  for (const k of ["name", "phone", "email", "address", "city", "state", "pin"])
    a[k] = text(v[k], k, k === "address" ? 500 : 150);
  a.email = email(a.email);
  if (!/^[6-9]\d{9}$/.test(a.phone))
    fail("Enter a valid 10-digit Indian mobile number.");
  if (!/^[1-9]\d{5}$/.test(a.pin)) fail("Enter a valid 6-digit PIN code.");
  return a;
}
