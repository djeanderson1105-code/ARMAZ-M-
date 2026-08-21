/**
 * SSTR Multi-Device API Synchronization Utility with Firebase Firestore
 * Keeps all devices synchronized in sub-second real-time with document-per-record collections.
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  enableIndexedDbPersistence,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  collection,
  addDoc,
  query,
  limit,
  writeBatch
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { extractImagesToIDB, restoreImagesFromCache, initLargeKVCacheFromIDB, saveLargeKVToIDB, deleteLargeKVFromIDB } from "./indexedDbCache";
import { parseCSVToRecords } from "./csvParser";
import { RAW_SAMPLE_DATA } from "../sampleData";
import { 
  HISTORICAL_RECORDS_JAN_JUL_2026, 
  filterDynamicRecentRecords, 
  combineBaselineWithDynamic, 
  isRecordInHistoricalPeriod 
} from "../data/historicalRecordsJul2026";
import { getProductsDatabase } from "../data/products";
import { DEFAULT_LISTA_CREW, DEFAULT_REPRESENTATIVOS_SETOR, DEFAULT_MOTORISTAS_ROTAS } from "../types";
import { getAuth } from "firebase/auth";
import { recordReads, recordWrites, recordDeletes } from "./dbQuotaTelemetry";

let lastSyncIssueNotificationTime = 0;

export interface SyncIssueDetail {
  message: string;
  code?: string;
  error?: string;
  timestamp: number;
}

export function notifySyncIssue(message: string, err?: any, force: boolean = false) {
  const now = Date.now();
  const errorCode = err?.code || (err?.message && (err.message.includes("resource-exhausted") || err.message.includes("quota")) ? "resource-exhausted" : "unknown");
  
  const issueData: SyncIssueDetail = {
    message,
    code: errorCode,
    error: err?.message || String(err || ""),
    timestamp: now
  };

  try {
    safeSetItem("sstr_last_sync_issue", JSON.stringify(issueData));
  } catch (e) {}

  if (force || now - lastSyncIssueNotificationTime >= 20000) {
    lastSyncIssueNotificationTime = now;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sstr_sync_issue", { detail: issueData }));
    }
  }
}

export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (data instanceof Date) {
    return data as any;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as any;
  }
  const cleanObj: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      cleanObj[key] = sanitizeForFirestore(val);
    }
  }
  return cleanObj as any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const auth = getAuth(firebaseApp);
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId || (firebaseConfig as any).databaseId;

// Initialize Firestore with modern local cache persistence, with a fallback to memory-only standard instance if blocked by the browser (Incognito/Private browsing/Iframe sandbox constraints)
let firestoreDbInstance: any;
try {
  firestoreDbInstance = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, dbId && dbId !== "(default)" ? dbId : undefined);
  console.log("[FIREBASE-INIT] Firestore initialized with persistent multiple-tab local cache.");
} catch (cacheErr) {
  console.warn("[FIREBASE-INIT] Failed to initialize Firestore with persistent local cache (e.g. Incognito / Private window or sandboxed iframe restriction). Falling back to memory-only standard Firestore...", cacheErr);
  try {
    firestoreDbInstance = getFirestore(firebaseApp, dbId && dbId !== "(default)" ? dbId : undefined);
  } catch (fallbackErr) {
    console.error("[FIREBASE-INIT] Critical: Could not initialize standard fallback. Retrying getFirestore default...", fallbackErr);
    try {
      firestoreDbInstance = getFirestore(firebaseApp);
    } catch (finalErr) {
      console.error("[FIREBASE-INIT] Ultimate: Failed all Firestore initializations", finalErr);
    }
  }
}

export const firestoreDb = firestoreDbInstance;

const originalSetItem = localStorage.setItem;
const originalGetItem = localStorage.getItem;
const originalRemoveItem = localStorage.removeItem;

// In-RAM fallback cache for extremely restrictive environments (Safari Private browsing, restricted iframe sandbox)
const memoryStorage = new Map<string, string>();

export function setMemoryStorageItem(key: string, value: string) {
  memoryStorage.set(key, value);
}

export function deleteMemoryStorageItem(key: string) {
  memoryStorage.delete(key);
}

export async function initAppStorageFromIDB(): Promise<void> {
  await initLargeKVCacheFromIDB((key, val) => {
    memoryStorage.set(key, val);
  });
}

export function safeGetItem(key: string): string | null {
  if (memoryStorage.has(key)) {
    return memoryStorage.get(key) || null;
  }
  try {
    const val = originalGetItem.call(localStorage, key);
    if (val !== null && val !== undefined) return val;
  } catch (e) {
    // Ignore native localStorage error
  }
  return memoryStorage.get(key) || null;
}

export function safeSetItem(key: string, value: string) {
  memoryStorage.set(key, value);
  try {
    let processedValue = value;
    if (
      key === "sstr_representative_pending_requests" ||
      key === "sstr_vales_historico_reg"
    ) {
      processedValue = extractImagesToIDB(value);
    }
    originalSetItem.call(localStorage, key, processedValue);
  } catch (e: any) {
    console.warn(`[STORAGE-WARN] Key "${key}" exceeded localStorage limits (~5MB). Persisting to IndexedDB (unlimited storage):`, e);
    saveLargeKVToIDB(key, value).catch(idbErr => console.error("[IDB-ERR] Save failed:", idbErr));

    if (!isSyncingFromFirestore && (key === "sstr_cached_records_v1" || key === "sstr_cached_batches_v1")) {
      try {
        const parsedValue = JSON.parse(value);
        addToOfflineQueue(key, parsedValue);
      } catch (parseErr) {
        addToOfflineQueue(key, value);
      }
    }
  }
}

export function hasPendingOfflineWrite(key: string): boolean {
  try {
    const queueStr = safeGetItem("sstr_offline_pending_sync_queue");
    if (!queueStr) return false;
    const queue: QueueItem[] = JSON.parse(queueStr);
    return Array.isArray(queue) && queue.some(q => q.key === key);
  } catch (err) {
    return false;
  }
}

export function safeRemoveItem(key: string) {
  memoryStorage.delete(key);
  try {
    originalRemoveItem.call(localStorage, key);
  } catch (e) {
    // Ignore
  }
  deleteLargeKVFromIDB(key).catch(err => console.error("[IDB-ERR] Delete failed:", err));
}

// OFFLINE QUEUE MANAGER & WRITE STREAM BACKPRESSURE THROTTLE
interface QueueItem {
  key: string;
  value: any;
  timestamp: number;
}

let writeQueueChain: Promise<any> = Promise.resolve();
let cooldownUntil = 0;
let isFlushingOfflineQueue = false;

export function isFirestoreInCooldown(): boolean {
  return Date.now() < cooldownUntil;
}

/**
 * Sequential Mutex for all Firestore write operations.
 * Ensures only ONE batch/write is dispatched to Firestore at any time,
 * preventing "Write stream exhausted maximum allowed queued writes" (resource-exhausted).
 */
