const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const license = require("./license.cjs");

/** @type {BrowserWindow | null} */
let win = null;

const POWER_PLANS = {
  balanced: "381b4222-f694-41f0-9685-ff5bb260df2e",
  high: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
  ultimate: "e9a42b02-d5df-448d-aa00-03f14749eb61",
};

const BACKGROUND_KILL_PATTERNS = [
  "onedrive",
  "msteams",
  "microsoftteams",
  "adobe",
  "creativecloud",
  "epicwebhelper",
  "epicgameslauncher",
  "eabackgroundservice",
  "eaanticheat",
  "updater",
  "update",
  "teams",
  "overwolf",
  "gamebar",
  "xbox",
  "rivatuner",
  "nahimic",
  "armourycrate",
  "corsair",
  "razer",
  "slack",
  "skype",
  "zoom",
  "webex",
  "gotomeeting",
];

async function runExec(file, args) {
  const result = await execFileAsync(file, args, { windowsHide: true });
  return (result.stdout || "").trim();
}

async function runPowerShell(command) {
  return runExec("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]);
}

async function getTopProcesses() {
  if (process.platform !== "win32") return [];
  try {
    const json = await runPowerShell(
      "Get-Process | Sort-Object -Property WorkingSet -Descending | Select-Object -First 6 ProcessName,Id,@{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB, 0)}} | ConvertTo-Json"
    );
    const parsed = JSON.parse(json || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((p) => ({
      name: p.ProcessName || "unknown",
      pid: Number(p.Id || 0),
      memoryMb: Number(p.MemoryMB || 0),
    }));
  } catch {
    return [];
  }
}

async function getRealtimeSystemLoad() {
  if (process.platform !== "win32") {
    return { cpuLoadPercent: 0, diskLoadPercent: 0, processCount: 0 };
  }
  const script = `
    $cpuItems = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue
    $cpu = 0
    if ($cpuItems) {
      $cpuAvg = ($cpuItems | Measure-Object -Property LoadPercentage -Average).Average
      if ($cpuAvg -ne $null) { $cpu = [math]::Round([double]$cpuAvg, 1) }
    }

    $disk = 0
    $diskTotal = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "_Total" } | Select-Object -First 1
    if ($diskTotal) {
      $disk = [math]::Round([double]$diskTotal.PercentDiskTime, 1)
    }

    $processCount = @(Get-Process -ErrorAction SilentlyContinue).Count

    [pscustomobject]@{
      cpuLoadPercent = [math]::Min([math]::Max($cpu, 0), 100)
      diskLoadPercent = [math]::Min([math]::Max($disk, 0), 100)
      processCount = [int]$processCount
    } | ConvertTo-Json -Depth 3
  `;
  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "{}");
    return {
      cpuLoadPercent: Number(parsed.cpuLoadPercent || 0),
      diskLoadPercent: Number(parsed.diskLoadPercent || 0),
      processCount: Number(parsed.processCount || 0),
    };
  } catch {
    return { cpuLoadPercent: 0, diskLoadPercent: 0, processCount: 0 };
  }
}

