/**
 * Zip contents of release/win-unpacked so Gumroad buyers get FPS Forge.exe at zip root (no extra folder).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const unpacked = path.join(root, "release", "win-unpacked");
const zipName = `FPS-Forge-${pkg.version}-Win-x64.zip`;
const zipPath = path.join(root, "release", zipName);

if (!fs.existsSync(unpacked)) {
  // eslint-disable-next-line no-console
  console.error("[zip-win-unpacked] missing folder:", unpacked);
  process.exit(1);
}

const esc = (p) => p.replace(/'/g, "''");
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const cmd = [
  `$ErrorActionPreference='Stop'`,
  `Set-Location -LiteralPath '${esc(unpacked)}'`,
  `Compress-Archive -Path * -DestinationPath '${esc(zipPath)}' -CompressionLevel Optimal -Force`,
].join("; ");

execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
  stdio: "inherit",
});

// eslint-disable-next-line no-console
console.log("[zip-win-unpacked] wrote", zipPath);
// eslint-disable-next-line no-console
console.log("[zip-win-unpacked] Or run without zip: release\\win-unpacked\\FPS Forge.exe");