export function enqueueFirestoreWrite<T>(task: () => Promise<T>): Promise<T | undefined> {
  if (Date.now() < cooldownUntil) {
    console.warn("[SYNC-THROTTLE] Write deferred/skipped due to active Firestore write stream cooldown.");
    return Promise.resolve(undefined);
  }

  const runTask = async (): Promise<T | undefined> => {
    if (Date.now() < cooldownUntil) {
      return undefined;
    }
    try {
      const result = await task();
      // Gentle pacing (60ms) to allow Firestore gRPC/WebSocket stream to clear buffer
      await new Promise(res => setTimeout(res, 60));
      return result;
    } catch (err: any) {
      const errMsg = err?.message || String(err || "");
      if (
        errMsg.includes("resource-exhausted") || 
        errMsg.includes("maximum allowed queued writes") || 
        errMsg.includes("maximum backoff delay") || 
        err?.code === "resource-exhausted"
      ) {
        console.warn("[SYNC-BACKOFF] Resource-exhausted / Write stream saturated detected. Setting 60s cooldown to allow Firestore stream recovery...", err);
        cooldownUntil = Date.now() + 60000;
        notifySyncIssue("Tráfego do banco de dados temporariamente saturado. O sistema pausou sincronizações de segundo plano por 60s para auto-recuperação sem perda de dados.", err, true);
      }
      throw err;
    }
  };

  const resultPromise = writeQueueChain.then(runTask, runTask);
  writeQueueChain = resultPromise.catch(() => {});
  return resultPromise;
}

export function addToOfflineQueue(key: string, value: any) {
  try {
    const queueStr = safeGetItem("sstr_offline_pending_sync_queue") || "[]";
    const queue: QueueItem[] = JSON.parse(queueStr);
    const existingIdx = queue.findIndex(q => q.key === key);
    if (existingIdx >= 0) {
      queue[existingIdx] = { key, value, timestamp: Date.now() };
    } else {
      queue.push({ key, value, timestamp: Date.now() });
    }
    safeSetItem("sstr_offline_pending_sync_queue", JSON.stringify(queue));
    console.log(`[OFFLINE-QUEUE] Item "${key}" stored in offline queue for future database sync.`);
  } catch (err) {
    console.warn("[OFFLINE-QUEUE-WARN] Failed to add to offline queue:", err);
  }
}

export function removeFromOfflineQueue(key: string) {
  try {
    const queueStr = safeGetItem("sstr_offline_pending_sync_queue");
    if (!queueStr) return;
    const queue: QueueItem[] = JSON.parse(queueStr);
    const filtered = queue.filter(q => q.key !== key);
    safeSetItem("sstr_offline_pending_sync_queue", JSON.stringify(filtered));
  } catch (err) {}
}

export async function flushOfflineSyncQueue() {
  if (isFlushingOfflineQueue || isFirestoreInCooldown()) return;
  const queueStr = safeGetItem("sstr_offline_pending_sync_queue");
  if (!queueStr) return;

  try {
    const queue: QueueItem[] = JSON.parse(queueStr);
    if (!Array.isArray(queue) || queue.length === 0) return;

    isFlushingOfflineQueue = true;
    console.log(`[OFFLINE-SYNC-FLUSH] Network connection active! Flushing ${queue.length} queued offline datasets to Firestore database...`);
    
    for (const item of [...queue]) {
      if (isFirestoreInCooldown()) break;
      const mapping = COLLECTION_MAP[item.key];
      if (!mapping) continue;

      if (item.key === "sstr_cached_records_v1") {
        await syncExchangeRecordsConsolidated(item.value);
      } else if (mapping.isObject) {
        const currentLocal = safeGetItem(item.key);
        const currentParsed = currentLocal ? JSON.parse(currentLocal) : {};
        await syncObjectToFirestore(mapping.name, {}, currentParsed);
      } else {
        const currentLocal = safeGetItem(item.key);
        const currentParsed = currentLocal ? JSON.parse(currentLocal) : [];
        await syncArrayToFirestore(mapping.name, [], currentParsed);
      }
      removeFromOfflineQueue(item.key);
      await new Promise(r => setTimeout(r, 100));
    }
    console.log("[OFFLINE-SYNC-FLUSH] Offline data queue processed.");
  } catch (err) {
    console.warn("[OFFLINE-SYNC-FLUSH-WARN] Error flushing offline queue:", err);
  } finally {
    isFlushingOfflineQueue = false;
  }
}

