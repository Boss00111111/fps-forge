const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const licenseConfig = require("./license-config.cjs");

const VERIFY_GRACE_MS = 72 * 60 * 60 * 1000;

let cachedApiBase = null;
let cachedLicenseState = null;

function clearLicenseCaches() {
  cachedApiBase = null;
  cachedLicenseState = null;
}

function getLicensePaths() {
  const dir = app.getPath("userData");
  const licensePath = path.join(dir, "license.json");
  const apiOverridePath = path.join(dir, "license-api.json");
  return { dir, licensePath, apiOverridePath };
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonSafe(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function resolveApiBase() {
  if (cachedApiBase !== null) return cachedApiBase;
  const envBase = String(process.env.FPSFORGE_LICENSE_API || "").trim().replace(/\/$/, "");
  if (envBase) {
    cachedApiBase = envBase;
    return cachedApiBase;
  }
  const { apiOverridePath } = getLicensePaths();
  const override = await readJsonSafe(apiOverridePath, {});
  const fromFile = String(override.apiBase || "").trim().replace(/\/$/, "");
  if (fromFile) {
    cachedApiBase = fromFile;
    return cachedApiBase;
  }
  const bundled = String(licenseConfig.packagedApiBase || "").trim().replace(/\/$/, "");
  if (bundled) {
    cachedApiBase = bundled;
    return cachedApiBase;
  }
  cachedApiBase = "http://127.0.0.1:3847";
  return cachedApiBase;
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeTier(tier) {
  const t = String(tier || "free").toLowerCase();
  if (t === "free" || t === "premium_monthly" || t === "premium_lifetime") return t;
  return "free";
}

async function getMachineId() {
  if (process.platform !== "win32") {
    return crypto.createHash("sha256").update(osInfoFallback()).digest("hex").slice(0, 32);
  }
  const script = `
    $uuid = (Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue).UUID
    $cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1).ProcessorId
    $raw = "$uuid|$cpu"
    $raw
  `;
  try {
    const out = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true }
    );
    const raw = String(out.stdout || "").trim();
    if (!raw) throw new Error("empty machine fingerprint");
    return crypto.createHash("sha256").update(raw).digest("hex");
  } catch {
    return crypto.createHash("sha256").update(osInfoFallback()).digest("hex");
  }
}

function osInfoFallback() {
  const os = require("os");
  return `${os.hostname()}|${os.platform()}|${os.arch()}`;
}

async function readLocalLicense() {
  const { licensePath } = getLicensePaths();
  return readJsonSafe(licensePath, null);
}

async function saveLocalLicense(payload) {
  const { licensePath } = getLicensePaths();
  await writeJsonSafe(licensePath, payload);
}

async function postJson(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { ok: false, message: text || "Invalid server response" };
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: {
        ok: false,
        message: "LICENSE_SERVER_OFFLINE",
        detail: e?.message || String(e),
      },
    };
  }
}

async function callActivate(key, machineId) {
  const base = await resolveApiBase();
  if (!base) {
    return { ok: false, message: "LICENSE_API_MISSING" };
  }
  return postJson(`${base}/activate`, { key, machineId });
}

async function callVerify(key, machineId) {
  const base = await resolveApiBase();
  if (!base) {
    return { ok: false, message: "LICENSE_API_MISSING" };
  }
  return postJson(`${base}/verify`, { key, machineId });
}

