/**
 * Za Gumroad / kupce: mora postojati FPSFORGE_LICENSE_BUNDLE_API=https://... prije dist.
 * Pokrece se iz npm run dist:release
 */
const v = String(process.env.FPSFORGE_LICENSE_BUNDLE_API || "").trim().replace(/\/$/, "");
if (!v.startsWith("https://")) {
  // eslint-disable-next-line no-console
  console.error("");
  // eslint-disable-next-line no-console
  console.error("=== FPS Forge: nedostaje javni license URL ===");
  // eslint-disable-next-line no-console
  console.error('Postavi (PowerShell):');
  // eslint-disable-next-line no-console
  console.error('  $env:FPSFORGE_LICENSE_BUNDLE_API="https://STVARNI-SERVIS.onrender.com"');
  // eslint-disable-next-line no-console
  console.error('Pa pokreni: npm run dist:release');
  // eslint-disable-next-line no-console
  console.error("");
  process.exit(1);
}
