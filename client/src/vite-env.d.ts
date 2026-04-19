/// <reference types="vite/client" />

export {};

declare global {
  type PowerPlanMode = "balanced" | "high" | "ultimate";

  interface ProcessRow {
    name: string;
    pid: number;
    memoryMb: number;
  }

  interface BoostStatsPayload {
    totalMem: number;
    freeMem: number;
    usedMem: number;
    memUsedPercent: number;
    cpuModel: string;
    cpuCount: number;
    platform: string;
    release: string;
    homedir: string;
    tmpDir: string;
    tempEntries: number;
    uptimeSec: number;
    topProcesses: ProcessRow[];
    cpuLoadPercent: number;
    diskLoadPercent: number;
    processCount: number;
    supportsUltimate: boolean;
  }

  interface Window {
    boostPc?: {
      getStats: () => Promise<BoostStatsPayload | { ok: false; message?: string }>;
      cleanTempFiles: () => Promise<{
        ok: boolean;
        deleted: number;
        failed: number;
        folder: string;
      }>;
      flushDns: () => Promise<{ ok: boolean; message?: string }>;
      setPowerPlan: (mode: PowerPlanMode) => Promise<{
        ok: boolean;
        plan?: string;
        message?: string;
        warningCode?: string;
      }>;
      closeBackgroundApps: () => Promise<{
        ok: boolean;
        attempted: string[];
        closed: string[];
        failed: string[];
      }>;
      runGameBoost: () => Promise<{
        ok: boolean;
        power: { ok: boolean; plan?: string; message?: string; warningCode?: string };
        cleanup: { ok: boolean; deleted: number; failed: number; folder: string };
        dns: { ok: boolean; message?: string };
        background: { ok: boolean; attempted: string[]; closed: string[]; failed: string[] };
        ramTrim: {
          ok: boolean;
          attempted: number;
          succeeded: number;
          errors: number;
          message?: string;
        };
      }>;
      runStreamMode: () => Promise<{
        ok: boolean;
        boost: {
          ok: boolean;
          power: { ok: boolean; plan?: string; message?: string; warningCode?: string };
          cleanup: { ok: boolean; deleted: number; failed: number; folder: string };
          dns: { ok: boolean; message?: string };
          background: { ok: boolean; attempted: string[]; closed: string[]; failed: string[] };
          ramTrim: {
            ok: boolean;
            attempted: number;
            succeeded: number;
            errors: number;
            message?: string;
          };
        };
        streamBalance: {
          ok: boolean;
          obsFound?: number;
          obsAdjusted?: number;
          gamesFound?: number;
          gamesAdjusted?: number;
          adjustedGames?: string[];
          message?: string;
        };
      }>;
      runMaxFpsBoost: () => Promise<{
        ok: boolean;
        power: { ok: boolean; plan?: string; message?: string; warningCode?: string };
        processor: {
          ok: boolean;
          applied: string[];
          failed: Array<{ command: string; message: string }>;
          message?: string;
        };
        gameBoost: {
          ok: boolean;
          power: { ok: boolean; plan?: string; message?: string };
          cleanup: { ok: boolean; deleted: number; failed: number; folder: string };
          dns: { ok: boolean; message?: string };
          background: { ok: boolean; attempted: string[]; closed: string[]; failed: string[] };
          ramTrim: {
            ok: boolean;
            attempted: number;
            succeeded: number;
            errors: number;
            message?: string;
          };
        };
        registry: {
          ok: boolean;
          applied: string[];
          failed: Array<{ tweak: string; message: string }>;
          message?: string;
        };
        network: {
          ok: boolean;
          applied: string[];
          failed: Array<{ command: string; message: string }>;
          message?: string;
        };
      }>;
      openExternal: (url: string) => Promise<{ ok: boolean }>;
      openPath: (p: string) => Promise<{ ok: boolean }>;
      getLicenseStatus: () => Promise<{
        ok: boolean;
        reason?: string;
        machineId?: string;
        apiConfigured?: boolean;
        apiBase?: string;
        tier?: "free" | "premium_monthly" | "premium_lifetime";
        expiresAt?: string | null;
        message?: string;
      }>;
      getMachineId: () => Promise<{ ok: boolean; machineId?: string; message?: string }>;
      activateLicense: (key: string) => Promise<{ ok: boolean; machineId?: string; message?: string }>;
      setLicenseApiBase: (url: string) => Promise<{ ok: boolean; apiBase?: string; message?: string }>;
      getSecurityStatus: () => Promise<{
        ok: boolean;
        message?: string;
        defenderRealtimeEnabled: boolean;
        defenderAntivirusEnabled: boolean;
        firewallEnabled: boolean;
        vpnActive: boolean;
        vpnAdapters: string[];
      }>;
      defenderQuickScan: () => Promise<{ ok: boolean; scanType?: string; message?: string }>;
      defenderFullScan: () => Promise<{ ok: boolean; scanType?: string; message?: string }>;
      openVpnProvider: (providerId: string) => Promise<{ ok: boolean; url?: string; message?: string }>;
      getVpnRegionBenchmarks: () => Promise<{
        ok: boolean;
        message?: string;
        rows: Array<{ country: string; host: string; latencyMs: number | null }>;
      }>;
      getVpnProfiles: () => Promise<{
        ok: boolean;
        message?: string;
        profiles: Array<{ name: string; connected: boolean }>;
      }>;
      connectVpnProfile: (
        profileName: string
      ) => Promise<{ ok: boolean; profile?: string; message?: string }>;
    };
  }
}