function isGraceStillValid(lastVerifiedAt) {
  if (!lastVerifiedAt) return false;
  const t = new Date(lastVerifiedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < VERIFY_GRACE_MS;
}

async function refreshLicenseState() {
  const packaged = app.isPackaged;
  const apiBase = await resolveApiBase();
  const machineId = await getMachineId();

  if (!packaged && licenseConfig.devBypassUnlicensed) {
    cachedLicenseState = {
      ok: true,
      reason: "dev_bypass",
      machineId,
      apiConfigured: Boolean(apiBase),
      tier: "premium_lifetime",
      expiresAt: null,
    };
    return cachedLicenseState;
  }

  if (!packaged && !apiBase) {
    cachedLicenseState = {
      ok: true,
      reason: "dev_no_api",
      machineId,
      apiConfigured: false,
      tier: "free",
      expiresAt: null,
    };
    return cachedLicenseState;
  }

  if (packaged && !apiBase) {
    cachedLicenseState = {
      ok: false,
      reason: "api_missing",
      machineId,
      apiConfigured: false,
      tier: "free",
      expiresAt: null,
      message: "Prod build requires license API. Set FPSFORGE_LICENSE_API or userData/license-api.json",
    };
    return cachedLicenseState;
  }

  const local = await readLocalLicense();
  if (!local || !local.key) {
    cachedLicenseState = {
      ok: false,
      reason: "not_activated",
      machineId,
      apiConfigured: true,
      tier: "free",
      expiresAt: null,
    };
    return cachedLicenseState;
  }

  if (local.machineId && local.machineId !== machineId) {
    cachedLicenseState = {
      ok: false,
      reason: "machine_mismatch",
      machineId,
      apiConfigured: true,
      tier: "free",
      expiresAt: null,
      message: "License belongs to another PC.",
    };
    return cachedLicenseState;
  }

  const verify = await callVerify(local.key, machineId);
  if (verify.ok && verify.json?.ok) {
    const next = {
      ...local,
      machineId,
      tier: normalizeTier(verify.json?.tier || local.tier),
      expiresAt: verify.json?.expiresAt || local.expiresAt || null,
      lastVerifiedAt: new Date().toISOString(),
    };
    await saveLocalLicense(next);
    cachedLicenseState = {
      ok: true,
      reason: "verified",
      machineId,
      apiConfigured: true,
      tier: next.tier || "premium_monthly",
      expiresAt: next.expiresAt || null,
    };
    return cachedLicenseState;
  }

  if (isGraceStillValid(local.lastVerifiedAt)) {
    cachedLicenseState = {
      ok: true,
      reason: "grace",
      machineId,
      apiConfigured: true,
      tier: normalizeTier(local.tier || "premium_monthly"),
      expiresAt: local.expiresAt || null,
      message: verify.json?.message || verify.json?.error || "Offline grace mode",
    };
    return cachedLicenseState;
  }

  cachedLicenseState = {
    ok: false,
    reason: "verify_failed",
    machineId,
    apiConfigured: true,
    tier: normalizeTier(local.tier || "free"),
    expiresAt: local.expiresAt || null,
    message: verify.json?.message || verify.json?.error || `Verify failed (${verify.status})`,
  };
  return cachedLicenseState;
}

async function setUserLicenseApiBase(rawUrl) {
  const clean = String(rawUrl || "")
    .trim()
    .replace(/\/$/, "");
  if (!clean) {
    return { ok: false, message: "EMPTY_URL" };
  }
  const allowed =
    clean.startsWith("https://") ||
    clean.startsWith("http://127.0.0.1") ||
    clean.startsWith("http://localhost");
  if (!allowed) {
    return { ok: false, message: "API_URL_HTTPS_REQUIRED" };
  }
  const { apiOverridePath } = getLicensePaths();
  await writeJsonSafe(apiOverridePath, { apiBase: clean });
  clearLicenseCaches();
  return { ok: true, apiBase: clean };
}

async function activateLicense(rawKey) {
  cachedLicenseState = null;
  const key = normalizeKey(rawKey);
  const machineId = await getMachineId();
  const apiBase = await resolveApiBase();

  if (!apiBase) {
    return { ok: false, message: "LICENSE_API_MISSING" };
  }

  const res = await callActivate(key, machineId);
  if (!res.ok || !res.json?.ok) {
    return {
      ok: false,
      message:
        res.json?.message ||
        res.json?.error ||
        (res.status === 0 ? "LICENSE_SERVER_OFFLINE" : `Activation failed (${res.status})`),
    };
  }

  await saveLocalLicense({
    key,
    machineId,
    tier: normalizeTier(res.json?.tier || "premium_monthly"),
    expiresAt: res.json?.expiresAt || null,
    activatedAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  });

  cachedLicenseState = {
    ok: true,
    reason: "activated",
    machineId,
    apiConfigured: true,
    tier: normalizeTier(res.json?.tier || "premium_monthly"),
    expiresAt: res.json?.expiresAt || null,
  };
  return { ok: true, machineId };
}

async function assertLicensedForBoost() {
  if (cachedLicenseState?.ok) return true;
  await refreshLicenseState();
  return Boolean(cachedLicenseState?.ok);
}

function isPremiumTier(state) {
  const tier = normalizeTier(state?.tier || "free");
  return tier === "premium_monthly" || tier === "premium_lifetime";
}

async function assertPremiumLicensed() {
  const state = cachedLicenseState || (await refreshLicenseState());
  return Boolean(state?.ok) && isPremiumTier(state);
}

module.exports = {
  getMachineId,
  refreshLicenseState,
  activateLicense,
  assertLicensedForBoost,
  assertPremiumLicensed,
  isPremiumTier,
  resolveApiBase,
  setUserLicenseApiBase,
  clearLicenseCaches,
};
