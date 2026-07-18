import React, { useState, useEffect, useMemo, useRef } from "react";
import { PendingRequest, REPRESENTATIVOS_SETOR, ExchangeRecord, RequestItem, MOTORISTAS_ROTAS, LISTA_CREW, getCrewDetailByName, getRepresentativosSetor, clearRepresentativosCache } from "../types";
import { PRODUCT_DATABASE } from "../data/products";
import { getPdvDatabase } from "../data/pdvData";
import ValesHistoryDashboard from "./ValesHistoryDashboard";
import { 
  Clock, 
  Search, 
  MapPin, 
  User, 
  FileText, 
  CheckCircle2, 
  X, 
  Upload,
  AlertCircle, 
  CheckSquare, 
  Eye, 
  Camera, 
  Trash2,
  ListFilter,
  Layers,
  ArrowRight,
  XCircle,
  Calendar,
  Printer,
  ChevronRight,
  Users,
  AlertTriangle,
  FileSpreadsheet,
  Signature,
  TrendingUp,
  PlusCircle,
  Plus,
  Copy
} from "lucide-react";

// Helper function to extract or parse request date safely for range filtering
const getReqDate = (req: PendingRequest): Date | null => {
  if (req.timestamp) {
    return new Date(req.timestamp);
  }
  if (req.data) {
    // req.data is typically "21/06/2026 às 13:43" or similar
    const match = req.data.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      return new Date(year, month, day);
    }
  }
  return null;
};

// Helper to determine if a request contains a shortage ("Falta") or an inversion ("Inversão")
const isFaltaOrInversao = (req: PendingRequest): boolean => {
  const checkMotive = (motive: string): boolean => {
    const m = (motive || "").toLowerCase().trim();
    // Inversões and Swaps are always included
    if (m.includes("invers") || m.includes("inversão") || m.includes("swap") || m.includes("troca de sku")) return true;
    // Falta de SKU Completo is always included
    if (m.includes("completo") || m.includes("sku completo") || m.includes("falta de sku completo")) return true;
    // Shortage checks: must contain "falta" or "sku completo" but must NOT contain "falta no sku" or "falta no"
    if (m.includes("falta")) {
      return !m.includes("falta no sku");
    }
    return false;
  };

  const isMain = checkMotive(req.motivo || "");
  
  const hasSub = req.items && req.items.some(item => {
    const isItemSwap = !!item.produtoAhEnviar || !!item.produtoARecolher;
    return checkMotive(item.motivo || "") || isItemSwap;
  });
  
  return isMain || !!hasSub;
};

// Helper to check if request is an inversion / swap request
const isSwapRequest = (req: PendingRequest): boolean => {
  const m = (req.motivo || "").toLowerCase().trim();
  if (m.includes("invers") || m.includes("swap") || m.includes("troca de sku")) return true;
  if (req.items && req.items.some(item => {
    const itemMotive = (item.motivo || "").toLowerCase();
    const isItemSwap = !!item.produtoAhEnviar || !!item.produtoARecolher;
    return isItemSwap || itemMotive.includes("invers") || itemMotive.includes("swap") || itemMotive.includes("troca de sku");
  })) {
    return true;
  }
  return false;
};

// Pricing helper to determine standard request pricing based on product database
const getRequestValue = (req: PendingRequest, promaxRecords: ExchangeRecord[]): number => {
  if (req.items && req.items.length > 0) {
    return req.items.reduce((sum, current) => {
      const itemUnitPrice = promaxRecords.find(r => r.produto === current.item)?.valorUnitario || 98.50;
      return sum + (itemUnitPrice * current.quantidade);
    }, 0);
  }
  if (req.item) {
    const itemUnitPrice = promaxRecords.find(r => r.produto === req.item)?.valorUnitario || 98.50;
    return itemUnitPrice * (req.quantidade || 1);
  }
  return 0;
};

// Smart client detail resolver utilizing both custom PDV database and promax historical cache
const getClientDetails = (
  nb: string | undefined,
  pdvDb: Record<string, any>,
  promaxRecords: ExchangeRecord[]
) => {
  const cleanNb = (nb || "").trim();
  if (!cleanNb) {
    return {
      razaoSocial: "CLIENTE PARCEIRO DE DISTRIBUIÇÃO",
      nomeFantasia: "CLIENTE PARCEIRO DE DISTRIBUIÇÃO",
      municipio: "",
      uf: "PB",
      documento: "",
      endereco: "",
      complemento: "",
      bairro: "",
      cep: ""
    };
  }

  // 1. Direct match in local PDV database
  let clientInfo = pdvDb[cleanNb];

  // 2. Normalize leading zeros / key integer matching
  if (!clientInfo) {
    const nbAsNum = parseInt(cleanNb, 10);
    if (!isNaN(nbAsNum)) {
      const foundKey = Object.keys(pdvDb).find(k => parseInt(k, 10) === nbAsNum);
      if (foundKey) {
        clientInfo = pdvDb[foundKey];
      }
    }
  }

  // 3. Match from promaxRecords history
  if (!clientInfo) {
    const matchingRecord = promaxRecords.find(r => {
      const recCd = (r.codigoCliente || "").trim();
      if (recCd === cleanNb) return true;
      const recAsNum = parseInt(recCd, 10);
      const nbAsNum = parseInt(cleanNb, 10);
      return !isNaN(recAsNum) && !isNaN(nbAsNum) && recAsNum === nbAsNum;
    });

    if (matchingRecord) {
      return {
        razaoSocial: matchingRecord.nomeCliente || `CLIENTE PARCEIRO DE DISTRIBUIÇÃO (#${cleanNb})`,
        nomeFantasia: matchingRecord.nomeCliente || `CLIENTE PARCEIRO DE DISTRIBUIÇÃO (#${cleanNb})`,
        municipio: "",
        uf: "PB",
        documento: "",
        endereco: "",
        complemento: "",
        bairro: "",
        cep: ""
      };
    }
  }

  // 4. Return formatted data if found in database
  if (clientInfo) {
    return {
      razaoSocial: clientInfo.razaoSocial,
      nomeFantasia: clientInfo.nomeFantasia,
      municipio: clientInfo.municipio || "",
      uf: clientInfo.uf || "PB",
      documento: clientInfo.documento || "",
      endereco: clientInfo.endereco || "",
      complemento: clientInfo.complemento || "",
      bairro: clientInfo.bairro || "",
      cep: clientInfo.cep || ""
    };
  }

  // 5. Final fallback
  return {
    razaoSocial: `CLIENTE PARCEIRO DE DISTRIBUIÇÃO (#${cleanNb})`,
    nomeFantasia: `CLIENTE PARCEIRO DE DISTRIBUIÇÃO (#${cleanNb})`,
    municipio: "",
    uf: "PB",
    documento: "",
    endereco: "",
    complemento: "",
    bairro: "",
    cep: ""
  };
};

// Formatting helper
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val);
};

