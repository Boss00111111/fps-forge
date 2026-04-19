/**
 * License API for FPS Forge (1 key = 1 PC).
 *
 * Storage (pick one):
 * - FREE on Render Web: set DATABASE_URL to Postgres (Neon / Supabase free tier) → persistent keys.
 * - Paid Render Disk: SQLite under DATA_DIR on mounted volume.
 * - Dev: SQLite under ./data
 *
 * Admin: ADMIN_TOKEN + header x-admin-token
 */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { openStore, normalizeKey, normalizeTier } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3847);
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();
const onRender = String(process.env.RENDER || "").toLowerCase() === "true";

/** Await sync or async store method */
function run(p) {
  return Promise.resolve(p);
}

function looksLikeRemoteDbUrl(s) {
  const t = String(s || "").trim().toLowerCase();
  return (
    t.startsWith("postgres://") ||
    t.startsWith("postgresql://") ||
    t.startsWith("mysql://") ||
    t.startsWith("mongodb://") ||
    t.startsWith("mongodb+srv://") ||
    t.startsWith("redis://")
  );
}

function pickPostgresUrl() {
  for (const env of [process.env.DATABASE_URL, process.env.POSTGRES_URL]) {
    const u = String(env || "").trim();
    if (!u) continue;
    const low = u.toLowerCase();
    if (low.startsWith("postgres://") || low.startsWith("postgresql://")) return u;
  }
  return "";
}

/**
 * DATA_DIR for SQLite only. If DATABASE_URL is a plain path (mis-name), use as dir.
 */
function pickFilesystemDataDirFromEnv() {
  const fromData = String(process.env.DATA_DIR || "").trim();
  const fromDbUrl = String(process.env.DATABASE_URL || "").trim();
  if (fromData) return { raw: fromData, source: "DATA_DIR" };
  if (fromDbUrl && !looksLikeRemoteDbUrl(fromDbUrl)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[fpsforge-license] Using DATABASE_URL as a filesystem path. Prefer DATA_DIR, and use DATABASE_URL only for Postgres (Neon/Supabase)."
    );
    return { raw: fromDbUrl, source: "DATABASE_URL" };
  }
  return { raw: "", source: null };
}

function normalizeDataDirPath(raw) {
  const warnings = [];
  let s = String(raw || "").trim();
  if (!s) return { path: s, warnings };
  if (/\s/.test(s) && s.startsWith("/")) {
    const before = s;
    s = s.replace(/\s+/g, "-");
    warnings.push(
      `DATA_DIR had spaces (${before}). Using ${s} — mount path must match exactly (no spaces).`
    );
    // eslint-disable-next-line no-console
    console.warn("[fpsforge-license]", warnings[0]);
  }
  return { path: s, warnings };
}

const publicDir = path.join(__dirname, "public");

/** @type {any} */
let store;
/** @type {"postgres"|"sqlite"} */
let storageKind = "sqlite";
let dataDir = "";
let dataDirWritable = false;
/** @type {string[]} */
let pathWarnings = [];
/** @type {string} */
let resolvedSource = "local_default";
/** @type {string | null} */
let sqlitePathLabel = null;