export async function performPeriodicLocalStorageBackup() {
  if (isFirestoreInCooldown()) return;
  try {
    const backupSummary: Record<string, number> = {};
    for (const [localKey, mapping] of Object.entries(COLLECTION_MAP)) {
      const localStr = safeGetItem(localKey);
      if (!localStr) continue;
      try {
        const parsed = JSON.parse(localStr);
        if (Array.isArray(parsed)) {
          backupSummary[mapping.name] = parsed.length;
        } else if (typeof parsed === "object" && parsed !== null) {
          backupSummary[mapping.name] = Object.keys(parsed).length;
        }
      } catch (e) {}
    }

    // Flush any pending offline queue items
    await flushOfflineSyncQueue();

    // Store periodic snapshot in Firestore for total redundancy against field device data loss
    await enqueueFirestoreWrite(async () => {
      const backupDocRef = doc(firestoreDb, "localStorage_backups", "latest_field_backup");
      await setDoc(backupDocRef, sanitizeForFirestore({
        timestamp: Date.now(),
        dateStr: new Date().toISOString(),
        summary: backupSummary,
        deviceAgent: typeof navigator !== "undefined" ? navigator.userAgent : "field-device"
      }), { merge: true });
    });

    console.log("[PERIODIC-BACKUP] Redundancy backup from localStorage to Firestore completed:", backupSummary);
  } catch (err) {
    console.warn("[PERIODIC-BACKUP-WARN] Periodic backup error:", err);
  }
}

// Attach automatic online event listener & gentle background maintenance
if (typeof window !== "undefined") {
  let onlineDebounce: any = null;
  window.addEventListener("online", () => {
    console.log("[NETWORK-ONLINE] Device back online. Scheduling offline sync flush...");
    if (onlineDebounce) clearTimeout(onlineDebounce);
    onlineDebounce = setTimeout(() => {
      flushOfflineSyncQueue();
    }, 2000);
  });

  // Low-frequency maintenance: every 5 minutes (instead of aggressive 30s)
  setInterval(() => {
    if (!isFirestoreInCooldown()) {
      flushOfflineSyncQueue();
    }
  }, 5 * 60 * 1000);
}

// Mapping of LocalStorage keys to Firestore Collections
export const COLLECTION_MAP: Record<string, { name: string; isObject: boolean }> = {
  "sstr_cached_records_v1": { name: "exchangeRecords", isObject: false },
  "sstr_cached_batches_v1": { name: "batches", isObject: false },
  "sstr_representative_pending_requests": { name: "pendingRequests", isObject: false },
  "sstr_registered_managers": { name: "managers", isObject: false },
  "sstr_vales_historico_reg": { name: "vales", isObject: false },
  "sstr_lista_crew": { name: "crewList", isObject: false },
  "sstr_reps_setor": { name: "repsSetor", isObject: true },
  "sstr_motoristas_rotas": { name: "motoristasRotas", isObject: true },
  "sstr_custom_pdvs_v1": { name: "customPdvs", isObject: false },
  "sstr_products_database": { name: "products", isObject: false }
};

// Flag to prevent sync loops
let isSyncingFromFirestore = false;

function getItemId(item: any): string {
  if (!item) return "";
  const rawId = item.id || item.codigo || item.cpf || item.nome || item.username;
  if (!rawId) return "";
  return String(rawId).replace(/[\/\s#\?]/g, "_");
}

export async function syncArrayToFirestore(collectionName: string, oldList: any[], newList: any[]) {
  if (isFirestoreInCooldown()) return;
  const oldMap = new Map<string, any>();
  const newMap = new Map<string, any>();

  (oldList || []).forEach(item => {
    const id = getItemId(item);
    if (id) oldMap.set(id, item);
  });

  (newList || []).forEach(item => {
    const id = getItemId(item);
    if (id) newMap.set(id, item);
  });

  const toSet: [string, any][] = [];
  const toDelete: string[] = [];

  // Added or modified
  for (const [id, item] of newMap.entries()) {
    const oldItem = oldMap.get(id);
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      toSet.push([id, item]);
    }
  }

  // Deleted
  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) {
      toDelete.push(id);
    }
  }

  const totalOps = toSet.length + toDelete.length;
  if (totalOps === 0) return;

  // Safe chunk size (100) to keep Firestore client write buffer low
  const chunkSize = 100;
  const allOps: { type: "set" | "delete"; id: string; data?: any }[] = [
    ...toSet.map(([id, data]) => ({ type: "set" as const, id, data })),
    ...toDelete.map(id => ({ type: "delete" as const, id }))
  ];

  await enqueueFirestoreWrite(async () => {
    try {
      for (let i = 0; i < allOps.length; i += chunkSize) {
        if (isFirestoreInCooldown()) break;
        const chunk = allOps.slice(i, i + chunkSize);
        const batch = writeBatch(firestoreDb);
        for (const op of chunk) {
          const docRef = doc(firestoreDb, collectionName, op.id);
          if (op.type === "set") {
            batch.set(docRef, sanitizeForFirestore(op.data));
          } else {
            batch.delete(docRef);
          }
        }
        await batch.commit();
        recordWrites(chunk.length);
        console.log(`[SYNC-WRITE] Committed batch of ${chunk.length} changes to Firestore collection "${collectionName}".`);
        await new Promise(r => setTimeout(r, 80));
      }
      const key = Object.keys(COLLECTION_MAP).find(k => COLLECTION_MAP[k]?.name === collectionName);
      if (key) removeFromOfflineQueue(key);
    } catch (err: any) {
      console.warn(`[SYNC-WRITE-OFFLINE] Firestore write error for ${collectionName}. Storing in offline queue for auto-retry when online.`, err);
      notifySyncIssue(`Erro ao gravar alterações na coleção "${collectionName}": ${err?.message || err}`, err);
      const key = Object.keys(COLLECTION_MAP).find(k => COLLECTION_MAP[k]?.name === collectionName);
      if (key) addToOfflineQueue(key, newList);
      throw err;
    }
  });
}

