/**
 * Removes release/ so stale broken artifacts (e.g. empty *.nsis.7z) cannot confuse Gumroad uploads.
 * Used by npm run dist:release only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = path.join(root, "release");

if (fs.existsSync(release)) {
  fs.rmSync(release, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log("[clean-release] removed release/");
}
