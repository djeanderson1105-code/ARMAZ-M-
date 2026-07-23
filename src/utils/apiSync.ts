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
import { extractImagesToIDB, restoreImagesFromCache } from "./indexedDbCache";
import { parseCSVToRecords } from "./csvParser";
import { RAW_SAMPLE_DATA } from "../sampleData";
import { getProductsDatabase } from "../data/products";
import { DEFAULT_LISTA_CREW, DEFAULT_REPRESENTATIVOS_SETOR, DEFAULT_MOTORISTAS_ROTAS } from "../types";
import { getAuth } from "firebase/auth";

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

export function safeGetItem(key: string): string | null {
  try {
    return originalGetItem.call(localStorage, key);
  } catch (e) {
    return memoryStorage.get(key) || null;
  }
}

export function safeSetItem(key: string, value: string) {
  try {
    let processedValue = value;
    if (
      key === "sstr_representative_pending_requests" ||
      key === "sstr_vales_historico_reg"
    ) {
      processedValue = extractImagesToIDB(value);
    }
    originalSetItem.call(localStorage, key, processedValue);
  } catch (e) {
    console.warn(`[STORAGE-WARN] Failed to write key "${key}" to native localStorage. Using in-memory fallback:`, e);
    memoryStorage.set(key, value);
  }
}

export function safeRemoveItem(key: string) {
  try {
    originalRemoveItem.call(localStorage, key);
  } catch (e) {
    memoryStorage.delete(key);
  }
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

async function syncArrayToFirestore(collectionName: string, oldList: any[], newList: any[]) {
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

  // We split operations into safe chunks of 400 (well below Firestore's 500 batch limit)
  const chunkSize = 400;
  const allOps: { type: "set" | "delete"; id: string; data?: any }[] = [
    ...toSet.map(([id, data]) => ({ type: "set" as const, id, data })),
    ...toDelete.map(id => ({ type: "delete" as const, id }))
  ];

  for (let i = 0; i < allOps.length; i += chunkSize) {
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
    try {
      await batch.commit();
      console.log(`[SYNC-WRITE] Committed batch of ${chunk.length} changes to Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[SYNC-WRITE] Error committing batch chunk to ${collectionName}:`, err);
      handleFirestoreError(err, OperationType.WRITE, collectionName);
    }
  }
}

async function syncObjectToFirestore(collectionName: string, oldObj: Record<string, any>, newObj: Record<string, any>) {
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

  const chunkSize = 400;
  const allOps: { type: "set" | "delete"; id: string; data?: any }[] = [
    ...toSet.map(([id, data]) => ({ type: "set" as const, id, data })),
    ...toDelete.map(id => ({ type: "delete" as const, id }))
  ];

  for (let i = 0; i < allOps.length; i += chunkSize) {
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
    try {
      await batch.commit();
      console.log(`[SYNC-WRITE] Committed object batch of ${chunk.length} key changes to Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[SYNC-WRITE] Error committing object batch chunk to ${collectionName}:`, err);
      handleFirestoreError(err, OperationType.WRITE, collectionName);
    }
  }
}


async function syncExchangeRecordsConsolidated(newList: any[]) {
  try {
    const chunkSize = 150;
    const chunks: any[][] = [];
    for (let i = 0; i < newList.length; i += chunkSize) {
      chunks.push(newList.slice(i, i + chunkSize));
    }

    const batch = writeBatch(firestoreDb);
    const metaRef = doc(firestoreDb, "exchangeRecords_chunks", "metadata");
    batch.set(metaRef, { totalChunks: chunks.length, timestamp: Date.now() });
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
      batch.set(chunkRef, sanitizeForFirestore({ data: chunks[i] }));
    }
    
    // Clean up old potential chunks
    for (let i = chunks.length; i < 150; i++) {
      const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
      batch.delete(chunkRef);
    }
    
    await batch.commit();
    console.log(`[SYNC-CONSOLIDATED] Successfully wrote ${newList.length} records in ${chunks.length} chunks.`);
  } catch (err) {
    console.error("[SYNC-CONSOLIDATED] Error syncing exchange records:", err);
    handleFirestoreError(err, OperationType.WRITE, "exchangeRecords_chunks");
  }
}