export async function syncObjectToFirestore(collectionName: string, oldObj: Record<string, any>, newObj: Record<string, any>) {
  if (isFirestoreInCooldown()) return;
  const toSet: [string, any][] = [];
  const toDelete: string[] = [];

  // Added or modified keys
  for (const [key, val] of Object.entries(newObj || {})) {
    const oldVal = oldObj ? oldObj[key] : undefined;
    if (!oldVal || JSON.stringify(oldVal) !== JSON.stringify(val)) {
      toSet.push([key, val]);
    }
  }

  // Deleted keys
  if (oldObj) {
    for (const key of Object.keys(oldObj)) {
      if (!(key in (newObj || {}))) {
        toDelete.push(key);
      }
    }
  }

  const totalOps = toSet.length + toDelete.length;
  if (totalOps === 0) return;

  const chunkSize = 100;
  const allOps: { type: "set" | "delete"; id: string; data?: any }[] = [
    ...toSet.map(([id, data]) => ({ type: "set" as const, id, data })),
    ...toDelete.map(id => ({ type: "delete" as const, id }))
  ];

  await enqueueFirestoreWrite(async () => {
    try {
      for (let i = 0; i < allOps.length; i += chunkSize) {
        if (isFirestoreInCooldown()) break;
        const chunk = allOps.slice(i, i + chunkSize);
        const batch = writeBatch(firestoreDb);
        for (const op of chunk) {
          const docRef = doc(firestoreDb, collectionName, op.id);
          if (op.type === "set") {
            batch.set(docRef, sanitizeForFirestore(op.data));
          } else {
            batch.delete(docRef);
          }
        }
        await batch.commit();
        recordWrites(chunk.length);
        console.log(`[SYNC-WRITE] Committed object batch of ${chunk.length} key changes to Firestore collection "${collectionName}".`);
        await new Promise(r => setTimeout(r, 80));
      }
      const key = Object.keys(COLLECTION_MAP).find(k => COLLECTION_MAP[k]?.name === collectionName);
      if (key) removeFromOfflineQueue(key);
    } catch (err: any) {
      console.warn(`[SYNC-WRITE-OFFLINE] Firestore object write error for ${collectionName}. Storing in offline queue for auto-retry when online.`, err);
      notifySyncIssue(`Erro ao sincronizar objeto "${collectionName}": ${err?.message || err}`, err);
      const key = Object.keys(COLLECTION_MAP).find(k => COLLECTION_MAP[k]?.name === collectionName);
      if (key) addToOfflineQueue(key, newObj);
      throw err;
    }
  });
}


let isWritingExchangeRecords = false;
let lastLocalWriteTimestamp = 0;

export async function syncExchangeRecordsConsolidated(newList: any[]) {
  if (isFirestoreInCooldown()) return;
  isWritingExchangeRecords = true;
  lastLocalWriteTimestamp = Date.now();
  
  await enqueueFirestoreWrite(async () => {
    try {
      // ⚡ COST & PERFORMANCE OPTIMIZATION:
      // Historical 03.18.05 records up to July 31, 2026 (Jan-Jul) are permanently frozen into the platform codebase.
      // We only write and synchronize dynamic / recent records (August 2026 onwards or new delta imports) to Firestore.
      const dynamicList = filterDynamicRecentRecords(newList);
      const chunkSize = 150;
      const chunks: any[][] = [];
      for (let i = 0; i < dynamicList.length; i += chunkSize) {
        chunks.push(dynamicList.slice(i, i + chunkSize));
      }

      const operations: { ref: any; data?: any; isDelete: boolean }[] = [];
      
      // Metadata doc
      const metaRef = doc(firestoreDb, "exchangeRecords_chunks", "metadata");
      operations.push({
        ref: metaRef,
        data: { 
          totalChunks: chunks.length, 
          dynamicRecordsCount: dynamicList.length,
          hasHistoricalBaselineInCode: true,
          timestamp: Date.now() 
        },
        isDelete: false
      });

      // Chunk docs
      for (let i = 0; i < chunks.length; i++) {
        const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
        operations.push({
          ref: chunkRef,
          data: sanitizeForFirestore({ data: chunks[i] }),
          isDelete: false
        });
      }

      // Clean up obsolete chunks safely based on remote metadata (or local fallback if offline)
      let remotePrevTotalChunks = 0;
      try {
        const metaSnap = await getDoc(metaRef);
        if (metaSnap.exists()) {
          recordReads(1);
          const metaData = metaSnap.data();
          remotePrevTotalChunks = metaData?.totalChunks || 0;
        }
      } catch (e) {
        console.warn("[SYNC-CONSOLIDATED] Could not read remote metadata for chunk cleanup, falling back to local count:", e);
      }

      const localPrevChunksStr = safeGetItem("sstr_prev_total_chunks") || "0";
      const localPrevChunks = parseInt(localPrevChunksStr, 10) || 0;
      const prevTotalChunks = Math.max(remotePrevTotalChunks, localPrevChunks);

      // Only delete chunks that previously existed beyond current chunks count
      if (prevTotalChunks > chunks.length) {
        for (let i = chunks.length; i < prevTotalChunks; i++) {
          const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
          operations.push({
            ref: chunkRef,
            isDelete: true
          });
        }
      }
      safeSetItem("sstr_prev_total_chunks", String(chunks.length));

      // Chunk operations into safe batches of max 100 ops to respect Firestore limits
      const maxOpsPerBatch = 100;
      for (let b = 0; b < operations.length; b += maxOpsPerBatch) {
        if (isFirestoreInCooldown()) break;
        const batchOps = operations.slice(b, b + maxOpsPerBatch);
        const batch = writeBatch(firestoreDb);
        for (const op of batchOps) {
          if (op.isDelete) {
            batch.delete(op.ref);
          } else {
            batch.set(op.ref, op.data);
          }
        }
        await batch.commit();
        recordWrites(batchOps.length);
        await new Promise(r => setTimeout(r, 80));
      }

      console.log(`[SYNC-CONSOLIDATED] Optimizado: Gravados ${dynamicList.length} registros dinâmicos (Agosto em diante) em ${chunks.length} chunks no Firestore. (${HISTORICAL_RECORDS_JAN_JUL_2026.length} registros Jan-Jul preservados no código estático).`);
      removeFromOfflineQueue("sstr_cached_records_v1");
    } catch (err: any) {
      console.warn("[SYNC-CONSOLIDATED-OFFLINE] Firestore chunk write error. Storing in local storage offline queue for auto-sync when online.", err);
      notifySyncIssue(`Erro ao gravar relatório base de trocas no Firestore: ${err?.message || err}`, err);
      addToOfflineQueue("sstr_cached_records_v1", newList);
      throw err;
    } finally {
      // Hold write flag for 10 seconds so incoming snapshots don't overwrite fresh local changes
      setTimeout(() => {
        isWritingExchangeRecords = false;
      }, 10000);
    }
  });
}

