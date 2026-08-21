import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { PendingRequest, ExchangeRecord, ImportBatch, CrewMember, DEFAULT_LISTA_CREW, DEFAULT_REPRESENTATIVOS_SETOR, DEFAULT_MOTORISTAS_ROTAS } from "../types";
import { ValeEntry } from "../components/ValesHistoryDashboard";
import { 
  firestoreDb, 
  safeGetItem, 
  safeSetItem, 
  setFirestoreDoc, 
  deleteFirestoreDoc, 
  COLLECTION_MAP, 
  initializeSync,
  syncExchangeRecordsConsolidated,
  syncArrayToFirestore
} from "../utils/apiSync";
import { onSnapshot, collection, getDocs, query, limit } from "firebase/firestore";
import { extractImagesToIDB, restoreImagesFromCache } from "../utils/indexedDbCache";
import { getProductsDatabase, setProductsCache, ProductInfo } from "../data/products";
import { 
  HISTORICAL_RECORDS_JAN_JUL_2026, 
  combineBaselineWithDynamic 
} from "../data/historicalRecordsJul2026";
import { 
  combineShortagesWithDynamic, 
  combineValesWithDynamic 
} from "../data/historicalShortages2026";

export interface SstrDataContextType {
  // Collections State
  pendingRequests: PendingRequest[];
  records: ExchangeRecord[];
  batches: ImportBatch[];
  managers: any[];
  crewList: CrewMember[];
  repsList: Record<string, any>;
  motoristasList: Record<string, any>;
  vales: ValeEntry[];
  products: ProductInfo[];
  shiftMode: "dia" | "noite";
  setShiftMode: (mode: "dia" | "noite") => void;
  
  // Status flags
  isInitialLoading: boolean;
  isHeavyLoading: boolean;

  // Granular mutation actions (Task 4)
  savePendingRequest: (req: PendingRequest) => Promise<void>;
  deletePendingRequest: (requestId: string) => Promise<void>;
  saveValeEntry: (vale: ValeEntry) => Promise<void>;
  deleteValeEntry: (valeId: string) => Promise<void>;
  saveManager: (manager: any) => Promise<void>;
  deleteManager: (username: string) => Promise<void>;
  saveCrewMember: (crew: CrewMember) => Promise<void>;
  deleteCrewMember: (id: string) => Promise<void>;
  saveRepsSetor: (key: string, data: any) => Promise<void>;
  deleteRepsSetor: (key: string) => Promise<void>;
  saveMotoristaRota: (key: string, data: any) => Promise<void>;
  deleteMotoristaRota: (key: string) => Promise<void>;
  saveProductsList: (products: ProductInfo[]) => Promise<void>;
  saveRecordsAndBatches: (newRecords: ExchangeRecord[], newBatches: ImportBatch[], mode?: "append" | "overwrite") => Promise<void>;
  
  // Refetch helpers
  refreshData: () => void;
}

const SstrDataContext = createContext<SstrDataContextType | undefined>(undefined);

