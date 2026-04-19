/**
 * PostgreSQL store — same API as store.mjs (async methods). Use on Render Free with Neon/Supabase/etc.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pg from "pg";
import { normalizeKey, normalizeTier } from "./store.mjs";

const { Pool } = pg;

function makeKey() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const seg = () => Array.from({ length: 4 }, () => chars[crypto.randomInt(chars.length)]).join("");
  return `FFG-${seg()}-${seg()}-${seg()}-${seg()}`;
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

function sslOptionForUrl(connectionString) {
  const u = connectionString.toLowerCase();
  if (u.includes("localhost") || u.includes("127.0.0.1")) return false;
  return { rejectUnauthorized: false };
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS license_keys (
      key VARCHAR(48) PRIMARY KEY,
      tier VARCHAR(32) NOT NULL,
      key_expires_at TIMESTAMPTZ,
      sale_status VARCHAR(24) NOT NULL DEFAULT 'inventory',
      sale_ref TEXT,
      sold_marked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activations (
      key VARCHAR(48) PRIMARY KEY REFERENCES license_keys(key) ON DELETE CASCADE,
      machine_id TEXT NOT NULL,
      tier VARCHAR(32) NOT NULL,
      expires_at TIMESTAMPTZ,
      activated_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_license_keys_sale ON license_keys(sale_status);
  `);
}

async function migrateFromJson(pool, legacyKeysPath, legacyActivationsPath) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM license_keys");
  if (rows[0].c > 0) return;

  const now = new Date().toISOString();
  let keysImported = 0;
  let actImported = 0;

  if (fs.existsSync(legacyKeysPath)) {
    try {
      const raw = fs.readFileSync(legacyKeysPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const row = keyRowFromJsonItem(item);
          if (!row.key) continue;
          const r = await pool.query(
            `INSERT INTO license_keys (key, tier, key_expires_at, sale_status, sale_ref, sold_marked_at, created_at)
             VALUES ($1,$2,$3,'inventory',NULL,NULL,$4)
             ON CONFLICT (key) DO NOTHING`,
            [row.key, row.tier, row.key_expires_at, now]
          );
          if (r.rowCount) keysImported++;
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
          await pool.query(
            `INSERT INTO activations (key, machine_id, tier, expires_at, activated_at, last_seen_at)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              key,
              String(info.machineId),
              normalizeTier(info.tier),
              info.expiresAt ? parseIsoOrNull(info.expiresAt) : null,
              info.activatedAt || now,
              info.lastSeenAt || now,
            ]
          );
          actImported++;
        } catch {
          /* FK or duplicate */
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
    console.log(`[fpsforge-license] Migrated JSON → Postgres: keys=${keysImported}, activations=${actImported}`);
  }
}

/**
 * @param {{ connectionString: string, legacyKeysPath: string, legacyActivationsPath: string }} opts
 */