function subscribeExchangeRecordsChunks(localKey: string): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    let unsubscribe: (() => void) | null = null;
    let retryDelay = 3000;
    let retryTimer: any = null;

    function attach() {
      if (unsubscribe) {
        try { unsubscribe(); } catch (e) {}
        unsubscribe = null;
      }

      unsubscribe = onSnapshot(collection(firestoreDb, "exchangeRecords_chunks"), (snapshot) => {
        retryDelay = 3000; // Reset backoff on successful snapshot arrival
        recordReads(snapshot.docs.length);

        if (isWritingExchangeRecords) {
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        if (snapshot.metadata.hasPendingWrites) {
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        const docsMap = new Map<string, any>();
        snapshot.docs.forEach(doc => {
          docsMap.set(doc.id, doc.data());
        });
        
        const metadata = docsMap.get("metadata");
        if (!metadata) {
          // If no remote chunks exist yet, ensure local has the in-code historical baseline
          const localStr = safeGetItem(localKey);
          if (!localStr || localStr === "[]") {
            safeSetItem(localKey, JSON.stringify(HISTORICAL_RECORDS_JAN_JUL_2026));
            window.dispatchEvent(new Event("storage"));
          }
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        // If metadata timestamp is older than or equal to local write, ignore this snapshot
        if (metadata.timestamp && metadata.timestamp <= lastLocalWriteTimestamp) {
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }
        
        const totalChunks = metadata.totalChunks || 0;
        let allChunksPresent = true;
        const dynamicListFromRemote: any[] = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkDoc = docsMap.get(`chunk_${i}`);
          if (chunkDoc && Array.isArray(chunkDoc.data)) {
            dynamicListFromRemote.push(...chunkDoc.data);
          } else {
            allChunksPresent = false;
            break;
          }
        }

        if (!allChunksPresent && totalChunks > 0) {
          // Incomplete chunks in current snapshot, ignore until all chunks arrive
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        // ⚡ COMBINE IN-CODE HISTORICAL BASELINE (Jan-Jul) WITH REMOTE DYNAMIC RECORDS (Aug onwards)
        const unifiedRecords = combineBaselineWithDynamic(dynamicListFromRemote);

        const localStr = safeGetItem(localKey) || "[]";
        let localRecords: any[] = [];
        try {
          localRecords = JSON.parse(localStr);
        } catch (e) {}

        // SAFETY SHIELD 1: If there is an unconfirmed local write pending in queue, preserve local state without initiating recursive write
        const isPendingOffline = hasPendingOfflineWrite(localKey);
        if (isPendingOffline) {
          console.log(`[SYNC-SHIELD] Unconfirmed local write pending in queue for "${localKey}". Preserving local cache.`);
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        const remoteStr = JSON.stringify(unifiedRecords);
        
        if (localStr !== remoteStr) {
          isSyncingFromFirestore = true;
          safeSetItem(localKey, remoteStr);
          isSyncingFromFirestore = false;
          
          window.dispatchEvent(new Event("storage"));
        }
        
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, (err) => {
        console.warn("[SYNC-CONSOLIDATED] Error subscribing to exchangeRecords_chunks:", err?.message || err);
        notifySyncIssue(`Falha na conexão de tempo real com a base de trocas (03.18.05): ${err?.message || err}`, err);
        
        if (!resolved) {
          resolved = true;
          resolve();
        }

        // Schedule automatic re-attach with exponential backoff
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          console.log(`[SYNC-CONSOLIDATED-RETRY] Attempting listener reconnect to exchangeRecords_chunks (delay ${retryDelay}ms)...`);
          attach();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      });
    }

    attach();
  });
}

// Monkey-patching localStorage.setItem to strip heavy base64 images and sync immediately to Firestore
localStorage.setItem = function(key: string, value: string) {
  try {
    const mapping = COLLECTION_MAP[key];
    if (!mapping) {
      safeSetItem(key, value);
      return;
    }

    let processedValue = value;
    if (
      key === "sstr_representative_pending_requests" ||
      key === "sstr_vales_historico_reg"
    ) {
      processedValue = extractImagesToIDB(value);
    }

    const oldValue = safeGetItem(key);
    safeSetItem(key, processedValue);
    
    if (mapping && !isSyncingFromFirestore && oldValue !== processedValue) {
      // Notify other tabs locally
      window.dispatchEvent(new Event("storage"));
      
      // Save to Firestore individually in background
      try {
        const oldParsed = oldValue ? JSON.parse(restoreImagesFromCache(oldValue)) : (mapping.isObject ? {} : []);
        const newParsed = JSON.parse(value);

        if (mapping.isObject) {
          syncObjectToFirestore(mapping.name, oldParsed, newParsed);
        } else {
          if (key === "sstr_cached_records_v1") {
            syncExchangeRecordsConsolidated(newParsed);
          } else {
            syncArrayToFirestore(mapping.name, oldParsed, newParsed);
          }
        }

        // Log operations by comparing with existing local storage
        if (Array.isArray(oldParsed) && Array.isArray(newParsed)) {
          logChange(key, oldParsed, newParsed);
        }
      } catch (err) {
        console.error(`Error parsing or sync-writing key ${key}:`, err);
      }
    }
  } catch (err) {
    console.warn(`[STORAGE-WARN] Error in patched localStorage.setItem for ${key}:`, err);
  }
};

// Monkey-patching localStorage.getItem to transparently restore images from synchronous cache
localStorage.getItem = function(key: string): string | null {
  try {
    const rawValue = safeGetItem(key);
    if (!rawValue) return rawValue;

    if (
      key === "sstr_representative_pending_requests" ||
      key === "sstr_vales_historico_reg"
    ) {
      return restoreImagesFromCache(rawValue);
    }

    return rawValue;
  } catch (err) {
    console.warn(`[STORAGE-WARN] Error in patched localStorage.getItem for ${key}:`, err);
    return null;
  }
};

// Helper to determine active operator
function getActiveUser(): string {
  const manager = sessionStorage.getItem("sstr_current_manager_name");
  if (manager) return `Gestor: ${manager}`;
  return "Colaborador";
}

// Advanced operation diff tracker and logger
async function logChange(key: string, oldList: any[], newList: any[]) {
  if (isFirestoreInCooldown()) return;
  try {
    const operator = getActiveUser();
    const logsCol = collection(firestoreDb, "sstr_logs");
    
    // Map lists to identify items by unique key
    const oldMap = new Map(oldList.map(item => [getItemId(item), item]));
    const newMap = new Map(newList.map(item => [getItemId(item), item]));
    
    const added: any[] = [];
    const modified: any[] = [];
    const deleted: any[] = [];
    
    for (const [id, item] of newMap.entries()) {
      if (!id) continue;
      if (!oldMap.has(id)) {
        added.push(item);
      } else {
        const oldItem = oldMap.get(id);
        if (JSON.stringify(oldItem) !== JSON.stringify(item)) {
          modified.push({ old: oldItem, new: item });
        }
      }
    }
    
    for (const [id, item] of oldMap.entries()) {
      if (id && !newMap.has(id)) {
        deleted.push(item);
      }
    }
    
    const totalChanges = added.length + modified.length + deleted.length;
    if (totalChanges === 0) return;

    await enqueueFirestoreWrite(async () => {
      try {
        const action = added.length > 0 && modified.length === 0 && deleted.length === 0 ? "CRIACAO" :
                       deleted.length > 0 && added.length === 0 && modified.length === 0 ? "EXCLUSAO" : "EDICAO";
        const details = `Operação em lote: ${added.length} criados, ${modified.length} alterados, ${deleted.length} excluídos na tabela "${COLLECTION_MAP[key]?.name || key}".`;
        
        await addDoc(logsCol, sanitizeForFirestore({
          usuario: operator,
          action,
          tabela: COLLECTION_MAP[key]?.name || key,
          dataHora: new Date().toLocaleString("pt-BR"),
          timestamp: Date.now(),
          detalhes: details,
          summary: { added: added.length, modified: modified.length, deleted: deleted.length }
        }));
      } catch (err) {
        // Non-critical audit log failure
      }
    });
  } catch (err) {
    console.error("Error writing audit logs to Firestore:", err);
  }
}

function subscribeCollection(collectionName: string, localKey: string, isObject: boolean = false): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    let unsubscribe: (() => void) | null = null;
    let retryDelay = 3000;
    let retryTimer: any = null;

    function attach() {
      if (unsubscribe) {
        try { unsubscribe(); } catch (e) {}
        unsubscribe = null;
      }

      unsubscribe = onSnapshot(collection(firestoreDb, collectionName), (snapshot) => {
        retryDelay = 3000; // Reset backoff on successful snapshot arrival
        recordReads(snapshot.docs.length);

        let remoteVal: any;
        if (isObject) {
          const obj: Record<string, any> = {};
          snapshot.docs.forEach(doc => {
            obj[doc.id] = doc.data();
          });
          remoteVal = obj;
        } else {
          remoteVal = snapshot.docs.map(doc => doc.data());
        }

        let remoteStr = JSON.stringify(remoteVal || (isObject ? {} : []));
        if (localKey === "sstr_representative_pending_requests" || localKey === "sstr_vales_historico_reg") {
          remoteStr = extractImagesToIDB(remoteStr);
        }

        const localStr = safeGetItem(localKey);

        if (hasPendingOfflineWrite(localKey)) {
          console.warn(`[SYNC-SHIELD] Unconfirmed local write pending in queue for "${localKey}". Preserving local state.`);
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }
        if (localKey === "sstr_products_database" && Array.isArray(remoteVal)) {
          try {
            const localArr = localStr ? JSON.parse(localStr) : [];
            if (Array.isArray(localArr) && localArr.length > remoteVal.length) {
              // Merge local products into remoteVal to prevent wiping user uploaded catalog
              const prodMap = new Map<string, any>();
              remoteVal.forEach(p => p.codigo && prodMap.set(p.codigo.trim(), p));
              localArr.forEach(p => p.codigo && !prodMap.has(p.codigo.trim()) && prodMap.set(p.codigo.trim(), p));
              remoteVal = Array.from(prodMap.values());
              remoteStr = JSON.stringify(remoteVal);
            }
          } catch (e) {}
        }

        if (localStr !== remoteStr) {
          isSyncingFromFirestore = true;
          safeSetItem(localKey, remoteStr);
          isSyncingFromFirestore = false;

          // Dispatch storage event so React updates
          window.dispatchEvent(new Event("storage"));
        }

        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, (err) => {
        console.warn(`[REALTIME-SYNC] Firestore offline or error subscribing to ${collectionName}:`, err?.message || err);
        notifySyncIssue(`Erro de sincronização em tempo real na tabela "${collectionName}": ${err?.message || err}`, err);

        if (!resolved) {
          resolved = true;
          resolve(); // resolve anyway using local cache so app continues smoothly
        }

        // Schedule automatic re-attach with exponential backoff
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          console.log(`[REALTIME-SYNC-RETRY] Attempting listener reconnect to ${collectionName} (delay ${retryDelay}ms)...`);
          attach();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 60000);
      });
    }

    attach();
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 4000): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let completed = false;
    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.warn(`[TIMEOUT] A operação de rede excedeu o limite de ${timeoutMs}ms. Seguindo em frente com cache local.`);
        resolve(undefined);
      }
    }, timeoutMs);

    promise.then(
      (val) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          resolve(val);
        }
      },
      (err) => {
        if (!completed) {
          completed = true;
          clearTimeout(timer);
          console.warn("[TIMEOUT-ERROR] Erro na promise monitorada:", err);
          resolve(undefined);
        }
      }
    );
  });
}

