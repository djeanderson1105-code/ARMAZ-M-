/**
 * SSTR Database Quota Telemetry & Action Projection Engine
 * Real-time monitoring for Firestore Spark Free Tier limits & 30+ collaborator performance.
 */

export interface TelemetryStats {
  dateKey: string;
  reads: number;
  writes: number;
  deletes: number;
  estimatedStorageMB: number;
  lastUpdated: string;
}

export const QUOTA_LIMITS = {
  DAILY_READS: 50000,
  DAILY_WRITES: 20000,
  DAILY_DELETES: 20000,
  MAX_STORAGE_MB: 1024, // 1 GiB
  MAX_CONCURRENT_USERS: 100, // WebSocket connections allowed on free tier
};

// Helper to get today's date key YYYY-MM-DD in local time
export function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTelemetryStats(): TelemetryStats {
  const todayKey = getTodayKey();
  const rawStats = localStorage.getItem(`sstr_db_telemetry_${todayKey}`);
  
  if (rawStats) {
    try {
      const parsed = JSON.parse(rawStats);
      if (parsed.dateKey === todayKey) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse telemetry stats:", e);
    }
  }

  // Initial estimate based on current records in localStorage
  let initialReads = 120;
  let initialWrites = 45;
  let estimatedStorage = 12.5;

  try {
    const rawRecords = localStorage.getItem("sstr_cached_records_v1");
    if (rawRecords) {
      const len = JSON.parse(rawRecords).length || 0;
      estimatedStorage += (len * 0.008); // approx 8KB per record with details
      initialReads += Math.min(len, 1200);
    }
    const rawPending = localStorage.getItem("sstr_representative_pending_requests");
    if (rawPending) {
      const pendLen = JSON.parse(rawPending).length || 0;
      estimatedStorage += (pendLen * 0.015); // images in IDB keep doc light
      initialWrites += pendLen * 2;
    }
  } catch (e) {
    // fallback defaults
  }

  const defaultStats: TelemetryStats = {
    dateKey: todayKey,
    reads: Math.round(initialReads),
    writes: Math.round(initialWrites),
    deletes: 5,
    estimatedStorageMB: Number(estimatedStorage.toFixed(2)),
    lastUpdated: new Date().toLocaleTimeString("pt-BR")
  };

  saveTelemetryStats(defaultStats);
  return defaultStats;
}

export function saveTelemetryStats(stats: TelemetryStats) {
  try {
    localStorage.setItem(`sstr_db_telemetry_${stats.dateKey}`, JSON.stringify(stats));
    window.dispatchEvent(new CustomEvent("sstr_telemetry_updated", { detail: stats }));
  } catch (e) {
    // safe fallback
  }
}

export function setCalibratedReadsAndWrites(reads: number, writes?: number) {
  const stats = getTelemetryStats();
  if (typeof reads === "number" && !isNaN(reads) && reads >= 0) {
    stats.reads = Math.round(reads);
  }
  if (typeof writes === "number" && !isNaN(writes) && writes >= 0) {
    stats.writes = Math.round(writes);
  }
  stats.lastUpdated = `${new Date().toLocaleTimeString("pt-BR")} (Calibrado via Firebase Console)`;
  saveTelemetryStats(stats);
}

export function recordReads(count: number) {
  if (count <= 0) return;
  const stats = getTelemetryStats();
  stats.reads += count;
  stats.lastUpdated = new Date().toLocaleTimeString("pt-BR");
  saveTelemetryStats(stats);
}

export function recordWrites(count: number) {
  if (count <= 0) return;
  const stats = getTelemetryStats();
  stats.writes += count;
  stats.lastUpdated = new Date().toLocaleTimeString("pt-BR");
  saveTelemetryStats(stats);
}

export function recordDeletes(count: number) {
  if (count <= 0) return;
  const stats = getTelemetryStats();
  stats.deletes += count;
  stats.lastUpdated = new Date().toLocaleTimeString("pt-BR");
  saveTelemetryStats(stats);
}