async function bootstrap() {
  const postgresUrl = pickPostgresUrl();
  if (postgresUrl) {
    storageKind = "postgres";
    dataDirWritable = true;
    dataDir = "(postgres)";
    resolvedSource = "DATABASE_URL";
    pathWarnings = [];
    const { openPgStore } = await import("./store-pg.mjs");
    const legacyKeysPath = path.join(__dirname, "keys.json");
    const legacyActivationsPath = path.join(__dirname, "data", "activations.json");
    store = await openPgStore({
      connectionString: postgresUrl,
      legacyKeysPath,
      legacyActivationsPath,
    });
    sqlitePathLabel = null;
    const counts = await run(store.healthCounts());
    // eslint-disable-next-line no-console
    console.log(
      `[fpsforge-license] PostgreSQL backend ${store.postgresHost || ""} keys=${counts.keys} activations=${counts.activations}`
    );
    return;
  }

  storageKind = "sqlite";
  const picked = pickFilesystemDataDirFromEnv();
  let rawDataDir = picked.raw;
  const dataDirSource = picked.source;

  const normalized = normalizeDataDirPath(rawDataDir);
  rawDataDir = normalized.path;
  pathWarnings = [...normalized.warnings];

  if (onRender && (rawDataDir === "/data" || rawDataDir === "/data/" || rawDataDir.startsWith("/data/"))) {
    // eslint-disable-next-line no-console
    console.warn(
      "[fpsforge-license] DATA_DIR=/data not writable without Disk. Falling back to /tmp/fpsforge-license."
    );
    rawDataDir = "";
    pathWarnings = pathWarnings.filter((w) => !w.includes("had spaces"));
  }

  const DATA_DIR_ENV = rawDataDir;

  let legacyKeysPath;
  let legacyActivationsPath;

  if (DATA_DIR_ENV) {
    dataDir = DATA_DIR_ENV;
    legacyKeysPath = path.join(dataDir, "keys.json");
    legacyActivationsPath = path.join(dataDir, "activations.json");
    resolvedSource = dataDirSource === "DATABASE_URL" ? "DATABASE_URL" : "DATA_DIR";
  } else if (onRender) {
    dataDir = path.join(os.tmpdir(), "fpsforge-license");
    legacyKeysPath = path.join(dataDir, "keys.json");
    legacyActivationsPath = path.join(dataDir, "activations.json");
    resolvedSource = "render_tmp";
  } else {
    dataDir = path.join(__dirname, "data");
    legacyKeysPath = path.join(__dirname, "keys.json");
    legacyActivationsPath = path.join(dataDir, "activations.json");
    resolvedSource = "local_default";
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, ".fpsforge-write-probe");
  try {
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    dataDirWritable = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[fpsforge-license] DATA_DIR not writable:", e?.message || e);
    dataDirWritable = false;
  }

  store = openStore({ dataDir, legacyKeysPath, legacyActivationsPath });
  sqlitePathLabel = path.basename(store.sqlitePath);
  const counts = await run(store.healthCounts());
  // eslint-disable-next-line no-console
  console.log(
    `fpsforge-license dataDir=${dataDir} sqlite=${store.sqlitePath} keys=${counts.keys} activations=${counts.activations} writable=${dataDirWritable} source=${resolvedSource}`
  );
}

function requireAdmin(req, res) {
  if (!ADMIN_TOKEN) {
    res.status(500).json({ ok: false, message: "ADMIN_TOKEN_MISSING" });
    return false;
  }
  const token = String(req.headers["x-admin-token"] || "");
  if (token !== ADMIN_TOKEN) {
    res.status(403).json({ ok: false, message: "FORBIDDEN" });
    return false;
  }
  return true;
}

await bootstrap();

if (onRender && storageKind === "sqlite") {
  // eslint-disable-next-line no-console
  console.error(
    "[fpsforge-license] CRITICAL (Render): DATABASE_URL is not a Postgres URL — using SQLite on ephemeral disk. License keys are LOST on every deploy/restart. Fix: add Neon/Supabase connection string as DATABASE_URL, redeploy, then /health must show storage: postgres."
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));
app.use("/public", express.static(publicDir));

app.get("/admin-panel", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/", (_req, res) => {
  res.redirect(302, "/health");
});