// Initial Sync from Firestore (Seeding default data if completely empty)
export function initializeSync() {
  const fastKeys = [
    "sstr_registered_managers",
    "sstr_lista_crew",
    "sstr_reps_setor",
    "sstr_motoristas_rotas",
    "sstr_custom_pdvs_v1",
    "sstr_representative_pending_requests",
    "sstr_cached_batches_v1",
    "sstr_products_database"
  ];
  const heavyKeys = [
    "sstr_cached_records_v1",
    "sstr_vales_historico_reg"
  ];

  console.log("Initializing SSTR Two-Phase Real-time Sync Engine with network timeouts...");

  // Detect project changes and clear local cache
  const savedProjectId = safeGetItem("sstr_connected_project_id");
  if (savedProjectId && savedProjectId !== firebaseConfig.projectId) {
    console.log(`[PROJECT-CHANGE] Firebase Project changed from ${savedProjectId} to ${firebaseConfig.projectId}. Clearing local storage cache for a fresh sync...`);
    const keysToClear = [
      "sstr_cached_records_v1",
      "sstr_cached_batches_v1",
      "sstr_representative_pending_requests",
      "sstr_registered_managers",
      "sstr_vales_historico_reg",
      "sstr_lista_crew",
      "sstr_reps_setor",
      "sstr_motoristas_rotas",
      "sstr_custom_pdvs_v1",
      "sstr_products_database",
      "sstr_offline_requests_queue",
      "sstr_active_creation_draft"
    ];
    keysToClear.forEach(key => safeRemoveItem(key));
  }
  safeSetItem("sstr_connected_project_id", firebaseConfig.projectId);

  const fastSyncPromise = (async () => {
    try {
      console.log("[FAST-SYNC] Phase 1: Fetching critical auth & metadata...");
      
      const managersCol = collection(firestoreDb, "managers");
      const managersSnap = await withTimeout(
        getDocs(query(managersCol, limit(1))).catch((err) => {
          handleFirestoreError(err, OperationType.GET, "managers");
        }),
        4000
      );

      if (!managersSnap) {
        console.warn("[FAST-SYNC] Não foi possível contactar o Firestore diretamente (timeout/offline). Continuando com inscrições em segundo plano usando cache local.");
        if (!safeGetItem("sstr_cached_records_v1")) {
          seedLocalStorageDefaults();
        }
      } else if (managersSnap.empty) {
        console.log("[FAST-SYNC] No remote state found. Seeding remote database baseline...");
        await seedFirestoreBaselines();
      }

      // Retrieve and update fast keys in parallel with timeout
      const fastPromises = fastKeys.map(async (localKey) => {
        const mapping = COLLECTION_MAP[localKey];
        if (!mapping) return;
        await withTimeout(subscribeCollection(mapping.name, localKey, mapping.isObject), 4000);
      });
      await Promise.all(fastPromises);
      console.log("[FAST-SYNC] Phase 1 Complete! Credentials & configuration updated.");
      
      // Trigger update for credentials and other fast tables
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("[FAST-SYNC-CRITICAL] Phase 1 Sync failed:", err);
    }
  })();

  const heavySyncPromise = (async () => {
    // Wait for Phase 1 to finish to maintain sequential logic
    await fastSyncPromise;
    
    try {
      console.log("[HEAVY-SYNC] Phase 2: Fetching large historical datasets...");
      
      const heavyPromises = heavyKeys.map(async (localKey) => {
        const mapping = COLLECTION_MAP[localKey];
        if (!mapping) return;
        if (localKey === "sstr_cached_records_v1") {
          await withTimeout(subscribeExchangeRecordsChunks(localKey), 5000);
        } else {
          await withTimeout(subscribeCollection(mapping.name, localKey, mapping.isObject), 4000);
        }
      });
      
      await Promise.all(heavyPromises);
      console.log("[HEAVY-SYNC] Phase 2 Complete! All transaction records and logs fully synced.");
      
      // Trigger update for historical records in React component state
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("[HEAVY-SYNC-CRITICAL] Phase 2 Sync failed:", err);
    }
  })();

  return {
    fastSyncPromise,
    heavySyncPromise
  };
}

