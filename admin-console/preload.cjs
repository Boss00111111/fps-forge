const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adminApi", {
  getBase: () => ipcRenderer.invoke("admin:getBase"),
  setBase: (apiBase) => ipcRenderer.invoke("admin:setBase", apiBase),
  health: () => ipcRenderer.invoke("admin:health"),
  startLocalServer: (token) => ipcRenderer.invoke("admin:startLocalServer", token),
  listKeys: (token) => ipcRenderer.invoke("admin:listKeys", token),
  listActivations: (token) => ipcRenderer.invoke("admin:listActivations", token),
  resetKey: (token, key) => ipcRenderer.invoke("admin:resetKey", token, key),
  createKeys: (token, payload) => ipcRenderer.invoke("admin:createKeys", token, payload),
  exportKeysTxt: (token) => ipcRenderer.invoke("admin:exportKeysTxt", token),
});