export async function openPgStore(opts) {
  const { connectionString, legacyKeysPath, legacyActivationsPath } = opts;
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
    ssl: sslOptionForUrl(connectionString),
  });

  await ensureSchema(pool);
  await migrateFromJson(pool, legacyKeysPath, legacyActivationsPath);

  const maskHost = () => {
    try {
      const u = new URL(connectionString.replace(/^postgresql:/, "postgres:"));
      return `${u.protocol}//${u.hostname}/…`;
    } catch {
      return "(postgres)";
    }
  };

  return {
    backend: "postgres",
    sqlitePath: null,
    postgresHost: maskHost(),

    async healthCounts() {
      const k = await pool.query("SELECT COUNT(*)::int AS c FROM license_keys");
      const a = await pool.query("SELECT COUNT(*)::int AS c FROM activations");
      return { keys: k.rows[0].c, activations: a.rows[0].c };
    },

    async activate(keyNorm, machineId) {
      const kr = await pool.query(
        `SELECT key, tier, key_expires_at AS "keyExpiresAt", sale_status AS "saleStatus", sale_ref AS "saleRef",
                sold_marked_at AS "soldMarkedAt", created_at AS "createdAt"
         FROM license_keys WHERE key = $1`,
        [keyNorm]
      );
      const row = kr.rows[0];
      if (!row) return { ok: false, code: "INVALID_KEY" };
      if (isExpired(row.keyExpiresAt)) return { ok: false, code: "KEY_EXPIRED" };

      const ex = await pool.query(`SELECT machine_id, activated_at FROM activations WHERE key = $1`, [keyNorm]);
      const existing = ex.rows[0];
      if (existing && existing.machine_id !== machineId) {
        return { ok: false, code: "KEY_ALREADY_USED" };
      }

      const now = new Date().toISOString();
      if (!existing) {
        await pool.query(
          `INSERT INTO activations (key, machine_id, tier, expires_at, activated_at, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [keyNorm, machineId, row.tier, row.keyExpiresAt, now, now]
        );
      } else {
        await pool.query(
          `UPDATE activations SET last_seen_at = $1, tier = $2, expires_at = $3 WHERE key = $4`,
          [now, row.tier, row.keyExpiresAt, keyNorm]
        );
      }
      return { ok: true, tier: row.tier, expiresAt: row.keyExpiresAt };
    },

    async verify(keyNorm, machineId) {
      const kr = await pool.query(
        `SELECT key, tier, key_expires_at AS "keyExpiresAt" FROM license_keys WHERE key = $1`,
        [keyNorm]
      );
      const row = kr.rows[0];
      if (!row) return { ok: false, code: "INVALID_KEY" };
      if (isExpired(row.keyExpiresAt)) return { ok: false, code: "KEY_EXPIRED" };

      const ar = await pool.query(`SELECT * FROM activations WHERE key = $1`, [keyNorm]);
      const act = ar.rows[0];
      if (!act) return { ok: false, code: "NOT_ACTIVATED" };
      if (act.machine_id !== machineId) return { ok: false, code: "WRONG_PC" };

      const now = new Date().toISOString();
      await pool.query(`UPDATE activations SET last_seen_at = $1, tier = $2, expires_at = $3 WHERE key = $4`, [
        now,
        row.tier,
        row.keyExpiresAt,
        keyNorm,
      ]);
      return { ok: true, tier: row.tier, expiresAt: row.keyExpiresAt };
    },

    async adminListActivations() {
      const r = await pool.query(
        `SELECT key, machine_id AS "machineId", tier, expires_at AS "expiresAt", activated_at AS "activatedAt", last_seen_at AS "lastSeenAt"
         FROM activations ORDER BY last_seen_at DESC`
      );
      return r.rows;
    },

    async adminListKeys() {
      const r = await pool.query(
        `SELECT
           k.key,
           k.tier,
           k.key_expires_at AS "expiresAt",
           k.sale_status AS "saleStatus",
           k.sale_ref AS "saleRef",
           k.sold_marked_at AS "soldMarkedAt",
           k.created_at AS "createdAt",
           a.machine_id AS "machineId",
           a.activated_at AS "activatedAt",
           a.last_seen_at AS "lastSeenAt",
           CASE
             WHEN a.key IS NOT NULL THEN 'activated'
             WHEN k.sale_status = 'sold' THEN 'sold_unredeemed'
             ELSE 'in_pool'
           END AS "uiStatus",
           CASE WHEN a.key IS NOT NULL THEN 'activated' ELSE 'free' END AS "status",
           (k.key_expires_at IS NOT NULL AND k.key_expires_at < NOW()) AS "expired"
         FROM license_keys k
         LEFT JOIN activations a ON a.key = k.key
         ORDER BY k.created_at DESC`
      );
      return r.rows.map((row) => ({
        ...row,
        expired: Boolean(row.expired),
      }));
    },

    async adminReset(keyNorm) {
      await pool.query(`DELETE FROM activations WHERE key = $1`, [keyNorm]);
      return { ok: true, removed: 1 };
    },

    async adminCreate(count, tier, daysValid) {
      const tierN = normalizeTier(tier);
      const keyExpiresAt =
        daysValid > 0 ? new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString() : null;
      const now = new Date().toISOString();
      const created = [];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < count; i++) {
          let k = makeKey();
          for (;;) {
            const e = await client.query("SELECT 1 FROM license_keys WHERE key = $1", [k]);
            if (e.rowCount === 0) break;
            k = makeKey();
          }
          await client.query(
            `INSERT INTO license_keys (key, tier, key_expires_at, sale_status, sale_ref, sold_marked_at, created_at)
             VALUES ($1,$2,$3,'inventory',NULL,NULL,$4)`,
            [k, tierN, keyExpiresAt, now]
          );
          created.push({ key: k, tier: tierN, expiresAt: keyExpiresAt });
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return { ok: true, created };
    },

    async adminMarkSold(keyNorm, saleRef) {
      const kr = await pool.query(`SELECT key FROM license_keys WHERE key = $1`, [keyNorm]);
      if (!kr.rowCount) return { ok: false, message: "UNKNOWN_KEY" };
      const ar = await pool.query(`SELECT key FROM activations WHERE key = $1`, [keyNorm]);
      if (ar.rowCount) return { ok: false, message: "ALREADY_ACTIVATED" };
      const now = new Date().toISOString();
      const ref = String(saleRef || "").trim() || null;
      await pool.query(
        `UPDATE license_keys SET sale_status = 'sold', sale_ref = $1, sold_marked_at = $2 WHERE key = $3`,
        [ref, now, keyNorm]
      );
      return { ok: true };
    },

    async adminUnmarkSold(keyNorm) {
      const kr = await pool.query(`SELECT key FROM license_keys WHERE key = $1`, [keyNorm]);
      if (!kr.rowCount) return { ok: false, message: "UNKNOWN_KEY" };
      const ar = await pool.query(`SELECT key FROM activations WHERE key = $1`, [keyNorm]);
      if (ar.rowCount) return { ok: false, message: "ALREADY_ACTIVATED_USE_RESET" };
      await pool.query(
        `UPDATE license_keys SET sale_status = 'inventory', sale_ref = NULL, sold_marked_at = NULL WHERE key = $1`,
        [keyNorm]
      );
      return { ok: true };
    },
  };
}
