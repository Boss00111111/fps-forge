const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

function getApiConfigPath() {
  return path.join(app.getPath("userData"), "admin-api.json");
}

function readConfiguredApiBase() {
  try {
    const raw = fs.readFileSync(getApiConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    const value = String(parsed?.apiBase || "").trim().replace(/\/$/, "");
    return value || null;
  } catch {
    return null;
  }
}

function writeConfiguredApiBase(apiBase) {
  const clean = String(apiBase || "").trim().replace(/\/$/, "");
  const filePath = getApiConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ apiBase: clean }, null, 2), "utf8");
  return clean;
}

function resolveApiBase() {
  const env = String(process.env.FPSFORGE_LICENSE_API || "").trim().replace(/\/$/, "");
  if (env) return env;
  const saved = readConfiguredApiBase();
  if (saved) return saved;
  return "http://127.0.0.1:3847";
}

function resolveServerDir() {
  const envDir = String(process.env.FPSFORGE_SERVER_DIR || "").trim();
  const docsDir = app.getPath("documents");
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    envDir,
    path.join(__dirname, "..", "license-server"),
    path.join(path.dirname(process.execPath), "..", "license-server"),
    path.join(exeDir, "license-server"),
    path.join(exeDir, "boost-pc-desktop", "license-server"),
    path.join(docsDir, "boost-pc-desktop", "license-server"),
    path.join(process.cwd(), "license-server"),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      const hasServer = fs.existsSync(path.join(dir, "server.mjs"));
      const hasPkg = fs.existsSync(path.join(dir, "package.json"));
      if (hasServer && hasPkg) return dir;
    } catch {
      // noop
    }
  }
  return null;
}

async function postAdmin(pathname, token, body) {
  const res = await fetch(`${resolveApiBase()}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": String(token || ""),
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, message: text || "INVALID_RESPONSE" };
  }
  return { ok: res.ok, status: res.status, ...json };
}

async function getAdmin(pathname, token) {
  const res = await fetch(`${resolveApiBase()}${pathname}`, {
    method: "GET",
    headers: {
      "x-admin-token": String(token || ""),
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { ok: false, message: text || "INVALID_RESPONSE" };
  }
  return { ok: res.ok, status: res.status, ...json };
}

async function getAdminRawText(pathname, token) {
  const res = await fetch(`${resolveApiBase()}${pathname}`, {
    method: "GET",
    headers: { "x-admin-token": String(token || "") },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    backgroundColor: "#0b111b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("admin:getBase", async () => ({ ok: true, apiBase: resolveApiBase() }));
ipcMain.handle("admin:setBase", async (_e, apiBase) => {
  const clean = writeConfiguredApiBase(apiBase);
  return { ok: true, apiBase: clean };
});

ipcMain.handle("admin:health", async () => {
  try {
    const res = await fetch(`${resolveApiBase()}/health`);
    const json = await res.json();
    return { ok: res.ok, ...json };
  } catch (e) {
    return { ok: false, message: `SERVER_OFFLINE: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:startLocalServer", async (_e, token) => {
  try {
    const serverDir = resolveServerDir();
    if (!serverDir) {
      return {
        ok: false,
        message: "LICENSE_SERVER_FOLDER_NOT_FOUND",
      };
    }
    const apiBase = resolveApiBase();
    const adminToken = String(token || "").trim();
    const env = {
      ...process.env,
      FPSFORGE_LICENSE_API: apiBase,
      ADMIN_TOKEN: adminToken || process.env.ADMIN_TOKEN || "",
    };
    const child = spawn("npm", ["start"], {
      cwd: serverDir,
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: true,
    });
    child.unref();
    return { ok: true, message: "SERVER_START_TRIGGERED", serverDir };
  } catch (e) {
    return { ok: false, message: `SERVER_START_FAILED: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:listActivations", async (_e, token) => {
  try {
    return await getAdmin("/admin/activations", token);
  } catch (e) {
    return { ok: false, message: `REQUEST_FAILED: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:listKeys", async (_e, token) => {
  try {
    return await getAdmin("/admin/keys", token);
  } catch (e) {
    return { ok: false, message: `REQUEST_FAILED: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:resetKey", async (_e, token, key) => {
  try {
    return await postAdmin("/admin/reset", token, { key });
  } catch (e) {
    return { ok: false, message: `REQUEST_FAILED: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:createKeys", async (_e, token, payload) => {
  try {
    return await postAdmin("/admin/create", token, payload || {});
  } catch (e) {
    return { ok: false, message: `REQUEST_FAILED: ${e?.message || e}` };
  }
});

ipcMain.handle("admin:exportKeysTxt", async (_e, token) => {
  try {
    const result = await getAdminRawText("/admin/keys-export", token);
    if (!result.ok) {
      let msg = result.text || "";
      try {
        const j = JSON.parse(result.text || "{}");
        if (j.message) msg = j.message;
      } catch {
        /* keep msg as body */
      }
      return { ok: false, message: msg || `HTTP ${result.status}` };
    }
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Save keys as text",
      defaultPath: "fps-forge-keys.txt",
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (canceled || !filePath) return { ok: false, message: "CANCELLED" };
    fs.writeFileSync(filePath, result.text, "utf8");
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, message: `REQUEST_FAILED: ${e?.message || e}` };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
