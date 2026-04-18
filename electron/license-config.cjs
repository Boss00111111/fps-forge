/**
 * License API base URL (no trailing slash).
 * Priority at runtime: env FPSFORGE_LICENSE_API > userData license-api.json >
 *   packaged bundle (see below) > http://127.0.0.1:3847
 *
 * For Gumroad builds, set FPSFORGE_LICENSE_BUNDLE_API when running `npm run dist`
 * so electron/license-runtime-url.cjs is generated (gitignored).
 */
function loadPackagedApiBase() {
  try {
    const m = require("./license-runtime-url.cjs");
    if (typeof m === "string") return m.trim().replace(/\/$/, "");
    if (m && typeof m === "object") {
      const s = m.apiBase ?? m.default;
      if (typeof s === "string") return s.trim().replace(/\/$/, "");
    }
  } catch {
    /* optional file — not committed */
  }
  return "";
}

module.exports = {
  devBypassUnlicensed: process.env.FPSFORGE_LICENSE_DEV === "1",
  packagedApiBase: loadPackagedApiBase(),
};