async function ensureUltimatePlanExists() {
  try {
    const list = await runExec("powercfg", ["/list"]);
    if (!list.toLowerCase().includes(POWER_PLANS.ultimate)) {
      await runExec("powercfg", ["/duplicatescheme", POWER_PLANS.ultimate]);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function isUltimatePlanSupported() {
  if (process.platform !== "win32") return false;
  try {
    const list = await runExec("powercfg", ["/list"]);
    return list.toLowerCase().includes(POWER_PLANS.ultimate);
  } catch {
    return false;
  }
}

async function setPowerPlan(mode) {
  if (process.platform !== "win32") {
    return { ok: false, message: "Power plan radi samo na Windowsu." };
  }
  const normalized = String(mode || "").toLowerCase();
  const guid = POWER_PLANS[normalized] || POWER_PLANS.high;
  if (normalized === "ultimate") {
    const ensured = await ensureUltimatePlanExists();
    if (!ensured.ok) {
      try {
        await runExec("powercfg", ["/setactive", POWER_PLANS.high]);
        return {
          ok: true,
          plan: "high",
          warningCode: "ultimate_fallback_high",
        };
      } catch {
        return ensured;
      }
    }
  }
  try {
    await runExec("powercfg", ["/setactive", guid]);
    return { ok: true, plan: normalized || "high" };
  } catch (e) {
    if (normalized === "ultimate") {
      try {
        await runExec("powercfg", ["/setactive", POWER_PLANS.high]);
        return {
          ok: true,
          plan: "high",
          warningCode: "ultimate_fallback_high",
        };
      } catch {
        /* keep original error below */
      }
    }
    return {
      ok: false,
      plan: normalized || "high",
      message: e?.message || String(e),
    };
  }
}

async function cleanTempFiles(limit = 1200) {
  const tmp = os.tmpdir();
  let deleted = 0;
  let failed = 0;
  const names = await fs.promises.readdir(tmp);
  for (const name of names.slice(0, limit)) {
    const full = path.join(tmp, name);
    try {
      const st = await fs.promises.lstat(full);
      if (st.isFile()) {
        await fs.promises.unlink(full);
        deleted++;
      }
    } catch {
      failed++;
    }
  }
  return { ok: true, deleted, failed, folder: tmp };
}

async function closeBackgroundApps() {
  if (process.platform !== "win32") {
    return { ok: false, closed: [], failed: [], attempted: [], kept: [] };
  }

  const script = `
    $killPatterns = @(${BACKGROUND_KILL_PATTERNS.map((p) => `"${p}"`).join(",")})
    $alwaysKeep = @(
      "system","idle","registry","csrss","wininit","services","lsass","svchost","dwm","explorer",
      "sihost","ctfmon","audiodg","spoolsv","fontdrvhost","smss","winlogon","taskhostw",
      "startmenuexperiencehost","shellexperiencehost","searchhost","runtimebroker",
      "securityhealthservice","msmpeng","wudfhost","wpsystem","applicationframehost",
      "discord","obs","obs64",
      "fps forge","boost pc","electron","cursor","code","powershell","pwsh"
    )
    $steamGameHint = @("steamapps\\\\common")
    $bnetGameHint = @("call of duty","overwatch","wow","world of warcraft","diablo","starcraft","hearthstone")

    $all = Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath
    $steamGameRunning = $false
    $bnetGameRunning = $false

    foreach ($p in $all) {
      $name = ($p.Name | ForEach-Object { $_.ToLower() })
      $path = (($p.ExecutablePath | ForEach-Object { $_.ToLower() }) -as [string])
      if (-not $steamGameRunning -and $path) {
        foreach ($hint in $steamGameHint) {
          if ($path -like "*$hint*") { $steamGameRunning = $true; break }
        }
      }
      if (-not $bnetGameRunning) {
        foreach ($hint in $bnetGameHint) {
          if (($path -and $path -like "*$hint*") -or ($name -and $name -like "*$hint*")) {
            $bnetGameRunning = $true
            break
          }
        }
      }
    }

    $keepDynamic = New-Object System.Collections.Generic.HashSet[string]
    foreach ($k in $alwaysKeep) { [void]$keepDynamic.Add($k) }
    [void]$keepDynamic.Add("discord")
    if ($steamGameRunning) { [void]$keepDynamic.Add("steam"); [void]$keepDynamic.Add("steamwebhelper") }
    if ($bnetGameRunning) {
      [void]$keepDynamic.Add("battle.net")
      [void]$keepDynamic.Add("agent")
      [void]$keepDynamic.Add("blizzardbrowser")
    }

    $attempted = @()
    $closed = @()
    $failed = @()
    $kept = @()

    foreach ($proc in $all) {
      if (-not $proc.Name) { continue }
      $nameRaw = [string]$proc.Name
      $name = $nameRaw.ToLower()
      if ($name.EndsWith(".exe")) { $name = $name.Substring(0, $name.Length - 4) }
      $path = ([string]$proc.ExecutablePath).ToLower()

      if ($keepDynamic.Contains($name)) {
        $kept += $nameRaw
        continue
      }

      if ($path -and ($path.StartsWith("c:\\windows\\") -or $path.StartsWith("c:\\program files\\windowsapps\\"))) {
        continue
      }

      $matchKillPattern = $false
      foreach ($pattern in $killPatterns) {
        if ($name -like "*$pattern*") { $matchKillPattern = $true; break }
      }
      if (-not $matchKillPattern) { continue }

      $attempted += $nameRaw
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        $closed += $nameRaw
      } catch {
        $failed += $nameRaw
      }
    }

    [pscustomobject]@{
      steamGameRunning = $steamGameRunning
      bnetGameRunning = $bnetGameRunning
      attempted = @($attempted | Select-Object -Unique)
      closed = @($closed | Select-Object -Unique)
      failed = @($failed | Select-Object -Unique)
      kept = @($kept | Select-Object -Unique)
    } | ConvertTo-Json -Depth 5
  `;

  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "{}");
    return {
      ok: true,
      steamGameRunning: Boolean(parsed.steamGameRunning),
      bnetGameRunning: Boolean(parsed.bnetGameRunning),
      attempted: Array.isArray(parsed.attempted) ? parsed.attempted : [],
      closed: Array.isArray(parsed.closed) ? parsed.closed : [],
      failed: Array.isArray(parsed.failed) ? parsed.failed : [],
      kept: Array.isArray(parsed.kept) ? parsed.kept : [],
    };
  } catch (e) {
    return {
      ok: false,
      attempted: [],
      closed: [],
      failed: [],
      kept: [],
      message: e?.message || String(e),
    };
  }
}

async function flushDns() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Samo Windows." };
  }
  try {
    await runExec("ipconfig", ["/flushdns"]);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

/**
 * Ask Windows to trim each process working set (soft hint). Does not kill apps;
 * frees reclaimable cache briefly. Big RAM % drops still need closing heavy apps.
 */
async function trimWorkingSets() {
  if (process.platform !== "win32") {
    return { ok: false, attempted: 0, succeeded: 0, errors: 0, message: "Not Windows." };
  }
  const script = `
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FpsRamTrim {
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetProcessWorkingSetSize(IntPtr proc, int min, int max);
}
'@
    $skip = New-Object "System.Collections.Generic.HashSet[string]" ([StringComparer]::OrdinalIgnoreCase)
    foreach ($n in @(
      "Idle","System","Registry","Secure System","csrss","wininit","services","lsass","svchost",
      "smss","winlogon","fontdrvhost","MsMpEng","SecurityHealthService","Memory Compression",
      "vmcompute","dwm","audiodg","spoolsv","WUDFHost","sihost","ctfmon","RuntimeBroker"
    )) { [void]$skip.Add($n) }

    $attempted = 0
    $succeeded = 0
    $errors = 0
    foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
      if (-not $p.Id -or $p.Id -le 4) { continue }
      $nm = $p.ProcessName
      if ([string]::IsNullOrWhiteSpace($nm)) { continue }
      if ($skip.Contains($nm)) { continue }
      $attempted++
      try {
        $h = $p.Handle
        if ([FpsRamTrim]::SetProcessWorkingSetSize($h, -1, -1)) { $succeeded++ }
      } catch {
        $errors++
      }
    }
    [pscustomobject]@{ attempted = $attempted; succeeded = $succeeded; errors = $errors } | ConvertTo-Json -Compress
  `;
  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "{}");
    return {
      ok: true,
      attempted: Number(parsed.attempted || 0),
      succeeded: Number(parsed.succeeded || 0),
      errors: Number(parsed.errors || 0),
    };
  } catch (e) {
    return {
      ok: false,
      attempted: 0,
      succeeded: 0,
      errors: 1,
      message: e?.message || String(e),
    };
  }
}