export interface SimulationResult {
  collaborators: number;
  actionsPerUser: number;
  mode: "eco" | "realtime" | "balanced";
  projectedDailyReads: number;
  projectedDailyWrites: number;
  remainingDailyReads: number;
  remainingDailyWrites: number;
  maxActionsRemainingForReads: number;
  maxActionsRemainingForWrites: number;
  readQuotaUsedPercent: number;
  writeQuotaUsedPercent: number;
  status: "SEGURO" | "ATENCAO" | "CRITICO";
  statusColor: string;
  statusMessage: string;
}

export function calculateProjection(
  collaborators: number = 30,
  actionsPerUser: number = 15,
  mode: "eco" | "realtime" | "balanced" = "balanced",
  currentReads: number = 0,
  currentWrites: number = 0
): SimulationResult {
  // Mode multipliers for reads & writes per user action
  // Eco Mode: IndexedDB cache + delta sync (1 read per session + 1 write per creation)
  // Balanced Mode: Real-time listener on pending requests + offline cache for products (approx 5 reads per action + 1.2 writes)
  // Realtime Mode: Full real-time listener on all collections (approx 15 reads per action + 1.5 writes)

  let readsPerAction = 5;
  let writesPerAction = 1.2;
  let fixedBaseReadsPerUserSession = 40;

  if (mode === "eco") {
    readsPerAction = 1.5;
    writesPerAction = 1.0;
    fixedBaseReadsPerUserSession = 10;
  } else if (mode === "realtime") {
    readsPerAction = 18;
    writesPerAction = 2.0;
    fixedBaseReadsPerUserSession = 120;
  }

  const totalUserActions = collaborators * actionsPerUser;
  
  const projectedDailyReads = Math.round(
    currentReads + (collaborators * fixedBaseReadsPerUserSession) + (totalUserActions * readsPerAction)
  );
  
  const projectedDailyWrites = Math.round(
    currentWrites + (totalUserActions * writesPerAction)
  );

  const remainingDailyReads = Math.max(0, QUOTA_LIMITS.DAILY_READS - projectedDailyReads);
  const remainingDailyWrites = Math.max(0, QUOTA_LIMITS.DAILY_WRITES - projectedDailyWrites);

  // How many individual user actions can be performed before hitting write or read limit
  const maxActionsForWrites = Math.floor(remainingDailyWrites / writesPerAction);
  const maxActionsForReads = Math.floor(remainingDailyReads / readsPerAction);

  const readQuotaUsedPercent = Math.min(100, Number(((projectedDailyReads / QUOTA_LIMITS.DAILY_READS) * 100).toFixed(1)));
  const writeQuotaUsedPercent = Math.min(100, Number(((projectedDailyWrites / QUOTA_LIMITS.DAILY_WRITES) * 100).toFixed(1)));

  const maxUsagePercent = Math.max(readQuotaUsedPercent, writeQuotaUsedPercent);

  let status: "SEGURO" | "ATENCAO" | "CRITICO" = "SEGURO";
  let statusColor = "emerald";
  let statusMessage = "Plano de Uso Otimizado! Sua operação está rodando 100% dentro da cota gratuita sem risco de estouro ou quedas.";

  if (maxUsagePercent >= 90) {
    status = "CRITICO";
    statusColor = "red";
    statusMessage = "ALERTA CRÍTICO: Projeção ultrapassa 90% da cota diária do Firebase! Ative o Modo Eco-Sync imediatamente.";
  } else if (maxUsagePercent >= 70) {
    status = "ATENCAO";
    statusColor = "amber";
    statusMessage = "Atenção Preventiva: Projeção de uso moderado. A arquitetura de cache local garante continuidade de serviço.";
  }

  return {
    collaborators,
    actionsPerUser,
    mode,
    projectedDailyReads,
    projectedDailyWrites,
    remainingDailyReads,
    remainingDailyWrites,
    maxActionsRemainingForReads: maxActionsForReads,
    maxActionsRemainingForWrites: maxActionsForWrites,
    readQuotaUsedPercent,
    writeQuotaUsedPercent,
    status,
    statusColor,
    statusMessage
  };
}
