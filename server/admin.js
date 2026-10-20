import { randomUUID } from "node:crypto";
import { one, run } from "./db.js";
import { hashPassword, email, password } from "./security.js";
const e = email(process.env.ADMIN_EMAIL),
  pw = password(process.env.ADMIN_PASSWORD),
  name = process.env.ADMIN_NAME || "MAYGREY Admin";
const hash = await hashPassword(pw),
  existing = one("SELECT id FROM admin_users WHERE email=?", e);
if (existing && process.argv.includes("--reset")) {
  run("UPDATE admin_users SET password_hash=? WHERE id=?", hash, existing.id);
  run("DELETE FROM sessions WHERE user_id=?", existing.id);
  console.log("Admin password updated. Existing sessions revoked.");
} else if (existing) {
  console.log(
    "Admin already exists. Use --reset for an intentional password change.",
  );
} else {
  run(
    "INSERT INTO admin_users(id,name,email,password_hash) VALUES(?,?,?,?)",
    randomUUID(),
    name,
    e,
    hash,
  );
  console.log(
    "Admin created. Sign in at /admin. No credentials are shipped with the app.",
  );
}
