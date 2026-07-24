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
  initializeSync 
} from "../utils/apiSync";
import { onSnapshot, collection, getDocs, query, limit } from "firebase/firestore";
import { extractImagesToIDB, restoreImagesFromCache } from "../utils/indexedDbCache";
import { getProductsDatabase, ProductInfo } from "../data/products";

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
    setPendingRequests(readLocal("sstr_representative_pending_requests", []));
    setRecords(readLocal("sstr_cached_records_v1", []));
    setBatches(readLocal("sstr_cached_batches_v1", []));
    setManagers(readLocal("sstr_registered_managers", [
      { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
      { username: "admin", password: "admin", name: "Administrador" }
    ]));
    setCrewList(readLocal("sstr_lista_crew", DEFAULT_LISTA_CREW));
    setRepsList(readLocal("sstr_reps_setor", DEFAULT_REPRESENTATIVOS_SETOR));
    setMotoristasList(readLocal("sstr_motoristas_rotas", DEFAULT_MOTORISTAS_ROTAS));
    setVales(readLocal("sstr_vales_historico_reg", []));
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

  // Real-time listener for Pending Requests (Task 2 & 3: real-time streaming where essential)
  useEffect(() => {
    const colRef = collection(firestoreDb, "pendingRequests");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items: PendingRequest[] = snapshot.docs.map(doc => doc.data() as PendingRequest);
      
      // Auto cleanup > 30 days & old base64 images without triggering remote sync loop
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const autoPurgeImgMs = 2 * 24 * 60 * 60 * 1000;

      let freshList = items.filter(req => {
        if (!req.timestamp) return true;
        return (now - req.timestamp) <= thirtyDaysMs;
      });

      freshList = freshList.map(req => {
        const isProcessed = req.statusPromax === "cadastrado" || req.statusPromax === "reprovado";
        if (isProcessed && req.timestamp && (now - req.timestamp) > autoPurgeImgMs && req.fotoUrl && req.fotoUrl.startsWith("data:image")) {
          return { ...req, fotoUrl: "imagem_purgada" };
        }
        return req;
      });

      freshList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      setPendingRequests(freshList);
      safeSetItem("sstr_representative_pending_requests", JSON.stringify(freshList));
    }, (err) => {
      console.warn("[CONTEXT-PENDING-LISTENER] Error subscribing to pendingRequests:", err);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for Vales (Task 2 & 3)
  useEffect(() => {
    const colRef = collection(firestoreDb, "vales");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items: ValeEntry[] = snapshot.docs.map(doc => doc.data() as ValeEntry);
      items.sort((a, b) => (b.requestId || "").localeCompare(a.requestId || ""));
      setVales(items);
      safeSetItem("sstr_vales_historico_reg", JSON.stringify(items));
    }, (err) => {
      console.warn("[CONTEXT-VALES-LISTENER] Error subscribing to vales:", err);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for Managers (Task 2 & 3)
  useEffect(() => {
    const colRef = collection(firestoreDb, "managers");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data());
      if (items.length > 0) {
        setManagers(items);
        safeSetItem("sstr_registered_managers", JSON.stringify(items));
      }
    }, (err) => {
      console.warn("[CONTEXT-MANAGERS-LISTENER] Error subscribing to managers:", err);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for Crew List (Task 2 & 3)
  useEffect(() => {
    const colRef = collection(firestoreDb, "crewList");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map(doc => doc.data() as CrewMember);
      if (items.length > 0) {
        setCrewList(items);
        safeSetItem("sstr_lista_crew", JSON.stringify(items));
      }
    }, (err) => {
      console.warn("[CONTEXT-CREW-LISTENER] Error subscribing to crewList:", err);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for Reps Setor
  useEffect(() => {
    const colRef = collection(firestoreDb, "repsSetor");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const obj: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        obj[doc.id] = doc.data();
      });
      if (Object.keys(obj).length > 0) {
        setRepsList(obj);
        safeSetItem("sstr_reps_setor", JSON.stringify(obj));
      }
    }, (err) => {
      console.warn("[CONTEXT-REPS-LISTENER] Error subscribing to repsSetor:", err);
    });

    return () => unsubscribe();
  }, []);

  // Real-time listener for Motoristas Rotas
  useEffect(() => {
    const colRef = collection(firestoreDb, "motoristasRotas");
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const obj: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        obj[doc.id] = doc.data();
      });
      if (Object.keys(obj).length > 0) {
        setMotoristasList(obj);
        safeSetItem("sstr_motoristas_rotas", JSON.stringify(obj));
      }
    }, (err) => {
      console.warn("[CONTEXT-DRIVERS-LISTENER] Error subscribing to motoristasRotas:", err);
    });

    return () => unsubscribe();
  }, []);

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
    const key = manager.username || manager.id;
    setManagers(prev => {
      const updated = [...prev.filter(m => (m.username || m.id) !== key), manager];
      safeSetItem("sstr_registered_managers", JSON.stringify(updated));
      return updated;
    });
    await setFirestoreDoc("managers", key, manager);
  };

  const deleteManager = async (username: string) => {
    setManagers(prev => {
      const updated = prev.filter(m => (m.username || m.id) !== username);
      safeSetItem("sstr_registered_managers", JSON.stringify(updated));
      return updated;
    });
    await deleteFirestoreDoc("managers", username);
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
    setProducts(newList);
    safeSetItem("sstr_products_database", JSON.stringify(newList));
    // Save to Firestore in chunks if needed
    for (const prod of newList) {
      if (prod.codigo) {
        await setFirestoreDoc("products", prod.codigo, prod);
      }
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

    localStorage.setItem("sstr_cached_records_v1", JSON.stringify(finalRecs));
    localStorage.setItem("sstr_cached_batches_v1", JSON.stringify(finalBatches));
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