async function runGameBoost() {
  const power = await setPowerPlan("high");
  const cleanup = await cleanTempFiles(800);
  const dns = await flushDns();
  const background = await closeBackgroundApps();
  const ramTrim = await trimWorkingSets();
  return { ok: true, power, cleanup, dns, background, ramTrim };
}

async function applyStreamPriorityBalance() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Stream balance works on Windows only." };
  }

  const script = `
    $obsProcesses = @("obs64","obs")
    $gamePatterns = @(
      "cs2","valorant","fortnite","r5apex","cod","rocketleague",
      "gta5","leagueoflegends","dota2","overwatch","pubg"
    )
    $result = [ordered]@{
      obsFound = 0
      obsAdjusted = 0
      gamesFound = 0
      gamesAdjusted = 0
      adjustedGames = @()
    }

    $obs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $obsProcesses -contains $_.ProcessName.ToLower() }
    $result.obsFound = @($obs).Count
    foreach ($p in $obs) {
      try {
        $p.PriorityClass = "AboveNormal"
        $result.obsAdjusted++
      } catch {}
    }

    $games = Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $n = $_.ProcessName.ToLower()
      foreach ($pattern in $gamePatterns) {
        if ($n -like "*$pattern*") { return $true }
      }
      return $false
    }
    $result.gamesFound = @($games).Count
    foreach ($g in $games) {
      try {
        $g.PriorityClass = "High"
        $result.gamesAdjusted++
        $result.adjustedGames += $g.ProcessName
      } catch {}
    }

    $result | ConvertTo-Json -Depth 4
  `;

  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "{}");
    return {
      ok: true,
      obsFound: Number(parsed.obsFound || 0),
      obsAdjusted: Number(parsed.obsAdjusted || 0),
      gamesFound: Number(parsed.gamesFound || 0),
      gamesAdjusted: Number(parsed.gamesAdjusted || 0),
      adjustedGames: Array.isArray(parsed.adjustedGames) ? parsed.adjustedGames : [],
    };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
}

