/**
 * License API for FPS Forge (1 key = 1 PC).
 *
 * Admin:
 * - set ADMIN_TOKEN env
 * - use x-admin-token header
 * Endpoints:
 * - POST /activate { key, machineId }
 * - POST /verify { key, machineId }
 * - GET  /admin/activations
 * - POST /admin/reset { key }
 * - POST /admin/create { count, tier, daysValid }
 */
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3847);
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || "").trim();
/** Optional persistent volume (e.g. Render disk mounted at /data). If unset, uses server folder + ./data */
const DATA_DIR = String(process.env.DATA_DIR || "").trim();
const keysPath = DATA_DIR ? path.join(DATA_DIR, "keys.json") : path.join(__dirname, "keys.json");
const dataDir = DATA_DIR ? DATA_DIR : path.join(__dirname, "data");
const dbPath = path.join(dataDir, "activations.json");
const publicDir = path.join(__dirname, "public");

function ensureDataLayout() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(keysPath)) {
    fs.writeFileSync(keysPath, "[]", "utf8");
  }
}
ensureDataLayout();

function normalizeKey(key) {
  return String(key || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeTier(tier) {
  const t = String(tier || "premium_monthly").toLowerCase();
  if (t === "free" || t === "premium_monthly" || t === "premium_lifetime") return t;
  return "premium_monthly";
}

function parseIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function keyRowFromInput(item) {
  if (typeof item === "string") {
    return { key: normalizeKey(item), tier: "premium_monthly", expiresAt: null };
  }
  if (item && typeof item === "object") {
    return {
      key: normalizeKey(item.key),
      tier: normalizeTier(item.tier),
      expiresAt: parseIsoOrNull(item.expiresAt),
    };
  }
  return { key: "", tier: "premium_monthly", expiresAt: null };
}

function readKeyCatalog() {
  const raw = fs.readFileSync(keysPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("keys.json must be array");
  const map = new Map();
  for (const item of parsed) {
    const row = keyRowFromInput(item);
    if (!row.key) continue;
    map.set(row.key, row);
  }
  return map;
}

function readDb() {
  try {
    const raw = fs.readFileSync(dbPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { activations: {} };
    return { activations: parsed.activations || {} };
  } catch {
    return { activations: {} };
  }
}

function writeDb(db) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function makeKey() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const seg = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `FFG-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
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

let catalog = readKeyCatalog();
let db = readDb();

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

app.get("/health", (_req, res) => {
  res.json({ ok: true, keys: catalog.size, activations: Object.keys(db.activations || {}).length });
});

app.post("/activate", (req, res) => {
  const key = normalizeKey(req.body?.key);
  const machineId = String(req.body?.machineId || "").trim();
  if (!key || !machineId) return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });

  const row = catalog.get(key);
  if (!row) return res.status(400).json({ ok: false, message: "INVALID_KEY" });
  if (isExpired(row.expiresAt)) return res.status(403).json({ ok: false, message: "KEY_EXPIRED" });

  const existing = db.activations[key];
  if (existing && existing.machineId !== machineId) {
    return res.status(403).json({ ok: false, message: "KEY_ALREADY_USED" });
  }

  db.activations[key] = {
    machineId,
    tier: row.tier,
    expiresAt: row.expiresAt,
    activatedAt: existing?.activatedAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  writeDb(db);
  return res.json({ ok: true, tier: row.tier, expiresAt: row.expiresAt });
});

app.post("/verify", (req, res) => {
  const key = normalizeKey(req.body?.key);
  const machineId = String(req.body?.machineId || "").trim();
  if (!key || !machineId) return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });

  const row = catalog.get(key);
  if (!row) return res.status(400).json({ ok: false, message: "INVALID_KEY" });
  if (isExpired(row.expiresAt)) return res.status(403).json({ ok: false, message: "KEY_EXPIRED" });

  const existing = db.activations[key];
  if (!existing) return res.status(403).json({ ok: false, message: "NOT_ACTIVATED" });
  if (existing.machineId !== machineId) return res.status(403).json({ ok: false, message: "WRONG_PC" });

  existing.lastSeenAt = new Date().toISOString();
  existing.tier = row.tier;
  existing.expiresAt = row.expiresAt;
  db.activations[key] = existing;
  writeDb(db);
  return res.json({ ok: true, tier: row.tier, expiresAt: row.expiresAt });
});

app.get("/admin/activations", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = Object.entries(db.activations || {}).map(([key, info]) => ({
    key,
    machineId: info.machineId,
    tier: info.tier,
    expiresAt: info.expiresAt || null,
    activatedAt: info.activatedAt,
    lastSeenAt: info.lastSeenAt,
  }));
  res.json({ ok: true, rows });
});

app.get("/admin/keys", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const rows = Array.from(catalog.values()).map((row) => {
    const activation = db.activations?.[row.key] || null;
    const expired = isExpired(row.expiresAt);
    return {
      key: row.key,
      tier: row.tier,
      expiresAt: row.expiresAt || null,
      expired,
      status: activation ? "activated" : "free",
      machineId: activation?.machineId || null,
      activatedAt: activation?.activatedAt || null,
      lastSeenAt: activation?.lastSeenAt || null,
    };
  });
  res.json({ ok: true, rows });
});

app.post("/admin/reset", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const key = normalizeKey(req.body?.key);
  if (!key) return res.status(400).json({ ok: false, message: "MISSING_KEY" });
  delete db.activations[key];
  writeDb(db);
  res.json({ ok: true });
});

app.post("/admin/create", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const count = Math.min(500, Math.max(1, Number(req.body?.count || 1)));
  const tier = normalizeTier(req.body?.tier || "premium_monthly");
  const daysValid = Number(req.body?.daysValid || 0);
  const expiresAt = daysValid > 0 ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString() : null;
  const created = [];
  const raw = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath, "utf8")) : [];
  const list = Array.isArray(raw) ? raw : [];

  for (let i = 0; i < count; i++) {
    let k = makeKey();
    while (catalog.has(k)) k = makeKey();
    const row = { key: k, tier, expiresAt };
    list.push(row);
    catalog.set(k, row);
    created.push(row);
  }
  fs.writeFileSync(keysPath, JSON.stringify(list, null, 2), "utf8");
  res.json({ ok: true, created });
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`License server listening on 0.0.0.0:${PORT} (PORT=${PORT})`);
});
