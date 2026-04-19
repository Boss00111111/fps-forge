/**
 * SQLite persistence for license keys + activations (survives restarts when DATA_DIR is on a disk).
 * One-time import from legacy keys.json + activations.json if DB is empty.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";

const DB_NAME = "fpsforge-license.sqlite";

function makeKey() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const seg = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `FFG-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export function normalizeKey(key) {
  return String(key || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeTier(tier) {
  const t = String(tier || "premium_monthly").toLowerCase();
  if (t === "free" || t === "premium_monthly" || t === "premium_lifetime") return t;
  return "premium_monthly";
}

function parseIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function keyRowFromJsonItem(item) {
  if (typeof item === "string") {
    return { key: normalizeKey(item), tier: "premium_monthly", key_expires_at: null };
  }
  if (item && typeof item === "object") {
    return {
      key: normalizeKey(item.key),
      tier: normalizeTier(item.tier),
      key_expires_at: parseIsoOrNull(item.expiresAt),
    };
  }
  return { key: "", tier: "premium_monthly", key_expires_at: null };
}

function migrateFromJson(db, legacyKeysPath, legacyActivationsPath) {
  const keyCount = db.prepare("SELECT COUNT(*) AS c FROM license_keys").get().c;
  if (keyCount > 0) return;

  let keysImported = 0;
  let actImported = 0;
  const now = new Date().toISOString();
  const insKey = db.prepare(`
    INSERT OR IGNORE INTO license_keys (key, tier, key_expires_at, sale_status, sale_ref, sold_marked_at, created_at)
    VALUES (@key, @tier, @key_expires_at, 'inventory', NULL, NULL, @created_at)
  `);
  const insAct = db.prepare(`
    INSERT OR REPLACE INTO activations (key, machine_id, tier, expires_at, activated_at, last_seen_at)
    VALUES (@key, @machine_id, @tier, @expires_at, @activated_at, @last_seen_at)
  `);

  if (fs.existsSync(legacyKeysPath)) {
    try {
      const raw = fs.readFileSync(legacyKeysPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const row = keyRowFromJsonItem(item);
          if (!row.key) continue;
          const r = insKey.run({
            key: row.key,
            tier: row.tier,
            key_expires_at: row.key_expires_at,
            created_at: now,
          });
          if (r.changes) keysImported++;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (fs.existsSync(legacyActivationsPath)) {
    try {
      const raw = fs.readFileSync(legacyActivationsPath, "utf8");
      const parsed = JSON.parse(raw);
      const map = parsed?.activations && typeof parsed.activations === "object" ? parsed.activations : {};
      for (const [k, info] of Object.entries(map)) {
        const key = normalizeKey(k);
        if (!key || !info?.machineId) continue;
        try {
          const r = insAct.run({
            key,
            machine_id: String(info.machineId),
            tier: normalizeTier(info.tier),
            expires_at: info.expiresAt ? parseIsoOrNull(info.expiresAt) : null,
            activated_at: info.activatedAt || now,
            last_seen_at: info.lastSeenAt || now,
          });
          if (r.changes) actImported++;
        } catch {
          /* orphan activation without catalog row — skip */
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (keysImported || actImported) {
    try {
      if (fs.existsSync(legacyKeysPath)) fs.renameSync(legacyKeysPath, `${legacyKeysPath}.migrated.bak`);
    } catch {
      /* ignore */
    }
    try {
      if (fs.existsSync(legacyActivationsPath))
        fs.renameSync(legacyActivationsPath, `${legacyActivationsPath}.migrated.bak`);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.log(`[fpsforge-license] Migrated JSON → SQLite: keys=${keysImported}, activations=${actImported}`);
  }
}

function createSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS license_keys (
      key TEXT PRIMARY KEY,
      tier TEXT NOT NULL,
      key_expires_at TEXT,
      sale_status TEXT NOT NULL DEFAULT 'inventory',
      sale_ref TEXT,
      sold_marked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activations (
      key TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      expires_at TEXT,
      activated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (key) REFERENCES license_keys(key)
    );
    CREATE INDEX IF NOT EXISTS idx_license_keys_sale ON license_keys(sale_status);
    CREATE INDEX IF NOT EXISTS idx_license_keys_created ON license_keys(created_at);
  `);
}

/**
 * @param {{ dataDir: string, legacyKeysPath: string, legacyActivationsPath: string }} opts
 */
export function openStore(opts) {
  const { dataDir, legacyKeysPath, legacyActivationsPath } = opts;
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlitePath = path.join(dataDir, DB_NAME);
  const db = new Database(sqlitePath);
  createSchema(db);
  migrateFromJson(db, legacyKeysPath, legacyActivationsPath);

  const getKeyRow = db.prepare(
    `SELECT key, tier, key_expires_at AS keyExpiresAt, sale_status AS saleStatus, sale_ref AS saleRef, sold_marked_at AS soldMarkedAt, created_at AS createdAt
     FROM license_keys WHERE key = ?`
  );

  return {
    sqlitePath,
    healthCounts() {
      const keys = db.prepare("SELECT COUNT(*) AS c FROM license_keys").get().c;
      const activations = db.prepare("SELECT COUNT(*) AS c FROM activations").get().c;
      return { keys, activations };
    },

    getKeyForActivate(keyNorm) {
      return getKeyRow.get(keyNorm) || null;
    },

    activate(keyNorm, machineId) {
      const row = getKeyRow.get(keyNorm);
      if (!row) return { ok: false, code: "INVALID_KEY" };
      if (isExpired(row.keyExpiresAt)) return { ok: false, code: "KEY_EXPIRED" };

      const existing = db.prepare("SELECT machine_id, activated_at FROM activations WHERE key = ?").get(keyNorm);
      if (existing && existing.machine_id !== machineId) {
        return { ok: false, code: "KEY_ALREADY_USED" };
      }

      const now = new Date().toISOString();
      if (!existing) {
        db.prepare(
          `INSERT INTO activations (key, machine_id, tier, expires_at, activated_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(keyNorm, machineId, row.tier, row.keyExpiresAt, now, now);
      } else {
        db.prepare(`UPDATE activations SET last_seen_at = ?, tier = ?, expires_at = ? WHERE key = ?`).run(
          now,
          row.tier,
          row.keyExpiresAt,
          keyNorm
        );
      }
      return { ok: true, tier: row.tier, expiresAt: row.keyExpiresAt };
    },

    verify(keyNorm, machineId) {
      const row = getKeyRow.get(keyNorm);
      if (!row) return { ok: false, code: "INVALID_KEY" };
      if (isExpired(row.keyExpiresAt)) return { ok: false, code: "KEY_EXPIRED" };

      const act = db.prepare("SELECT * FROM activations WHERE key = ?").get(keyNorm);
      if (!act) return { ok: false, code: "NOT_ACTIVATED" };
      if (act.machine_id !== machineId) return { ok: false, code: "WRONG_PC" };

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE activations SET last_seen_at = ?, tier = ?, expires_at = ? WHERE key = ?`
      ).run(now, row.tier, row.keyExpiresAt, keyNorm);
      return { ok: true, tier: row.tier, expiresAt: row.keyExpiresAt };
    },

    adminListActivations() {
      return db
        .prepare(
          `SELECT a.key, a.machine_id AS machineId, a.tier, a.expires_at AS expiresAt, a.activated_at AS activatedAt, a.last_seen_at AS lastSeenAt
           FROM activations a ORDER BY a.last_seen_at DESC`
        )
        .all();
    },

    adminListKeys() {
      const rows = db
        .prepare(
          `SELECT
             k.key,
             k.tier,
             k.key_expires_at AS expiresAt,
             k.sale_status AS saleStatus,
             k.sale_ref AS saleRef,
             k.sold_marked_at AS soldMarkedAt,
             k.created_at AS createdAt,
             a.machine_id AS machineId,
             a.activated_at AS activatedAt,
             a.last_seen_at AS lastSeenAt,
             CASE
               WHEN a.key IS NOT NULL THEN 'activated'
               WHEN k.sale_status = 'sold' THEN 'sold_unredeemed'
               ELSE 'in_pool'
             END AS uiStatus,
             CASE WHEN a.key IS NOT NULL THEN 'activated' ELSE 'free' END AS status
           FROM license_keys k
           LEFT JOIN activations a ON a.key = k.key
           ORDER BY datetime(k.created_at) DESC`
        )
        .all();
      return rows.map((r) => ({
        ...r,
        expired: Boolean(r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()),
      }));
    },

    adminReset(keyNorm) {
      const r = db.prepare("DELETE FROM activations WHERE key = ?").run(keyNorm);
      return { ok: true, removed: r.changes };
    },

    adminCreate(count, tier, daysValid) {
      const tierN = normalizeTier(tier);
      const keyExpiresAt =
        daysValid > 0 ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString() : null;
      const now = new Date().toISOString();
      const exists = db.prepare("SELECT key FROM license_keys WHERE key = ?");
      const ins = db.prepare(`
        INSERT INTO license_keys (key, tier, key_expires_at, sale_status, sale_ref, sold_marked_at, created_at)
        VALUES (?, ?, ?, 'inventory', NULL, NULL, ?)
      `);
      const created = [];
      const txn = db.transaction(() => {
        for (let i = 0; i < count; i++) {
          let k = makeKey();
          while (exists.get(k)) k = makeKey();
          ins.run(k, tierN, keyExpiresAt, now);
          created.push({ key: k, tier: tierN, expiresAt: keyExpiresAt });
        }
      });
      txn();
      return { ok: true, created };
    },

    adminMarkSold(keyNorm, saleRef) {
      const row = getKeyRow.get(keyNorm);
      if (!row) return { ok: false, message: "UNKNOWN_KEY" };
      const act = db.prepare("SELECT key FROM activations WHERE key = ?").get(keyNorm);
      if (act) return { ok: false, message: "ALREADY_ACTIVATED" };
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE license_keys SET sale_status = 'sold', sale_ref = ?, sold_marked_at = ? WHERE key = ?`
      ).run(String(saleRef || "").trim() || null, now, keyNorm);
      return { ok: true };
    },

    adminUnmarkSold(keyNorm) {
      const row = getKeyRow.get(keyNorm);
      if (!row) return { ok: false, message: "UNKNOWN_KEY" };
      const act = db.prepare("SELECT key FROM activations WHERE key = ?").get(keyNorm);
      if (act) return { ok: false, message: "ALREADY_ACTIVATED_USE_RESET" };
      db.prepare(
        `UPDATE license_keys SET sale_status = 'inventory', sale_ref = NULL, sold_marked_at = NULL WHERE key = ?`
      ).run(keyNorm);
      return { ok: true };
    },
  };
}