export default function PendingRequestsTab() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const compilingPdfRef = useRef<Set<string>>(new Set());

  // Client-side triggers for compiling PDFs on demand via server API
  useEffect(() => {
    const compilingSet = compilingPdfRef.current;
    
    // Find requests that are concluded and need a compiled PDF
    const pendingCompilations = requests.filter(req => {
      const isConcluded = req.statusPromax === "cadastrado" || req.faltaBaixa === true;
      const hasImage = req.fotoUrl && typeof req.fotoUrl === "string";
      const isAlreadyPdf = hasImage && (req.fotoUrl.endsWith(".pdf") || req.fotoUrl.includes("pdf_finalizada_"));
      return isConcluded && hasImage && !isAlreadyPdf && !compilingSet.has(req.id);
    });

    if (pendingCompilations.length === 0) return;

    // Process each compilation
    pendingCompilations.forEach(async (req) => {
      const requestId = req.id;
      compilingSet.add(requestId);
      console.log(`[CLIENT-PDF] Triggering PDF compile for ${requestId}...`);

      try {
        const res = await fetch("/api/compile-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, docData: req })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.url) {
            console.log(`[CLIENT-PDF] PDF compiled successfully for ${requestId}: ${data.url}`);
            
            // Update the requests list with the new PDF URL
            setRequests(prev => {
              const updated = prev.map(item => {
                if (item.id === requestId) {
                  return { ...item, fotoUrl: data.url };
                }
                return item;
              });
              localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
              return updated;
            });
          } else {
            console.warn(`[CLIENT-PDF] Compile failed for ${requestId}:`, data.error || "unknown error");
          }
        } else {
          console.warn(`[CLIENT-PDF] Server responded with error status ${res.status} for ${requestId}`);
        }
      } catch (err: any) {
        console.error(`[CLIENT-PDF] Error requesting PDF compile for ${requestId}:`, err.message);
      } finally {
        compilingSet.delete(requestId);
      }
    });
  }, [requests]);

  const [repsList, setRepsList] = useState(() => getRepresentativosSetor());
  const [promaxRecords, setPromaxRecords] = useState<ExchangeRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"pendente" | "cadastrado" | "reprovado" | "faltas_inversoes" | "historico_baixas" | "historico_vales" | "espelho">("pendente");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sectorFilter, setSectorFilter] = useState<string>("todos");
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

  // Espelho de Reposições state variables
  const [searchEspelho, setSearchEspelho] = useState("");
  const [filterEspelhoDate, setFilterEspelhoDate] = useState(() => {
    return new Date().toLocaleDateString("pt-BR");
  });
  const [isPrintingEspelho, setIsPrintingEspelho] = useState(false);

  // Faltas & Inversões specific filters
  const [lackFilterStatus, setLackFilterStatus] = useState<"todos" | "abertos" | "baixados">("abertos");
  const [lackFilterErrorType, setLackFilterErrorType] = useState<"todos" | "carregamento" | "entrega" | "indefinido">("todos");

  // States for physical settlement ("Dar Baixa" with signed receipt attachment)
  const [baixandoFalta, setBaixandoFalta] = useState<PendingRequest | null>(null);
  const [baixaReciboFile, setBaixaReciboFile] = useState<{ name: string; type: string; dataUrl: string } | null>(null);
  const [baixaObservacao, setBaixaObservacao] = useState("");
  const [baixaError, setBaixaError] = useState("");
  const [concludedBaixa, setConcludedBaixa] = useState<any | null>(null);

  // States for physical delivery reminders (Exactly 1 day before delivery date)
  const [showReminderPopup, setShowReminderPopup] = useState(false);
  const [dismissedReminderToday, setDismissedReminderToday] = useState(false);

  // States for interactive actions
  const [modalAction, setModalAction] = useState<{
    type: "register" | "reject" | "corrigir" | "delete";
    requestId: string;
  } | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [modalError, setModalError] = useState("");

  // Edit shortage/inversion details states
  const [editingFalta, setEditingFalta] = useState<PendingRequest | null>(null);
  const [editFaltaErrorType, setEditFaltaErrorType] = useState<"carregamento" | "entrega" | "">("");
  const [editFaltaMotorista, setEditFaltaMotorista] = useState("");
  const [editFaltaMotoristaCpf, setEditFaltaMotoristaCpf] = useState("");
  const [editFaltaAjudantes, setEditFaltaAjudantes] = useState("");
  const [editFaltaAjudante1, setEditFaltaAjudante1] = useState("");
  const [editFaltaAjudante1Cpf, setEditFaltaAjudante1Cpf] = useState("");
  const [editFaltaAjudante2, setEditFaltaAjudante2] = useState("");
  const [editFaltaAjudante2Cpf, setEditFaltaAjudante2Cpf] = useState("");
  const [editFaltaDataAnomalia, setEditFaltaDataAnomalia] = useState("");
  const [editFaltaDataEntrega, setEditFaltaDataEntrega] = useState("");
  const [editFaltaObservacao, setEditFaltaObservacao] = useState("");
  const [editFaltaCidade, setEditFaltaCidade] = useState("");

  // Document print state
  const [selectedPrintDoc, setSelectedPrintDoc] = useState<{
    type: "recibo" | "vale";
    request: PendingRequest;
  } | null>(null);
  const [customPrintCidade, setCustomPrintCidade] = useState("");
  const [customPrintNome, setCustomPrintNome] = useState("");
  const [customPrintDocumento, setCustomPrintDocumento] = useState("");
  const [customPrintEndereco, setCustomPrintEndereco] = useState("");

  useEffect(() => {
    if (selectedPrintDoc) {
      const cast = selectedPrintDoc.request as any;
      const pdvDb = getPdvDatabase();
      const clientInfo = getClientDetails(selectedPrintDoc.request.nb, pdvDb, promaxRecords);
      setCustomPrintCidade(cast.municipioRecibo || clientInfo.municipio || "");
      setCustomPrintNome(cast.nomeRecibo || clientInfo.razaoSocial || "");
      setCustomPrintDocumento(cast.documentoRecibo || clientInfo.documento || "");
      setCustomPrintEndereco(cast.enderecoRecibo || clientInfo.endereco || "");
    } else {
      setCustomPrintCidade("");
      setCustomPrintNome("");
      setCustomPrintDocumento("");
      setCustomPrintEndereco("");
    }
  }, [selectedPrintDoc, promaxRecords]);

  const handleUpdatePrintCidade = (newCity: string) => {
    setCustomPrintCidade(newCity);
    if (selectedPrintDoc) {
      const updated = requests.map(r => {
        if (r.id === selectedPrintDoc.request.id) {
          return {
            ...r,
            municipioRecibo: newCity || undefined,
          };
        }
        return r;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);

      setSelectedPrintDoc(prev => {
        if (!prev) return null;
        return {
          ...prev,
          request: {
            ...prev.request,
            municipioRecibo: newCity || undefined,
          }
        };
      });
    }
  };

  const handleUpdatePrintNome = (newName: string) => {
    setCustomPrintNome(newName);
    if (selectedPrintDoc) {
      const updated = requests.map(r => {
        if (r.id === selectedPrintDoc.request.id) {
          return {
            ...r,
            nomeRecibo: newName || undefined,
          };
        }
        return r;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);

      setSelectedPrintDoc(prev => {
        if (!prev) return null;
        return {
          ...prev,
          request: {
            ...prev.request,
            nomeRecibo: newName || undefined,
          }
        };
      });
    }
  };

  const handleUpdatePrintDocumento = (newDoc: string) => {
    setCustomPrintDocumento(newDoc);
    if (selectedPrintDoc) {
      const updated = requests.map(r => {
        if (r.id === selectedPrintDoc.request.id) {
          return {
            ...r,
            documentoRecibo: newDoc || undefined,
          };
        }
        return r;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);

      setSelectedPrintDoc(prev => {
        if (!prev) return null;
        return {
          ...prev,
          request: {
            ...prev.request,
            documentoRecibo: newDoc || undefined,
          }
        };
      });
    }
  };

  const handleUpdatePrintEndereco = (newEnd: string) => {
    setCustomPrintEndereco(newEnd);
    if (selectedPrintDoc) {
      const updated = requests.map(r => {
        if (r.id === selectedPrintDoc.request.id) {
          return {
            ...r,
            enderecoRecibo: newEnd || undefined,
          };
        }
        return r;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);

      setSelectedPrintDoc(prev => {
        if (!prev) return null;
        return {
          ...prev,
          request: {
            ...prev.request,
            enderecoRecibo: newEnd || undefined,
          }
        };
      });
    }
  };

  // Vales historical records state and handlers (User request)
  const [valesHistorico, setValesHistorico] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("sstr_vales_historico_reg");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Delete a single voucher from historical log
  const handleDeleteSingleVale = (id: string) => {
    const updated = valesHistorico.filter(v => v.id !== id);
    setValesHistorico(updated);
    localStorage.setItem("sstr_vales_historico_reg", JSON.stringify(updated));
  };

  // Request creation states (modo supervisor / gestor)
  const [reqSetor, setReqSetor] = useState("");
  const [reqMotorista, setReqMotorista] = useState("");
  const [reqAjudante1, setReqAjudante1] = useState("");
  const [reqAjudante2, setReqAjudante2] = useState("");
  const [reqNf, setReqNf] = useState("");
  const [reqNb, setReqNb] = useState("");
  const [reqMapa, setReqMapa] = useState("");
  const [reqMotiveType, setReqMotiveType] = useState<string>("Produto Avariado");
  const [reqMotiveText, setReqMotiveText] = useState("");
  const [reqFotoUrl, setReqFotoUrl] = useState("");
  const [reqObservacao, setReqObservacao] = useState("");
  
  // Single item entry states
  const [reqItem, setReqItem] = useState("");
  const [reqQuantidade, setReqQuantidade] = useState("");
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);

  // Inversion fields
  const [reqInversaoIr, setReqInversaoIr] = useState("");
  const [reqInversaoRecolher, setReqInversaoRecolher] = useState("");
  const [reqInversaoIrQtd, setReqInversaoIrQtd] = useState("");
  const [reqInversaoRecolherQtd, setReqInversaoRecolherQtd] = useState("");
  const [showIrSuggestions, setShowIrSuggestions] = useState(false);
  const [showRecolherSuggestions, setShowRecolherSuggestions] = useState(false);

  // Draft items list
  const [reqDraftItems, setReqDraftItems] = useState<any[]>([]);

  // Creation notification states
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Auto-pull Sector / Setor de Venda based on NB from promaxRecords and requests history
  const sectorLoadingInfo = useMemo(() => {
    const cleanNb = reqNb.trim();
    if (!cleanNb) return null;

    // Try to find the sector in promaxRecords
    let foundSector = "";
    const foundPromax = promaxRecords.find(r => {
      const recCd = (r.codigoCliente || "").trim();
      if (recCd === cleanNb) return true;
      const recAsNum = parseInt(recCd, 10);
      const nbAsNum = parseInt(cleanNb, 10);
      return !isNaN(recAsNum) && !isNaN(nbAsNum) && recAsNum === nbAsNum;
    });

    if (foundPromax && foundPromax.setorVenda) {
      foundSector = foundPromax.setorVenda;
    } else {
      // Fallback: check in current requests list
      const foundReq = requests.find(r => {
        const reqCd = (r.nb || "").trim();
        if (reqCd === cleanNb) return true;
        const reqAsNum = parseInt(reqCd, 10);
        const nbAsNum = parseInt(cleanNb, 10);
        return !isNaN(reqAsNum) && !isNaN(nbAsNum) && reqAsNum === nbAsNum;
      });
      if (foundReq && foundReq.setor) {
        foundSector = foundReq.setor;
      }
    }

    // Check if client is registered in PDV database
    const db = getPdvDatabase();
    let client = db[cleanNb];
    if (!client) {
      const nbAsNum = parseInt(cleanNb, 10);
      if (!isNaN(nbAsNum)) {
        const foundKey = Object.keys(db).find(k => parseInt(k, 10) === nbAsNum);
        if (foundKey) {
          client = db[foundKey];
        }
      }
    }

    return {
      foundSector,
      isRegistered: !!client,
      clientName: client ? client.nomeFantasia : null
    };
  }, [reqNb, promaxRecords, requests]);

  // Apply auto-pulled sector automatically
  useEffect(() => {
    if (sectorLoadingInfo && sectorLoadingInfo.foundSector) {
      setReqSetor(sectorLoadingInfo.foundSector);
    }
  }, [sectorLoadingInfo]);

  // Reps array mapped from REPRESENTATIVOS_SETOR
  const repsArray = useMemo(() => {
    return Object.keys(repsList).map(key => ({
      setor: key,
      ...repsList[key]
    })).sort((a, b) => a.setor.localeCompare(b.setor));
  }, [repsList]);

  // Filtered lists for suggestions inside Manager Request form
  const itemSuggestions = React.useMemo(() => {
    const q = reqItem.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqItem]);

  const irSuggestions = React.useMemo(() => {
    const q = reqInversaoIr.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqInversaoIr]);

  const recolherSuggestions = React.useMemo(() => {
    const q = reqInversaoRecolher.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqInversaoRecolher]);

  const handleAddReqDraftItem = () => {
    setCreateError(null);
    if (reqMotiveType === "Inversão") {
      if (!reqInversaoIr.trim() || !reqInversaoRecolher.trim()) {
        setCreateError("Especifique o Produto que deve ir e o Produto que deve ser recolhido para Inversão.");
        return;
      }
      const qty = parseInt(reqQuantidade) || 1;
      const irQtd = parseInt(reqInversaoIrQtd) || qty;
      const recolherQtd = parseInt(reqInversaoRecolherQtd) || qty;

      // try to locate code
      const prodCode = reqItem.trim() || "INVERSÃO";
      const productDef = PRODUCT_DATABASE.find(p => p.codigo === prodCode);
      const factor = productDef?.fatorHecto || 0;
      const calculatedHl = Number((qty * factor).toFixed(4));

      const newItem = {
        id: `req_draft_${Date.now()}_${Math.random()}`,
        itemCode: prodCode,
        itemDesc: productDef ? productDef.descricao : `Inversão: ${reqInversaoIr.trim()} 🔄 ${reqInversaoRecolher.trim()}`,
        quantidade: qty,
        motivo: "Inversão",
        fatorHecto: factor,
        hectolitros: calculatedHl,
        produtoAhEnviar: `${reqInversaoIr.trim()} (Qtd: ${irQtd} un)`,
        produtoARecolher: `${reqInversaoRecolher.trim()} (Qtd: ${recolherQtd} un)`
      };

      setReqDraftItems([...reqDraftItems, newItem]);
      
      // Clear item fields
      setReqInversaoIr("");
      setReqInversaoRecolher("");
      setReqInversaoIrQtd("");
      setReqInversaoRecolherQtd("");
      setReqItem("");
      setReqQuantidade("");
    } else {
      if (!reqItem.trim()) {
        setCreateError("Por favor, digite ou selecione um código SKU de produto.");
        return;
      }
      const qty = parseInt(reqQuantidade);
      if (isNaN(qty) || qty <= 0) {
        setCreateError("A quantidade deve ser maior do que zero.");
        return;
      }

      const productDef = PRODUCT_DATABASE.find(p => p.codigo === reqItem.trim());
      if (!productDef) {
        setCreateError(`Produto com código "${reqItem.trim()}" não encontrado.`);
        return;
      }

      const factor = productDef.fatorHecto || 0.0800;
      const calculatedHl = Number((qty * factor).toFixed(4));

      let finalMotive = reqMotiveType;
      if (reqMotiveType === "Falta de SKU Completo") {
        finalMotive = reqMotiveText.trim() ? `Falta de SKU Completo - ${reqMotiveText.trim()}` : "Falta de SKU Completo";
      } else if (reqMotiveType === "Falta no SKU") {
        finalMotive = reqMotiveText.trim() ? `Falta no SKU - ${reqMotiveText.trim()}` : "Falta no SKU";
      } else if (reqMotiveType === "Outros") {
        finalMotive = reqMotiveText.trim() || "Outros";
      } else {
        finalMotive = reqMotiveText.trim() ? `${reqMotiveType} - ${reqMotiveText.trim()}` : reqMotiveType;
      }

      const newItem = {
        id: `req_draft_${Date.now()}_${Math.random()}`,
        itemCode: productDef.codigo,
        itemDesc: productDef.descricao,
        quantidade: qty,
        motivo: finalMotive,
        fatorHecto: factor,
        hectolitros: calculatedHl
      };

      setReqDraftItems([...reqDraftItems, newItem]);
      
      // Clear fields
      setReqItem("");
      setReqQuantidade("");
    }
  };

  const handleRemoveReqDraftItem = (id: string) => {
    setReqDraftItems(reqDraftItems.filter(item => item.id !== id));
  };

  const handleCreateRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    if (!reqSetor) {
      setCreateError("Selecione o Setor / RN para o qual deseja criar a solicitação.");
      return;
    }

    // NF validation is optional as requested
    const finalNf = reqNf.trim() || "NÃO CONSTA";

    const isFaltaSkuCompleto = reqMotiveType === "Falta de SKU Completo";
    if (!reqFotoUrl && !isFaltaSkuCompleto) {
      setCreateError("É obrigatório tirar foto ou anexar comprovante, exceto para solicitações de Falta de SKU Completo.");
      return;
    }

    // Check if Map is empty when Lack/Inversion, NB is optional
    const isLackOrInversion = reqMotiveType === "Inversão" || reqMotiveType.includes("Falta");
    if (isLackOrInversion) {
      if (!reqMapa.trim()) {
        setCreateError("O número do Mapa de Carga é obrigatório para falta ou inversão.");
        return;
      }
    }

    let finalDrafts = [...reqDraftItems];
    // Auto-add current input if list is empty and user has filled out fields
    if (finalDrafts.length === 0) {
      if (reqMotiveType === "Inversão") {
        if (!reqInversaoIr.trim() || !reqInversaoRecolher.trim()) {
          setCreateError("Sua lista de itens está vazia. Adicione o item à lista ou complete os campos de Inversão.");
          return;
        }
        const qty = parseInt(reqQuantidade) || 1;
        const irQtd = parseInt(reqInversaoIrQtd) || qty;
        const recolherQtd = parseInt(reqInversaoRecolherQtd) || qty;
        const prodCode = reqItem.trim() || "INVERSÃO";
        const productDef = PRODUCT_DATABASE.find(p => p.codigo === prodCode);
        const factor = productDef?.fatorHecto || 0;
        const calculatedHl = Number((qty * factor).toFixed(4));

        finalDrafts.push({
          id: `req_draft_${Date.now()}`,
          itemCode: prodCode,
          itemDesc: productDef ? productDef.descricao : `Inversão: ${reqInversaoIr.trim()} 🔄 ${reqInversaoRecolher.trim()}`,
          quantidade: qty,
          motivo: "Inversão",
          fatorHecto: factor,
          hectolitros: calculatedHl,
          produtoAhEnviar: `${reqInversaoIr.trim()} (Qtd: ${irQtd} un)`,
          produtoARecolher: `${reqInversaoRecolher.trim()} (Qtd: ${recolherQtd} un)`
        });
      } else {
        if (!reqItem.trim() || !reqQuantidade.trim()) {
          setCreateError("Adicione pelo menos um SKU à lista de produtos.");
          return;
        }
        const qty = parseInt(reqQuantidade);
        const productDef = PRODUCT_DATABASE.find(p => p.codigo === reqItem.trim());
        if (!productDef || isNaN(qty) || qty <= 0) {
          setCreateError("O SKU ou quantidade digitados são inválidos. Adicione o item de forma válida.");
          return;
        }
        const factor = productDef.fatorHecto || 0.0800;
        const calculatedHl = Number((qty * factor).toFixed(4));
        let finalMotive = reqMotiveType;
        if (reqMotiveType === "Falta de SKU Completo") {
          finalMotive = reqMotiveText.trim() ? `Falta de SKU Completo - ${reqMotiveText.trim()}` : "Falta de SKU Completo";
        } else if (reqMotiveType === "Falta no SKU") {
          finalMotive = reqMotiveText.trim() ? `Falta no SKU - ${reqMotiveText.trim()}` : "Falta no SKU";
        } else if (reqMotiveType === "Outros") {
          finalMotive = reqMotiveText.trim() || "Outros";
        } else {
          finalMotive = reqMotiveText.trim() ? `${reqMotiveType} - ${reqMotiveText.trim()}` : reqMotiveType;
        }

        finalDrafts.push({
          id: `req_draft_${Date.now()}`,
          itemCode: productDef.codigo,
          itemDesc: productDef.descricao,
          quantidade: qty,
          motivo: finalMotive,
          fatorHecto: factor,
          hectolitros: calculatedHl
        });
      }
    }

    try {
      const now = new Date();
      const dataFormatada = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      const firstItem = finalDrafts[0];
      const totalAccumulatedHl = Number(finalDrafts.reduce((acc, curr) => acc + curr.hectolitros, 0).toFixed(4));

      // Retrieve driver detail
      let driverCpf = "";
      if (reqMotorista) {
        const found = LISTA_CREW.find(c => c.nome === reqMotorista);
        if (found) driverCpf = found.cpf;
      }

      // CLOUD FILE UPLOAD FOR EVIDENCE!!!
      let finalFotoUrl = reqFotoUrl;
      if (reqFotoUrl && reqFotoUrl.startsWith("data:image/")) {
        setUploadingImage(true);
        try {
          const upRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: reqFotoUrl })
          });
          if (upRes.ok) {
            const upData = await upRes.json();
            if (upData.url) {
              finalFotoUrl = upData.url;
            }
          }
        } catch (uploadErr) {
          console.error("Error uploading image evidence to cloud server:", uploadErr);
        } finally {
          setUploadingImage(false);
        }
      }

      const newRequest: PendingRequest = {
        id: `pending_req_${Date.now()}`,
        timestamp: Date.now(),
        data: dataFormatada,
        setor: reqSetor,
        mapa: reqMapa.trim(),
        nb: reqNb.trim() || "000000",
        nf: finalNf,
        fotoUrl: finalFotoUrl || "",
        observacao: reqObservacao.trim(),
        statusPromax: "pendente",
        notified: false,
        cadastroUser: "Gestor (Dashboard)",
        cadastroDate: dataFormatada,
        
        // Shortage fields
        faltaMotorista: reqMotorista || undefined,
        faltaMotoristaCpf: driverCpf || undefined,
        faltaAjudantes: [reqAjudante1, reqAjudante2].filter(Boolean).join(", ") || undefined,
        faltaAjudante1: reqAjudante1 || undefined,
        faltaAjudante2: reqAjudante2 || undefined,
        faltaTipoErro: "entrega",

        // Compat fallbacks
        item: firstItem.itemCode,
        quantidade: finalDrafts.reduce((sum, current) => sum + current.quantidade, 0),
        fatorHecto: firstItem.fatorHecto,
        hectolitros: totalAccumulatedHl,
        motivo: firstItem.motivo,
        
        items: finalDrafts.map(d => ({
          id: d.id,
          item: d.itemCode,
          descricao: d.itemDesc,
          quantidade: d.quantidade,
          motivo: d.motivo,
          fatorHecto: d.fatorHecto,
          hectolitros: d.hectolitros,
          produtoAhEnviar: d.produtoAhEnviar,
          produtoARecolher: d.produtoARecolher
        }))
      };

      const existingReqs = JSON.parse(localStorage.getItem("sstr_representative_pending_requests") || "[]");
      const updatedReqs = [newRequest, ...existingReqs];
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updatedReqs));

      // Trigger local storage event
      window.dispatchEvent(new Event("storage"));

      // Clear all form states
      setReqNf("");
      setReqNb("");
      setReqMapa("");
      setReqObservacao("");
      setReqFotoUrl("");
      setReqDraftItems([]);
      setReqItem("");
      setReqQuantidade("");
      setReqInversaoIr("");
      setReqInversaoRecolher("");
      
      setCreateSuccess(`SUCESSO! Solicitação criada com sucesso para o Setor ${reqSetor} (NF: ${newRequest.nf}). Ela já está disponível no controle para aprovação e armazenada na nuvem.`);
      
      // Auto switch back to pendentes after 2 seconds so they can see their new request!
      setTimeout(() => {
        setActiveTab("pendente");
        setCreateSuccess(null);
      }, 2000);
    } catch (e: any) {
      setCreateError("Erro ao salvar nova solicitação: " + e.message);
    }
  };

  const handleImageCaptureInForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setCreateError("A imagem é muito grande. Escolha uma foto menor (máximo de 10MB) para evitar problemas de memória.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReqFotoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Auto-seed historical Vales tab if empty (User request)
  useEffect(() => {
    const saved = localStorage.getItem("sstr_vales_historico_reg");
    if (!saved || JSON.parse(saved).length === 0) {
      if (requests.length === 0) return;
      
      const seededVales = requests
        .filter(req => {
          const cast = req as any;
          return cast.faltaTipoErro === "entrega";
        })
        .map((req, index) => {
          const cast = req as any;
          const printableItems = req.items && req.items.length > 0 ? req.items : [
            {
              produto: req.produto || req.item || "9999",
              quantidade: req.quantidade || 1,
              hectolitros: req.hectolitros || 0.12,
              um: req.unidadeMedia || req.um || "CX",
              motivo: req.motivo || "Falta de Entrega SSTR"
            }
          ];

          const calculatedValTotal = printableItems.reduce((acc: number, item: any) => {
            const match = promaxRecords.find(r => r.produto === (item.produto || item.itemCode || item.item));
            const price = match?.valorUnitario || 98.50;
            return acc + (price * item.quantidade);
          }, 0);

          return {
            id: `vale_seed_${index}_${req.id}`,
            requestId: req.id,
            nf: req.nf || `10245${index}-2`,
            rota: req.setor || "010",
            dataEmissao: cast.dataEntregaRecibo || new Date().toLocaleDateString("pt-BR"),
            motorista: cast.faltaMotorista || "Carlos Alberto Silva SSTR",
            motoristaCpf: cast.faltaMotoristaCpf || "125.884.254-85",
            ajudantes: cast.faltaAjudantes || "Marcus V., Diego M.",
            ajudante1: cast.faltaAjudante1 || "Marcus Vinicius Ferreira",
            ajudante1Cpf: cast.faltaAjudante1Cpf || "451.228.369-12",
            ajudante2: cast.faltaAjudante2 || "Diego Marques Santana",
            ajudante2Cpf: cast.faltaAjudante2Cpf || "754.125.362-95",
            hectolitros: req.hectolitros || printableItems.reduce((s: any, c: any) => s + (c.hectolitros || 0), 0),
            valorTotal: calculatedValTotal || (280 + (index * 95)),
            itemsCount: printableItems.reduce((s: any, c: any) => s + c.quantidade, 0),
            originalRequest: { ...req, fotoUrl: req.fotoUrl ? "imagem_no_vale_detalhes" : "" }
          };
        });

      if (seededVales.length > 0) {
        setValesHistorico(seededVales);
        localStorage.setItem("sstr_vales_historico_reg", JSON.stringify(seededVales));
      }
    }
  }, [requests, promaxRecords]);

  const handleLogAndPrint = (req: PendingRequest, type: "recibo" | "vale") => {
    let printedWithNewTab = false;
    const printElement = document.getElementById("printable-document-root");
    if (printElement) {
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          // Gather styles
          const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(el => el.outerHTML)
            .join('\n');
          
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>SSTR - Imprimir ${type === "vale" ? "Vale Coletivo" : "Recibo"}</title>
                ${styles}
                <style>
                  body {
                    background-color: white !important;
                    color: black !important;
                    padding: 12px 16px !important;
                    font-size: 10px !important;
                    line-height: 1.25 !important;
                  }
                  #printable-document-root {
                    display: block !important;
                    position: relative !important;
                    box-shadow: none !important;
                    border: none !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    font-size: 10px !important;
                  }
                  h1 { font-size: 13px !important; margin: 2px 0 !important; }
                  h2 { font-size: 14px !important; }
                  p, td, th, div { font-size: 10px !important; line-height: 1.25 !important; }
                  .my-6, .my-4 { margin-top: 4px !important; margin-bottom: 4px !important; }
                  .p-4, .p-8, .p-10 { padding: 6px 10px !important; }
                  .py-3 { padding-top: 3px !important; padding-bottom: 3px !important; }
                  .mb-6 { margin-bottom: 6px !important; }
                  .mb-10 { margin-bottom: 6px !important; }
                  .mt-12 { margin-top: 8px !important; }
                  .pt-8 { padding-top: 4px !important; }
                  .space-y-10 > :not([hidden]) ~ :not([hidden]) { margin-top: 10px !important; }
                  .space-y-6 > :not([hidden]) ~ :not([hidden]) { margin-top: 6px !important; }
                  .space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 4px !important; }
                  .pb-4 { padding-bottom: 4px !important; }
                  table td, table th { padding: 4px 6px !important; }
                </style>
              </head>
              <body class="bg-white text-black">
                <div id="printable-document-root" class="w-full">
                  ${printElement.innerHTML}
                </div>
                <script>
                  window.onload = function() {
                    window.focus();
                    setTimeout(function() {
                      window.print();
                    }, 400);
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
          printedWithNewTab = true;
        }
      } catch (e) {
        console.warn("Could not print in a new tab, falling back to window.print()", e);
      }
    }

    if (!printedWithNewTab) {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn("Iframe blocked print dialog:", e);
      }
    }

    if (type === "vale") {
      // Check if already in history first
      const alreadyExists = valesHistorico.some(v => v.requestId === req.id);
      if (!alreadyExists) {
        const cast = req as any;
        const printableItems = req.items && req.items.length > 0 ? req.items : [
          {
            produto: cast.produto || cast.item || "9999",
            quantidade: cast.quantidade || 1,
            hectolitros: cast.hectolitros || 0.12,
            um: cast.unidadeMedia || cast.um || "CX",
            motivo: cast.motivo || "Falta de Entrega SSTR"
          }
        ];

        const calculatedValTotal = printableItems.reduce((acc: number, item: any) => {
          const match = promaxRecords.find(r => r.produto === (item.produto || item.itemCode || item.item));
          const price = match?.valorUnitario || 98.50;
          return acc + (price * item.quantidade);
        }, 0);

        const newValeEntry = {
          id: `vale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          requestId: req.id,
          nf: req.nf || "N0-NF",
          rota: req.setor || "R00",
          dataEmissao: cast.dataEntregaRecibo || new Date().toLocaleDateString("pt-BR"),
          motorista: cast.faltaMotorista || "Não Declarado",
          motoristaCpf: cast.faltaMotoristaCpf || "",
          ajudantes: cast.faltaAjudantes || "",
          ajudante1: cast.faltaAjudante1 || "",
          ajudante1Cpf: cast.faltaAjudante1Cpf || "",
          ajudante2: cast.faltaAjudante2 || "",
          ajudante2Cpf: cast.ajudante2Cpf || "",
          hectolitros: req.hectolitros || printableItems.reduce((s: any, c: any) => s + (c.hectolitros || 0), 0),
          valorTotal: calculatedValTotal || 150,
          itemsCount: printableItems.reduce((s: any, c: any) => s + c.quantidade, 0),
          originalRequest: { ...req, fotoUrl: req.fotoUrl ? "imagem_no_vale_detalhes" : "" }
        };

        const updated = [newValeEntry, ...valesHistorico];
        setValesHistorico(updated);
        localStorage.setItem("sstr_vales_historico_reg", JSON.stringify(updated));
      }
    }
  };

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Load and sync requests
  const loadRequests = () => {
    const dataJson = localStorage.getItem("sstr_representative_pending_requests");
    if (dataJson) {
      try {
        const rawList = JSON.parse(dataJson) as PendingRequest[];
        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const autoPurgeImgMs = 2 * 24 * 60 * 60 * 1000; // 2 days

        let changedObj = false;

        // Keep only requests made within the last 30 days
        let freshList = rawList.filter(req => {
          const reqDate = getReqDate(req);
          if (!reqDate) return true;
          return (now - reqDate.getTime()) <= thirtyDaysMs;
        });

        if (freshList.length !== rawList.length) {
          changedObj = true;
        }

        // Automatic strip of heavy Base64 image payload for resolved/rejected requests older than 2 days
        freshList = freshList.map(req => {
          const reqDate = getReqDate(req);
          const isProcessed = req.statusPromax === "cadastrado" || req.statusPromax === "reprovado";
          if (isProcessed && reqDate && (now - reqDate.getTime()) > autoPurgeImgMs && req.fotoUrl && req.fotoUrl.startsWith("data:image")) {
            changedObj = true;
            return {
              ...req,
              fotoUrl: "imagem_purgada"
            };
          }
          return req;
        });

        setRequests(freshList);

        if (changedObj) {
          localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(freshList));
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Load official Promax records for budget calculation
  const loadPromaxRecords = () => {
    const cached = localStorage.getItem("sstr_cached_records_v1");
    if (cached) {
      try {
        setPromaxRecords(JSON.parse(cached));
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    loadRequests();
    loadPromaxRecords();
    
    const handleStorage = () => {
      loadRequests();
      loadPromaxRecords();
      clearRepresentativosCache();
      setRepsList(getRepresentativosSetor());
      try {
        const savedVales = localStorage.getItem("sstr_vales_historico_reg");
        if (savedVales) {
          setValesHistorico(JSON.parse(savedVales));
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Memoized tomorrow's reminders (exactly 1 day before delivery date)
  const tomorrowReminders = useMemo(() => {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const parsePtDate = (ptStr?: string): Date | null => {
      if (!ptStr) return null;
      const parts = ptStr.trim().split("/");
      if (parts.length < 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    };

    return requests.filter(req => {
      // Must be a shortage of full SKU or an inversion
      const isFalta = (req.motivo || "").toLowerCase().includes("falta") || 
        (req.motivo || "").toLowerCase().includes("inver") ||
        (req.items && req.items.some(sub => {
          const m = (sub.motivo || "").toLowerCase();
          return m.includes("falta") || m.includes("inver") || !!sub.produtoAhEnviar;
        }));
      
      if (!isFalta) return false;

      // Must not be physical settled yet
      const cast = req as any;
      if (cast.faltaBaixa) return false;

      // Must have a set delivery date
      if (!cast.dataEntregaRecibo) return false;

      const delivDate = parsePtDate(cast.dataEntregaRecibo);
      if (!delivDate) return false;
      delivDate.setHours(0, 0, 0, 0);

      // Diff calculation in days
      const diffTime = delivDate.getTime() - todayMidnight.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays === 1; // 1 day before (Tomorrow!)
    });
  }, [requests]);

  // Approved replacements list Memo (flattened and filtered by date)
  const approvedReplacements = useMemo(() => {
    const approved = requests.filter(r => r.statusPromax === "cadastrado");
    const flattened: any[] = [];
    const db = getPdvDatabase();

    for (const req of approved) {
      const pdv = getClientDetails(req.nb, db, promaxRecords);
      const cast = req as any;
      const displayMunicipio = cast.municipioRecibo || pdv.municipio || "Guarabira";

      const dateOnly = req.cadastroDate ? req.cadastroDate.split(" ")[0] : "";

      if (req.items && req.items.length > 0) {
        for (const item of req.items) {
          flattened.push({
            requestId: req.id,
            cadastroDate: req.cadastroDate || "",
            dateOnly,
            nb: req.nb,
            razaoSocial: pdv.razaoSocial,
            nomeFantasia: pdv.nomeFantasia,
            municipio: displayMunicipio,
            productCode: item.item || item.itemCode,
            productDesc: item.descricao || item.itemDesc || "Produto sem descrição",
            quantidade: item.quantidade,
            solicitante: req.setor,
            nf: req.nf,
            mapa: req.mapa
          });
        }
      } else if (req.item) {
        flattened.push({
          requestId: req.id,
          cadastroDate: req.cadastroDate || "",
          dateOnly,
          nb: req.nb,
          razaoSocial: pdv.razaoSocial,
          nomeFantasia: pdv.nomeFantasia,
          municipio: displayMunicipio,
          productCode: req.item,
          productDesc: req.descricaoProduto || "Produto sem descrição",
          quantidade: req.quantidade || 0,
          solicitante: req.setor,
          nf: req.nf,
          mapa: req.mapa
        });
      }
    }

    return flattened;
  }, [requests, promaxRecords]);

  // Filtered Approved Replacements Memo (based on selected date and search text)
  const espelhoFiltrado = useMemo(() => {
    return approvedReplacements.filter((item: any) => {
      // Date filter
      const matchesDate = item.dateOnly === filterEspelhoDate;
      if (!matchesDate) return false;

      // Search filter
      if (!searchEspelho) return true;
      const q = searchEspelho.toLowerCase();
      return (
        (item.nb || "").toLowerCase().includes(q) ||
        (item.razaoSocial || "").toLowerCase().includes(q) ||
        (item.nomeFantasia || "").toLowerCase().includes(q) ||
        (item.productCode || "").toLowerCase().includes(q) ||
        (item.productDesc || "").toLowerCase().includes(q) ||
        (item.municipio || "").toLowerCase().includes(q)
      );
    });
  }, [approvedReplacements, filterEspelhoDate, searchEspelho]);

  // Prompt the reminder card once
  useEffect(() => {
    if (tomorrowReminders.length > 0 && !dismissedReminderToday) {
      setShowReminderPopup(true);
    }
  }, [tomorrowReminders, dismissedReminderToday]);

  const uniqueSectors = useMemo(() => {
    const list = new Set(requests.map(r => r.setor));
    return Array.from(list).sort();
  }, [requests]);

  // Filter requests according to tabs
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // 1. Search filter
      const text = searchTerm.trim().toLowerCase();
      const matchSearch = !searchTerm ||
        (req.nf && req.nf.toLowerCase().includes(text)) ||
        (req.mapa && req.mapa.toLowerCase().includes(text)) ||
        (req.nb && req.nb.toLowerCase().includes(text)) ||
        (req.id && req.id.toLowerCase().includes(text)) ||
        (req.observacao && req.observacao.toLowerCase().includes(text));

      // 2. Sector filter
      const matchSector = sectorFilter === "todos" || req.setor === sectorFilter;

      // 3. Date range filter
      if (startDate) {
        const reqDate = getReqDate(req);
        if (reqDate) {
          const start = new Date(startDate + "T00:00:00");
          if (reqDate < start) return false;
        } else {
          return false;
        }
      }
      if (endDate) {
        const reqDate = getReqDate(req);
        if (reqDate) {
          const end = new Date(endDate + "T23:59:59");
          if (reqDate > end) return false;
        } else {
          return false;
        }
      }

      // 4. Tab filters
      if (activeTab === "historico_baixas") {
        const isFalta = isFaltaOrInversao(req);
        const isBaixada = !!(req as any).faltaBaixa;
        return isFalta && isBaixada && matchSearch && matchSector;
      }

      if (activeTab === "faltas_inversoes") {
        const isFalta = isFaltaOrInversao(req);
        if (!isFalta) return false;

        // Faltas specificity status filter
        const isBaixada = !!(req as any).faltaBaixa;
        if (lackFilterStatus === "abertos" && isBaixada) return false;
        if (lackFilterStatus === "baixados" && !isBaixada) return false;

        // Faltas typo erro filter
        const errType = (req as any).faltaTipoErro;
        if (lackFilterErrorType === "carregamento" && errType !== "carregamento") return false;
        if (lackFilterErrorType === "entrega" && errType !== "entrega") return false;
        if (lackFilterErrorType === "indefinido" && errType) return false;

        return matchSearch && matchSector;
      } else {
        let matchStatus = req.statusPromax === activeTab;
        if (activeTab === "reprovado") {
          matchStatus = req.statusPromax === "reprovado" || req.statusPromax === "corrigir";
        }
        return matchSearch && matchStatus && matchSector;
      }
    });
  }, [requests, searchTerm, activeTab, sectorFilter, startDate, endDate, lackFilterStatus, lackFilterErrorType]);

  // Trigger handlers to open custom interactive modals
  const triggerRegister = (id: string) => {
    setModalAction({ type: "register", requestId: id });
    setModalInput("Responsável pelo Controle");
    setModalError("");
  };

  const triggerReject = (id: string) => {
    setModalAction({ type: "reject", requestId: id });
    setModalInput("");
    setModalError("");
  };

  const triggerCorrigir = (id: string) => {
    setModalAction({ type: "corrigir", requestId: id });
    setModalInput("");
    setModalError("");
  };

  const triggerDelete = (id: string) => {
    setModalAction({ type: "delete", requestId: id });
    setModalInput("");
    setModalError("");
  };

  const handleModalConfirm = () => {
    if (!modalAction) return;
    const { type, requestId } = modalAction;

    if (type === "reject" || type === "corrigir") {
      if (!modalInput.trim()) {
        const errMsg = type === "reject" ? "O motivo da reprovação é obrigatório!" : "Descreva o que preencher ou corrigir (Obrigatório)!";
        setModalError(errMsg);
        return;
      }
      const updated = requests.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            statusPromax: type === "reject" ? ("reprovado" as const) : ("corrigir" as const),
            notified: false,
            rejeitadoObs: modalInput.trim(),
            reprovadoUser: "Responsável pelo Controle",
            reprovadoDate: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          };
        }
        return req;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);
    } else if (type === "register") {
      const name = modalInput.trim() || "Responsável pelo Controle";
      const updated = requests.map(req => {
        if (req.id === requestId) {
          return {
            ...req,
            statusPromax: "cadastrado" as const,
            notified: false,
            cadastroUser: name,
            cadastroDate: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          };
        }
        return req;
      });
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);
    } else if (type === "delete") {
      const updated = requests.filter(req => req.id !== requestId);
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      setRequests(updated);
    }

    setModalAction(null);
    setModalInput("");
    setModalError("");
  };

  // Open Edit Shortage sliding details editor
  const handleOpenEditFalta = (req: PendingRequest) => {
    const cast = req as any;
    setEditingFalta(req);
    setEditFaltaErrorType(cast.faltaTipoErro || "");
    
    // Guess default driver from Promax records if empty
    let inferredDriver = "";
    if (promaxRecords.length > 0) {
      const matched = promaxRecords.find(r => r.nf === req.nf || r.mapa === req.mapa);
      if (matched) {
        inferredDriver = matched.nomeMotorista || matched.motorista || "";
      }
    }

    let defaultMotorista = cast.faltaMotorista || "";
    if (!defaultMotorista) {
      const sectorKey = req.setor ? req.setor.replace("ROTA - ", "").trim() : "";
      const routeDriver = MOTORISTAS_ROTAS[sectorKey];
      if (routeDriver) {
        defaultMotorista = routeDriver.nome;
      } else if (inferredDriver) {
        defaultMotorista = inferredDriver;
      }
    }

    let defaultMotoristaCpf = cast.faltaMotoristaCpf || "";
    if (defaultMotorista && !defaultMotoristaCpf) {
      const detail = getCrewDetailByName(defaultMotorista);
      if (detail) {
        defaultMotoristaCpf = detail.cpf;
      }
    }

    setEditFaltaMotorista(defaultMotorista);
    setEditFaltaMotoristaCpf(defaultMotoristaCpf);
    setEditFaltaAjudantes(cast.faltaAjudantes || "");
    
    let defaultAjudante1 = cast.faltaAjudante1 || (cast.faltaAjudantes ? cast.faltaAjudantes.split(",")[0] || "" : "");
    let defaultAjudante1Cpf = cast.faltaAjudante1Cpf || "";
    if (defaultAjudante1 && !defaultAjudante1Cpf) {
      const detail = getCrewDetailByName(defaultAjudante1);
      if (detail) {
        defaultAjudante1Cpf = detail.cpf;
      }
    }

    let defaultAjudante2 = cast.faltaAjudante2 || (cast.faltaAjudantes ? cast.faltaAjudantes.split(",")[1] || "" : "");
    let defaultAjudante2Cpf = cast.faltaAjudante2Cpf || "";
    if (defaultAjudante2 && !defaultAjudante2Cpf) {
      const detail = getCrewDetailByName(defaultAjudante2);
      if (detail) {
        defaultAjudante2Cpf = detail.cpf;
      }
    }

    setEditFaltaAjudante1(defaultAjudante1);
    setEditFaltaAjudante1Cpf(defaultAjudante1Cpf);
    setEditFaltaAjudante2(defaultAjudante2);
    setEditFaltaAjudante2Cpf(defaultAjudante2Cpf);
    setEditFaltaDataAnomalia(cast.mapaDataAnomalia || req.data.split(" ")[0] || "");
    setEditFaltaDataEntrega(cast.dataEntregaRecibo || new Date().toLocaleDateString("pt-BR"));
    setEditFaltaObservacao(cast.observacaoRecibo || req.observacao || "");
    const pdvDb = getPdvDatabase();
    const clientInfo = getClientDetails(req.nb, pdvDb, promaxRecords);
    setEditFaltaCidade(cast.municipioRecibo || clientInfo.municipio || "");
  };

  // Save customized shortage parameters to localStorage
  const handleSaveFaltaDetails = () => {
    if (!editingFalta) return;

    const updated = requests.map(req => {
      if (req.id === editingFalta.id) {
        // Build comma separated helpers list for backwards compatibility
        const helpersList: string[] = [];
        if (editFaltaAjudante1.trim()) helpersList.push(editFaltaAjudante1.trim());
        if (editFaltaAjudante2.trim()) helpersList.push(editFaltaAjudante2.trim());
        const combinedHelpers = helpersList.join(", ");

        return {
          ...req,
          faltaTipoErro: editFaltaErrorType || undefined,
          faltaMotorista: editFaltaMotorista.trim() || undefined,
          faltaMotoristaCpf: editFaltaMotoristaCpf.trim() || undefined,
          faltaAjudantes: combinedHelpers || editFaltaAjudantes.trim() || undefined,
          faltaAjudante1: editFaltaAjudante1.trim() || undefined,
          faltaAjudante1Cpf: editFaltaAjudante1Cpf.trim() || undefined,
          faltaAjudante2: editFaltaAjudante2.trim() || undefined,
          faltaAjudante2Cpf: editFaltaAjudante2Cpf.trim() || undefined,
          mapaDataAnomalia: editFaltaDataAnomalia.trim() || undefined,
          dataEntregaRecibo: editFaltaDataEntrega.trim() || undefined,
          observacaoRecibo: editFaltaObservacao.trim() || undefined,
          municipioRecibo: editFaltaCidade.trim() || undefined,
        } as PendingRequest;
      }
      return req;
    });

    localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
    setRequests(updated);
    setEditingFalta(null);
  };

  // Process physical settlement confirmation modal with uploaded document/photo
  const handleConfirmarBaixaShortage = async () => {
    if (!baixandoFalta) return;
    if (!baixaReciboFile) {
      setBaixaError("Por favor, anexe a foto ou o PDF do recibo assinado pelo cliente para poder efetuar a baixa.");
      return;
    }

    setBaixaError("Gerando PDF de Evidência Completo... Por favor, aguarde.");

    // Resolve client details for PDF metadata
    const pdvDb = getPdvDatabase();
    const clientDetails = getClientDetails(baixandoFalta.nb, pdvDb, promaxRecords);
    const clientNameResolved = clientDetails.razaoSocial || clientDetails.nomeFantasia || "Cliente Especial";

    // Prepare docData for compiling
    const docDataForPdf = {
      ...baixandoFalta,
      nomeCliente: clientNameResolved,
      cadastroUser: "Controle Operacional",
      cadastroDate: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    };

    let compiledPdfUrl = "";
    try {
      const compileRes = await fetch("/api/compile-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: baixandoFalta.id,
          docData: docDataForPdf
        })
      });

      if (!compileRes.ok) {
        const errData = await compileRes.json();
        throw new Error(errData.error || "Erro desconhecido no servidor");
      }

      const compileData = await compileRes.json();
      if (compileData.success && compileData.url) {
        compiledPdfUrl = compileData.url;
      } else {
        throw new Error("A resposta do servidor de compilação de PDF não retornou uma URL válida.");
      }
    } catch (compileErr: any) {
      console.error("Erro ao compilar PDF de evidência para baixa:", compileErr);
      setBaixaError(`FALHA CRÍTICA DE COMPILAÇÃO: A baixa física foi BLOQUEADA pois não foi possível gerar o PDF de evidência completo do processo (${compileErr.message}). Corrija a imagem ou tente novamente.`);
      return;
    }

    // PDF compiled successfully! Now offer the download of this document with a standard naming convention
    const formattedDate = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    const cleanClientNameForFile = clientNameResolved
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-zA-Z0-9]/g, "_")
      .substring(0, 30);
    const suggestedPdfName = `SSTR_EVIDENCIA_${baixandoFalta.id}_NF_${baixandoFalta.nf}_${cleanClientNameForFile}_${formattedDate}.pdf`;

    try {
      const link = document.createElement("a");
      link.href = compiledPdfUrl;
      link.download = suggestedPdfName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (dlErr) {
      console.error("Falha ao iniciar o download automático do PDF:", dlErr);
    }

    // Now upload physical settlement receipt image/file if needed
    let finalReciboUrl = baixaReciboFile.dataUrl;
    if (baixaReciboFile.dataUrl && baixaReciboFile.dataUrl.startsWith("data:image/")) {
      try {
        const upRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: baixaReciboFile.dataUrl })
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData.url) {
            finalReciboUrl = upData.url;
          }
        }
      } catch (uploadErr) {
        console.error("Error uploading physical settlement image:", uploadErr);
      }
    }

    const updatedRequestObj = {
      ...baixandoFalta,
      faltaBaixa: true,
      faltaBaixaDate: new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      faltaBaixaUser: "Controle Operacional",
      faltaBaixaReciboName: baixaReciboFile.name,
      faltaBaixaReciboUrl: finalReciboUrl,
      faltaBaixaReciboType: baixaReciboFile.type,
      faltaBaixaObs: baixaObservacao.trim() || undefined,
      fotoUrl: compiledPdfUrl // Replace original heavy image with the complete compiled PDF URL
    } as PendingRequest;

    const updated = requests.map(req => {
      if (req.id === baixandoFalta.id) {
        return updatedRequestObj;
      }
      return req;
    });

    localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
    setRequests(updated);

    // Trigger local storage storage event
    window.dispatchEvent(new Event("storage"));

    // Save to concludedBaixa to display the success copy path modal
    setConcludedBaixa(updatedRequestObj);

    setBaixandoFalta(null);
    setBaixaReciboFile(null);
    setBaixaObservacao("");
    setBaixaError("");
  };

  // Undoing "Dar Baixa" on shortage request if mistakes were made
  const handleReverterBaixaShortage = (id: string) => {
    const updated = requests.map(req => {
      if (req.id === id) {
        return {
          ...req,
          faltaBaixa: false,
          faltaBaixaDate: undefined,
          faltaBaixaUser: undefined,
          faltaBaixaReciboName: undefined,
          faltaBaixaReciboUrl: undefined,
          faltaBaixaReciboType: undefined,
          faltaBaixaObs: undefined
        } as PendingRequest;
      }
      return req;
    });
    localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
    setRequests(updated);
  };

  // Count active requests by status category
  const pendingCount = useMemo(() => {
    return requests.filter(r => r.statusPromax === "pendente").length;
  }, [requests]);

  const approvedCount = useMemo(() => {
    return requests.filter(r => r.statusPromax === "cadastrado").length;
  }, [requests]);

  const rejectedCount = useMemo(() => {
    return requests.filter(r => r.statusPromax === "reprovado" || r.statusPromax === "corrigir").length;
  }, [requests]);

  const lackCount = useMemo(() => {
    return requests.filter(isFaltaOrInversao).length;
  }, [requests]);

  const lackActiveCount = useMemo(() => {
    return requests.filter(r => isFaltaOrInversao(r) && !(r as any).faltaBaixa).length;
  }, [requests]);

  const lackHistoryCount = useMemo(() => {
    return requests.filter(r => isFaltaOrInversao(r) && !!(r as any).faltaBaixa).length;
  }, [requests]);

  // Monthly limit metric calculation (R$ 12.000 limit)
  const MONTHLY_LIMIT = 12000;

  const budgetProjection = useMemo(() => {
    const officialRecords = promaxRecords.filter(r => r.sistemaOrigem !== "Portal de Campo SSTR");

    // Dynamic active evaluation month based on official records if available
    const dObj = new Date();
    let evalMonth = dObj.getMonth() + 1; // 1-indexed (1-12)
    let evalYear = dObj.getFullYear();

    if (officialRecords.length > 0) {
      let maxTime = 0;
      let bestMonth = evalMonth;
      let bestYear = evalYear;

      officialRecords.forEach(r => {
        if (r.dataSolicitacao) {
          const parts = r.dataSolicitacao.split("/");
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const y = parseInt(parts[2], 10);
            const t = new Date(y, m - 1, d).getTime();
            if (t > maxTime) {
              maxTime = t;
              bestMonth = m;
              bestYear = y;
            }
          }
        }
      });
      evalMonth = bestMonth;
      evalYear = bestYear;
    }

    const monthNamesList = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const evalMonthName = monthNamesList[evalMonth - 1];

    // Filter current evaluation month/year approved official records
    const currentMonthOfficialApproved = officialRecords.filter(r => {
      const isApproved = r.status.toLowerCase().includes("aprov") || r.status.toLowerCase().includes("cadastrado");
      if (!isApproved) return false;

      if (r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          return m === evalMonth && y === evalYear;
        }
      }
      return false;
    });

    const approvedOfficialSum = currentMonthOfficialApproved.reduce((sum, r) => sum + r.valorTotal, 0);

    // Sum of all currently pending requests
    const pendingReqs = requests.filter(r => r.statusPromax === "pendente");
    const totalPendingSum = pendingReqs.reduce((sum, r) => {
      if (isSwapRequest(r)) {
        const errType = (r as any).faltaTipoErro || "";
        if (errType !== "entrega") {
          return sum; // Exclude inversion if not classified as delivery error (erro da entrega)
        }
      }
      return sum + getRequestValue(r, promaxRecords);
    }, 0);

    const projectedAccumulated = approvedOfficialSum + totalPendingSum;
    const currentAtingimento = (approvedOfficialSum / MONTHLY_LIMIT) * 100;
    const projectedAtingimento = (projectedAccumulated / MONTHLY_LIMIT) * 100;
    const isProjectedOverLimit = projectedAccumulated > MONTHLY_LIMIT;
    const projectedOverflow = isProjectedOverLimit ? projectedAccumulated - MONTHLY_LIMIT : 0;

    return {
      evalMonthName,
      evalYear,
      approvedOfficialSum,
      totalPendingSum,
      projectedAccumulated,
      currentAtingimento,
      projectedAtingimento,
      isProjectedOverLimit,
      projectedOverflow
    };
  }, [promaxRecords, requests]);


  // Substats count for Faltas tab overview
  const lackSubstats = useMemo(() => {
    const list = requests.filter(isFaltaOrInversao);
    const abertos = list.filter(r => !(r as any).faltaBaixa).length;
    const baixados = list.filter(r => (r as any).faltaBaixa).length;
    
    const carregamento = list.filter(r => (r as any).faltaTipoErro === "carregamento").length;
    const entrega = list.filter(r => (r as any).faltaTipoErro === "entrega").length;
    const indefinido = list.filter(r => !(r as any).faltaTipoErro).length;

    return { abertos, baixados, carregamento, entrega, indefinido };
  }, [requests]);

  const handlePrintEspelho = () => {
    let printedWithNewTab = false;
    const printElement = document.getElementById("espelho-printable-content");
    if (printElement) {
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(el => el.outerHTML)
            .join('\n');
          
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>SSTR - Imprimir Espelho de Reposições</title>
                ${styles}
                <style>
                  body {
                    background-color: white !important;
                    color: black !important;
                    padding: 24px 32px !important;
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  #espelho-printable-content {
                    display: block !important;
                    color: black !important;
                  }
                  table {
                    border-collapse: collapse !important;
                    width: 100% !important;
                    margin-top: 16px !important;
                    margin-bottom: 16px !important;
                  }
                  th, td {
                    border: 1px solid #94a3b8 !important;
                    padding: 8px !important;
                    color: black !important;
                  }
                  th {
                    background-color: #f1f5f9 !important;
                    font-weight: bold !important;
                  }
                </style>
              </head>
              <body class="bg-white text-black">
                <div id="espelho-printable-content" class="space-y-6">
                  ${printElement.innerHTML}
                </div>
                <script>
                  window.onload = function() {
                    window.focus();
                    setTimeout(function() {
                      window.print();
                    }, 450);
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
          printedWithNewTab = true;
        }
      } catch (e) {
        console.warn("Could not print in a new tab, falling back to window.print()", e);
      }
    }

    if (!printedWithNewTab) {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn("Iframe blocked print dialog:", e);
      }
    }
  };

  if (isPrintingEspelho) {
    return (
      <div className="fixed inset-0 bg-white text-black z-[9999] overflow-y-auto p-8 font-sans" id="espelho-impressao-overlay">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Print controls */}
          <div className="flex justify-between items-center border-b pb-4 mb-4 no-print">
            <span className="text-sm font-bold text-slate-800">Visualização de Impressão do Espelho</span>
            <div className="flex gap-2">
              <button
                onClick={handlePrintEspelho}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono rounded flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-white" /> Confirmar Impressão
              </button>
              <button
                onClick={() => setIsPrintingEspelho(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-mono rounded cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>

          <div id="espelho-printable-content" className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
              <div className="space-y-1">
                <h1 className="text-xl font-black uppercase tracking-tight">ESPELHO DE REPOSIÇÕES E TROCAS DO DIA</h1>
                <p className="text-xs text-slate-600 uppercase font-mono">SSTR Ambev - Relatório Operacional de Conformidade</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold font-mono">DATA DE REFERÊNCIA: {filterEspelhoDate}</p>
                <p className="text-[10px] text-slate-500">Emitido em: {new Date().toLocaleString("pt-BR")}</p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-xs border-collapse border border-slate-400">
              <thead>
                <tr className="bg-slate-100 border-b-2 border-slate-400 text-[10px] font-bold uppercase">
                  <th className="p-2 border border-slate-300 text-left">NB</th>
                  <th className="p-2 border border-slate-300 text-left">Razão Social / Cliente</th>
                  <th className="p-2 border border-slate-300 text-left">Produto (SKU - Descrição)</th>
                  <th className="p-2 border border-slate-300 text-center">Qtd</th>
                  <th className="p-2 border border-slate-300 text-left">Cidade</th>
                  <th className="p-2 border border-slate-300 text-left">N.F. / Mapa</th>
                  <th className="p-2 border border-slate-300 text-left">Setor</th>
                </tr>
              </thead>
              <tbody>
                {espelhoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                      Nenhuma reposição cadastrada/aprovada na data {filterEspelhoDate}.
                    </td>
                  </tr>
                ) : (
                  espelhoFiltrado.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                      <td className="p-2 border border-slate-300 font-mono font-bold text-slate-900">{item.nb}</td>
                      <td className="p-2 border border-slate-300 uppercase">
                        <p className="font-bold">{item.razaoSocial}</p>
                        <p className="text-[9px] text-slate-500 font-mono">{item.nomeFantasia}</p>
                      </td>
                      <td className="p-2 border border-slate-300">
                        <strong className="font-mono text-slate-900">#{item.productCode}</strong> - <span className="uppercase text-slate-750">{item.productDesc}</span>
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-extrabold text-slate-900">{item.quantidade}</td>
                      <td className="p-2 border border-slate-300 uppercase font-mono">{item.municipio}</td>
                      <td className="p-2 border border-slate-300 font-mono">
                        <p>NF: {item.nf || "N/A"}</p>
                        <p className="text-[9px] text-slate-500">Mapa: {item.mapa || "N/A"}</p>
                      </td>
                      <td className="p-2 border border-slate-300 font-mono text-slate-600">{item.solicitante}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Footer signature lines */}
            <div className="grid grid-cols-2 gap-8 pt-12 text-center text-[10px] uppercase font-mono">
              <div className="space-y-1">
                <div className="border-t border-slate-400 w-48 mx-auto mt-6"></div>
                <p className="font-bold">CONFERENTE OPERACIONAL</p>
                <p className="text-[9px] text-slate-500">SSTR LOGÍSTICA</p>
              </div>
              <div className="space-y-1">
                <div className="border-t border-slate-400 w-48 mx-auto mt-6"></div>
                <p className="font-bold">SUPERVISÃO / GESTÃO</p>
                <p className="text-[9px] text-slate-500">CONTROLE SSTR</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100 animate-fade-in">
      
      {/* Introduction bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500 animate-pulse" />
            Guia de Solicitações e Controle Promax SSTR
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl font-sans">
            Visualize as solicitações enviadas pelos representantes de vendas (RN) de campo e faça a gestão de lançamentos ou controle de perdas e faltas física diretamente no Promax PW.
          </p>
        </div>

        {/* Dynamic status overview badge */}
        <div className="bg-slate-950/40 border border-slate-850 px-4 py-2.5 rounded-xl text-center shrink-0 min-w-[150px]">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Status Selecionado</span>
          <span className="text-sm font-bold font-mono text-white flex items-center justify-center gap-1.5 mt-1">
            <span className={`w-2 h-2 rounded-full ${
              activeTab === "pendente" ? "bg-amber-500 animate-pulse" : 
              activeTab === "cadastrado" ? "bg-emerald-500" : 
              activeTab === "faltas_inversoes" ? "bg-indigo-400" : 
              activeTab === "historico_baixas" ? "bg-teal-500" :
              "bg-red-500"}`}></span>
            {activeTab === "pendente" ? `${pendingCount} Pendentes` : 
             activeTab === "cadastrado" ? `${approvedCount} Aprovadas` : 
             activeTab === "faltas_inversoes" ? `${lackCount} Faltas / Inversões` : 
             activeTab === "historico_baixas" ? `${lackHistoryCount} Baixadas Fisicamente` :
             `${rejectedCount} Reprovadas`}
          </span>
        </div>
      </div>

      {/* Visual Monthly Budget Limit & Projection Panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Monthly limit/Goal */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1 text-left relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-15">
            <Layers className="w-8 h-8 text-slate-400" />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Meta de Verba Mensal</span>
          <p className="text-xl font-extrabold text-white font-mono">{formatCurrency(MONTHLY_LIMIT)}</p>
          <span className="text-[10px] text-slate-500 block font-semibold">Referente a {budgetProjection.evalMonthName} / {budgetProjection.evalYear}</span>
        </div>

        {/* Card 2: Officially Approved */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1 text-left relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-15">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Acumulado Aprovado Oficial</span>
          <p className="text-xl font-extrabold text-emerald-400 font-mono">{formatCurrency(budgetProjection.approvedOfficialSum)}</p>
          <span className="text-[10px] font-mono text-slate-500 block font-semibold">
            Atingimento: <strong className="text-emerald-500 font-bold">{budgetProjection.currentAtingimento.toFixed(1)}%</strong>
          </span>
        </div>

        {/* Card 3: Requested Pending Sum */}
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1 text-left relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-15">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Valor Total das Pendências</span>
          <p className="text-xl font-extrabold text-amber-500 font-mono">{formatCurrency(budgetProjection.totalPendingSum)}</p>
          <span className="text-[10px] text-slate-500 block font-semibold">Base local do SSTR de Campo</span>
        </div>

        {/* Card 4: Projection if all approved & status indicator */}
        <div className={`p-4 rounded-xl space-y-1 text-left relative overflow-hidden border ${
          budgetProjection.isProjectedOverLimit 
            ? "bg-rose-950/25 border-rose-900/50 animate-pulse" 
            : "bg-slate-900 border border-slate-850"
        }`}>
          <div className="absolute right-3 top-3 opacity-15">
            <AlertCircle className={`w-8 h-8 ${budgetProjection.isProjectedOverLimit ? "text-rose-400" : "text-blue-400"}`} />
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Projeção com as Pendentes</span>
          <p className={`text-xl font-extrabold font-mono ${
            budgetProjection.isProjectedOverLimit ? "text-rose-455 font-bold animate-bounce" : "text-blue-400"
          }`}>
            {formatCurrency(budgetProjection.projectedAccumulated)}
          </p>
          <div className="flex flex-col gap-0.5 text-[9.5px]">
            <span className="text-slate-400 font-semibold">
              Atingimento: <strong className={budgetProjection.isProjectedOverLimit ? "text-rose-404 font-bold" : "text-blue-400"}>{budgetProjection.projectedAtingimento.toFixed(1)}%</strong>
            </span>
            {budgetProjection.isProjectedOverLimit ? (
              <span className="text-rose-400 font-extrabold block">
                ⚠️ Estouro de Verba: +{formatCurrency(budgetProjection.projectedOverflow)}
              </span>
            ) : (
              <span className="text-slate-500 block font-semibold">
                Dentro do limite mensal
              </span>
            )}
          </div>
        </div>
      </div>

      {/* FOUR FILTER SUB-TABS */}
      <div className="bg-slate-950 p-2 rounded-2xl border border-slate-850/80 flex flex-wrap gap-2 no-print">
        <button
          onClick={() => setActiveTab("pendente")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 relative cursor-pointer ${
            activeTab === "pendente"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-900/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span>⏳ Pendentes ({pendingCount})</span>
          {pendingCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 absolute top-2 right-2 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("cadastrado")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "cadastrado"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>✔️ Aprovadas ({approvedCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("faltas_inversoes")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 relative cursor-pointer ${
            activeTab === "faltas_inversoes"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
              : "bg-slate-900 text-slate-400 hover:text-slate-205 hover:bg-slate-850 border border-slate-850"
          }`}
          title="Faltas de carregar ou entregar não faturadas"
        >
          <Layers className="w-3.5 h-3.5 text-indigo-350" />
          <span>📦 Faltas & Inversões ({lackActiveCount} ativas)</span>
          {lackActiveCount > 0 && (
            <span className="px-1.5 py-0.5 bg-rose-600 text-[8.5px] font-mono text-white rounded-full absolute -top-1 -right-1 font-bold animate-pulse">
              {lackActiveCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("reprovado")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "reprovado"
              ? "bg-red-650 text-white shadow-lg shadow-red-900/10 border border-red-900/35"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-red-500" />
          <span>❌ Reprovadas ({rejectedCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("historico_baixas")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "historico_baixas"
              ? "bg-emerald-650 text-white shadow-lg shadow-emerald-950 border border-emerald-900/30"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
          title="Consulte todos os recibos físicos digitados e liquidados com comprovante assinado"
        >
          <FileText className="w-3.5 h-3.5 text-emerald-450" />
          <span>📜 Histórico de Baixas ({lackHistoryCount})</span>
        </button>

        <button
          onClick={() => setActiveTab("historico_vales")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === "historico_vales"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-900/20 border border-amber-800"
              : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
          title="Consulte o financeiro de vales emitidos, rankings de equipes e reimpressões"
        >
          <TrendingUp className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span>📈 Histórico de Vales ({valesHistorico.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("criar_solicitacao")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer relative ${
            activeTab === "criar_solicitacao"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 border border-emerald-550"
              : "bg-slate-900 text-slate-450 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
          title="Criar nova solicitação de troca, falta ou reposição diretamente pelo controle"
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-450" />
          <span>Criar Solicitação 🆕</span>
        </button>

        <button
          onClick={() => setActiveTab("espelho")}
          className={`flex-grow md:flex-none px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer relative ${
            activeTab === "espelho"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 border border-indigo-550"
              : "bg-slate-900 text-slate-450 hover:text-slate-200 hover:bg-slate-850 border border-slate-850"
          }`}
          title="Consulte o espelho consolidado de reposições e trocas homologadas e liquidas do dia"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span>Espelho do Dia 📋</span>
        </button>
      </div>

      {/* Main Grid: Filters & Lists */}
      <div className="space-y-4">
        
        {/* Controls Layout with 12-column responsive design and Date range filter */}
        {activeTab !== "historico_vales" && activeTab !== "criar_solicitacao" && activeTab !== "espelho" && (
          <div className="bg-slate-900 p-4.5 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3.5 text-left no-print">
            
            {/* Search bar */}
            <div className="md:col-span-4 relative space-y-1">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Pesquisa de Documento:</span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="NF, Código NB, Mapa, Solicitação..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 h-10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-650 placeholder:font-sans focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Start Date filter */}
            <div className="md:col-span-2 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Data Inicial:</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5 pointer-events-none" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 h-10 text-xs font-mono text-slate-205 cursor-pointer focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* End Date filter */}
            <div className="md:col-span-2 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Data Final:</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-505 w-3.5 h-3.5 pointer-events-none" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 h-10 text-xs font-mono text-slate-250 cursor-pointer focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Sector filter */}
            <div className="md:col-span-3 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Setor / Rota RN:</span>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 h-10 text-xs text-slate-350 font-semibold cursor-pointer focus:outline-none"
              >
                <option value="todos">Todos os Setores</option>
                {uniqueSectors.map(sec => {
                  const rep = repsList[sec.trim()];
                  const rot = MOTORISTAS_ROTAS[sec.trim()];
                  const label = rep 
                    ? `Setor ${sec} (${rep.nome})` 
                    : rot 
                      ? `Rota ${sec} (${rot.nome})` 
                      : `Setor/Rota ${sec}`;
                  return (
                    <option key={sec} value={sec}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Clear Button */}
            <div className="md:col-span-1">
              {(searchTerm || startDate || endDate || sectorFilter !== "todos") ? (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setStartDate("");
                    setEndDate("");
                    setSectorFilter("todos");
                  }}
                  className="w-full h-10 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/40 text-rose-300 text-[10px] font-mono font-bold rounded-xl cursor-pointer flex items-center justify-center transition-all hover:scale-[1.02]"
                >
                  Limpar
                </button>
              ) : (
                <div className="w-full h-10 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-[9px] text-slate-600 font-mono font-bold uppercase tracking-wider select-none">
                  Ativos
                </div>
              )}
            </div>
          </div>
        )}

        {/* AMANHÃ REMINDERS BANNER CONTAINER */}
        {activeTab === "faltas_inversoes" && tomorrowReminders.length > 0 && (
          <div className="p-4 bg-amber-950/20 border border-amber-900/35 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 no-print text-left animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-950 border border-amber-900/40 rounded-xl text-amber-500 shrink-0 animate-pulse mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <span>⏰ Prazo Urgente Amanhã</span>
                  <span className="p-0.5 px-1.5 bg-amber-500 text-slate-950 rounded-full font-sans font-extrabold text-[9px] lowercase leading-none">
                    {tomorrowReminders.length} pendente{tomorrowReminders.length > 1 ? "s" : ""}
                  </span>
                </h4>
                <p className="text-[11.5px] text-slate-300 mt-1 max-w-2xl leading-normal">
                  Cargas agendadas para amanhã necessitam de comprovação de entrega. Acesse os comprovantes físicos ou simule os arquivos assinados e faça a respectiva baixa física no controle.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[9.5px] font-mono">
                  {tomorrowReminders.map(rem => (
                    <span key={rem.id} className="p-0.5 px-2 bg-slate-950 border border-slate-850/60 rounded text-slate-400">
                      NF: <span className="text-amber-500 font-bold">{rem.nf}</span> ({rem.faltaMotorista || "Sem Mot."})
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
              <button
                onClick={() => setDismissedReminderToday(true)}
                className="p-1.5 px-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-[10px] text-slate-400 hover:text-white rounded-xl cursor-pointer transition-colors font-mono font-bold"
              >
                Ignorar
              </button>
              <button
                onClick={() => setShowReminderPopup(true)}
                className="p-1.5 px-4 bg-amber-600 hover:bg-amber-700 text-slate-950 font-extrabold text-[10px] rounded-xl cursor-pointer transition-all hover:scale-[1.03] shadow-md shadow-amber-950/25"
              >
                Abrir Checklist
              </button>
            </div>
          </div>
        )}

        {/* SPECIAL CONTROLS PANEL FOR THE FALTAS & INVERSÕES HISTORICAL TAB */}
        {activeTab === "faltas_inversoes" && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap gap-4 items-center justify-between no-print animate-fade-in text-left">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Filter shortage status (Open pending vs Closed baixados) */}
              <div className="space-y-1">
                <span className="text-[9.5px] font-mono font-bold text-slate-400 block uppercase">Estado de Baixa Física:</span>
                <div className="bg-slate-955 border border-slate-850 p-1 rounded-xl flex items-center space-x-1">
                  <button
                    onClick={() => setLackFilterStatus("todos")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer transition-colors ${
                      lackFilterStatus === "todos" ? "bg-slate-800 text-white font-bold" : "text-slate-450 hover:text-white"
                    }`}
                  >
                    Geral ({lackCount})
                  </button>
                  <button
                    onClick={() => setLackFilterStatus("abertos")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer transition-colors ${
                      lackFilterStatus === "abertos" ? "bg-indigo-600 text-white font-bold" : "text-slate-450 hover:text-white"
                    }`}
                    title="Apenas pendências físicas esperando envio do produto pelo controle"
                  >
                    Pendente ({lackSubstats.abertos})
                  </button>
                  <button
                    onClick={() => setLackFilterStatus("baixados")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer transition-colors ${
                      lackFilterStatus === "baixados" ? "bg-emerald-600 text-white font-bold" : "text-slate-450 hover:text-white"
                    }`}
                    title="Baixas de estoque concluídas"
                  >
                    Baixadas ({lackSubstats.baixados})
                  </button>
                </div>
              </div>

              {/* Filter shortage reason/origin (Loading vs Delivery error) */}
              <div className="space-y-1">
                <span className="text-[9.5px] font-mono font-bold text-slate-400 block uppercase">Origem do Erro / Custódia:</span>
                <div className="bg-slate-955 border border-slate-850 p-1 rounded-xl flex items-center space-x-1">
                  <button
                    onClick={() => setLackFilterErrorType("todos")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer ${
                      lackFilterErrorType === "todos" ? "bg-slate-800 text-white font-bold" : "text-slate-450 hover:text-white"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setLackFilterErrorType("carregamento")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer ${
                      lackFilterErrorType === "carregamento" ? "bg-blue-900 border border-blue-800/40 text-blue-300 font-bold" : "text-slate-450"
                    }`}
                    title="Falta de carregamento no armazém - Sem faturamento comercial"
                  >
                    Carregamento ({lackSubstats.carregamento})
                  </button>
                  <button
                    onClick={() => setLackFilterErrorType("entrega")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer ${
                      lackFilterErrorType === "entrega" ? "bg-amber-900 border border-amber-800/40 text-amber-300 font-bold" : "text-slate-450"
                    }`}
                    title="Erro de descarga/entrega na rota - Faturar + Cobrança"
                  >
                    Descarregamento ({lackSubstats.entrega})
                  </button>
                  <button
                    onClick={() => setLackFilterErrorType("indefinido")}
                    className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg cursor-pointer ${
                      lackFilterErrorType === "indefinido" ? "bg-red-956 border border-red-900/20 text-red-400 font-bold" : "text-slate-450"
                    }`}
                    title="Faltas aguardando classificação operacional de culpa"
                  >
                    Não Definidos ({lackSubstats.indefinido})
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Informative text box */}
            <div className="max-w-xs text-[10px] text-slate-400 border-l-2 border-slate-700 pl-3 leading-relaxed font-sans">
              As Faltas e Inversões ficam gravadas permanentemente. Faltas de carregamento não faturam. Faltas de entrega geram Vale e faturamento.
            </div>
          </div>
        )}

        {/* Requests List Grid */}
        {activeTab === "criar_solicitacao" ? (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-4xl mx-auto space-y-6 text-left no-print animate-fade-in shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-widest font-sans flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                    <PlusCircle className="w-4 h-4" />
                  </span>
                  <span>Criar Nova Solicitação (Supervisor / Gestor)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Gere solicitações de trocas, faltas, sobras ou inversões com arquivamento persistente na nuvem.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("pendente")}
                className="p-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer transition-colors text-xs font-mono font-bold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>

            {/* Error and Success alerts */}
            {createError && (
              <div className="p-4 bg-red-950/30 border border-red-900/45 text-red-300 rounded-xl text-xs flex items-start gap-2.5 leading-relaxed font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-900/40 text-emerald-300 rounded-xl text-xs flex items-start gap-2.5 leading-relaxed font-bold animate-pulse">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{createSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateRequestSubmit} className="space-y-6" id="form-criar-solicitacao">
              {/* Row 1: Setor and Crew */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                {/* Sector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Setor / RN:</label>
                  <select
                    value={reqSetor}
                    onChange={(e) => setReqSetor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    required
                  >
                    <option value="">-- Selecione o Setor --</option>
                    {repsArray.map(r => (
                      <option key={r.setor} value={r.setor}>
                        Setor {r.setor} ({r.nome})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Driver */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Motorista (Rota):</label>
                  <select
                    value={reqMotorista}
                    onChange={(e) => setReqMotorista(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Selecione o Motorista --</option>
                    {LISTA_CREW.filter(c => c.cargo.toLowerCase().includes("motorista")).map(c => (
                      <option key={c.cpf} value={c.nome}>
                        {c.nome} ({c.cargo})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Assistants */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Ajudante 1:</label>
                  <select
                    value={reqAjudante1}
                    onChange={(e) => setReqAjudante1(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Selecione o Ajudante 1 --</option>
                    {LISTA_CREW.filter(c => c.cargo.toLowerCase().includes("ajudante") || c.cargo.toLowerCase().includes("auxiliar")).map(c => (
                      <option key={c.cpf} value={c.nome}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Document Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                {/* Nota Fiscal */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Nota Fiscal (NF) <span className="text-slate-600 font-normal text-[9px]">(Opcional)</span>:</label>
                  <input
                    type="text"
                    placeholder="Ex: 123456"
                    value={reqNf}
                    onChange={(e) => setReqNf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Cliente NB */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Cód. Cliente (NB) <span className="text-slate-600 font-normal text-[9px]">(Opcional)</span>:</label>
                  <input
                    type="text"
                    placeholder="Ex: 504030"
                    value={reqNb}
                    onChange={(e) => setReqNb(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                  {sectorLoadingInfo && (
                    <div className="space-y-1 mt-1 font-sans leading-tight text-[10.5px]">
                      {sectorLoadingInfo.isRegistered ? (
                        <span className="text-emerald-400 block font-semibold">
                          ✅ PDV: {sectorLoadingInfo.clientName}
                        </span>
                      ) : (
                        <span className="text-amber-500 block leading-normal font-semibold">
                          ⚠️ NB não cadastrado no banco do PDV. Cadastre o PDV manualmente no Painel de Gestores para puxar o setor de venda automaticamente ou selecione o setor manualmente.
                        </span>
                      )}

                      {sectorLoadingInfo.foundSector ? (
                        <span className="text-emerald-400 font-bold block font-mono">
                          📍 Setor auto-identificado: Setor {sectorLoadingInfo.foundSector}
                        </span>
                      ) : (
                        <span className="text-slate-500 block font-medium">
                          🔍 Nenhum setor associado a este NB nos registros.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Mapa de Carga */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Mapa de Carga:</label>
                  <input
                    type="text"
                    placeholder="Ex: 987"
                    value={reqMapa}
                    onChange={(e) => setReqMapa(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-10 text-xs font-mono text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Motive & Evidence Section */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-850 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Motive Selection */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Motivo Principal:</label>
                    <select
                      value={reqMotiveType}
                      onChange={(e) => {
                        setReqMotiveType(e.target.value);
                        setReqMotiveText("");
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs font-semibold text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="Produto Avariado">Produto Avariado</option>
                      <option value="Falta de SKU Completo">Falta de SKU Completo</option>
                      <option value="Falta no SKU">Falta no SKU</option>
                      <option value="Sobra de Carga">Sobra de Carga</option>
                      <option value="Inversão">Inversão</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>

                  {/* Complementary Motive text */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Detalhamento do Motivo:</label>
                    <input
                      type="text"
                      placeholder="Ex: Quebra de garrafa, erro na carga, etc."
                      value={reqMotiveText}
                      onChange={(e) => setReqMotiveText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Evidence Photo Section */}
                <div className="border-t border-slate-900 pt-3.5">
                  {reqMotiveType === "Falta de SKU Completo" ? (
                    <div className="p-3 bg-blue-950/20 border border-blue-900/35 rounded-xl flex items-start gap-2 text-blue-400">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                      <div className="text-[10.5px] leading-relaxed">
                        <span className="font-extrabold uppercase font-mono block">⚠️ Foto Dispensada para SKU Completo</span>
                        Conforme regra operacional, solicitações de <strong>Falta de SKU Completo</strong> não necessitam de foto ou comprovante físico anexado, visto que não existe produto ou fragmento físico para ser registrado.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block flex items-center gap-1.5">
                        <span>📸 Foto da Evidência / Comprovante:</span>
                        <span className="text-red-500 font-sans font-bold text-[9px] uppercase tracking-normal">(Obrigatório)</span>
                      </span>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <label className="h-10 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-350 hover:text-white px-4 rounded-xl cursor-pointer flex items-center justify-center gap-2 text-xs font-bold transition-all hover:scale-[1.01]">
                          <Camera className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Tirar Foto / Anexar</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleImageCaptureInForm}
                            className="hidden"
                          />
                        </label>

                        {reqFotoUrl && (
                          <div className="flex items-center gap-2 p-1.5 px-3 bg-emerald-950/20 border border-emerald-900/25 rounded-xl max-w-sm">
                            <img src={reqFotoUrl} className="w-7 h-7 object-cover rounded border border-emerald-900/30" alt="Evidência" />
                            <span className="text-[10px] font-mono text-emerald-400 font-bold truncate max-w-[150px]">Foto capturada!</span>
                            <button
                              type="button"
                              onClick={() => setReqFotoUrl("")}
                              className="text-red-500 hover:text-red-400 p-1 cursor-pointer ml-auto"
                              title="Remover foto"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product and quantities item entry section */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-850 space-y-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono border-b border-slate-900 pb-2">
                  📦 Inserir SKUs de Produtos
                </h4>

                {reqMotiveType === "Inversão" ? (
                  <div className="space-y-4">
                    {/* Inversion inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* SKU to deliver */}
                      <div className="space-y-1 relative">
                        <label className="text-[10px] font-bold text-emerald-400 font-mono uppercase tracking-wider block">
                          SKU que deve IR (Entregar ao cliente):
                        </label>
                        <input
                          type="text"
                          placeholder="Digite código ou descrição..."
                          value={reqInversaoIr}
                          onChange={(e) => {
                            setReqInversaoIr(e.target.value);
                            setShowIrSuggestions(true);
                          }}
                          onFocus={() => setShowIrSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowIrSuggestions(false), 200)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                        />
                        {/* Suggestions list */}
                        {showIrSuggestions && irSuggestions.length > 0 && (
                          <div className="absolute z-30 left-0 right-0 top-16 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-900">
                            {irSuggestions.map(p => (
                              <button
                                key={p.codigo}
                                type="button"
                                onMouseDown={() => {
                                  setReqInversaoIr(p.codigo);
                                  setReqItem(p.codigo);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-slate-900 transition-colors block text-[10.5px]"
                              >
                                <span className="font-mono font-bold text-emerald-400">{p.codigo}</span>
                                <span className="text-slate-400 ml-2 block truncate">{p.descricao}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* SKU to recollect */}
                      <div className="space-y-1 relative">
                        <label className="text-[10px] font-bold text-rose-400 font-mono uppercase tracking-wider block">
                          SKU que deve VIR (Recolher do cliente):
                        </label>
                        <input
                          type="text"
                          placeholder="Digite código ou descrição..."
                          value={reqInversaoRecolher}
                          onChange={(e) => {
                            setReqInversaoRecolher(e.target.value);
                            setShowRecolherSuggestions(true);
                          }}
                          onFocus={() => setShowRecolherSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowRecolherSuggestions(false), 200)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                        />
                        {/* Suggestions list */}
                        {showRecolherSuggestions && recolherSuggestions.length > 0 && (
                          <div className="absolute z-30 left-0 right-0 top-16 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-900">
                            {recolherSuggestions.map(p => (
                              <button
                                key={p.codigo}
                                type="button"
                                onMouseDown={() => setReqInversaoRecolher(p.codigo)}
                                className="w-full px-3 py-2 text-left hover:bg-slate-900 transition-colors block text-[10.5px]"
                              >
                                <span className="font-mono font-bold text-rose-400">{p.codigo}</span>
                                <span className="text-slate-400 ml-2 block truncate">{p.descricao}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quantities for Inversion */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Qtd do SKU a Enviar:</label>
                        <input
                          type="number"
                          placeholder="Falta/Inversão IR"
                          value={reqInversaoIrQtd}
                          onChange={(e) => setReqInversaoIrQtd(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Qtd do SKU a Recolher:</label>
                        <input
                          type="number"
                          placeholder="Sobra/Inversão Recolher"
                          value={reqInversaoRecolherQtd}
                          onChange={(e) => setReqInversaoRecolherQtd(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={handleAddReqDraftItem}
                          className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform shadow"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Adicionar Inversão</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* SKU search */}
                    <div className="md:col-span-8 space-y-1 relative">
                      <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">SKU do Produto:</label>
                      <input
                        type="text"
                        placeholder="Pesquise por código ou nome do SKU..."
                        value={reqItem}
                        onChange={(e) => {
                          setReqItem(e.target.value);
                          setShowItemSuggestions(true);
                        }}
                        onFocus={() => setShowItemSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-200 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                      />
                      {/* Suggestions list */}
                      {showItemSuggestions && itemSuggestions.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 top-16 bg-slate-950 border border-slate-850 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-900">
                          {itemSuggestions.map(p => (
                            <button
                              key={p.codigo}
                              type="button"
                              onMouseDown={() => setReqItem(p.codigo)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-900 transition-colors block text-[10.5px]"
                            >
                              <span className="font-mono font-bold text-amber-500">{p.codigo}</span>
                              <span className="text-slate-400 ml-2 block truncate">{p.descricao}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Quantidade:</label>
                      <input
                        type="number"
                        placeholder="Ex: 5"
                        value={reqQuantidade}
                        onChange={(e) => setReqQuantidade(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 h-10 text-xs text-slate-205 placeholder:text-slate-700 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    {/* Add Button */}
                    <div className="md:col-span-2 flex items-end">
                      <button
                        type="button"
                        onClick={handleAddReqDraftItem}
                        className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform shadow"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Adicionar SKU</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Draft list table */}
                {reqDraftItems.length > 0 && (
                  <div className="mt-3.5 border border-slate-900 rounded-xl overflow-hidden bg-slate-950">
                    <table className="w-full text-left text-xs divide-y divide-slate-900">
                      <thead>
                        <tr className="bg-slate-900/50 font-mono font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                          <th className="px-4 py-2.5">SKU / Produto</th>
                          <th className="px-4 py-2.5">Qtd</th>
                          <th className="px-4 py-2.5">Motivo</th>
                          <th className="px-4 py-2.5 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {reqDraftItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/30">
                            <td className="px-4 py-2.5">
                              <span className="font-mono font-bold text-emerald-450">{item.itemCode}</span>
                              <span className="text-slate-400 ml-2 block sm:inline truncate max-w-[250px]">{item.itemDesc}</span>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-200">
                              {item.quantidade} <span className="text-[10px] text-slate-500 font-normal">
                                {item.motivo && item.motivo.toLowerCase().includes("falta de sku completo") ? "cx" : "un"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="p-0.5 px-2 bg-slate-900 border border-slate-800 rounded font-bold text-[10px] text-amber-500 font-mono">
                                {item.motivo}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveReqDraftItem(item.id)}
                                className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 cursor-pointer inline-flex items-center"
                                title="Excluir item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Row 4: Observações e Submit */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4.5">
                {/* Observations */}
                <div className="md:col-span-8 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider block">Observações Adicionais:</label>
                  <textarea
                    rows={2}
                    placeholder="Escreva observações internas para a equipe de controle ou auditoria..."
                    value={reqObservacao}
                    onChange={(e) => setReqObservacao(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-205 placeholder:text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Submit button wrapper */}
                <div className="md:col-span-4 flex items-end">
                  <button
                    type="submit"
                    disabled={uploadingImage}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-850 text-white font-extrabold text-sm rounded-xl cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform shadow-lg shadow-emerald-950/20"
                  >
                    {uploadingImage ? (
                      <>
                        <span className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></span>
                        <span>Arquivando na Nuvem...</span>
                      </>
                    ) : (
                      <>
                        <PlusCircle className="w-5 h-5 text-emerald-300" />
                        <span>Gerar Solicitação 🚀</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : activeTab === "historico_vales" ? (
          <div className="no-print animate-fade-in">
            <ValesHistoryDashboard 
              vales={valesHistorico} 
              onReimprimir={(vale) => setSelectedPrintDoc({ type: "vale", request: vale.originalRequest })} 
              onDeleteSingleVale={handleDeleteSingleVale}
            />
          </div>
        ) : activeTab === "espelho" ? (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4 text-left animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div className="space-y-1">
                <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wide flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" /> Espelho de Reposições e Trocas Aprovadas
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Consulte e imprima a lista consolidada de todas as anomalias e devoluções homologadas e liquidadas ("cadastradas") na data de referência.
                </p>
              </div>
              <button
                onClick={() => setIsPrintingEspelho(true)}
                disabled={espelhoFiltrado.length === 0}
                className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 uppercase tracking-wider shadow-md ${
                  espelhoFiltrado.length === 0
                    ? "bg-slate-800 text-slate-600 border border-slate-850 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/25 cursor-pointer hover:scale-[1.02] active:scale-95"
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Espelho</span>
              </button>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/40 p-4 border border-slate-850 rounded-xl items-end">
              <div className="md:col-span-4 space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Data de Referência (Aprovação/Cadastro)</label>
                <input
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [year, month, day] = e.target.value.split("-");
                      setFilterEspelhoDate(`${day}/${month}/${year}`);
                    } else {
                      setFilterEspelhoDate(new Date().toLocaleDateString("pt-BR"));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-8 space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Filtrar por palavras-chave</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Buscar por NB, Cliente, Produto, Cidade..."
                    value={searchEspelho}
                    onChange={(e) => setSearchEspelho(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Main Table */}
            <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950 font-sans text-xs">
              <div className="p-3 bg-slate-900/60 border-b border-slate-850 flex justify-between items-center text-[10.5px] font-mono text-slate-400">
                <span>Registros encontrados na data <strong className="text-white font-bold">{filterEspelhoDate}</strong>:</span>
                <span className="font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/40 px-2 py-0.5 rounded">{espelhoFiltrado.length} Reposições</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase border-b border-slate-850">
                      <th className="p-3">NB</th>
                      <th className="p-3">CLIENTE / CIDADE</th>
                      <th className="p-3">PRODUTO (SKU)</th>
                      <th className="p-3 text-center">QUANTIDADE</th>
                      <th className="p-3">MAPA / NF</th>
                      <th className="p-3">CANAL</th>
                      <th className="p-3">HORÁRIO APROV.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {espelhoFiltrado.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500 font-mono text-xs italic">
                          Nenhuma reposição/troca foi localizada com o status "Aprovada/Cadastrada" para a data {filterEspelhoDate}.
                        </td>
                      </tr>
                    ) : (
                      espelhoFiltrado.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-850/20 text-slate-350">
                          <td className="p-3 font-mono font-bold text-white text-xs">{item.nb}</td>
                          <td className="p-3 space-y-0.5 uppercase">
                            <p className="font-bold text-slate-200 text-xs">{item.razaoSocial}</p>
                            <div className="flex gap-2 items-center text-[10px]">
                              <span className="text-slate-400 font-mono">{item.nomeFantasia}</span>
                              <span className="text-slate-500">•</span>
                              <span className="text-emerald-450 font-semibold">{item.municipio}</span>
                            </div>
                          </td>
                          <td className="p-3 uppercase">
                            <p className="font-bold text-slate-300">{item.productDesc}</p>
                            <p className="text-[10px] text-slate-500 font-mono">SKU: #{item.productCode}</p>
                          </td>
                          <td className="p-3 text-center font-extrabold text-white text-sm font-mono">{item.quantidade}</td>
                          <td className="p-3 font-mono text-[10.5px]">
                            <p className="text-slate-300">NF: {item.nf || "N/A"}</p>
                            <p className="text-slate-500 text-[9px]">MAPA: {item.mapa || "N/A"}</p>
                          </td>
                          <td className="p-3 font-mono text-[10.5px] text-indigo-400 font-semibold uppercase">{item.solicitante}</td>
                          <td className="p-3 text-slate-400 font-mono text-[10.5px]">
                            {item.cadastroDate ? item.cadastroDate.split(" ")[1] || "---" : "---"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center bg-slate-900 rounded-2xl border border-slate-850 space-y-2 text-slate-550 max-w-lg mx-auto no-print">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-650" />
            <p className="font-mono text-xs">Nenhum registro encontrado nesta exibição.</p>
            <p className="text-[10px] text-slate-655">Limpe os filtros de pesquisa ou mude de guia para atualizar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 no-print">
            {filteredRequests.map((req) => {
              const repInfo = repsList[req.setor.trim()];
              const rotInfo = MOTORISTAS_ROTAS[req.setor.trim()];
              const isShortage = isFaltaOrInversao(req);
              const cast = req as any;
              const pdvDb = getPdvDatabase();
              const clientDetails = getClientDetails(req.nb, pdvDb, promaxRecords);
              
              return (
                <div 
                  key={req.id} 
                  className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-xl transition-all ${
                    req.statusPromax === "cadastrado" && activeTab !== "faltas_inversoes" && activeTab !== "historico_baixas"
                      ? "border-emerald-900/30 opacity-75" 
                      : (activeTab === "faltas_inversoes" || activeTab === "historico_baixas") && cast.faltaBaixa
                        ? "border-emerald-950 opacity-80"
                        : "border-slate-800 hover:border-slate-755"
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header bar of card */}
                    <div className="flex justify-between items-start gap-1">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 bg-blue-950 text-blue-400 border border-blue-900/50 rounded-lg flex items-center justify-center font-bold text-[10px] font-mono shrink-0">
                          {req.setor}
                        </div>
                        <div className="text-left">
                          <h4 className="font-bold text-xs text-slate-200">
                            {rotInfo ? `Rota ${req.setor}` : `Setor ${req.setor}`}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-450 block truncate max-w-[145px]" title={rotInfo ? rotInfo.nome : (repInfo ? repInfo.nome : "")}>
                            {rotInfo ? rotInfo.nome : (repInfo ? repInfo.nome : "Representante")}
                          </span>
                        </div>
                      </div>

                      {/* Status / Shortage physical dispatches indicators */}
                      {(activeTab === "faltas_inversoes" || activeTab === "historico_baixas") ? (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {cast.faltaBaixa ? (
                            <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-900/40 rounded-full text-[8.5px] font-bold font-mono text-emerald-450 flex items-center gap-1 leading-none uppercase">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Baixada</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-indigo-950/70 border border-indigo-900/50 rounded-full text-[8.5px] font-bold font-mono text-indigo-400 flex items-center gap-1 leading-none uppercase animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-450"></span>
                              <span>Pendente</span>
                            </span>
                          )}

                          {cast.faltaTipoErro === "carregamento" ? (
                            <span className="text-[7.5px] uppercase font-bold font-mono text-blue-400 bg-blue-950/45 px-1.5 py-0.5 rounded border border-blue-900/30">
                              📦 Carregamento
                            </span>
                          ) : cast.faltaTipoErro === "entrega" ? (
                            <span className="text-[7.5px] uppercase font-bold font-mono text-amber-500 bg-amber-955/35 px-1.5 py-0.5 rounded border border-amber-900/30">
                              🚚 Descarregamento
                            </span>
                          ) : (
                            <span className="text-[7.5px] uppercase font-bold font-mono text-red-400 bg-red-955/20 px-1.5 py-0.5 rounded border border-red-900/20">
                              ⚠️ Indefinido
                            </span>
                          )}
                        </div>
                      ) : (
                        req.statusPromax === "cadastrado" ? (
                          <span className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-900/55 rounded-full text-[9px] font-bold font-mono text-emerald-400 flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3 text-emerald-450" />
                            <span>Promax Ok</span>
                          </span>
                        ) : req.statusPromax === "reprovado" ? (
                          <span className="px-2 py-0.5 bg-red-950/60 border border-red-900/55 rounded-full text-[9px] font-bold font-mono text-red-400 flex items-center gap-1 shrink-0">
                            <XCircle className="w-3 h-3 text-red-450" />
                            <span>Reprovado</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-450 border border-amber-900/60 text-[9px] font-bold font-mono rounded-full flex items-center gap-1 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>Pendente</span>
                          </span>
                        )
                      )}
                    </div>

                    {/* Client Info Block on card */}
                    <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 text-left">
                      <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono">Cliente / Ponto de Venda (PDV):</p>
                      <h4 className="font-extrabold text-slate-200 text-xs uppercase leading-tight mt-1" title={clientDetails.razaoSocial}>
                        {clientDetails.razaoSocial}
                      </h4>
                      <p className="text-[10px] text-emerald-450 font-bold uppercase mt-1">
                        📍 {clientDetails.municipio} - {clientDetails.uf}
                      </p>
                    </div>

                    {/* Metadata summary (NF, MAPA, NB) */}
                    <div className="p-3 bg-slate-950 rounded-xl space-y-1.5 border border-slate-850 text-xs font-mono text-left">
                      <div className="flex justify-between text-slate-400">
                        <span>NF-e original:</span>
                        <strong className="text-white text-right select-all">{req.nf}</strong>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Código NB PDV:</span>
                        <span className="text-white text-right select-all">{req.nb}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Mapa de Carga:</span>
                        <span className="text-slate-200 text-right select-all">{req.mapa || "FALTA MAPA"}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Motivo do Registro:</span>
                        <span className="text-indigo-400 font-bold text-right uppercase text-[10px]">{req.motivo || "Falta / Inversão"}</span>
                      </div>

                      {req.items && req.items.length > 0 ? (
                        <div className="pt-2 border-t border-slate-900 mt-2 space-y-2 text-left">
                          <span className="text-[8px] text-blue-400 block font-bold uppercase tracking-wider">SKUs DA SOLICITAÇÃO ({req.items.length})</span>
                          <div className="space-y-2 divide-y divide-slate-900 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                            {req.items.map((sub, sIdx) => {
                              const isSwapItem = !!sub.produtoAhEnviar || !!sub.produtoARecolher;
                              const isItemShort = (sub.motivo || "").toLowerCase().includes("falta");
                              
                              return (
                                <div key={sub.id || sIdx} className="pt-1.5 first:pt-0 text-[10px] space-y-0.5 font-mono">
                                  <div className="flex justify-between items-start gap-1">
                                    <span className="text-slate-200 font-bold max-w-[170px] break-words whitespace-normal leading-tight">
                                      #{sub.item} - <span className="font-sans font-medium text-slate-400">{sub.descricao || "Item SSTR"}</span>
                                    </span>
                                    <strong className="text-emerald-400 whitespace-nowrap">{sub.quantidade} cx</strong>
                                  </div>
                                  <div className="flex justify-between text-[8.5px] text-slate-500">
                                    <span>Hl: <strong className="text-amber-500 font-semibold">{sub.hectolitros?.toFixed(4) || "0.0000"}</strong></span>
                                    <span>Motivo: <strong className={isItemShort ? "text-red-400" : isSwapItem ? "text-indigo-400" : "text-blue-400"}>{sub.motivo}</strong></span>
                                  </div>
                                  
                                  {isSwapItem && (
                                    <div className="mt-1 p-1 bg-slate-900 rounded-[6px] text-[8.5px] font-sans text-amber-500 leading-normal border border-slate-850">
                                      🔄 <strong className="text-indigo-400">Inversão de Carga:</strong>
                                      <div className="pl-2 mt-0.5 text-[8px] text-slate-400">
                                        Entregar: <span className="font-mono text-slate-300 font-bold">{sub.produtoAhEnviar}</span><br/>
                                        Recolher: <span className="font-mono text-slate-200">{sub.produtoARecolher}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          <div className="pt-1.5 border-t border-slate-950 flex flex-col gap-1 font-bold text-[9.5px]">
                            <div className="flex justify-between">
                              <span className="text-slate-450 uppercase">Total Geral (Volume):</span>
                              <span className="text-amber-500">{req.hectolitros?.toFixed(4) || "0.0000"} HL</span>
                            </div>
                            <div className="flex justify-between text-xs text-emerald-400">
                              <span className="uppercase text-[9.5px]">Total Geral (Financ.):</span>
                              <span>{formatCurrency(getRequestValue(req, promaxRecords))}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {req.item && (
                            <div className="flex justify-between text-slate-400">
                              <span>SKU do Item:</span>
                              <span className="text-amber-400 font-bold text-right truncate max-w-[150px]">{req.item}</span>
                            </div>
                          )}
                          {req.quantidade !== undefined && (
                            <div className="flex justify-between text-slate-400">
                              <span>Quantidade:</span>
                              <span className="text-white font-bold text-right">
                                {req.quantidade} {req.motivo && req.motivo.toLowerCase().includes("falta de sku completo") ? "cx" : "un"}
                              </span>
                            </div>
                          )}
                          <div className="pt-1.5 border-t border-slate-950 flex flex-col gap-1 font-bold text-[9.5px] mt-1.5">
                            <div className="flex justify-between">
                              <span className="text-slate-450 uppercase">Total Geral (Volume):</span>
                              <span className="text-amber-500">{req.hectolitros?.toFixed(4) || "0.0000"} HL</span>
                            </div>
                            <div className="flex justify-between text-xs text-emerald-400">
                              <span className="uppercase text-[9.5px]">Total Geral (Financ.):</span>
                              <span>{formatCurrency(getRequestValue(req, promaxRecords))}</span>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="flex justify-between text-slate-400 pt-1.5 border-t border-slate-950 mt-1">
                        <span>Data da anomalia:</span>
                        <span className="text-slate-450 text-right">{cast.mapaDataAnomalia || req.data}</span>
                      </div>

                      {/* Display active assigned crew */}
                      {isShortage && (cast.faltaMotorista || cast.faltaAjudantes) && (
                        <div className="pt-2 mt-2 border-t border-slate-900 space-y-1 text-[10.5px] font-sans leading-relaxed text-slate-400">
                          {cast.faltaMotorista && (
                            <p>🚚 <strong>Motorista:</strong> <span className="font-mono text-xs uppercase text-slate-300 font-bold">{cast.faltaMotorista}</span></p>
                          )}
                          {cast.faltaAjudantes && (
                            <p>👥 <strong>Equipe / Ajudantes:</strong> <span className="text-slate-300 uppercase italic font-medium">{cast.faltaAjudantes}</span></p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Evidence and photo link */}
                    {req.fotoUrl && (
                      <div className="relative group bg-slate-950 p-2 rounded-xl border border-slate-850 flex items-center gap-3 select-none text-left">
                        <img 
                          src={req.fotoUrl} 
                          alt="Pre visualizacao" 
                          className="w-11 h-11 object-cover rounded-md border border-slate-800 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-[10px] leading-relaxed">
                          <span className="text-slate-500 font-semibold block uppercase tracking-wider text-[8px] font-sans">Evidência anexada:</span>
                          <span className="text-slate-300 italic font-mono block max-w-[140px] truncate">
                            "{req.observacao || "Sem observações..."}"
                          </span>
                        </div>
                        <button 
                          onClick={() => setZoomPhoto(req.fotoUrl)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 bg-slate-900 hover:bg-slate-850 rounded-md border border-slate-800 text-blue-400 cursor-pointer transition-transform"
                          title="Visualizar tela cheia"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {/* Low checkmared details info */}
                    {(activeTab === "faltas_inversoes" || activeTab === "historico_baixas") && cast.faltaBaixa && (
                      <div className="p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-xl text-xs text-left space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold block uppercase text-[8.5px] text-emerald-500">🟢 Log de Baixa Registrada</span>
                          <span className="text-[10px] font-mono text-slate-400">{cast.faltaBaixaDate}</span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-200">
                          Confirmado envio e entrega do produto por <strong className="text-emerald-400">{cast.faltaBaixaUser}</strong>.
                        </p>
                        
                        {cast.faltaBaixaObs && (
                          <div className="p-2 bg-slate-950/40 border border-slate-900 rounded-lg text-[10.5px] text-slate-350 italic">
                            "{cast.faltaBaixaObs}"
                          </div>
                        )}

                        {cast.faltaBaixaReciboUrl && (
                          <div className="pt-2 border-t border-emerald-900/30 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[140px] flex items-center gap-1" title={cast.faltaBaixaReciboName}>
                              📎 <span className="hover:underline">{cast.faltaBaixaReciboName || "Recibo_Assinado"}</span>
                            </span>
                            {cast.faltaBaixaReciboUrl === "pdf_placeholder" || (cast.faltaBaixaReciboType && cast.faltaBaixaReciboType.includes("pdf")) ? (
                              <button
                                onClick={() => {
                                  // Open a safe info notification or download
                                  const link = document.createElement("a");
                                  link.href = cast.faltaBaixaReciboUrl === "pdf_placeholder" ? "#" : cast.faltaBaixaReciboUrl;
                                  link.download = cast.faltaBaixaReciboName || "recibo_assinado.pdf";
                                  if (cast.faltaBaixaReciboUrl === "pdf_placeholder") {
                                    alert(`Documento PDF "${cast.faltaBaixaReciboName || "recibo.pdf"}" registrado no sistema devidamente.`);
                                  } else {
                                    link.click();
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-850 border border-emerald-850 text-[10px] text-emerald-355 hover:text-white rounded-md cursor-pointer transition-colors"
                              >
                                Baixar/Abrir PDF
                              </button>
                            ) : (
                              <button
                                onClick={() => setZoomPhoto(cast.faltaBaixaReciboUrl)}
                                className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-850 border border-emerald-850 text-[10px] text-emerald-355 hover:text-white rounded-md cursor-pointer transition-colors"
                              >
                                Visualizar Foto
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
 
                   {/* Actions footer (Depends heavily on SSTR Faltas Ledger vs regular filters) */}
                  <div className="pt-2 border-t border-slate-850/60 no-print">
                    
                    {(activeTab === "faltas_inversoes" || activeTab === "historico_baixas") ? (
                      /* AUDIT LEDGER CARD ACTIONS */
                      <div className="space-y-2">
                        {/* Classify and Edit details */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEditFalta(req)}
                            className="flex-1 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-900/30 text-indigo-400 rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-colors block text-center uppercase"
                            title="Classificar tipo de erro, motorista, ajudantes e datas"
                          >
                            Classificar Erro
                          </button>
 
                          {/* Low button */}
                          {cast.faltaBaixa ? (
                            <button
                              onClick={() => handleReverterBaixaShortage(req.id)}
                              className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-450 hover:text-white rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-colors"
                              title="Reverter a baixa física para aberta"
                            >
                              Estornar Baixa
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setBaixandoFalta(req);
                                setBaixaReciboFile(null);
                                setBaixaObservacao("");
                                setBaixaError("");
                              }}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors uppercase leading-none"
                              title="Dar baixa - Anexar recibo assinado e liquidar"
                            >
                              Dar Baixa
                            </button>
                          )}
                        </div>
 
                        {/* Printable Receipts and Driver chargings slips */}
                        <div className="flex gap-2 pt-1 border-t border-slate-850/50">
                          {/* Deliver Receipt */}
                          {(() => {
                            const isReqInversion = (req.motivo && (req.motivo.toLowerCase().includes("inver") || req.motivo.toLowerCase().includes("troca"))) || 
                              (req.items && req.items.some((it: any) => it.produtoAhEnviar || it.produtoARecolher));
                            const canPrintRecibo = !!cast.faltaTipoErro || !!isReqInversion;
                            return (
                              <button
                                onClick={() => setSelectedPrintDoc({ type: "recibo", request: req })}
                                disabled={!canPrintRecibo}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                                  canPrintRecibo 
                                    ? "bg-slate-950 hover:bg-slate-855 border border-slate-800 text-blue-400 cursor-pointer" 
                                    : "bg-slate-950/40 border border-slate-900 text-slate-600 cursor-not-allowed"
                                }`}
                                title={canPrintRecibo ? "Gerar recibo de entrega timbrado Ambev para o PDV assinar" : "Classifique o erro primeiro para gerar o recibo de faltas"}
                              >
                                <Printer className="w-3.5 h-3.5 text-blue-550" />
                                <span>Recibo PDV</span>
                              </button>
                            );
                          })()}

                          {/* Crew Charge slip */}
                          <button
                            onClick={() => setSelectedPrintDoc({ type: "vale", request: req })}
                            disabled={cast.faltaTipoErro !== "entrega"}
                            className={`flex-grow py-1.5 rounded-lg text-[9px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                              cast.faltaTipoErro === "entrega"
                                ? "bg-slate-950 hover:bg-slate-850 border border-slate-800 text-amber-500 cursor-pointer"
                                : "bg-slate-950/20 border border-transparent text-slate-650 cursor-not-allowed"
                            }`}
                            title={cast.faltaTipoErro === "entrega" ? "Gerar auto de infração / cobrança (vale) para assinatura do motorista e equipe" : "Vale disponível apenas para Erro de Descarregamento / Entrega"}
                          >
                            <Signature className="w-3 h-3" />
                            <span>Vale Motorista</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* STANDARD WORKFLOW ACTION ROW */
                      <div className="flex items-center justify-between gap-2">
                        {/* Delete button option */}
                        <button
                          onClick={() => triggerDelete(req.id)}
                          className="p-1.5 bg-slate-950 text-slate-500 hover:text-red-400 border border-slate-850 hover:border-red-900 rounded-lg cursor-pointer"
                          title="Deletar permanentemente"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {req.statusPromax === "pendente" ? (
                          <div className="flex items-center gap-1.5 flex-grow justify-end">
                            {/* Corrigir option */}
                            <button
                              onClick={() => triggerCorrigir(req.id)}
                              className="px-2.5 py-1.5 bg-amber-955/80 hover:bg-amber-900 hover:text-white border border-amber-900/30 text-amber-400 rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-colors shrink-0"
                              title="Devolver para ajuste pelo RN de campo"
                            >
                              Corrigir
                            </button>

                            {/* Reprovar option */}
                            <button
                              onClick={() => triggerReject(req.id)}
                              className="px-2.5 py-1.5 bg-red-955/80 hover:bg-red-900 hover:text-white border border-red-900/30 text-red-500 rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-colors shrink-0"
                              title="Reprovar definitivamente"
                            >
                              Reprovar
                            </button>

                            {/* Approved Registered option */}
                            <button
                              onClick={() => triggerRegister(req.id)}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer transition-colors shrink-0"
                            >
                              <CheckSquare className="w-3 h-3 shrink-0" />
                              <span>Cadastrar</span>
                            </button>
                          </div>
                        ) : req.statusPromax === "reprovado" ? (
                          <div className="py-1.5 px-3 bg-red-955/10 border border-red-900/20 text-red-400 rounded-lg text-[10px] font-mono shrink-0">
                            Reprovado Definitivo
                          </div>
                        ) : req.statusPromax === "corrigir" ? (
                          <div className="py-1.5 px-3 bg-amber-955/10 border border-amber-900/20 text-amber-405 rounded-lg text-[10px] font-mono shrink-0">
                            Aguardando Correção pelo RN
                          </div>
                        ) : (
                          <div className="py-1.5 px-3 bg-slate-950 border border-slate-850/60 text-slate-500 rounded-lg text-[10px] font-mono shrink-0">
                            Lançado por: <strong className="text-slate-350">{req.cadastroUser}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Discreet Instructions Box (fluxo de ações) */}
      <footer className="mt-8 pt-4 border-t border-slate-900/60 flex justify-center no-print text-left">
        <div className="max-w-2xl bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/50 text-[10.5px] text-slate-550 leading-relaxed font-sans flex items-start gap-2.5">
          <span className="text-blue-500/80 font-bold shrink-0 mt-0.5 font-semibold">💡 Controle de Faltas Física & SSTR:</span>
          <div className="flex flex-col gap-1.5 text-left">
            <p>
              Qualquer solicitação contendo falta física ou inversão de SKU é listada de forma persistente sob a aba **Faltas & Inversões**.
            </p>
            <p>
              Classifique as faltas como <span className="text-blue-400">Carregamento (Estoque Armazém / Sem Faturamento)</span> ou <span className="text-amber-500">Descarregamento na Entrega (Faturamento Coletor / Vale Motorista com desconto)</span> e imprima recibos oficiais com a marca Ambev.
            </p>
          </div>
        </div>
      </footer>

      {/* PHYSICAL SETTLEMENT (DAR BAIXA) MODAL WITH FILE UPLOAD */}
      {baixandoFalta && (
        <div className="fixed inset-0 z-55 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in no-print">
          <div className="bg-slate-900 border border-slate-805 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left font-sans animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1 px-1.5 bg-emerald-950 border border-emerald-900 rounded text-emerald-450 text-[9px] uppercase font-mono font-bold">
                  Baixa Física
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Liquidar Shortage / Inversão
                </h3>
              </div>
              <button
                onClick={() => setBaixandoFalta(null)}
                className="text-slate-455 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-955 p-3 rounded-xl border border-slate-850 text-xs text-slate-350 space-y-1.5 leading-relaxed font-mono">
              <div><strong>NF / Série:</strong> {baixandoFalta.nf}</div>
              <div><strong>PDV / Cliente Código:</strong> {baixandoFalta.nb}</div>
              <div><strong>Setor de Vendas:</strong> {baixandoFalta.setor}</div>
              {baixandoFalta.items && baixandoFalta.items.length > 0 && (
                <div className="pt-1.5 border-t border-slate-900 text-slate-400">
                  <strong>Itens Envolvidos:</strong>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px]">
                    {baixandoFalta.items.map((sub, idx) => (
                      <li key={idx}>
                        {sub.produtoAhEnviar ? (
                          <span>🔄 Enviar: {sub.produtoAhEnviar} | Recolher: {sub.produtoARecolher}</span>
                        ) : (
                          <span>📦 SKU: {sub.item} - {sub.descricao || "Falta"} (Qtd: {sub.quantidade})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block">
                Comprovante Assinado (Foto JPG/PNG ou PDF) <span className="text-emerald-500">*</span>
              </label>

              {/* Drag and Drop Container */}
              <div 
                onClick={() => document.getElementById("receipt-file-input")?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    const file = e.dataTransfer.files[0];
                    const fileType = file.type;
                    const fileName = file.name;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBaixaReciboFile({
                        name: fileName,
                        type: fileType,
                        dataUrl: reader.result as string
                      });
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
                  baixaReciboFile 
                    ? "border-emerald-500/50 bg-emerald-950/10" 
                    : "border-slate-800 hover:border-emerald-500 bg-slate-950/45 hover:bg-slate-950/70"
                }`}
              >
                <input 
                  id="receipt-file-input"
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      const fileType = file.type;
                      const fileName = file.name;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setBaixaReciboFile({
                          name: fileName,
                          type: fileType,
                          dataUrl: reader.result as string
                        });
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />

                {baixaReciboFile ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    {baixaReciboFile.type.includes("pdf") || baixaReciboFile.dataUrl === "pdf_placeholder" ? (
                      <div className="flex flex-col items-center p-2">
                        <FileText className="w-9 h-9 text-emerald-400 mb-1" />
                        <span className="text-xs text-white font-mono font-bold truncate max-w-[280px]">{baixaReciboFile.name}</span>
                        <span className="text-[10px] text-emerald-500 font-mono">Documento PDF Carregado</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <img src={baixaReciboFile.dataUrl} className="max-h-24 object-contain rounded border border-slate-850 mb-1.5" alt="Recibo Assinado" />
                        <span className="text-[11px] text-white font-mono truncate max-w-[280px] block">{baixaReciboFile.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setBaixaReciboFile(null)}
                      className="px-2 py-0.5 bg-red-950 text-red-400 border border-red-900/50 hover:bg-red-905 hover:text-white rounded text-[10px] font-sans font-bold cursor-pointer transition-colors"
                    >
                      Remover e Alterar Comprovante
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-1.5 select-none py-2">
                    <Upload className="w-7 h-7 text-slate-500 animate-pulse" />
                    <p className="text-xs font-semibold text-slate-200">Arraste & Solte ou Clique para Anexar</p>
                    <p className="text-[10px] text-slate-500">Imagens JPG, PNG ou recibos formato PDF</p>
                  </div>
                )}
              </div>

              {/* Simulation Quick helper buttons for fast validation */}
              {!baixaReciboFile && (
                <div className="flex items-center justify-between gap-1.5 text-[10px] bg-slate-950/50 p-2 rounded-lg border border-slate-850">
                  <span className="text-slate-400 font-mono">Gerar comprovante teste:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBaixaReciboFile({
                          name: "FOTO_RECIBO_CLIENTE_ENTREGUE.jpg",
                          type: "image/jpeg",
                          dataUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=300"
                        });
                      }}
                      className="px-2 py-0.5 bg-blue-950 hover:bg-blue-900 border border-blue-900/40 text-blue-450 rounded font-mono text-[9px] cursor-pointer transition-colors"
                    >
                      📸 Simular Foto (JPG)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBaixaReciboFile({
                          name: "RECIBO_TIMBRADO_AMBEV_FINANCEIRO.pdf",
                          type: "application/pdf",
                          dataUrl: "pdf_placeholder"
                        });
                      }}
                      className="px-2 py-0.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-900/40 text-indigo-450 rounded font-mono text-[9px] cursor-pointer transition-colors"
                    >
                      📄 Simular PDF
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-450 font-bold uppercase tracking-wider block">
                Notas / Observação da Baixa
              </label>
              <textarea
                rows={2}
                placeholder="Ex. Recibo assinado fisicamente, encaminhado ao setor Operacional / Rota."
                value={baixaObservacao}
                onChange={(e) => setBaixaObservacao(e.target.value)}
                className="w-full bg-slate-955 border border-slate-805 rounded-lg p-2 text-xs text-slate-205 font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {baixaError && (
              <div className="p-2.5 bg-red-950/20 border border-red-900/35 rounded-xl text-[10px] text-red-400 font-mono">
                🚨 {baixaError}
              </div>
            )}

            <div className="flex gap-2.5 pt-2 border-t border-slate-850">
              <button
                onClick={() => setBaixandoFalta(null)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmarBaixaShortage}
                disabled={!baixaReciboFile}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  baixaReciboFile 
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer" 
                    : "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
                }`}
              >
                Gravar Baixa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO ZOOM MODAL */}
      {zoomPhoto && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in no-print"
          onClick={() => setZoomPhoto(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[85vh] bg-slate-900 p-3 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomPhoto(null)}
              className="absolute -top-3 -right-3 p-1.5 bg-slate-950 text-slate-350 hover:text-white rounded-full border border-slate-800 shadow-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img 
              src={zoomPhoto} 
              alt="Zoom avaria" 
              className="max-w-full max-h-[75vh] object-contain rounded-xl"
              referrerPolicy="no-referrer"
            />
            <p className="mt-3 text-[10px] font-mono text-slate-450">Clique fora ou no botão superior para fechar.</p>
          </div>
        </div>
      )}

      {/* SHORTAGE CLASSIFICATION AND DETAILS EDITING SLIDEOVER/MODAL */}
      {editingFalta && (() => {
        return (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in no-print">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left font-sans">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>Classificar e Ajustar Falta Física</span>
                </h3>
                <button 
                  onClick={() => setEditingFalta(null)} 
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Informative recap */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-[11px] text-slate-350 grid grid-cols-2 gap-2 font-mono">
                <p><strong>Nota Fiscal:</strong> {editingFalta.nf}</p>
                <p><strong>Código Client NB:</strong> {editingFalta.nb}</p>
                <p><strong>Mapa Carga:</strong> {editingFalta.mapa || "NÃO CONFIGURADO"}</p>
                <p><strong>Setor Venda:</strong> {editingFalta.setor}</p>
              </div>

              {/* Edit attributes form */}
              <div className="space-y-3">
                {/* 1. Classify err type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Classificação do Erro (Responsabilidade):</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditFaltaErrorType("carregamento")}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition-colors ${
                        editFaltaErrorType === "carregamento"
                          ? "bg-blue-900/40 border-blue-500 text-blue-300"
                          : "bg-slate-950 border-slate-850 text-slate-500 hover:border-slate-800 hover:text-slate-300"
                      }`}
                    >
                      <p className="text-xs">📦 Erro Carregamento</p>
                      <p className="text-[9px] font-medium opacity-85 mt-0.5">Estoque Armazém / Não faturar</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditFaltaErrorType("entrega")}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition-colors ${
                        editFaltaErrorType === "entrega"
                          ? "bg-amber-900/40 border-amber-500 text-amber-300"
                          : "bg-slate-950 border-slate-850 text-slate-500 hover:border-slate-800 hover:text-slate-300"
                      }`}
                    >
                      <p className="text-xs">🚚 Erro de Entrega</p>
                      <p className="text-[9px] font-medium opacity-85 mt-0.5">Rota Logística / Faturar + Vale Crew</p>
                    </button>
                  </div>
                </div>

                {/* 2. Motorista name & CPF */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2 space-y-1 font-sans font-medium">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Nome do Motorista:</label>
                    <input
                      type="text"
                      list="motoristas-list"
                      value={editFaltaMotorista}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFaltaMotorista(val);
                        const match = getCrewDetailByName(val);
                        if (match) {
                          setEditFaltaMotoristaCpf(match.cpf);
                        }
                      }}
                      placeholder="Nome completo do condutor responsável"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-sans"
                    />
                  </div>
                  <div className="space-y-1 font-sans">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">CPF Motorista:</label>
                    <input
                      type="text"
                      value={editFaltaMotoristaCpf}
                      onChange={(e) => setEditFaltaMotoristaCpf(e.target.value)}
                      placeholder="Ex: 123.456.789-00"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* 3. Ajudante 1 & CPF */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2 space-y-1 font-sans">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono font-sans font-medium">Nome do Ajudante 1:</label>
                    <input
                      type="text"
                      list="ajudantes-list"
                      value={editFaltaAjudante1}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFaltaAjudante1(val);
                        const match = getCrewDetailByName(val);
                        if (match) {
                          setEditFaltaAjudante1Cpf(match.cpf);
                        }
                      }}
                      placeholder="Nome do ajudante 1 da rota"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-sans"
                    />
                  </div>
                  <div className="space-y-1 font-sans">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">CPF Ajudante 1:</label>
                    <input
                      type="text"
                      value={editFaltaAjudante1Cpf}
                      onChange={(e) => setEditFaltaAjudante1Cpf(e.target.value)}
                      placeholder="Ex: 000.000.000-00"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                {/* 4. Ajudante 2 & CPF */}
                <div className="grid grid-cols-3 gap-2.5 font-sans">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono font-sans font-medium">Nome do Ajudante 2 (Opcional):</label>
                    <input
                      type="text"
                      list="ajudantes-list"
                      value={editFaltaAjudante2}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFaltaAjudante2(val);
                        const match = getCrewDetailByName(val);
                        if (match) {
                          setEditFaltaAjudante2Cpf(match.cpf);
                        }
                      }}
                      placeholder="Nome do ajudante 2 da rota"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-sans"
                    />
                  </div>
                  <div className="space-y-1 font-sans">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">CPF Ajudante 2:</label>
                    <input
                      type="text"
                      value={editFaltaAjudante2Cpf}
                      onChange={(e) => setEditFaltaAjudante2Cpf(e.target.value)}
                      placeholder="Ex: 000.000.000-00"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <datalist id="motoristas-list">
                  {LISTA_CREW.filter(c => c.cargo.includes("MOTORISTA")).map(crew => (
                    <option key={crew.nome} value={crew.nome}>CPF: {crew.cpf}</option>
                  ))}
                </datalist>
                <datalist id="ajudantes-list">
                  {LISTA_CREW.filter(c => c.cargo.includes("AJUDANTE")).map(crew => (
                    <option key={crew.nome} value={crew.nome}>CPF: {crew.cpf}</option>
                  ))}
                </datalist>

                {/* 4. Dates row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Data da Anomalia (Mapa):</label>
                    <input
                      type="text"
                      value={editFaltaDataAnomalia}
                      onChange={(e) => setEditFaltaDataAnomalia(e.target.value)}
                      placeholder="Ex: 21/06/2026"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Data de Entrega Recibo:</label>
                    <input
                      type="text"
                      value={editFaltaDataEntrega}
                      onChange={(e) => setEditFaltaDataEntrega(e.target.value)}
                      placeholder="Ex: 22/06/2026"
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Municipio / Cidade do PDV (Manual edit) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Município / Cidade do PDV:</label>
                  <input
                    type="text"
                    value={editFaltaCidade}
                    onChange={(e) => setEditFaltaCidade(e.target.value)}
                    placeholder="Digite a cidade manualmente (caso não identificada no banco)"
                    className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:border-blue-500 focus:outline-none uppercase font-bold"
                  />
                  <p className="text-[10px] text-slate-500">
                    O sistema busca a cidade automaticamente no banco importado. Se não identificar, você pode digitar acima.
                  </p>
                </div>

                {/* 5. Custom observing receipt */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block font-mono">Observações no Recibo / Justificativa:</label>
                  <textarea
                    value={editFaltaObservacao}
                    onChange={(e) => setEditFaltaObservacao(e.target.value)}
                    placeholder="Opcional. Ex: Entrega realizada com atraso, autorizado pelo supervisor."
                    rows={2}
                    className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFalta(null)}
                  className="px-4 py-2 bg-slate-950 hover:bg-slate-850 border border-slate-850 rounded-lg text-xs font-bold text-slate-400 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveFaltaDetails}
                  className="px-5 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Salvar Informações
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DOCUMENT PRINT PREVIEW AND CONTROLS MODAL */}
      {selectedPrintDoc && (() => {
        const req = selectedPrintDoc.request;
        const cast = req as any;
        const isVale = selectedPrintDoc.type === "vale";

        const parseProductString = (str: string | undefined, defaultQty: number) => {
          if (!str) return { code: "INVERSÃO", name: "Produto Não Especificado", qty: defaultQty };
          const match = str.match(/^#?(\d+)?\s*-?\s*([^()]+)/);
          let code = "INVERSÃO";
          let name = str;
          if (match) {
            code = match[1] || "INVERSÃO";
            name = match[2].trim();
          }
          if (name.startsWith("-")) {
            name = name.substring(1).trim();
          }
          let qty = defaultQty;
          const qtyMatch = str.match(/\(Qtd:\s*(\d+)/i);
          if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10);
          }
          return { code, name, qty };
        };
        
        // Calculate items and pricing specifically for printable sheets
        const printableItems = req.items && req.items.length > 0 ? req.items : [
          {
            id: "1",
            item: req.item || "SKU_GENERIC",
            descricao: "PRODUTO EM COMPENSAÇÃO SSTR",
            quantidade: req.quantidade || 1,
            hectolitros: req.hectolitros || 0.1200,
            motivo: req.motivo || "Falta de SKU"
          } as RequestItem
        ];

        const totalPricingValue = getRequestValue(req, promaxRecords);

        // Helper to retrieve split information for logistics team vouchers (vales)
        const getValeSplitInfo = () => {
          const driverName = cast.faltaMotorista || "Motorista";
          const driverCpf = cast.faltaMotoristaCpf || "";
          
          let h1Name = cast.faltaAjudante1 || "";
          let h1Cpf = cast.faltaAjudante1Cpf || "";
          let h2Name = cast.faltaAjudante2 || "";
          let h2Cpf = cast.faltaAjudante2Cpf || "";

          // Fallback if structured helper fields are empty but CSV helper string exists
          if (!h1Name && cast.faltaAjudantes && cast.faltaAjudantes.trim().length > 0 && cast.faltaAjudantes.toUpperCase() !== "NÃO DECLARADOS") {
            const parts = cast.faltaAjudantes.split(",").map((s: string) => s.trim());
            if (parts[0]) h1Name = parts[0];
            if (parts[1]) h2Name = parts[1];
          }

          let count = 1; // Always has the driver
          const crew: Array<{ role: string; name: string; cpf?: string }> = [
            { role: "Motorista", name: driverName, cpf: driverCpf }
          ];

          if (h1Name && h1Name.trim().length > 0) {
            count++;
            crew.push({ role: "Ajudante 1", name: h1Name, cpf: h1Cpf });
          }
          if (h2Name && h2Name.trim().length > 0) {
            count++;
            crew.push({ role: "Ajudante 2", name: h2Name, cpf: h2Cpf });
          }

          const individualValue = totalPricingValue / count;

          return { count, crew, individualValue };
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-start overflow-y-auto p-4 md:p-8 animate-fade-in no-print">
            
            {/* Modal actions toolbar header */}
            <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between shadow-2xl mb-4 text-left">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-white text-xs uppercase font-mono">Dispositivo de Impressão Direta</h3>
                  <p className="text-[10px] text-slate-400">
                    Apenas o cupom central sairá no papel. <strong className="text-amber-400">Aviso:</strong> Se o gerenciador do navegador não abrir na visualização incorporada, abra este app em uma <strong className="text-indigo-300 font-mono">Nova Guia</strong> (ícone no topo direito) para imprimir perfeitamente.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedPrintDoc(null)}
                  className="px-4 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-400 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Voltar ao Controle
                </button>
                <button
                  onClick={() => handleLogAndPrint(selectedPrintDoc.request, selectedPrintDoc.type)}
                  className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Agora</span>
                </button>
              </div>
            </div>

            {/* HIGH-FIDELITY PRINT SHEET ROOT TEMPLATE */}
            {/* The class 'print-document-content' combined with the dynamic stylesheet inside hides the rest during physical print */}
            <div 
              id="printable-document-root" 
              className="w-full max-w-2xl bg-white text-black p-8 md:p-10 border border-slate-300 rounded-xl shadow-2xl text-left font-sans text-sm relative leading-relaxed"
            >
              
              {/* PRINT ONLY STYLE INJECTOR - Ensures robust clean framing */}
              <style dangerouslySetInnerHTML={{__html: `
                @media print {
                  @page {
                    size: A4 portrait;
                    margin: 8mm 8mm 8mm 8mm !important;
                  }
                  body * {
                    visibility: hidden !important;
                    background: transparent !important;
                  }
                  #printable-document-root, #printable-document-root * {
                    visibility: visible !important;
                    color: black !important;
                  }
                  #printable-document-root {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0px 5px !important;
                    margin: 0px !important;
                    font-size: 10px !important;
                    line-height: 1.25 !important;
                  }
                  #printable-document-root h1 {
                    font-size: 13px !important;
                    margin: 2px 0 !important;
                  }
                  #printable-document-root h2 {
                    font-size: 14px !important;
                  }
                  #printable-document-root p, #printable-document-root td, #printable-document-root th, #printable-document-root div {
                    font-size: 10px !important;
                    line-height: 1.25 !important;
                  }
                  #printable-document-root .my-6, #printable-document-root .my-4 {
                    margin-top: 4px !important;
                    margin-bottom: 4px !important;
                  }
                  #printable-document-root .p-4, #printable-document-root .p-8, #printable-document-root .p-10 {
                    padding: 6px 10px !important;
                  }
                  #printable-document-root .py-3 {
                    padding-top: 3px !important;
                    padding-bottom: 3px !important;
                  }
                  #printable-document-root .mb-6 {
                    margin-bottom: 6px !important;
                  }
                  #printable-document-root .mb-10 {
                    margin-bottom: 6px !important;
                  }
                  #printable-document-root .mt-12 {
                    margin-top: 8px !important;
                  }
                  #printable-document-root .pt-8 {
                    padding-top: 4px !important;
                  }
                  #printable-document-root .space-y-10 > :not([hidden]) ~ :not([hidden]) {
                    margin-top: 10px !important;
                  }
                  #printable-document-root .space-y-6 > :not([hidden]) ~ :not([hidden]) {
                    margin-top: 6px !important;
                  }
                  #printable-document-root .space-y-4 > :not([hidden]) ~ :not([hidden]) {
                    margin-top: 4px !important;
                  }
                  #printable-document-root .pb-4 {
                    padding-bottom: 4px !important;
                  }
                  #printable-document-root table td, #printable-document-root table th {
                    padding: 4px 6px !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                  .no-print-border {
                    border: none !important;
                    background: transparent !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    outline: none !important;
                    box-shadow: none !important;
                    width: auto !important;
                  }
                }
              `}} />

              {/* TIMBRE HEADER AMBEV & REVENDEDOR AUTORIZADO PAU BRASIL */}
              <div className="border-b-2 border-black pb-4 text-center">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-left">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 font-mono">REVENDA AMBEV REGISTRADA</span>
                    <h2 className="text-lg font-black tracking-tighter uppercase text-slate-900 leading-none">PAU BRASIL DISTRIBUIDORA DE BEBIDAS LTDA</h2>
                    <p className="text-[9.5px] font-mono mt-1 text-slate-600">
                      Ramo de Bebidas e Logística | CNPJ: <strong className="text-black">53.935.732/0001-30</strong>
                    </p>
                    <p className="text-[9px] font-mono leading-none mt-0.5 text-slate-500">
                      Rodovia PB-073, Km 02, S/N - Distrito Industrial, Guarabira - PB | CEP: 58.200-000
                    </p>
                  </div>

                  {/* Dynamic NB & Setor card instead of old Dist ambev badge */}
                  <div className="border-2 border-black p-2 rounded text-left shrink-0 font-mono bg-slate-50 min-w-[125px]">
                    <span className="block leading-none text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">REGISTRO SSTR</span>
                    <span className="block text-xs font-black text-black">NB: <strong className="font-mono">{req.nb}</strong></span>
                    <span className="block text-[11px] text-slate-700">SETOR: <strong className="font-mono text-black">{req.setor}</strong></span>
                  </div>
                </div>
              </div>

              {/* TITLE OF DOCUMENT */}
              <div className="my-6 text-center space-y-1 bg-slate-100 py-3 rounded border border-slate-300">
                {isVale ? (
                  <>
                    <h1 className="text-md font-extrabold uppercase tracking-wide">AUTO DE COBRANÇA REPOSIÇÃO - VALE EQUIPE LOGÍSTICA</h1>
                    <p className="text-[10px] uppercase font-bold text-rose-600">ERRO DE ENTREGADOR / DESCARGA NA ROTA (CUSTÓDIA E AVARIA)</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-md font-extrabold uppercase tracking-wide">RECIBO DE COMPROVAÇÃO DE ENTREGA DE PRODUTO</h1>
                    <p className="text-[10px] uppercase font-bold text-blue-700">CONTROLE DE COMPENSAÇÃO FÍSICA SSTR (ANOMALIA DE CONFORMIDADE)</p>
                  </>
                )}
              </div>

              {/* IS VALE DECLARATION TERM */}
              {isVale && (
                <div className="my-4 p-4 border border-rose-350 bg-rose-50 rounded text-[11px] leading-relaxed italic text-slate-700 text-left font-sans">
                  <strong>DECLARAÇÃO DE DEBITAMENTO E RESPONSABILIDADO:</strong> "Pelo presente instrumento de acerto particular do Promax SSTR, nós, na qualidade de condutor/ajudante responsáveis pela rota de entrega descrita abaixo, assumimos a integral responsabilidade pela falta ou avaria física de mercadoria ocorrida na referida entrega ao cliente. Declaramos concordância em relação ao faturamento legal e posterior indenização operacional dos valores no fechamento de perdas logísticas."
                </div>
              )}

              {/* METADATA BLOCK FOR DATES & CARGO CHASSIS */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 border border-gray-300 p-4 rounded bg-slate-50/50 mb-6 font-sans text-xs">
                <div>
                  <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wide block">Data da Ocorrência (Anomalia):</p>
                  <p className="font-bold text-slate-900">{cast.mapaDataAnomalia || req.data.split(" ")[0]}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wide block">Data da Efetiva Liquidação/Entrega:</p>
                  <p className="font-bold text-slate-900">{cast.dataEntregaRecibo || new Date().toLocaleDateString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wide block">No. do Mapa de Carga (Rota):</p>
                  <p className="font-bold font-mono text-slate-900 select-all">{req.mapa || "NÃO CONSTA"}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wide block">Nota Fiscal Originária / Série:</p>
                  <p className="font-bold font-mono text-slate-900 select-all">{req.nf}</p>
                </div>
              </div>

              {/* CUSTOMER PDV INFORMATION CONTAINER */}
              {(() => {
                const pdvDb = getPdvDatabase();
                const clientInfo = getClientDetails(req.nb, pdvDb, promaxRecords);
                const nbStr = (req.nb || "").trim();
                const isFound = nbStr && (!!pdvDb[nbStr] || Object.keys(pdvDb).some(k => parseInt(k, 10) === parseInt(nbStr, 10)) || promaxRecords.some(r => (r.codigoCliente || "").trim() === nbStr));

                return (
                  <div className="border border-gray-300 p-4 rounded mb-6 text-xs text-left bg-slate-50">
                    <span className="text-slate-500 uppercase font-bold text-[9.5px] block border-b border-gray-200 pb-1 mb-2 tracking-wider">Dados cadastrais do Ponto de Venda (PDV):</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 mb-2">
                      <p className="font-bold text-slate-900 flex items-center gap-1">
                        <span>Razão Social:</span>
                        {!isFound ? (
                          <input
                            type="text"
                            value={customPrintNome}
                            onChange={(e) => handleUpdatePrintNome(e.target.value)}
                            placeholder="DIGITE A RAZÃO SOCIAL"
                            className="font-bold text-black uppercase bg-amber-50/30 hover:bg-amber-100/50 focus:bg-white border-b border-gray-300 hover:border-indigo-400 focus:border-indigo-600 focus:outline-none px-1 rounded text-xs leading-none transition-colors w-full max-w-[280px] no-print-border font-sans"
                          />
                        ) : (
                          <span className="uppercase text-slate-800 font-medium">{customPrintNome || clientInfo.razaoSocial}</span>
                        )}
                      </p>
                      <p className="font-bold text-slate-900 flex items-center gap-1">
                        <span>Nome Fantasia:</span>
                        {!isFound ? (
                          <input
                            type="text"
                            value={customPrintNome}
                            onChange={(e) => handleUpdatePrintNome(e.target.value)}
                            placeholder="DIGITE O NOME FANTASIA"
                            className="font-bold text-black uppercase bg-amber-50/30 hover:bg-amber-100/50 focus:bg-white border-b border-gray-300 hover:border-indigo-400 focus:border-indigo-600 focus:outline-none px-1 rounded text-xs leading-none transition-colors w-full max-w-[280px] no-print-border font-sans"
                          />
                        ) : (
                          <span className="uppercase text-slate-800 font-medium">{customPrintNome || clientInfo.nomeFantasia || clientInfo.razaoSocial}</span>
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-2 text-slate-600 pt-2 border-t border-dashed border-gray-200">
                      <p>Código SSTR (NB): <strong className="text-black font-mono">{req.nb}</strong></p>
                      <p className="flex items-center gap-1">
                        <span>CPF/CNPJ:</span>
                        {!isFound ? (
                          <input
                            type="text"
                            value={customPrintDocumento}
                            onChange={(e) => handleUpdatePrintDocumento(e.target.value)}
                            placeholder="DIGITE O CNPJ/CPF"
                            className="font-mono text-black uppercase bg-amber-50/30 hover:bg-amber-100/50 focus:bg-white border-b border-gray-300 hover:border-indigo-400 focus:border-indigo-600 focus:outline-none px-1 rounded text-xs leading-none transition-colors w-full max-w-[180px] no-print-border font-sans"
                          />
                        ) : (
                          <strong className="text-black font-mono">{customPrintDocumento || clientInfo.documento || "NÃO CONSTA"}</strong>
                        )}
                      </p>
                      
                      <p className="col-span-2 flex items-center gap-1.5 flex-wrap">
                        <span>Município:</span>
                        <input
                          type="text"
                          value={customPrintCidade}
                          onChange={(e) => handleUpdatePrintCidade(e.target.value)}
                          placeholder="DIGITE A CIDADE MANUALMENTE"
                          className="font-bold text-black uppercase bg-amber-50/30 hover:bg-amber-100/50 focus:bg-white border-b border-gray-300 hover:border-indigo-400 focus:border-indigo-600 focus:outline-none px-1 rounded text-xs leading-none transition-colors w-64 no-print-border font-sans"
                        />
                        {clientInfo.uf && <span> - <strong className="text-black uppercase">{clientInfo.uf}</strong></span>}
                        {clientInfo.cep && <span> | CEP: <strong className="text-black font-mono">{clientInfo.cep}</strong></span>}
                      </p>
                      
                      <p className="col-span-2 font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                        <span>Endereço Completo:</span>
                        {!isFound ? (
                          <input
                            type="text"
                            value={customPrintEndereco}
                            onChange={(e) => handleUpdatePrintEndereco(e.target.value)}
                            placeholder="DIGITE O ENDEREÇO COMPLETO"
                            className="font-bold text-black uppercase bg-amber-50/30 hover:bg-amber-100/50 focus:bg-white border-b border-gray-300 hover:border-indigo-400 focus:border-indigo-600 focus:outline-none px-1 rounded text-xs leading-none transition-colors flex-1 min-w-[300px] no-print-border font-sans"
                          />
                        ) : (
                          <strong className="text-black uppercase font-bold">
                            {[
                              customPrintEndereco || clientInfo.endereco?.trim(),
                              clientInfo.complemento?.trim(),
                              clientInfo.bairro ? `BAIRRO: ${clientInfo.bairro.trim()}` : "",
                              customPrintCidade ? `${customPrintCidade.trim()} - ${clientInfo.uf?.trim() || "PB"}` : "",
                              clientInfo.cep ? `CEP: ${clientInfo.cep.trim()}` : ""
                            ].filter(Boolean).join(", ")}
                          </strong>
                        )}
                      </p>
                      
                      <p className="col-span-2">Setor de Atendimento: <strong className="text-black font-mono">{req.setor}</strong></p>
                    </div>
                  </div>
                );
              })()}

              {/* PRODUCT LACK LISTING TABLE */}
              <div className="mb-6">
                <span className="text-slate-500 uppercase font-bold text-[9.5px] block pb-1 mb-2 tracking-wider">Produtos Associados à Reposição / Falta:</span>
                <table className="w-full text-xs font-sans border-collapse border border-gray-300 text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-gray-300">
                      <th className="p-2.5 border-r border-gray-300">Código Item</th>
                      <th className="p-2.5 border-r border-gray-300">Descrição Comercial do SKU</th>
                      <th className="p-2.5 border-r border-gray-300 text-center">Quantidade</th>
                      <th className="p-2.5 border-r border-gray-300 text-center">Volume Hectolitros</th>
                      {isVale && <th className="p-2.5 text-right">Preço Unit.</th>}
                      {isVale && <th className="p-2.5 text-right">Total R$</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {printableItems.map((sub, index) => {
                      const isSwap = !!sub.produtoAhEnviar || !!sub.produtoARecolher;
                      const entregarInfo = isSwap ? parseProductString(sub.produtoAhEnviar, sub.quantidade) : null;
                      const recolherInfo = isSwap ? parseProductString(sub.produtoARecolher, sub.quantidade) : null;
                      
                      const itemCode = entregarInfo ? entregarInfo.code : sub.item;
                      const itemDesc = entregarInfo ? entregarInfo.name : sub.descricao;
                      const itemQty = entregarInfo ? entregarInfo.qty : sub.quantidade;

                      const itemUnitPrice = promaxRecords.find(r => r.produto === itemCode)?.valorUnitario || 98.50;
                      
                      // Check if it is a "Falta de SKU" or "Falta no SKU" or contains "falta" and "sku" (e.g. "Falta de SKU Completo", "Falta de SKU Fechado")
                      const subMotiveLower = (sub.motivo || "").toLowerCase();
                      const reqMotiveLower = (req.motivo || "").toLowerCase();
                      const isFaltaDeSkuItem = 
                        (subMotiveLower.includes("falta") && subMotiveLower.includes("sku")) ||
                        (reqMotiveLower.includes("falta") && reqMotiveLower.includes("sku")) ||
                        subMotiveLower.includes("sku") ||
                        reqMotiveLower.includes("sku") ||
                        subMotiveLower.includes("fechado") ||
                        reqMotiveLower.includes("fechado");

                      const rawItemUm = promaxRecords.find(r => r.produto === itemCode)?.um || "cx";
                      const itemUm = isFaltaDeSkuItem ? "sku" : rawItemUm;
                      
                      return (
                        <React.Fragment key={sub.id || index}>
                          <tr className="border-b border-gray-300">
                            <td className="p-2.5 border-r border-gray-300 font-mono font-bold">{itemCode}</td>
                            <td className="p-2.5 border-r border-gray-300 uppercase shrink-0 font-medium font-sans">
                              {itemDesc || "Item Solicitado no SSTR"}
                              {isSwap && <span className="font-bold text-amber-600 text-[10px] block font-sans">🔄 SKU COMPENSADO DE INVERSÃO</span>}
                            </td>
                            <td className="p-2.5 border-r border-gray-300 text-center font-bold font-mono">
                              {itemQty} {itemUm}
                            </td>
                            <td className="p-2.5 border-r border-gray-300 text-center font-mono">{(sub.hectolitros || 0).toFixed(4)} HL</td>
                            {isVale && <td className="p-2.5 text-right font-mono">{formatCurrency(itemUnitPrice)}</td>}
                            {isVale && <td className="p-2.5 text-right font-mono font-bold">{formatCurrency(itemUnitPrice * itemQty)}</td>}
                          </tr>
                          
                          {/* INVERSION SWAP EXPLICIT BLOCK */}
                          {isSwap && recolherInfo && entregarInfo && (
                            <tr className="bg-amber-50/45 border-b border-gray-300">
                              <td colSpan={isVale ? 6 : 4} className="p-2 text-[10.5px] font-sans leading-relaxed pl-6">
                                <div className="border-l-4 border-amber-500 pl-3.5 space-y-1">
                                  <p className="text-amber-700 font-bold uppercase text-[9px] tracking-wide">COMPROVAÇÃO DE INVERSÃO LOGÍSTICA:</p>
                                  <p>⬅️ <strong className="text-slate-700">MERCADORIA RECUSADA / A RECOLHER:</strong> SKU: <strong className="font-mono text-black">#{recolherInfo.code}</strong> - {recolherInfo.name} <span className="font-mono font-bold text-black border-b border-dashed border-black pb-0.5 select-all">(Qtd: {recolherInfo.qty} {isFaltaDeSkuItem ? "sku" : (promaxRecords.find(r => r.produto === recolherInfo.code)?.um || "cx")})</span></p>
                                  <p>➡️ <strong className="text-slate-700">MERCADORIA CORRETA ENVIADA / A ENTREGAR (A NOTA ORIGINAL):</strong> SKU: <strong className="font-mono text-black">#{entregarInfo.code}</strong> - {entregarInfo.name} <span className="font-mono font-bold text-black border-b border-dashed border-black pb-0.5 select-all">(Qtd: {entregarInfo.qty} {isFaltaDeSkuItem ? "sku" : (promaxRecords.find(r => r.produto === entregarInfo.code)?.um || "cx")})</span></p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t border-gray-400">
                      <td colSpan={2} className="p-2.5 text-right">TOTAIS DA CARGA COMPENSADA:</td>
                      <td className="p-2.5 text-center font-mono">
                        {printableItems.reduce((s, c) => s + c.quantidade, 0)} {
                          (() => {
                            const requestMotiveLower = (req.motivo || "").toLowerCase();
                            const hasFaltaDeSkuOverall = (requestMotiveLower.includes("falta") && requestMotiveLower.includes("sku")) || 
                              printableItems.some(item => {
                                const mLower = (item.motivo || "").toLowerCase();
                                return mLower.includes("falta") && mLower.includes("sku");
                              });
                            return hasFaltaDeSkuOverall ? "sku" : "cx";
                          })()
                        }
                      </td>
                      <td className="p-2.5 text-center font-mono">{(req.hectolitros || printableItems.reduce((s, c) => s + (c.hectolitros || 0), 0)).toFixed(4)} HL</td>
                      {isVale && <td colSpan={2} className="p-2.5 text-right font-mono text-rose-700">{formatCurrency(totalPricingValue)}</td>}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* CREW RESPONSIBLE LOGISTICS PERSONNEL SECTION */}
              <div className="border border-gray-300 p-3 rounded mb-3.5 text-xs text-left font-sans bg-slate-50/20">
                <span className="text-slate-500 uppercase font-bold text-[9px] block border-b border-gray-200 pb-1 mb-2 tracking-wider">Condutores e Auxiliares de Transporte Associados:</span>
                <div className="grid grid-cols-2 gap-4">
                  <p className="text-[11px]">🚚 Motorista Operacional: <strong className="text-black uppercase">{cast.faltaMotorista || "NÃO DECLARADO"}</strong> {cast.faltaMotoristaCpf && <span className="font-mono text-[9px] text-slate-600 block">(CPF: {cast.faltaMotoristaCpf})</span>}</p>
                  <div className="text-[11px]">
                    <p className="mb-1 text-slate-500">👥 Auxiliares / Ajudantes envolvidos:</p>
                    {cast.faltaAjudante1 ? (
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-800 font-sans">
                        <li>
                          <strong className="text-black uppercase">{cast.faltaAjudante1}</strong>
                          {cast.faltaAjudante1Cpf && <span className="font-mono text-[9px] text-slate-600"> (CPF: {cast.faltaAjudante1Cpf})</span>}
                        </li>
                        {cast.faltaAjudante2 && (
                          <li>
                            <strong className="text-black uppercase">{cast.faltaAjudante2}</strong>
                            {cast.faltaAjudante2Cpf && <span className="font-mono text-[9px] text-slate-600"> (CPF: {cast.faltaAjudante2Cpf})</span>}
                          </li>
                        )}
                      </ul>
                    ) : (
                      <strong className="text-black uppercase">{cast.faltaAjudantes || "NÃO DECLARADOS"}</strong>
                    )}
                  </div>
                </div>

                {/* DYNAMIC VALUE DIVISION BOX IN CASE OF VALES */}
                {isVale && (() => {
                  const { count, crew, individualValue } = getValeSplitInfo();
                  return (
                    <div className="mt-2.5 p-2 bg-rose-50 border border-rose-200 rounded text-xs text-left font-sans">
                      <span className="text-rose-900 uppercase font-extrabold text-[8.5px] block border-b border-rose-200/50 pb-0.5 mb-1 tracking-wider">
                        📊 RATEIO DE PAGAMENTO DO VALE (DIVISÃO EM {count} INTEGRANTE(S)):
                      </span>
                      <div className="space-y-0.5">
                        {crew.map((member, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[10px] text-slate-800">
                            <span>
                              <strong>{idx + 1}. {member.role}:</strong> {member.name}
                            </span>
                            <span className="font-mono font-black text-rose-700">
                              {formatCurrency(individualValue)} {count === 1 ? "(100% Integral)" : `(1/${count} do Valor)`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* COMMENTS AND DIRECT OBSERVATIONS */}
              <div className="border border-gray-350 p-2.5 rounded mb-3.5 text-xs">
                <span className="text-slate-500 uppercase font-bold text-[9px] block pb-0.5 mb-1 tracking-wider">Anotações Gerais de Entrega:</span>
                <p className="italic text-slate-700 font-sans leading-relaxed text-[10px]">
                  "{cast.observacaoRecibo || "Operação física de devolução/ajuste documentada para faturamento interno ou reposição SSTR no Promax PW. Sem empenho de faturas adicionais para o estabelecimento se classificado erro de carregamento."}"
                </p>
              </div>

              {/* DYNAMIC SIGNATURE DECISION MATRIX */}
              <div className="mt-4 pt-3 border-t border-gray-200 font-sans text-xs">
                {isVale ? (() => {
                  const { count, crew, individualValue } = getValeSplitInfo();
                  const gridColsClass = crew.length === 1 ? "grid-cols-1" : crew.length === 2 ? "grid-cols-2" : "grid-cols-3";
                  return (
                    <div className="space-y-4">
                      <p className="text-center text-[9.5px] text-slate-600 mb-2 font-semibold">Os assinantes abaixo declaram-se cientes e assumem responsabilidade no acerto operacional:</p>
                      <div className={`grid ${gridColsClass} gap-6 pt-1 text-center`}>
                        {crew.map((member, idx) => (
                          <div key={idx} className="space-y-1 font-sans">
                            <div className="border-t border-black w-full my-1"></div>
                            <p className="font-extrabold uppercase text-black text-[9.5px] leading-tight truncate">{member.name}</p>
                            <p className="text-slate-500 font-mono text-[7.5px] leading-tight block">CPF: {member.cpf || "_________________"}</p>
                            <div className="text-[8.5px] text-rose-700 font-bold leading-tight uppercase font-mono mt-0.5">
                              Pagar: {formatCurrency(individualValue)}
                            </div>
                            <p className="text-slate-500 font-sans text-[8px] font-medium">Assinatura do {member.role === "Motorista" ? "Condutor" : member.role}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })() : (() => {
                  const pdvDb = getPdvDatabase();
                  const clientInfo = getClientDetails(req.nb, pdvDb, promaxRecords);
                  const cityText = customPrintCidade ? `${customPrintCidade.trim()} - ${clientInfo.uf?.trim() || "PB"}` : "Guarabira - PB";
                  return (
                    /* SIGNATURES RECIBO (PDV ASSINANTE / CUSTOMER SIGN) */
                    <div className="space-y-6">
                      {/* Top sub-messages, balanced */}
                      <div className="grid grid-cols-2 gap-10 mb-8 items-end text-[11px] text-slate-600 leading-normal font-sans">
                        <div className="italic text-left">
                          Atesto que recebi e conferi os volumes descritos neste cupom de conformidade física, suprindo qualquer falta reclamada.
                        </div>
                        <div className="text-right font-mono uppercase font-bold text-black">
                          {cityText}, {cast.dataEntregaRecibo || new Date().toLocaleDateString("pt-BR")}
                        </div>
                      </div>

                      {/* Signature lines perfectly aligned */}
                      <div className="grid grid-cols-2 gap-12 pt-4 font-sans">
                        <div className="text-center space-y-1.5">
                          <div className="border-t border-black w-full my-1"></div>
                          <p className="font-extrabold uppercase text-black">Ponto de Venda (PDV Assinante)</p>
                          <p className="text-slate-500 font-semibold text-[9.5px]">Assinatura e carimbo do estabelecimento do Cliente</p>
                        </div>
                        
                        <div className="text-center space-y-1.5">
                          <div className="border-t border-black w-full my-1"></div>
                          <p className="font-extrabold uppercase text-black">Conferência Pau Brasil Ambev</p>
                          <p className="text-slate-500 font-mono text-[9px]">Assinatura do Lançador/Controle Técnico</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* FOOLS NOTCH FOR FISCAL ARCHIVAL */}
              <div className="absolute right-4 top-4 text-[7px] font-mono border-dashed border border-slate-300 p-0.5 text-slate-400 font-bold uppercase select-none tracking-widest leading-none no-print">
                PROMAX SSTR LEDGER • CNPJ 53.935.732/0001-30
              </div>

            </div>
          </div>
        );
      })()}

      {/* ACTION DIALOG MODAL (IFRAME SAFE) */}
      {modalAction && (() => {
        const targetReq = requests.find(r => r.id === modalAction.requestId);
        if (!targetReq) return null;
        
        return (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in no-print">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-bold text-white font-mono flex items-center gap-1.5">
                  {modalAction.type === "reject" && <span className="text-red-500">🔴 Reprovar Definitivamente</span>}
                  {modalAction.type === "corrigir" && <span className="text-amber-500">⚠️ Solicitar Correção pelo RN</span>}
                  {modalAction.type === "register" && <span className="text-emerald-500">✔️ Lançar como Cadastrado</span>}
                  {modalAction.type === "delete" && <span className="text-slate-400">⚠️ Excluir Lançamento</span>}
                </h3>
                <button 
                  onClick={() => setModalAction(null)} 
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-350 space-y-1 font-sans">
                <p><strong>Nota Fiscal:</strong> {targetReq.nf}</p>
                <p><strong>Setor RN:</strong> {targetReq.setor} | <strong>NB Cliente:</strong> {targetReq.nb}</p>
              </div>

              {/* Input for Reject / Corrigir */}
              {(modalAction.type === "reject" || modalAction.type === "corrigir") && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-300 uppercase block">
                    {modalAction.type === "reject" ? "Motivo da Reprovação Definitiva (Obrigatório):" : "O que deve ser corrigido/ajustado (Obrigatório):"}
                  </label>
                  <textarea
                    placeholder={modalAction.type === "reject" ? "Ex: Material recusado ou sem elegibilidade..." : "Ex: Enviar foto nítida do produto, corrigir quantidade de engradados..."}
                    value={modalInput}
                    onChange={(e) => setModalInput(e.target.value)}
                    rows={3}
                    className={`w-full bg-slate-955 border rounded-lg p-2 text-xs text-slate-100 placeholder-slate-650 focus:outline-none ${
                      modalAction.type === "reject" ? "border-red-850/60 focus:border-red-500" : "border-amber-850/60 focus:border-amber-500"
                    }`}
                  />
                </div>
              )}

              {/* Input for Register */}
              {modalAction.type === "register" && (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-955/40 border border-blue-900/30 rounded-xl space-y-1">
                    <p className="text-xs text-blue-350 font-sans font-bold flex items-center gap-1.5">
                      <span>⚠️ Confirmação de Cadastro no Promax:</span>
                    </p>
                    <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
                      Você confirma que esta nota fiscal <strong>{targetReq.nf}</strong> do cliente <strong>{targetReq.nb}</strong> foi registrada e liquidada corretamente no sistema Promax PW?
                    </p>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-300 uppercase block font-mono">Responsável pelo Lançamento:</label>
                    <input
                      type="text"
                      value={modalInput}
                      onChange={(e) => setModalInput(e.target.value)}
                      className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                      placeholder="Ex: Responsável pelo Controle"
                    />
                  </div>
                </div>
              )}

              {/* Info for Delete */}
              {modalAction.type === "delete" && (
                <p className="text-xs text-red-400 leading-relaxed">
                  Tem certeza que deseja apagar permanentemente esta solicitação? Esta ação é irreversível e removerá o registro do controle.
                </p>
              )}

              {modalError && (
                <p className="text-[10px] font-bold text-red-500 bg-red-950/20 border border-red-900/30 p-2 rounded-lg text-left">
                  ⚠️ {modalError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-850 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleModalConfirm}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-md cursor-pointer ${
                    modalAction.type === "reject" ? "bg-red-650 hover:bg-red-700" :
                    modalAction.type === "corrigir" ? "bg-amber-600 hover:bg-amber-700 text-slate-900" :
                    modalAction.type === "register" ? "bg-blue-600 hover:bg-blue-700" :
                    "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {modalAction.type === "register" ? "Confirmar Lançamento" :
                   modalAction.type === "reject" ? "Confirmar Reprovação" :
                   modalAction.type === "corrigir" ? "Solicitar Ajuste do RN" :
                   "Confirmar Exclusão"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CONCLUDED BAIXA SUCCESS / PATH COPY OVERLAY */}
      {concludedBaixa && (() => {
        return (
          <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in no-print">
            <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-left font-sans">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold text-emerald-400 font-mono flex items-center gap-2 uppercase tracking-wide">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>Baixa Física Registrada com Sucesso!</span>
                </h3>
                <button 
                  onClick={() => setConcludedBaixa(null)} 
                  className="p-1 hover:bg-slate-850 rounded-full text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  O PDF de evidência completo foi compilado no servidor e o download do arquivo <strong>doc-evidência</strong> foi iniciado no seu navegador.
                </p>

                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-850 space-y-2">
                  <p className="text-[10px] text-slate-450 font-extrabold uppercase tracking-widest font-mono">
                    Pasta de Rede Destino para Arquivamento:
                  </p>
                  
                  <div className="flex items-center gap-2 bg-slate-900/65 border border-slate-800 p-2 rounded-lg">
                    <input 
                      type="text" 
                      readOnly 
                      value="P:\Guarabira\2026\04.LOGISTICA\ARMAZÉM\3.0 ACURACIDADE\3.1 PACOTE PREJUIZO\TROCAS\REGISTROS"
                      className="bg-transparent text-[11px] font-mono text-emerald-300 flex-1 outline-none select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText("P:\\Guarabira\\2026\\04.LOGISTICA\\ARMAZÉM\\3.0 ACURACIDADE\\3.1 PACOTE PREJUIZO\\TROCAS\\REGISTROS");
                        alert("Caminho copiado com sucesso para a sua área de transferência!");
                      }}
                      className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-700/40 text-emerald-300 hover:text-white rounded text-[10px] font-mono font-bold cursor-pointer transition-all flex items-center gap-1 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Caminho</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-500 italic leading-snug">
                    💡 <strong>Como salvar na rede:</strong> Clique no botão <strong>"Copiar Caminho"</strong> acima, abra o Explorador de Arquivos do Windows (Windows Explorer), clique na barra de endereço superior, cole (Ctrl+V) e tecle Enter para acessar a pasta direta. Mova o arquivo PDF baixado para lá.
                  </p>
                </div>

                <div className="bg-slate-950/40 border border-slate-850/60 p-3 rounded-xl grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                  <p><strong>Nota Fiscal:</strong> <span className="text-white">{concludedBaixa.nf}</span></p>
                  <p><strong>Código Client NB:</strong> <span className="text-white">{concludedBaixa.nb}</span></p>
                  <p><strong>Protocolo ID:</strong> <span className="text-white">{concludedBaixa.id}</span></p>
                  <p><strong>Data da Baixa:</strong> <span className="text-white">{concludedBaixa.faltaBaixaDate}</span></p>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-850">
                <button
                  type="button"
                  onClick={() => setConcludedBaixa(null)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 hover:text-white rounded-lg text-xs font-bold text-white shadow-lg cursor-pointer transition-colors"
                >
                  Concluir e Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
