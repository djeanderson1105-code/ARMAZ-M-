/**
 * SSTR Multi-Device API Synchronization Utility with Firebase Firestore
 * Keeps all devices synchronized in sub-second real-time with document-per-record collections.
 */

import { initializeApp } from "firebase/app";
import {
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

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const dbId = (firebaseConfig as any).firestoreDatabaseId || (firebaseConfig as any).databaseId;

export const firestoreDb = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, dbId && dbId !== "(default)" ? dbId : undefined);

try {
  enableIndexedDbPersistence(firestoreDb).catch((err) => {
    console.warn("[FIREBASE] Could not enable offline persistence:", err.message);
  });
} catch (e) {
  console.warn("[FIREBASE] Offline persistence error:", e);
}

const originalSetItem = localStorage.setItem;
const originalGetItem = localStorage.getItem;

// Mapping of LocalStorage keys to Firestore Collections
export const COLLECTION_MAP: Record<string, { name: string; isObject: boolean }> = {
  "sstr_cached_records_v1": { name: "exchangeRecords", isObject: false },
  "sstr_cached_batches_v1": { name: "batches", isObject: false },
  "sstr_representative_pending_requests": { name: "pendingRequests", isObject: false },
  "sstr_registered_managers": { name: "managers", isObject: false },
  "sstr_vales_historico_reg": { name: "vales", isObject: false },
  "sstr_lista_crew": { name: "crewList", isObject: false },
  "sstr_reps_setor": { name: "repsSetor", isObject: true },
  "sstr_custom_pdvs_v1": { name: "customPdvs", isObject: false }
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

  const batch = writeBatch(firestoreDb);
  let operationCount = 0;

  // Added or modified
  for (const [id, item] of newMap.entries()) {
    const oldItem = oldMap.get(id);
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      const docRef = doc(firestoreDb, collectionName, id);
      batch.set(docRef, item);
      operationCount++;
    }
  }

  // Deleted
  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) {
      const docRef = doc(firestoreDb, collectionName, id);
      batch.delete(docRef);
      operationCount++;
    }
  }

  if (operationCount > 0) {
    try {
      await batch.commit();
      console.log(`[SYNC-WRITE] Committed ${operationCount} changes to Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[SYNC-WRITE] Error committing batch to ${collectionName}:`, err);
    }
  }
}

async function syncObjectToFirestore(collectionName: string, oldObj: Record<string, any>, newObj: Record<string, any>) {
  const batch = writeBatch(firestoreDb);
  let operationCount = 0;

  // Added or modified keys
  for (const [key, val] of Object.entries(newObj || {})) {
    const oldVal = oldObj ? oldObj[key] : undefined;
    if (!oldVal || JSON.stringify(oldVal) !== JSON.stringify(val)) {
      const docRef = doc(firestoreDb, collectionName, key);
      batch.set(docRef, val);
      operationCount++;
    }
  }

  // Deleted keys
  if (oldObj) {
    for (const key of Object.keys(oldObj)) {
      if (!(key in (newObj || {}))) {
        const docRef = doc(firestoreDb, collectionName, key);
        batch.delete(docRef);
        operationCount++;
      }
    }
  }

  if (operationCount > 0) {
    try {
      await batch.commit();
      console.log(`[SYNC-WRITE] Committed ${operationCount} key changes to Firestore collection "${collectionName}".`);
    } catch (err) {
      console.error(`[SYNC-WRITE] Error committing object batch to ${collectionName}:`, err);
    }
  }
}


async function syncExchangeRecordsConsolidated(newList: any[]) {
  try {
    const chunkSize = 1000;
    const chunks: any[][] = [];
    for (let i = 0; i < newList.length; i += chunkSize) {
      chunks.push(newList.slice(i, i + chunkSize));
    }

    const batch = writeBatch(firestoreDb);
    const metaRef = doc(firestoreDb, "exchangeRecords_chunks", "metadata");
    batch.set(metaRef, { totalChunks: chunks.length, timestamp: Date.now() });
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
      batch.set(chunkRef, { data: chunks[i] });
    }
    
    // Clean up old potential chunks
    for (let i = chunks.length; i < 50; i++) {
      const chunkRef = doc(firestoreDb, "exchangeRecords_chunks", `chunk_${i}`);
      batch.delete(chunkRef);
    }
    
    await batch.commit();
    console.log(`[SYNC-CONSOLIDATED] Successfully wrote ${newList.length} records in ${chunks.length} chunks.`);
  } catch (err) {
    console.error("[SYNC-CONSOLIDATED] Error syncing exchange records:", err);
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
      const localStr = originalGetItem.call(localStorage, localKey);
      
      if (localStr !== remoteStr) {
        isSyncingFromFirestore = true;
        originalSetItem.call(localStorage, localKey, remoteStr);
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
    });
  });
}