const DEFAULT_MANAGERS = [
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

const normalizeManagerUsername = (username: any) => String(username || "").toLowerCase().trim().replace(/^@+/, "");

export const SstrDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [records, setRecords] = useState<ExchangeRecord[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [repsList, setRepsList] = useState<Record<string, any>>({});
  const [motoristasList, setMotoristasList] = useState<Record<string, any>>({});
  const [vales, setVales] = useState<ValeEntry[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [shiftMode, setShiftModeState] = useState<"dia" | "noite">(() => {
    return (safeGetItem("sstr_shift_mode") as "dia" | "noite") || "dia";
  });

  const setShiftMode = (mode: "dia" | "noite") => {
    setShiftModeState(mode);
    safeSetItem("sstr_shift_mode", mode);
  };

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isHeavyLoading, setIsHeavyLoading] = useState(true);

  // Helper to read JSON safely from storage
  const readLocal = useCallback((key: string, fallback: any) => {
    try {
      const val = safeGetItem(key);
      if (!val) return fallback;
      if (key === "sstr_representative_pending_requests" || key === "sstr_vales_historico_reg") {
        const restored = restoreImagesFromCache(val);
        return JSON.parse(restored);
      }
      return JSON.parse(val);
    } catch (e) {
      return fallback;
    }
  }, []);

  // Hydrate local state from storage immediately
  const hydrateFromLocalStorage = useCallback(() => {
    const localRequests = readLocal("sstr_representative_pending_requests", []);
    const unifiedRequests = combineShortagesWithDynamic(localRequests);
    setPendingRequests(unifiedRequests);
    
    // Unify cached dynamic records with the permanent in-code historical baseline (Jan-Jul 2026)
    const rawCachedRecords = readLocal("sstr_cached_records_v1", []);
    const unifiedRecords = combineBaselineWithDynamic(rawCachedRecords);
    setRecords(unifiedRecords);
    
    const cachedBatches = readLocal("sstr_cached_batches_v1", []);
    if (cachedBatches.length === 0) {
      const defaultBatch: ImportBatch = {
        id: "batch_default_hist",
        timestamp: Date.now(),
        fileName: "Base Promax 03.18.05 (Jan-Jul 2026 Congelada)",
        recordCount: HISTORICAL_RECORDS_JAN_JUL_2026.length,
        totalValue: HISTORICAL_RECORDS_JAN_JUL_2026.reduce((acc, r) => acc + (r.valorTotal || 0), 0)
      };
      setBatches([defaultBatch]);
    } else {
      setBatches(cachedBatches);
    }
    
    // Normalize and merge saved managers with DEFAULT_MANAGERS fallback
    const savedManagers = readLocal("sstr_registered_managers", DEFAULT_MANAGERS);
    const mgrMap = new Map<string, any>();
    DEFAULT_MANAGERS.forEach(m => {
      const norm = normalizeManagerUsername(m.username);
      if (norm) mgrMap.set(norm, { ...m, username: norm });
    });
    if (Array.isArray(savedManagers)) {
      savedManagers.forEach(m => {
        const norm = normalizeManagerUsername(m.username || m.id);
        if (norm) mgrMap.set(norm, { ...m, username: norm });
      });
    }
    setManagers(Array.from(mgrMap.values()));

    setCrewList(readLocal("sstr_lista_crew", DEFAULT_LISTA_CREW));
    setRepsList(readLocal("sstr_reps_setor", DEFAULT_REPRESENTATIVOS_SETOR));
    setMotoristasList(readLocal("sstr_motoristas_rotas", DEFAULT_MOTORISTAS_ROTAS));
    
    const localVales = readLocal("sstr_vales_historico_reg", []);
    const unifiedVales = combineValesWithDynamic(localVales);
    setVales(unifiedVales);

    setProducts(readLocal("sstr_products_database", getProductsDatabase()));
  }, [readLocal]);

  useEffect(() => {
    // Initial local hydration
    hydrateFromLocalStorage();

    // Start background Firestore sync promises
    const { fastSyncPromise, heavySyncPromise } = initializeSync();

    fastSyncPromise.then(() => {
      setIsInitialLoading(false);
      hydrateFromLocalStorage();
    }).catch(err => {
      console.warn("[CONTEXT] Fast sync fallback:", err);
      setIsInitialLoading(false);
    });

    heavySyncPromise.then(() => {
      setIsHeavyLoading(false);
      hydrateFromLocalStorage();
    }).catch(err => {
      console.warn("[CONTEXT] Heavy sync fallback:", err);
      setIsHeavyLoading(false);
    });

    // Central listener for storage events
    const handleStorageEvent = () => {
      hydrateFromLocalStorage();
    };

    window.addEventListener("storage", handleStorageEvent);
    return () => {
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [hydrateFromLocalStorage]);

  // Granular Actions (Task 4)
  const savePendingRequest = async (req: PendingRequest) => {
    setPendingRequests(prev => {
      const idx = prev.findIndex(r => r.id === req.id);
      let updated: PendingRequest[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = req;
      } else {
        updated = [req, ...prev];
      }
      safeSetItem("sstr_representative_pending_requests", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("pendingRequests", req.id, req);
  };

  const deletePendingRequest = async (requestId: string) => {
    setPendingRequests(prev => {
      const updated = prev.filter(r => r.id !== requestId);
      safeSetItem("sstr_representative_pending_requests", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("pendingRequests", requestId);
  };

  const saveValeEntry = async (vale: ValeEntry) => {
    setVales(prev => {
      const idx = prev.findIndex(v => v.id === vale.id);
      let updated: ValeEntry[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = vale;
      } else {
        updated = [vale, ...prev];
      }
      safeSetItem("sstr_vales_historico_reg", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("vales", vale.id, vale);
  };

  const deleteValeEntry = async (valeId: string) => {
    setVales(prev => {
      const updated = prev.filter(v => v.id !== valeId);
      safeSetItem("sstr_vales_historico_reg", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("vales", valeId);
  };

  const saveManager = async (manager: any) => {
    const rawUser = manager.username || manager.id;
    const key = normalizeManagerUsername(rawUser);
    const normalizedManager = { ...manager, username: key };
    setManagers(prev => {
      const updated = [...prev.filter(m => normalizeManagerUsername(m.username || m.id) !== key), normalizedManager];
      safeSetItem("sstr_registered_managers", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("managers", key, normalizedManager);
  };

  const deleteManager = async (username: string) => {
    const key = normalizeManagerUsername(username);
    setManagers(prev => {
      const updated = prev.filter(m => normalizeManagerUsername(m.username || m.id) !== key);
      safeSetItem("sstr_registered_managers", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("managers", key);
  };

  const saveCrewMember = async (crew: CrewMember) => {
    const key = crew.cpf || (crew as any).id || crew.nome;
    setCrewList(prev => {
      const updated = [...prev.filter(c => (c.cpf || (c as any).id || c.nome) !== key), crew];
      safeSetItem("sstr_lista_crew", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("crewList", key, crew);
  };

  const deleteCrewMember = async (id: string) => {
    setCrewList(prev => {
      const updated = prev.filter(c => (c.cpf || (c as any).id || c.nome) !== id);
      safeSetItem("sstr_lista_crew", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("crewList", id);
  };

  const saveRepsSetor = async (key: string, data: any) => {
    setRepsList(prev => {
      const updated = { ...prev, [key]: data };
      safeSetItem("sstr_reps_setor", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("repsSetor", key, data);
  };

  const deleteRepsSetor = async (key: string) => {
    setRepsList(prev => {
      const updated = { ...prev };
      delete updated[key];
      safeSetItem("sstr_reps_setor", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("repsSetor", key);
  };

  const saveMotoristaRota = async (key: string, data: any) => {
    setMotoristasList(prev => {
      const updated = { ...prev, [key]: data };
      safeSetItem("sstr_motoristas_rotas", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("motoristasRotas", key, data);
  };

  const deleteMotoristaRota = async (key: string) => {
    setMotoristasList(prev => {
      const updated = { ...prev };
      delete updated[key];
      safeSetItem("sstr_motoristas_rotas", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("motoristasRotas", key);
  };

  const saveProductsList = async (newList: ProductInfo[]) => {
    const prevList = products;
    setProductsCache(newList);
    setProducts(newList);
    safeSetItem("sstr_products_database", JSON.stringify(newList));
    // Save to Firestore in background using batched syncArrayToFirestore
    try {
      await syncArrayToFirestore("products", prevList, newList);
    } catch (e) {
      console.warn("[CONTEXT] Firestore product batch sync warning:", e);
    }
  };

  const saveRecordsAndBatches = async (newRecords: ExchangeRecord[], newBatches: ImportBatch[], mode: "append" | "overwrite" = "append") => {
    let finalRecs: ExchangeRecord[] = [];
    let finalBatches: ImportBatch[] = [];

    if (mode === "overwrite") {
      finalRecs = newRecords;
      finalBatches = newBatches;
    } else {
      finalRecs = [...records, ...newRecords];
      finalBatches = [...batches, ...newBatches];
    }

    setRecords(finalRecs);
    setBatches(finalBatches);

    safeSetItem("sstr_cached_records_v1", JSON.stringify(finalRecs));
    safeSetItem("sstr_cached_batches_v1", JSON.stringify(finalBatches));

    // Replicate imported records and batches to Firestore for instant multi-device replication
    try {
      await syncExchangeRecordsConsolidated(finalRecs);
      await syncArrayToFirestore("batches", mode === "overwrite" ? [] : batches, finalBatches);
    } catch (err) {
      console.warn("[CONTEXT-SAVE] Firestore sync queued for offline retry:", err);
    }
  };

  const refreshData = () => {
    hydrateFromLocalStorage();
  };

  return (
    <SstrDataContext.Provider
      value={{
        pendingRequests,
        records,
        batches,
        managers,
        crewList,
        repsList,
        motoristasList,
        vales,
        products,
        shiftMode,
        setShiftMode,
        isInitialLoading,
        isHeavyLoading,
        savePendingRequest,
        deletePendingRequest,
        saveValeEntry,
        deleteValeEntry,
        saveManager,
        deleteManager,
        saveCrewMember,
        deleteCrewMember,
        saveRepsSetor,
        deleteRepsSetor,
        saveMotoristaRota,
        deleteMotoristaRota,
        saveProductsList,
        saveRecordsAndBatches,
        refreshData
      }}
    >
      {children}
    </SstrDataContext.Provider>
  );
};

export const useSstrData = (): SstrDataContextType => {
  const context = useContext(SstrDataContext);
  if (!context) {
    throw new Error("useSstrData must be used within an SstrDataProvider");
  }
  return context;
};
