import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const count = Number(process.argv[2] || 100);

function segment(len) {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
}

function makeKey() {
  return `FFG-${segment(4)}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

const keyRows = [];
for (let i = 0; i < count; i++) {
  keyRows.push({
    key: makeKey(),
    tier: "premium_lifetime",
    expiresAt: null,
  });
}

const serverKeysPath = path.join(root, "license-server", "keys.json");
const outDir = path.join(root, "license-server", "output");
fs.mkdirSync(outDir, { recursive: true });
const csvPath = path.join(outDir, "keys.csv");

fs.writeFileSync(serverKeysPath, JSON.stringify(keyRows, null, 2), "utf8");
fs.writeFileSync(
  csvPath,
  ["key,tier,expiresAt", ...keyRows.map((r) => `${r.key},${r.tier},${r.expiresAt ?? ""}`)].join("\n"),
  "utf8"
);

const docPath = path.join(os.homedir(), "OneDrive", "Dokumente", "Boost-PC-license-100-keys.csv");
try {
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.copyFileSync(csvPath, docPath);
} catch {
  /* ignore copy errors */
}

// eslint-disable-next-line no-console
console.log("Wrote keys:", serverKeysPath);
// eslint-disable-next-line no-console
console.log("CSV:", csvPath);
// eslint-disable-next-line no-console
console.log("Copy for seller:", docPath);