app.get("/health", async (_req, res) => {
  const { keys, activations } = await run(store.healthCounts());
  const warnings = [...pathWarnings];
  if (storageKind === "sqlite") {
    const ephemeral =
      onRender &&
      (dataDir.includes(`${path.sep}tmp`) || dataDir.startsWith("/tmp") || dataDir.includes("Temp"));
    if (ephemeral) {
      warnings.push(
        "SQLite on /tmp is LOST on every deploy. Free fix: create a Neon or Supabase Postgres DB, paste connection string as DATABASE_URL on this service. Paid fix: Render Disk + DATA_DIR."
      );
    }
    if (!dataDirWritable) {
      warnings.push(
        "DATA_DIR not writable (Disk path wrong or missing paid Disk). Use Postgres DATABASE_URL on free tier instead."
      );
    }
  }
  res.json({
    ok: true,
    storageReady: storageKind === "postgres" ? true : dataDirWritable,
    keys,
    activations,
    dataDir,
    dataDirSource: resolvedSource,
    dataDirWritable: storageKind === "postgres" ? true : dataDirWritable,
    storage: storageKind,
    sqlite: sqlitePathLabel,
    ...(storageKind === "postgres" && store.postgresHost ? { postgres: store.postgresHost } : {}),
    ...(warnings.length ? { warnings } : {}),
  });
});

app.post("/activate", async (req, res) => {
  const key = normalizeKey(req.body?.key);
  const machineId = String(req.body?.machineId || "").trim();
  if (!key || !machineId) return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });

  const r = await run(store.activate(key, machineId));
  if (!r.ok) {
    const map = {
      INVALID_KEY: 400,
      KEY_EXPIRED: 403,
      KEY_ALREADY_USED: 403,
    };
    const status = map[r.code] || 400;
    return res.status(status).json({ ok: false, message: r.code });
  }
  return res.json({ ok: true, tier: r.tier, expiresAt: r.expiresAt });
});

app.post("/verify", async (req, res) => {
  const key = normalizeKey(req.body?.key);
  const machineId = String(req.body?.machineId || "").trim();
  if (!key || !machineId) return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });

  const r = await run(store.verify(key, machineId));
  if (!r.ok) {
    const map = {
      INVALID_KEY: 400,
      KEY_EXPIRED: 403,
      NOT_ACTIVATED: 403,
      WRONG_PC: 403,
    };
    const status = map[r.code] || 400;
    return res.status(status).json({ ok: false, message: r.code });
  }
  return res.json({ ok: true, tier: r.tier, expiresAt: r.expiresAt });
});

app.get("/admin/activations", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, rows: await run(store.adminListActivations()) });
});

app.get("/admin/keys", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, rows: await run(store.adminListKeys()) });
});

/** Plain-text export: one license key per line (UTF-8). Same auth as other admin routes. */
app.get("/admin/keys-export", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = await run(store.adminListKeys());
  const text = (rows || [])
    .map((r) => String(r?.key || "").trim())
    .filter(Boolean)
    .join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="fps-forge-keys.txt"');
  res.send(text);
});

app.post("/admin/reset", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const key = normalizeKey(req.body?.key);
  if (!key) return res.status(400).json({ ok: false, message: "MISSING_KEY" });
  await run(store.adminReset(key));
  res.json({ ok: true });
});

app.post("/admin/create", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const count = Math.min(500, Math.max(1, Number(req.body?.count || 1)));
  const tier = normalizeTier(req.body?.tier || "premium_monthly");
  const daysValid = Number(req.body?.daysValid || 0);
  const r = await run(store.adminCreate(count, tier, daysValid));
  res.json(r);
});

app.post("/admin/mark-sold", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const key = normalizeKey(req.body?.key);
  const saleRef = String(req.body?.saleRef || req.body?.orderRef || "").trim();
  if (!key) return res.status(400).json({ ok: false, message: "MISSING_KEY" });
  const r = await run(store.adminMarkSold(key, saleRef));
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true });
});

app.post("/admin/unmark-sold", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const key = normalizeKey(req.body?.key);
  if (!key) return res.status(400).json({ ok: false, message: "MISSING_KEY" });
  const r = await run(store.adminUnmarkSold(key));
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`License server listening on 0.0.0.0:${PORT} (PORT=${PORT})`);
});