function subscribeExchangeRecordsChunks(localKey: string): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    onSnapshot(collection(firestoreDb, "exchangeRecords_chunks"), (snapshot) => {
      const docsMap = new Map<string, any>();
      snapshot.docs.forEach(doc => {
        docsMap.set(doc.id, doc.data());
      });
      
      const metadata = docsMap.get("metadata");
      if (!metadata) {
        if (!resolved) {
          resolved = true;
          resolve();
        }
        return;
      }
      
      const totalChunks = metadata.totalChunks || 0;
      const combinedList: any[] = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkDoc = docsMap.get(`chunk_${i}`);
        if (chunkDoc && Array.isArray(chunkDoc.data)) {
          combinedList.push(...chunkDoc.data);
        }
      }
      
      const remoteStr = JSON.stringify(combinedList);
      const localStr = safeGetItem(localKey);
      
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
      console.warn("[SYNC-CONSOLIDATED] Error subscribing to exchangeRecords_chunks:", err.message);
      if (!resolved) {
        resolved = true;
        resolve();
      }
      handleFirestoreError(err, OperationType.GET, "exchangeRecords_chunks");
    });
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
    
    const createLogEntry = async (action: "CRIACAO" | "EDICAO" | "EXCLUSAO", details: string, itemData: any) => {
      try {
        await addDoc(logsCol, sanitizeForFirestore({
          usuario: operator,
          action,
          tabela: COLLECTION_MAP[key]?.name || key,
          dataHora: new Date().toLocaleString("pt-BR"),
          timestamp: Date.now(),
          detalhes: details,
          dados: itemData
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "sstr_logs");
      }
    };
    
    if (added.length > 10) {
      await createLogEntry("CRIACAO", `Cadastro em lote: ${added.length} novos registros adicionados na tabela "${COLLECTION_MAP[key]?.name || key}".`, { count: added.length });
    } else {
      for (const item of added) {
        const name = item.nomeCliente || item.nome || item.razaoSocial || item.fileName || item.username || "Novo Item";
        await createLogEntry("CRIACAO", `Lançamento criado: "${name}"`, item);
      }
    }
    
    if (modified.length > 10) {
      await createLogEntry("EDICAO", `Atualização em lote: ${modified.length} registros modificados na tabela "${COLLECTION_MAP[key]?.name || key}".`, { count: modified.length });
    } else {
      for (const change of modified) {
        const name = change.new.nomeCliente || change.new.nome || change.new.razaoSocial || change.new.fileName || change.new.username || "Item Modificado";
        await createLogEntry("EDICAO", `Lançamento atualizado: "${name}"`, change.new);
      }
    }
    
    if (deleted.length > 10) {
      await createLogEntry("EXCLUSAO", `Remoção em lote: ${deleted.length} registros excluídos na tabela "${COLLECTION_MAP[key]?.name || key}".`, { count: deleted.length });
    } else {
      for (const item of deleted) {
        const name = item.nomeCliente || item.nome || item.razaoSocial || item.fileName || item.username || "Item Removido";
        await createLogEntry("EXCLUSAO", `Lançamento removido: "${name}"`, item);
      }
    }
  } catch (err) {
    console.error("Error writing audit logs to Firestore:", err);
  }
}

function subscribeCollection(collectionName: string, localKey: string, isObject: boolean = false): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    onSnapshot(collection(firestoreDb, collectionName), (snapshot) => {
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
      console.warn(`[REALTIME-SYNC] Error subscribing to ${collectionName}:`, err.message);
      if (!resolved) {
        resolved = true;
        resolve(); // resolve anyway to not block app load
      }
      handleFirestoreError(err, OperationType.LIST, collectionName);
    });
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
  console.log("Seeding local storage with default demonstration dataset...");
  const defaultRecords = parseCSVToRecords(RAW_SAMPLE_DATA, "Planilha Base Pau Brasil");
  const initialBatch = {
    id: "batch_default",
    timestamp: Date.now(),
    fileName: "Planilha Base Pau Brasil.csv",
    recordCount: defaultRecords.length,
    totalValue: defaultRecords.reduce((acc: number, r: any) => acc + r.valorTotal, 0)
  };
  const defaultManagers = [
    { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
    { username: "admin", password: "admin", name: "Administrador" }
  ];

  safeSetItem("sstr_cached_records_v1", JSON.stringify(defaultRecords));
  safeSetItem("sstr_cached_batches_v1", JSON.stringify([initialBatch]));
  safeSetItem("sstr_representative_pending_requests", JSON.stringify([]));
  safeSetItem("sstr_registered_managers", JSON.stringify(defaultManagers));
  safeSetItem("sstr_vales_historico_reg", JSON.stringify([]));
  safeSetItem("sstr_custom_pdvs_v1", JSON.stringify([]));
  safeSetItem("sstr_products_database", JSON.stringify(getProductsDatabase()));
  safeSetItem("sstr_lista_crew", JSON.stringify(DEFAULT_LISTA_CREW));
  safeSetItem("sstr_reps_setor", JSON.stringify(DEFAULT_REPRESENTATIVOS_SETOR));
  safeSetItem("sstr_motoristas_rotas", JSON.stringify(DEFAULT_MOTORISTAS_ROTAS));
}