async function runStreamMode() {
  const boost = await runGameBoost();
  const streamBalance = await applyStreamPriorityBalance();
  return { ok: true, boost, streamBalance };
}

async function tuneProcessorPolicyForGaming() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Processor tuning is Windows only." };
  }
  const commands = [
    ["/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMIN", "100"],
    ["/setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "100"],
    ["/setactive", "SCHEME_CURRENT"],
  ];
  const applied = [];
  const failed = [];
  for (const args of commands) {
    try {
      await runExec("powercfg", args);
      applied.push(args.join(" "));
    } catch (e) {
      failed.push({ command: args.join(" "), message: e?.message || String(e) });
    }
  }
  return { ok: failed.length === 0, applied, failed };
}

async function applyRegistryGamingTweaks() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Registry tweaks are Windows only." };
  }
  const tweaks = [
    [
      "reg",
      [
        "add",
        "HKCU\\Software\\Microsoft\\GameBar",
        "/v",
        "AllowAutoGameMode",
        "/t",
        "REG_DWORD",
        "/d",
        "1",
        "/f",
      ],
      "Enable Game Mode",
    ],
    [
      "reg",
      [
        "add",
        "HKCU\\System\\GameConfigStore",
        "/v",
        "GameDVR_Enabled",
        "/t",
        "REG_DWORD",
        "/d",
        "0",
        "/f",
      ],
      "Disable Game DVR",
    ],
    [
      "reg",
      [
        "add",
        "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR",
        "/v",
        "AppCaptureEnabled",
        "/t",
        "REG_DWORD",
        "/d",
        "0",
        "/f",
      ],
      "Disable background capture",
    ],
  ];

  const applied = [];
  const failed = [];
  for (const [file, args, label] of tweaks) {
    try {
      await runExec(file, args);
      applied.push(label);
    } catch (e) {
      failed.push({ tweak: label, message: e?.message || String(e) });
    }
  }
  return { ok: failed.length === 0, applied, failed };
}

async function applyNetworkGamingProfile() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Network profile is Windows only." };
  }
  const commands = [
    ["int", "tcp", "set", "global", "autotuninglevel=normal"],
    ["int", "tcp", "set", "global", "rss=enabled"],
  ];
  const applied = [];
  const failed = [];
  for (const cmd of commands) {
    try {
      await runExec("netsh", cmd);
      applied.push(cmd.join(" "));
    } catch (e) {
      failed.push({ command: cmd.join(" "), message: e?.message || String(e) });
    }
  }
  const ok = failed.length === 0 || applied.length > 0;
  return { ok, applied, failed };
}

async function runMaxFpsBoost() {
  const power = await setPowerPlan("ultimate");
  const processor = await tuneProcessorPolicyForGaming();
  const gameBoost = await runGameBoost();
  const registry = await applyRegistryGamingTweaks();
  const network = await applyNetworkGamingProfile();
  const ok =
    power.ok &&
    processor.ok &&
    gameBoost.ok &&
    registry.ok &&
    network.ok;
  return { ok, power, processor, gameBoost, registry, network };
}

