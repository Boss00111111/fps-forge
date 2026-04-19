/**
 * Copy the main release artifact to %LOCALAPPDATA%\\FPSForge\\ (not OneDrive).
 * Prefers Portable .exe; otherwise the Win-x64 .zip from dir+zip builds.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const v = pkg.version;

const portable = path.join(release, `FPS-Forge-${v}-Portable.exe`);
const zip = path.join(release, `FPS-Forge-${v}-Win-x64.zip`);

/** @type {{ src: string; label: string } | null} */
let pick = null;
if (fs.existsSync(portable)) {
  const st = fs.statSync(portable);
  if (st.size > 1_000_000) pick = { src: portable, label: "Portable exe" };
}
if (pick == null && fs.existsSync(zip)) {
  const st = fs.statSync(zip);
  if (st.size > 1_000_000) pick = { src: zip, label: "Windows zip" };
}

if (pick == null) {
  // eslint-disable-next-line no-console
  console.warn("[copy-release-artifact-local] No Portable exe or Win zip found in release/. Open release\\win-unpacked\\FPS Forge.exe");
  process.exit(0);
}

const localApp = process.env.LOCALAPPDATA;
if (!localApp) {
  // eslint-disable-next-line no-console
  console.warn("[copy-release-artifact-local] LOCALAPPDATA not set, skip");
  process.exit(0);
}

const destDir = path.join(localApp, "FPSForge");
fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, path.basename(pick.src));
fs.copyFileSync(pick.src, dest);
// eslint-disable-next-line no-console
console.log(`[copy-release-artifact-local] Copied ${pick.label} to:`);
// eslint-disable-next-line no-console
console.log(dest);