async function seedFirestoreBaselines() {
  console.log("Seeding Firestore databases with initial demonstration datasets...");
  const defaultRecords = parseCSVToRecords(RAW_SAMPLE_DATA, "Planilha Base Pau Brasil");
  const initialBatch = {
    id: "batch_default",
    timestamp: Date.now(),
    fileName: "Planilha Base Pau Brasil.csv",
    recordCount: defaultRecords.length,
    totalValue: defaultRecords.reduce((acc: number, r: any) => acc + r.valorTotal, 0)
  };
  const defaultManagers = [
    { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
    { username: "admin", password: "admin", name: "Administrador" }
  ];

  isSyncingFromFirestore = true;

  const seedArrayInChunks = async (colName: string, items: any[]) => {
    let chunk: any[] = [];
    for (let i = 0; i < items.length; i++) {
      chunk.push(items[i]);
      if (chunk.length === 200 || i === items.length - 1) {
        const batch = writeBatch(firestoreDb);
        chunk.forEach(item => {
          const id = getItemId(item);
          if (id) {
            batch.set(doc(firestoreDb, colName, id), sanitizeForFirestore(item));
          }
        });
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, colName);
        }
        chunk = [];
      }
    }
  };

  const seedObjectInFirestore = async (colName: string, obj: Record<string, any>) => {
    const batch = writeBatch(firestoreDb);
    for (const [key, val] of Object.entries(obj)) {
      batch.set(doc(firestoreDb, colName, key), sanitizeForFirestore(val));
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, colName);
    }
  };

  await syncExchangeRecordsConsolidated(defaultRecords);
  await seedArrayInChunks("batches", [initialBatch]);
  await seedArrayInChunks("managers", defaultManagers);
  await seedArrayInChunks("products", getProductsDatabase());
  await seedArrayInChunks("crewList", DEFAULT_LISTA_CREW);
  await seedObjectInFirestore("repsSetor", DEFAULT_REPRESENTATIVOS_SETOR);
  await seedObjectInFirestore("motoristasRotas", DEFAULT_MOTORISTAS_ROTAS);

  seedLocalStorageDefaults();

  isSyncingFromFirestore = false;
  console.log("Seeding process completed successfully!");
}

// Granular Document-Level Write Helpers for Instant Real-Time Operations (Task 4)
export async function setFirestoreDoc(collectionName: string, id: string, data: any) {
  try {
    const docRef = doc(firestoreDb, collectionName, id);
    await setDoc(docRef, sanitizeForFirestore(data));
    console.log(`[GRANULAR-WRITE] Updated document "${id}" in Firestore collection "${collectionName}".`);
  } catch (err) {
    console.error(`[GRANULAR-WRITE-ERROR] Failed to write doc "${id}" to "${collectionName}":`, err);
    handleFirestoreError(err, OperationType.WRITE, collectionName);
  }
}

export async function deleteFirestoreDoc(collectionName: string, id: string) {
  try {
    const docRef = doc(firestoreDb, collectionName, id);
    await deleteDoc(docRef);
    console.log(`[GRANULAR-DELETE] Deleted document "${id}" from Firestore collection "${collectionName}".`);
  } catch (err) {
    console.error(`[GRANULAR-DELETE-ERROR] Failed to delete doc "${id}" from "${collectionName}":`, err);
    handleFirestoreError(err, OperationType.DELETE, collectionName);
  }
}

export function startPolling() {
  console.log("Real-time synchronization established through native onSnapshot collections.");
}