async function getSecurityStatus() {
  if (process.platform !== "win32") {
    return {
      ok: false,
      message: "Windows only.",
      defenderRealtimeEnabled: false,
      defenderAntivirusEnabled: false,
      firewallEnabled: false,
      vpnActive: false,
      vpnAdapters: [],
    };
  }
  const script = `
    $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue
    $fwProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
    $vpnAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
      $_.Status -eq "Up" -and (
        $_.Name -match "VPN|WireGuard|TAP|TUN" -or
        $_.InterfaceDescription -match "VPN|WireGuard|TAP|TUN|Nord|Express|Surfshark|OpenVPN"
      )
    } | Select-Object Name,InterfaceDescription

    [pscustomobject]@{
      defenderRealtimeEnabled = [bool]$mp.RealTimeProtectionEnabled
      defenderAntivirusEnabled = [bool]$mp.AntivirusEnabled
      firewallEnabled = [bool](($fwProfiles | Where-Object { $_.Enabled -eq $true }).Count -ge 1)
      vpnActive = [bool](@($vpnAdapters).Count -ge 1)
      vpnAdapters = @($vpnAdapters | ForEach-Object { $_.Name })
    } | ConvertTo-Json -Depth 4
  `;
  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "{}");
    return {
      ok: true,
      defenderRealtimeEnabled: Boolean(parsed.defenderRealtimeEnabled),
      defenderAntivirusEnabled: Boolean(parsed.defenderAntivirusEnabled),
      firewallEnabled: Boolean(parsed.firewallEnabled),
      vpnActive: Boolean(parsed.vpnActive),
      vpnAdapters: Array.isArray(parsed.vpnAdapters) ? parsed.vpnAdapters : [],
    };
  } catch (e) {
    return {
      ok: false,
      message: e?.message || String(e),
      defenderRealtimeEnabled: false,
      defenderAntivirusEnabled: false,
      firewallEnabled: false,
      vpnActive: false,
      vpnAdapters: [],
    };
  }
}

async function runDefenderScan(scanType) {
  if (process.platform !== "win32") {
    return { ok: false, message: "Windows only." };
  }
  const type = String(scanType || "").toLowerCase() === "full" ? "FullScan" : "QuickScan";
  const script = `Start-MpScan -ScanType ${type}`;
  try {
    await runPowerShell(script);
    return { ok: true, scanType: type };
  } catch (e) {
    return { ok: false, scanType: type, message: e?.message || String(e) };
  }
}

async function openVpnProvider(providerId) {
  const id = String(providerId || "").toLowerCase();
  const providers = {
    proton: "https://protonvpn.com/download",
    windscribe: "https://windscribe.com/download",
    mullvad: "https://mullvad.net/download/vpn/windows",
  };
  const url = providers[id] || providers.proton;
  await shell.openExternal(url);
  return { ok: true, url };
}

async function getVpnRegionBenchmarks() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Windows only.", rows: [] };
  }
  const script = `
    $targets = @(
      @{ country = "Germany"; host = "de-fra.prod.surfshark.com" },
      @{ country = "Netherlands"; host = "nl-ams.prod.surfshark.com" },
      @{ country = "Poland"; host = "pl-waw.prod.surfshark.com" },
      @{ country = "France"; host = "fr-par.prod.surfshark.com" },
      @{ country = "UK"; host = "uk-lon.prod.surfshark.com" },
      @{ country = "USA East"; host = "us-nyc.prod.surfshark.com" }
    )

    $rows = @()
    foreach ($t in $targets) {
      $avg = $null
      try {
        $pings = Test-Connection -ComputerName $t.host -Count 2 -ErrorAction Stop
        $avg = [math]::Round((($pings | Measure-Object ResponseTime -Average).Average), 1)
      } catch {}
      $rows += [pscustomobject]@{
        country = $t.country
        host = $t.host
        latencyMs = $avg
      }
    }
    $rows | ConvertTo-Json -Depth 3
  `;
  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "[]");
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({
      country: String(r.country || ""),
      host: String(r.host || ""),
      latencyMs: r.latencyMs === null || r.latencyMs === undefined ? null : Number(r.latencyMs),
    }));
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, message: e?.message || String(e), rows: [] };
  }
}

async function listWindowsVpnProfiles() {
  if (process.platform !== "win32") {
    return { ok: false, message: "Windows only.", profiles: [] };
  }
  const script = `
    $profiles = Get-VpnConnection -ErrorAction SilentlyContinue | Select-Object Name,ConnectionStatus
    $profiles | ConvertTo-Json -Depth 3
  `;
  try {
    const json = await runPowerShell(script);
    const parsed = JSON.parse(json || "[]");
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((p) => ({
      name: String(p.Name || ""),
      connected: String(p.ConnectionStatus || "").toLowerCase() === "connected",
    }));
    return { ok: true, profiles: rows.filter((r) => r.name) };
  } catch (e) {
    return { ok: false, message: e?.message || String(e), profiles: [] };
  }
}

