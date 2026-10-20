import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) console.log("Existing .env preserved.");
else {
  writeFileSync(
    ".env",
    `SESSION_SECRET=${randomBytes(48).toString("hex")}\nPAYMENT_MODE=mock\nAPP_ORIGIN=http://localhost:5173\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Local .env created with a random server session secret. No admin account or real payment credentials created.",
  );
}