function seedLocalStorageDefaults() {
  const existingRecordsStr = safeGetItem("sstr_cached_records_v1");
  let hasUserRecords = false;
  if (existingRecordsStr) {
    try {
      const parsed = JSON.parse(existingRecordsStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        hasUserRecords = true;
      }
    } catch (e) {}
  }

  if (hasUserRecords) {
    console.log("[SEED-SKIP] Local storage already contains user records. Preserving existing user database.");
  } else {
    console.log("Seeding local storage with default demonstration dataset...");
    const defaultRecords = HISTORICAL_RECORDS_JAN_JUL_2026;
    const initialBatch = {
      id: "batch_default",
      timestamp: Date.now(),
      fileName: "Base Promax 03.18.05 (Jan-Jul 2026 Congelada)",
      recordCount: defaultRecords.length,
      totalValue: defaultRecords.reduce((acc: number, r: any) => acc + r.valorTotal, 0)
    };
    safeSetItem("sstr_cached_records_v1", JSON.stringify(defaultRecords));
    if (!safeGetItem("sstr_cached_batches_v1")) {
      safeSetItem("sstr_cached_batches_v1", JSON.stringify([initialBatch]));
    }
  }

  const defaultManagers = [
    { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
    { username: "admin", password: "admin", name: "Administrador" },
    { username: "g1002", password: "!Liz1105", name: "Djeanderson Soares" },
    { username: "g1009", password: "123", name: "Nixon Henrique" },
    { username: "7171", password: "Anbev10", name: "Marcos Guilherme" },
    { username: "7224", password: "Anbev10", name: "Elisson Minervino" },
    { username: "g1022", password: "Anbev10", name: "JOAO PAULO" },
    { username: "g1121", password: "Anbev10", name: "José Gonçalves" },
    { username: "g1163", password: "Anbev10", name: "Alécya Ferreira" },
    { username: "monitoramento", password: "Anbev10", name: "MONITORAMENTO" }
  ];

  if (!safeGetItem("sstr_representative_pending_requests")) safeSetItem("sstr_representative_pending_requests", JSON.stringify([]));
  if (!safeGetItem("sstr_registered_managers")) safeSetItem("sstr_registered_managers", JSON.stringify(defaultManagers));
  if (!safeGetItem("sstr_vales_historico_reg")) safeSetItem("sstr_vales_historico_reg", JSON.stringify([]));
  if (!safeGetItem("sstr_custom_pdvs_v1")) safeSetItem("sstr_custom_pdvs_v1", JSON.stringify([]));
  if (!safeGetItem("sstr_products_database")) safeSetItem("sstr_products_database", JSON.stringify(getProductsDatabase()));
  if (!safeGetItem("sstr_lista_crew")) safeSetItem("sstr_lista_crew", JSON.stringify(DEFAULT_LISTA_CREW));
  if (!safeGetItem("sstr_reps_setor")) safeSetItem("sstr_reps_setor", JSON.stringify(DEFAULT_REPRESENTATIVOS_SETOR));
  if (!safeGetItem("sstr_motoristas_rotas")) safeSetItem("sstr_motoristas_rotas", JSON.stringify(DEFAULT_MOTORISTAS_ROTAS));
}

async function seedFirestoreBaselines() {
  console.log("Seeding Firestore baseline credentials...");
  
  const defaultManagers = [
    { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
    { username: "admin", password: "admin", name: "Administrador" },
    { username: "g1002", password: "!Liz1105", name: "Djeanderson Soares" },
    { username: "g1009", password: "Bud0102", name: "Nixon Henrique" },
    { username: "7171", password: "Anbev10", name: "Marcos Guilherme" },
    { username: "7224", password: "Anbev10", name: "Elisson Minervino" },
    { username: "g1022", password: "Anbev10", name: "JOAO PAULO" },
    { username: "g1121", password: "Anbev10", name: "José Gonçalves" },
    { username: "g1163", password: "Anbev10", name: "Alécya Ferreira" },
    { username: "monitoramento", password: "Anbev10", name: "MONITORAMENTO" }
  ];

  isSyncingFromFirestore = true;

  await enqueueFirestoreWrite(async () => {
    const batch = writeBatch(firestoreDb);
    defaultManagers.forEach(m => {
      batch.set(doc(firestoreDb, "managers", m.username), sanitizeForFirestore(m));
    });
    // Set minimal metadata doc for chunk management
    const metaRef = doc(firestoreDb, "exchangeRecords_chunks", "metadata");
    batch.set(metaRef, {
      totalChunks: 0,
      dynamicRecordsCount: 0,
      hasHistoricalBaselineInCode: true,
      timestamp: Date.now()
    });
    try {
      await batch.commit();
      recordWrites(defaultManagers.length + 1);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "managers");
    }
  });

  seedLocalStorageDefaults();
  isSyncingFromFirestore = false;
  console.log("Firestore baseline seed completed smoothly.");
}

// Granular Document-Level Write Helpers for Instant Real-Time Operations (Task 4)
export async function setFirestoreDoc(collectionName: string, id: string, data: any) {
  if (isFirestoreInCooldown()) return;
  return enqueueFirestoreWrite(async () => {
    try {
      const docRef = doc(firestoreDb, collectionName, id);
      await setDoc(docRef, sanitizeForFirestore(data));
      recordWrites(1);
      console.log(`[GRANULAR-WRITE] Updated document "${id}" in Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[GRANULAR-WRITE-ERROR] Failed to write doc "${id}" to "${collectionName}":`, err);
      handleFirestoreError(err, OperationType.WRITE, collectionName);
      throw err;
    }
  });
}

export async function deleteFirestoreDoc(collectionName: string, id: string) {
  if (isFirestoreInCooldown()) return;
  return enqueueFirestoreWrite(async () => {
    try {
      const docRef = doc(firestoreDb, collectionName, id);
      await deleteDoc(docRef);
      recordDeletes(1);
      console.log(`[GRANULAR-DELETE] Deleted document "${id}" from Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[GRANULAR-DELETE-ERROR] Failed to delete doc "${id}" from "${collectionName}":`, err);
      handleFirestoreError(err, OperationType.DELETE, collectionName);
      throw err;
    }
  });
}

export function startPolling() {
  console.log("Real-time synchronization established through native onSnapshot collections.");
}