async function connectWindowsVpnProfile(profileName) {
  if (process.platform !== "win32") {
    return { ok: false, message: "Windows only." };
  }
  const profile = String(profileName || "").trim();
  if (!profile) return { ok: false, message: "Missing profile name." };
  try {
    await runExec("rasdial", [profile]);
    return { ok: true, profile };
  } catch (e) {
    return { ok: false, profile, message: e?.message || String(e) };
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#1b2838",
    title: "FPS Forge",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    win.loadURL("http://127.0.0.1:5175/");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const idx = path.join(process.resourcesPath, "client", "dist", "index.html");
    win.loadFile(idx);
  }

  // Keep taskbar/window title on "FPS Forge" (old cached HTML or dev server could still say "Boost PC").
  win.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    win.setTitle("FPS Forge");
  });

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(async () => {
  await license.refreshLicenseState();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function requireLicenseOrFail() {
  try {
    const state = await license.refreshLicenseState();
    if (!state?.ok) {
      return { ok: false, message: "LICENSE_REQUIRED" };
    }
    return null;
  } catch {
    return { ok: false, message: "LICENSE_SERVER_OFFLINE" };
  }
}

async function requirePremiumOrFail() {
  try {
    const state = await license.refreshLicenseState();
    if (!state?.ok || !license.isPremiumTier(state)) {
      return { ok: false, message: "PREMIUM_REQUIRED" };
    }
    return null;
  } catch {
    return { ok: false, message: "PREMIUM_REQUIRED" };
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("boost:getStats", async () => {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const cpus = os.cpus() || [];
  const tmpDir = os.tmpdir();
  let tempFiles = 0;
  try {
    const names = await fs.promises.readdir(tmpDir);
    tempFiles = names.length;
  } catch {
    /* ignore */
  }
  const topProcesses = await getTopProcesses();
  const realtimeLoad = await getRealtimeSystemLoad();
  const supportsUltimate = await isUltimatePlanSupported();
  return {
    totalMem: total,
    freeMem: free,
    usedMem: used,
    memUsedPercent: Math.round((used / total) * 1000) / 10,
    cpuModel: cpus[0]?.model || "—",
    cpuCount: cpus.length,
    platform: os.platform(),
    release: os.release(),
    homedir: os.homedir(),
    tmpDir,
    tempEntries: tempFiles,
    uptimeSec: os.uptime(),
    topProcesses,
    cpuLoadPercent: realtimeLoad.cpuLoadPercent,
    diskLoadPercent: realtimeLoad.diskLoadPercent,
    processCount: realtimeLoad.processCount,
    supportsUltimate,
  };
});

ipcMain.handle("boost:cleanTempFiles", async () => {
  return cleanTempFiles();
});

ipcMain.handle("boost:flushDns", async () => {
  return flushDns();
});

ipcMain.handle("boost:setPowerPlan", async (_e, mode) => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return setPowerPlan(mode);
});

ipcMain.handle("boost:closeBackgroundApps", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return closeBackgroundApps();
});

ipcMain.handle("boost:runGameBoost", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return runGameBoost();
});

ipcMain.handle("boost:runStreamMode", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return runStreamMode();
});

ipcMain.handle("boost:runMaxFpsBoost", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return runMaxFpsBoost();
});

ipcMain.handle("security:getStatus", async () => {
  return getSecurityStatus();
});

ipcMain.handle("security:defenderQuickScan", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return runDefenderScan("quick");
});

ipcMain.handle("security:defenderFullScan", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return runDefenderScan("full");
});

ipcMain.handle("security:openVpnProvider", async (_e, providerId) => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return openVpnProvider(providerId);
});

ipcMain.handle("security:vpnRegionBenchmarks", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return getVpnRegionBenchmarks();
});

ipcMain.handle("security:vpnProfiles", async () => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return listWindowsVpnProfiles();
});

ipcMain.handle("security:connectVpnProfile", async (_e, profileName) => {
  const denied = await requirePremiumOrFail();
  if (denied) return denied;
  return connectWindowsVpnProfile(profileName);
});

ipcMain.handle("boost:openExternal", async (_e, url) => {
  await shell.openExternal(String(url));
  return { ok: true };
});

ipcMain.handle("boost:openPath", async (_e, target) => {
  const t = String(target || "").trim();
  if (!t) return { ok: false };
  await shell.openPath(t);
  return { ok: true };
});

ipcMain.handle("license:getStatus", async () => {
  const state = await license.refreshLicenseState();
  const apiBase = await license.resolveApiBase();
  return { ...state, apiBase };
});

ipcMain.handle("license:getMachineId", async () => {
  return { ok: true, machineId: await license.getMachineId() };
});

ipcMain.handle("license:activate", async (_e, rawKey) => {
  return license.activateLicense(rawKey);
});

ipcMain.handle("license:setApiBase", async (_e, rawUrl) => {
  return license.setUserLicenseApiBase(rawUrl);
});