// Monkey-patching localStorage.setItem to strip heavy base64 images and sync immediately to Firestore
localStorage.setItem = function(key: string, value: string) {
  const mapping = COLLECTION_MAP[key];
  if (!mapping) {
    originalSetItem.apply(this, [key, value]);
    return;
  }

  let processedValue = value;
  if (
    key === "sstr_representative_pending_requests" ||
    key === "sstr_vales_historico_reg"
  ) {
    processedValue = extractImagesToIDB(value);
  }

  const oldValue = originalGetItem.call(localStorage, key);
  originalSetItem.apply(this, [key, processedValue]);
  
  if (mapping && !isSyncingFromFirestore && oldValue !== processedValue) {
    // Notify other tabs locally
    window.dispatchEvent(new Event("storage"));
    
    // Save to Firestore individually in background
    try {
      const oldParsed = oldValue ? JSON.parse(oldValue) : (mapping.isObject ? {} : []);
      const newParsed = JSON.parse(processedValue);

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
};

// Monkey-patching localStorage.getItem to transparently restore images from synchronous cache
localStorage.getItem = function(key: string): string | null {
  const rawValue = originalGetItem.apply(this, [key]);
  if (!rawValue) return rawValue;

  if (
    key === "sstr_representative_pending_requests" ||
    key === "sstr_vales_historico_reg"
  ) {
    return restoreImagesFromCache(rawValue);
  }

  return rawValue;
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
      await addDoc(logsCol, {
        usuario: operator,
        action,
        tabela: COLLECTION_MAP[key]?.name || key,
        dataHora: new Date().toLocaleString("pt-BR"),
        timestamp: Date.now(),
        detalhes: details,
        dados: itemData
      });
    };
    
    for (const item of added) {
      const name = item.nomeCliente || item.nome || item.razaoSocial || item.fileName || item.username || "Novo Item";
      await createLogEntry("CRIACAO", `Lançamento criado: "${name}"`, item);
    }
    
    for (const change of modified) {
      const name = change.new.nomeCliente || change.new.nome || change.new.razaoSocial || change.new.fileName || change.new.username || "Item Modificado";
      await createLogEntry("EDICAO", `Lançamento atualizado: "${name}"`, change.new);
    }
    
    for (const item of deleted) {
      const name = item.nomeCliente || item.nome || item.razaoSocial || item.fileName || item.username || "Item Removido";
      await createLogEntry("EXCLUSAO", `Lançamento removido: "${name}"`, item);
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

      const localStr = originalGetItem.call(localStorage, localKey);
      if (localStr !== remoteStr) {
        isSyncingFromFirestore = true;
        originalSetItem.call(localStorage, localKey, remoteStr);
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
    "sstr_custom_pdvs_v1",
    "sstr_representative_pending_requests",
    "sstr_cached_batches_v1"
  ];
  const heavyKeys = [
    "sstr_cached_records_v1",
    "sstr_vales_historico_reg"
  ];

  console.log("Initializing SSTR Two-Phase Real-time Sync Engine with network timeouts...");

  const fastSyncPromise = (async () => {
    try {
      console.log("[FAST-SYNC] Phase 1: Fetching critical auth & metadata...");
      
      const managersCol = collection(firestoreDb, "managers");
      const managersSnap = await withTimeout(getDocs(query(managersCol, limit(1))), 4000);

      if (!managersSnap) {
        console.warn("[FAST-SYNC] Não foi possível contactar o Firestore diretamente (timeout/offline). Mantendo cache local.");
        if (!originalGetItem.call(localStorage, "sstr_cached_records_v1")) {
          seedLocalStorageDefaults();
        }
        window.dispatchEvent(new Event("storage"));
        return;
      }

      if (managersSnap.empty) {
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

  originalSetItem.call(localStorage, "sstr_cached_records_v1", JSON.stringify(defaultRecords));
  originalSetItem.call(localStorage, "sstr_cached_batches_v1", JSON.stringify([initialBatch]));
  originalSetItem.call(localStorage, "sstr_representative_pending_requests", JSON.stringify([]));
  originalSetItem.call(localStorage, "sstr_registered_managers", JSON.stringify(defaultManagers));
  originalSetItem.call(localStorage, "sstr_vales_historico_reg", JSON.stringify([]));
  originalSetItem.call(localStorage, "sstr_custom_pdvs_v1", JSON.stringify([]));
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
            batch.set(doc(firestoreDb, colName, id), item);
          }
        });
        await batch.commit();
        chunk = [];
      }
    }
  };

  await syncExchangeRecordsConsolidated(defaultRecords);
  await seedArrayInChunks("batches", [initialBatch]);
  await seedArrayInChunks("managers", defaultManagers);

  seedLocalStorageDefaults();

  isSyncingFromFirestore = false;
  console.log("Seeding process completed successfully!");
}

export function startPolling() {
  console.log("Real-time synchronization established through native onSnapshot collections.");
}
