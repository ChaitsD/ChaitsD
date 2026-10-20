import { backup } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db.js";
const dir = resolve(process.env.BACKUP_DIR || ".data/backups");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const destination = resolve(
  dir,
  "maygrey-" + new Date().toISOString().replaceAll(":", "-") + ".sqlite",
);
await backup(db, destination);
chmodSync(destination, 0o600);
db.close();
console.log(
  "Consistent SQLite backup saved. Keep database, uploads and environment secrets backed up securely.",
);
