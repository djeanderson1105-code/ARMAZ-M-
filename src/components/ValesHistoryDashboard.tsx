import React, { useState, useMemo, useEffect } from "react";
import { 
  Search, 
  Printer, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  UserCheck, 
  AlertCircle, 
  Trash2, 
  PlusCircle, 
  X, 
  FileSpreadsheet, 
  RefreshCw, 
  CheckCircle2, 
  Eye,
  Edit3,
  User,
  Users,
  Check,
  ShieldCheck,
  Sparkles,
  Calendar,
  BarChart3,
  ArrowRight,
  Filter,
  Award
} from "lucide-react";
import { exportValesPacotePrejuizoExcel } from "../utils/excelExport";
import { useSstrData } from "../context/SstrDataContext";
import { calculateRequestValueAndHL, getProductsDatabase } from "../data/products";
import { 
  isInversaoOrSwapReq, 
  calculateValeRateio, 
  isDriverX, 
  MOTORISTAS_ROTAS, 
  LISTA_CREW, 
  DEFAULT_LISTA_CREW,
  getCrewDetailByName,
  getMotoristasRotas,
  getListaCrew,
  PendingRequest,
  RequestItem
} from "../types";

export interface ValeEntry {
  id: string;
  requestId: string;
  nf: string;
  rota: string;
  dataEmissao: string;
  motorista: string;
  motoristaCpf: string;
  ajudantes: string;
  ajudante1: string;
  ajudante1Cpf: string;
  ajudante2: string;
  ajudante2Cpf: string;
  hectolitros: number;
  valorTotal: number;
  itemsCount: number;
  status?: "emitido" | "pendente" | "assinado" | "compensado";
  originalRequest: any;
}

interface ValesHistoryDashboardProps {
  vales: ValeEntry[];
  onReimprimir: (vale: ValeEntry) => void;
  onDeleteSingleVale?: (id: string) => void;
  onUpdateValeStatus?: (id: string, newStatus: "emitido" | "pendente" | "assinado" | "compensado") => void;
  onInspectRequest?: (vale: ValeEntry) => void;
  onCreateAvulsoVale?: (data: {
    mapa: string;
    itemCode: string;
    itemDesc?: string;
    data: string;
    quantidade: number;
    unidadeMedida: "cx" | "und";
    motorista: string;
    ajudantes: string;
    observacao: string;
  }) => void;
}

const MONTH_NAMES = [
  { num: 1, short: "Jan", full: "Janeiro", label: "01 - Janeiro" },
  { num: 2, short: "Fev", full: "Fevereiro", label: "02 - Fevereiro" },
  { num: 3, short: "Mar", full: "Março", label: "03 - Março" },
  { num: 4, short: "Abr", full: "Abril", label: "04 - Abril" },
  { num: 5, short: "Mai", full: "Maio", label: "05 - Maio" },
  { num: 6, short: "Jun", full: "Junho", label: "06 - Junho" },
  { num: 7, short: "Jul", full: "Julho", label: "07 - Julho" },
  { num: 8, short: "Ago", full: "Agosto", label: "08 - Agosto" },
  { num: 9, short: "Set", full: "Setembro", label: "09 - Setembro" },
  { num: 10, short: "Out", full: "Outubro", label: "10 - Outubro" },
  { num: 11, short: "Nov", full: "Novembro", label: "11 - Novembro" },
  { num: 12, short: "Dez", full: "Dezembro", label: "12 - Dezembro" },
];

/**
 * Robust date parser for Vales supporting DD/MM/YYYY, YYYY-MM-DD, and fallbacks
 */
export const parseValeDate = (dateStr?: string, fallbackReq?: any): Date | null => {
  const tryParse = (str?: string): Date | null => {
    if (!str || typeof str !== "string") return null;
    const clean = str.trim();
    if (!clean) return null;

    if (clean.includes("/")) {
      const parts = clean.split("/");
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          return new Date(y, m, d, 12, 0, 0);
        }
      }
    } else if (clean.includes("-")) {
      const dateOnly = clean.split("T")[0];
      const parts = dateOnly.split("-");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            return new Date(y, m, d, 12, 0, 0);
          }
        } else {
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
            return new Date(y, m, d, 12, 0, 0);
          }
        }
      }
    }
    const parsed = new Date(clean);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const parsed = tryParse(dateStr);
  if (parsed) return parsed;
  if (fallbackReq) {
    return tryParse(fallbackReq.data) || tryParse(fallbackReq.cadastroDate);
  }
  return null;
};

export const formatDisplayDate = (dStr: string): string => {
  if (!dStr) return "";
  if (dStr.includes("-")) {
    const parts = dStr.split("T")[0].split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  return dStr;
};

export const getSelectedMonthsLabel = (months: number[], format: "short" | "full" | "label" = "short"): string => {
  if (months.length === 0) return "Nenhum";
  if (months.length === 12) return "Todos os Meses";
  const sorted = [...months].sort((a, b) => a - b);
  if (format === "label") {
    return sorted.map(num => MONTH_NAMES.find(m => m.num === num)?.label).filter(Boolean).join(", ");
  }
  if (format === "full") {
    if (sorted.length === 1) return MONTH_NAMES.find(m => m.num === sorted[0])?.full || "";
    if (sorted.length === 2) {
      const m1 = MONTH_NAMES.find(m => m.num === sorted[0])?.full;
      const m2 = MONTH_NAMES.find(m => m.num === sorted[1])?.full;
      return `${m1} e ${m2}`;
    }
    return sorted.map(num => MONTH_NAMES.find(m => m.num === num)?.full).filter(Boolean).join(", ");
  }
  return sorted.map(num => MONTH_NAMES.find(m => m.num === num)?.short).filter(Boolean).join(", ");
};

export default function ValesHistoryDashboard({ 
  vales, 
  onReimprimir, 
  onDeleteSingleVale, 
  onUpdateValeStatus, 
  onInspectRequest, 
  onCreateAvulsoVale 
}: ValesHistoryDashboardProps) {
  // Navigation: "acumulado" (guia principal) vs "mensal" (guia mês a mês)
  const [activeTabMode, setActiveTabMode] = useState<"acumulado" | "mensal">("acumulado");
  
  // Selected months array (supports multiple selection when holding Ctrl key or toggling multi-select)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([8]); // Default Agosto (Mês 8, 2026)
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);

  // Custom Day Range Filter for searching and exporting vales
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("todas");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("todos");
  const [confirmDeleteValeId, setConfirmDeleteValeId] = useState<string | null>(null);

  // Vale Avulso Modal State
  const [isAvulsoModalOpen, setIsAvulsoModalOpen] = useState(false);
  const [avulsoMapa, setAvulsoMapa] = useState("");
  const [avulsoItemCode, setAvulsoItemCode] = useState("");
  const [avulsoItemDesc, setAvulsoItemDesc] = useState("");
  const [avulsoData, setAvulsoData] = useState(new Date().toISOString().split("T")[0]);
  const [avulsoQuantidade, setAvulsoQuantidade] = useState("1");
  const [avulsoUnidade, setAvulsoUnidade] = useState<"cx" | "und">("cx");
  const [avulsoMotorista, setAvulsoMotorista] = useState("");
  const [avulsoAjudantes, setAvulsoAjudantes] = useState("");
  const [avulsoObs, setAvulsoObs] = useState("");
  const [avulsoError, setAvulsoError] = useState<string | null>(null);

  // Recalculate Vales State
  const { saveValeEntry, deleteValeEntry, records: promaxRecords, pendingRequests, savePendingRequest, deletePendingRequest } = useSstrData();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalculateModalOpen, setRecalculateModalOpen] = useState(false);
  const [recalculateSummary, setRecalculateSummary] = useState<{
    totalAnalyzed: number;
    totalUpdated: number;
    totalDeletedInversions: number;
    changes: { id: string; nf: string; oldVal: number; newVal: number; oldHl: number; newHl: number }[];
  } | null>(null);

  // Edit Driver & Crew Modal State
  const [isEditDriverModalOpen, setIsEditDriverModalOpen] = useState(false);
  const [editingVale, setEditingVale] = useState<ValeEntry | null>(null);
  const [editMotoristaName, setEditMotoristaName] = useState("");
  const [editMotoristaCpf, setEditMotoristaCpf] = useState("");
  const [editAjudante1Name, setEditAjudante1Name] = useState("");
  const [editAjudante1Cpf, setEditAjudante1Cpf] = useState("");
  const [editAjudante2Name, setEditAjudante2Name] = useState("");
  const [editAjudante2Cpf, setEditAjudante2Cpf] = useState("");
  const [isSavingDriverEdit, setIsSavingDriverEdit] = useState(false);
  const [driverEditFeedback, setDriverEditFeedback] = useState<string | null>(null);

  const handleOpenEditDriverModal = (vale: ValeEntry) => {
    setEditingVale(vale);
    setEditMotoristaName(vale.motorista || "");
    setEditMotoristaCpf(vale.motoristaCpf || "");
    setEditAjudante1Name(vale.ajudante1 || "");
    setEditAjudante1Cpf(vale.ajudante1Cpf || "");
    setEditAjudante2Name(vale.ajudante2 || "");
    setEditAjudante2Cpf(vale.ajudante2Cpf || "");
    setDriverEditFeedback(null);
    setIsEditDriverModalOpen(true);
  };

  const handleSaveDriverEdit = async () => {
    if (!editingVale) return;
    setIsSavingDriverEdit(true);

    try {
      const isX = isDriverX(editMotoristaName);
      const cleanDriverName = editMotoristaName.trim() || (isX ? "X" : "Motorista Não Declarado");
      const cleanDriverCpf = isX ? "000.000.000-00" : (editMotoristaCpf.trim() || "");

      const helpersList: string[] = [];
      if (editAjudante1Name.trim()) helpersList.push(editAjudante1Name.trim());
      if (editAjudante2Name.trim()) helpersList.push(editAjudante2Name.trim());
      const helpersCsv = helpersList.join(", ");

      const updatedVale: ValeEntry = {
        ...editingVale,
        motorista: cleanDriverName,
        motoristaCpf: cleanDriverCpf,
        ajudante1: editAjudante1Name.trim(),
        ajudante1Cpf: editAjudante1Cpf.trim(),
        ajudante2: editAjudante2Name.trim(),
        ajudante2Cpf: editAjudante2Cpf.trim(),
        ajudantes: helpersCsv || (editAjudante1Name.trim() ? editAjudante1Name.trim() : "Sem Ajudantes"),
        originalRequest: editingVale.originalRequest ? {
          ...editingVale.originalRequest,
          faltaMotorista: cleanDriverName,
          faltaMotoristaCpf: cleanDriverCpf,
          faltaAjudante1: editAjudante1Name.trim(),
          faltaAjudante1Cpf: editAjudante1Cpf.trim(),
          faltaAjudante2: editAjudante2Name.trim(),
          faltaAjudante2Cpf: editAjudante2Cpf.trim(),
          motorista: cleanDriverName,
          motoristaCpf: cleanDriverCpf,
          ajudante1: editAjudante1Name.trim(),
          ajudante1Cpf: editAjudante1Cpf.trim(),
          ajudante2: editAjudante2Name.trim(),
          ajudante2Cpf: editAjudante2Cpf.trim(),
          ajudantes: helpersCsv
        } : undefined
      };

      await saveValeEntry(updatedVale);

      const matchingReq = pendingRequests.find(r => 
        r.id === editingVale.requestId || 
        r.id === editingVale.originalRequest?.id || 
        (r as any).valeId === editingVale.id ||
        (r.nf === editingVale.nf && (r as any).mapa === (editingVale.originalRequest?.mapa || (editingVale as any).mapa))
      );

      if (matchingReq) {
        const updatedReq: PendingRequest = {
          ...matchingReq,
          faltaMotorista: cleanDriverName,
          faltaMotoristaCpf: cleanDriverCpf,
          faltaAjudante1: editAjudante1Name.trim(),
          faltaAjudante1Cpf: editAjudante1Cpf.trim(),
          faltaAjudante2: editAjudante2Name.trim(),
          faltaAjudante2Cpf: editAjudante2Cpf.trim()
        };
        await savePendingRequest(updatedReq);
      }

      setDriverEditFeedback("Equipe do Vale e Solicitação de Falta sincronizadas com sucesso!");
      setTimeout(() => {
        setIsEditDriverModalOpen(false);
      }, 900);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao sincronizar motorista: " + err.message);
    } finally {
      setIsSavingDriverEdit(false);
    }
  };

  // Auto-cleanup any historical vales that were generated for Inversion (inversão não gera vale)
  useEffect(() => {
    if (!vales || vales.length === 0) return;
    vales.forEach(v => {
      if (isInversaoOrSwapReq(v) || isInversaoOrSwapReq(v.originalRequest)) {
        deleteValeEntry(v.id);
      }
    });
  }, [vales, deleteValeEntry]);

  // Valid Vales (Strictly excluding any inversion / swap records)
  const validVales = useMemo(() => {
    return vales.filter(v => !isInversaoOrSwapReq(v) && !isInversaoOrSwapReq(v.originalRequest));
  }, [vales]);

  // Helper to extract month number (1 to 12) from date string (YYYY-MM-DD or DD/MM/YYYY)
  const getValeMonth = (v: ValeEntry | string): number => {
    const dateStr = typeof v === "string" ? v : v.dataEmissao;
    const fallback = typeof v === "string" ? undefined : v.originalRequest;
    const d = parseValeDate(dateStr, fallback);
    if (d) {
      return d.getMonth() + 1;
    }
    return 8; // default to August if missing
  };

  // Monthly breakdown map for all 12 months
  const monthlyStats = useMemo(() => {
    const map: Record<number, { count: number; val: number; hl: number; vales: ValeEntry[] }> = {};
    for (let m = 1; m <= 12; m++) {
      map[m] = { count: 0, val: 0, hl: 0, vales: [] };
    }

    validVales.forEach(v => {
      const m = getValeMonth(v);
      if (map[m]) {
        map[m].count += 1;
        map[m].val += v.valorTotal || 0;
        map[m].hl += v.hectolitros || 0;
        map[m].vales.push(v);
      }
    });

    return map;
  }, [validVales]);

  // Vales for the selected mode & month(s)
  const activeDatasetVales = useMemo(() => {
    if (activeTabMode === "acumulado") {
      return validVales;
    } else {
      // Support single or multiple selected months
      const result: ValeEntry[] = [];
      const seen = new Set<string>();
      selectedMonths.forEach(mNum => {
        const list = monthlyStats[mNum]?.vales || [];
        list.forEach(v => {
          if (!seen.has(v.id)) {
            seen.add(v.id);
            result.push(v);
          }
        });
      });
      return result;
    }
  }, [activeTabMode, selectedMonths, validVales, monthlyStats]);

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Extract unique routes for dropdown filter
  const uniqueRoutes = useMemo(() => {
    const rSet = new Set<string>();
    activeDatasetVales.forEach(v => {
      if (v.rota) rSet.add(v.rota.trim());
    });
    return Array.from(rSet).sort();
  }, [activeDatasetVales]);

  // Filtered Vales List (applying custom day range, search, route, and status)
  const filteredVales = useMemo(() => {
    return activeDatasetVales.filter(v => {
      // 1. Custom Day Filter (Data Inicial & Data Final)
      if (startDate) {
        const d = parseValeDate(v.dataEmissao, v.originalRequest);
        if (d) {
          const [sY, sM, sD] = startDate.split("-").map(Number);
          const sDate = new Date(sY, sM - 1, sD, 0, 0, 0);
          if (d < sDate) return false;
        } else {
          return false;
        }
      }
      if (endDate) {
        const d = parseValeDate(v.dataEmissao, v.originalRequest);
        if (d) {
          const [eY, eM, eD] = endDate.split("-").map(Number);
          const eDate = new Date(eY, eM - 1, eD, 23, 59, 59);
          if (d > eDate) return false;
        } else {
          return false;
        }
      }

      // 2. Search Term
      const matchSearch = !searchTerm ||
        v.nf.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.motorista.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.motoristaCpf && v.motoristaCpf.includes(searchTerm)) ||
        (v.ajudantes && v.ajudantes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.ajudante1 && v.ajudante1.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.ajudante2 && v.ajudante2.toLowerCase().includes(searchTerm.toLowerCase()));

      // 3. Route Filter
      const matchRoute = selectedRoute === "todas" || v.rota.trim() === selectedRoute.trim();
      
      // 4. Status Filter
      const st = v.status || "pendente";
      const matchStatus = selectedStatusFilter === "todos" || st === selectedStatusFilter;

      return matchSearch && matchRoute && matchStatus;
    });
  }, [activeDatasetVales, searchTerm, selectedRoute, selectedStatusFilter, startDate, endDate]);

  // Quick range preset helper
  const setQuickRange = (preset: "hoje" | "ontem" | "7dias" | "15dias" | "este_mes" | "limpar") => {
    const now = new Date();
    const formatYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    if (preset === "limpar") {
      setStartDate("");
      setEndDate("");
      return;
    }
    if (preset === "hoje") {
      const todayStr = formatYMD(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
      return;
    }
    if (preset === "ontem") {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = formatYMD(yest);
      setStartDate(yestStr);
      setEndDate(yestStr);
      return;
    }
    if (preset === "7dias") {
      const past = new Date(now);
      past.setDate(past.getDate() - 7);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(now));
      return;
    }
    if (preset === "15dias") {
      const past = new Date(now);
      past.setDate(past.getDate() - 15);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(now));
      return;
    }
    if (preset === "este_mes") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
      return;
    }
  };

  // Dynamic filename and button label for export
  const getExportFilename = () => {
    if (startDate || endDate) {
      const s = startDate ? startDate.replace(/-/g, "") : "inicio";
      const e = endDate ? endDate.replace(/-/g, "") : "fim";
      return `vales_periodo_${s}_a_${e}`;
    }
    if (activeTabMode === "mensal") {
      if (selectedMonths.length === 1) {
        const m = MONTH_NAMES.find(x => x.num === selectedMonths[0]);
        return `vales_${m?.short.toLowerCase() || "mes"}_2026`;
      }
      const names = selectedMonths.map(num => MONTH_NAMES.find(x => x.num === num)?.short.toLowerCase()).join("_");
      return `vales_meses_${names}_2026`;
    }
    return `vales_acumulado_2026`;
  };

  const getExportButtonLabel = () => {
    if (startDate || endDate) {
      return `Exportar Período (${filteredVales.length})`;
    }
    if (activeTabMode === "mensal") {
      if (selectedMonths.length === 1) {
        return `Exportar ${MONTH_NAMES.find(m => m.num === selectedMonths[0])?.short} (${filteredVales.length})`;
      }
      return `Exportar ${selectedMonths.length} Meses (${filteredVales.length})`;
    }
    return `Exportar Excel (${filteredVales.length})`;
  };

  // Aggregate stats of active dataset
  const currentStats = useMemo(() => {
    const totalCount = filteredVales.length;
    const totalVal = filteredVales.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const totalHl = filteredVales.reduce((s, v) => s + (v.hectolitros || 0), 0);
    const avgVal = totalCount > 0 ? totalVal / totalCount : 0;
    return { totalCount, totalVal, totalHl, avgVal };
  }, [filteredVales]);

  // Accumulated year totals for global KPI headers
  const globalYearStats = useMemo(() => {
    const totalCount = validVales.length;
    const totalVal = validVales.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const totalHl = validVales.reduce((s, v) => s + (v.hectolitros || 0), 0);
    const avgVal = totalCount > 0 ? totalVal / totalCount : 0;
    return { totalCount, totalVal, totalHl, avgVal };
  }, [validVales]);

  // Driver ranking analytics for filtered dataset (Top 5)
  const driverRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    filteredVales.forEach(v => {
      const name = v.motorista.trim().toUpperCase();
      if (!name || name === "NÃO DECLARADO") return;
      if (!rankMap[name]) {
        rankMap[name] = { name: v.motorista, cpf: v.motoristaCpf, count: 0, val: 0, hl: 0 };
      }
      rankMap[name].count += 1;
      rankMap[name].val += v.valorTotal || 0;
      rankMap[name].hl += v.hectolitros || 0;
    });

    return Array.from(Object.values(rankMap))
      .sort((a, b) => b.hl - a.hl)
      .slice(0, 5);
  }, [filteredVales]);

  // Helper/Crew ranking analytics for filtered dataset (Top 5)
  const helperRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    
    filteredVales.forEach(v => {
      const helpersList = [];
      if (v.ajudante1 && v.ajudante1.trim()) {
        helpersList.push({ name: v.ajudante1.trim(), cpf: v.ajudante1Cpf });
      }
      if (v.ajudante2 && v.ajudante2.trim()) {
        helpersList.push({ name: v.ajudante2.trim(), cpf: v.ajudante2Cpf });
      }

      if (helpersList.length === 0 && v.ajudantes && v.ajudantes.trim()) {
        v.ajudantes.split(",").forEach(h => {
          if (h.trim()) helpersList.push({ name: h.trim(), cpf: "" });
        });
      }

      helpersList.forEach(helper => {
        const key = helper.name.toUpperCase();
        if (!rankMap[key]) {
          rankMap[key] = { name: helper.name, cpf: helper.cpf || "", count: 0, val: 0, hl: 0 };
        }
        rankMap[key].count += 1;
        rankMap[key].val += (v.valorTotal || 0) / (helpersList.length || 1);
        rankMap[key].hl += (v.hectolitros || 0) / (helpersList.length || 1); 
      });
    });

    return Array.from(Object.values(rankMap))
      .sort((a, b) => b.hl - a.hl)
      .slice(0, 5);
  }, [filteredVales]);


  const handleRecalculateAllVales = async () => {
    setIsRecalculating(true);
    let totalAnalyzed = 0;
    let totalUpdated = 0;
    let totalDeletedInversions = 0;
    const changes: { id: string; nf: string; oldVal: number; newVal: number; oldHl: number; newHl: number }[] = [];

    for (const v of vales) {
      totalAnalyzed++;
      const origReq = v.originalRequest;
      
      if (isInversaoOrSwapReq(v) || isInversaoOrSwapReq(origReq)) {
        await deleteValeEntry(v.id);
        totalDeletedInversions++;
        continue;
      }

      if (!origReq) continue;

      const { valorTotal, hectolitros } = calculateRequestValueAndHL(origReq, promaxRecords);
      const oldVal = v.valorTotal || 0;
      const oldHl = v.hectolitros || 0;

      const valDiff = Math.abs(oldVal - valorTotal);
      const hlDiff = Math.abs(oldHl - hectolitros);

      if (valDiff > 0.01 || hlDiff > 0.0001) {
        totalUpdated++;
        changes.push({
          id: v.id,
          nf: v.nf,
          oldVal,
          newVal: valorTotal,
          oldHl,
          newHl: hectolitros
        });

        const updatedVale: ValeEntry = {
          ...v,
          valorTotal,
          hectolitros
        };

        await saveValeEntry(updatedVale);
      }
    }

    setRecalculateSummary({
      totalAnalyzed,
      totalUpdated,
      totalDeletedInversions,
      changes
    });
    setIsRecalculating(false);
    setRecalculateModalOpen(true);
  };

  return (
    <div className="space-y-6 text-left" id="vales-dashboard-container">
      
      {/* 1. TOP HEADER & NAVIGATION MODE SWITCHER */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-wide flex items-center gap-2">
                Painel de Vales & Rateio Operacional
                <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-bold">
                  SSTR 2026
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                Controle de vias de cobrança, desconto por condutor/ajudante e fechamento acumulado
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Mode Switcher Tabs */}
          <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTabMode("acumulado")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTabMode === "acumulado"
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Guia Principal (Acumulado)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTabMode("mensal")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTabMode === "mensal"
                  ? "bg-amber-500 text-slate-950 shadow-md font-extrabold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Guia Mês a Mês</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. MONTH TABS (Shown when activeTabMode === 'mensal') */}
      {activeTabMode === "mensal" && (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-mono font-black text-white uppercase tracking-wider">
                Navegação Mês a Mês
              </span>
              <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
                {selectedMonths.length === 1 
                  ? MONTH_NAMES.find(m => m.num === selectedMonths[0])?.full 
                  : `${selectedMonths.length} meses selecionados (${getSelectedMonthsLabel(selectedMonths, "short")})`}
              </span>
            </div>

            {/* Multi-selection toggle and quick reset */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                className={`px-3 py-1 rounded-xl text-[11px] font-mono font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                  isMultiSelectMode
                    ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black scale-[1.02]"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
                }`}
                title="Ative para selecionar múltiplos meses clicando diretamente ou segure Ctrl"
              >
                <span>{isMultiSelectMode ? "✓ Multi-Seleção Ativa (Ctrl)" : "Fixar Multi-Seleção (Ctrl)"}</span>
              </button>

              {selectedMonths.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedMonths([8])}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded-xl text-[10px] font-mono transition-colors cursor-pointer"
                >
                  Resetar (Apenas Agosto)
                </button>
              )}
            </div>
          </div>

          {/* Month buttons row */}
          <div className="overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5 min-w-max">
              {MONTH_NAMES.map(m => {
                const count = monthlyStats[m.num]?.count || 0;
                const isSelected = selectedMonths.includes(m.num);

                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={(e) => {
                      const isCtrl = e.ctrlKey || e.metaKey || isMultiSelectMode;
                      if (isCtrl) {
                        if (selectedMonths.includes(m.num)) {
                          if (selectedMonths.length > 1) {
                            setSelectedMonths(selectedMonths.filter(x => x !== m.num));
                          }
                        } else {
                          setSelectedMonths([...selectedMonths, m.num].sort((a, b) => a - b));
                        }
                      } else {
                        setSelectedMonths([m.num]);
                      }
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-mono transition-all flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? "bg-amber-500 border-amber-400 text-slate-950 font-black shadow-lg scale-[1.02]"
                        : "bg-slate-950/70 hover:bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                    title={isMultiSelectMode ? `Alternar mês de ${m.full}` : `Ver vales de ${m.full} (Pressione e segure Ctrl para selecionar mais de um mês)`}
                  >
                    <span>{m.short}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      isSelected
                        ? "bg-slate-950 text-amber-400"
                        : count > 0 
                          ? "bg-slate-800 text-emerald-400" 
                          : "bg-slate-900 text-slate-500"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <span>💡 <strong>Dica:</strong> Pressione e segure a tecla <strong>Control (Ctrl)</strong> ao clicar para selecionar vários meses de uma vez, ou ative o botão &quot;Fixar Multi-Seleção&quot;.</span>
          </p>
        </div>
      )}

      {/* 3. METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Count */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-blue-400 font-mono uppercase tracking-wider block">
              {startDate || endDate
                ? `Vales no Período (${formatDisplayDate(startDate) || "Início"} a ${formatDisplayDate(endDate) || "Hoje"})`
                : activeTabMode === "acumulado" 
                  ? "Vales Acumulados no Ano" 
                  : `Vales em ${getSelectedMonthsLabel(selectedMonths, "short")}`}
            </span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-white font-sans">{currentStats.totalCount}</strong>
              <span className="text-xs text-slate-450 font-medium">unidades</span>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">
              {startDate || endDate 
                ? "Filtro personalizado de dias ativo"
                : activeTabMode === "acumulado" 
                  ? "Consolidado geral de todas as emissões" 
                  : `Meses: ${getSelectedMonthsLabel(selectedMonths, "label")}`}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/30 flex items-center justify-center shrink-0 z-10">
            <Layers className="w-6 h-6 text-blue-400" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all duration-300"></div>
        </div>

        {/* Metric 2: Volume HL */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-amber-500 font-mono uppercase tracking-wider block">
              Volume Total ({startDate || endDate ? "Período" : activeTabMode === "acumulado" ? "Ano" : getSelectedMonthsLabel(selectedMonths, "short")})
            </span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-amber-500 font-sans">{currentStats.totalHl.toFixed(2)}</strong>
              <span className="text-xs text-slate-450 font-mono">HL</span>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Hectolitros totais para acerto com condutores</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-900/30 flex items-center justify-center shrink-0 z-10">
            <TrendingUp className="w-6 h-6 text-amber-500" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all duration-300"></div>
        </div>

        {/* Metric 3: Total Valor R$ */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-emerald-400 font-mono uppercase tracking-wider block">
              Montante de Cobranças ({startDate || endDate ? "Período" : activeTabMode === "acumulado" ? "Acumulado" : getSelectedMonthsLabel(selectedMonths, "short")})
            </span>
            <div className="flex items-baseline space-x-1 hover:scale-[1.01] transition-transform">
              <strong className="text-2xl sm:text-3xl font-black text-emerald-400 font-sans">{formatCurrency(currentStats.totalVal)}</strong>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Valor financeiro dos termos emitidos</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-900/30 flex items-center justify-center shrink-0 z-10">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>
        </div>

        {/* Metric 4: Média por Vale */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-purple-400 font-mono uppercase tracking-wider block">
              Média por Vale Faturado
            </span>
            <div className="flex items-baseline space-x-1">
              <strong className="text-2xl sm:text-3xl font-black text-purple-300 font-sans">{formatCurrency(currentStats.avgVal)}</strong>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Ticket médio por ocorrência registrada</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-950/40 border border-purple-900/30 flex items-center justify-center shrink-0 z-10">
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-all duration-300"></div>
        </div>
      </div>

      {/* 4. CONSOLIDATED BENTO GRID (Shown when activeTabMode === 'acumulado') */}
      {activeTabMode === "acumulado" && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-widest font-mono flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-500" />
                Matriz Comparativa Mês a Mês (Janeiro a Dezembro de 2026)
              </h3>
              <p className="text-[10.5px] text-slate-400 font-sans">
                Clique em qualquer mês para abrir a visão analítica isolada daquele período
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
              Total Geral: <strong className="text-emerald-400">{formatCurrency(globalYearStats.totalVal)}</strong> ({globalYearStats.totalCount} vales)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {MONTH_NAMES.map(m => {
              const data = monthlyStats[m.num];
              const count = data?.count || 0;
              const val = data?.val || 0;
              const hl = data?.hl || 0;
              const hasData = count > 0;

              return (
                <div
                  key={m.num}
                  onClick={(e) => {
                    const isCtrl = e.ctrlKey || e.metaKey || isMultiSelectMode;
                    if (isCtrl) {
                      if (!selectedMonths.includes(m.num)) {
                        setSelectedMonths([...selectedMonths, m.num].sort((a, b) => a - b));
                      }
                    } else {
                      setSelectedMonths([m.num]);
                    }
                    setActiveTabMode("mensal");
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                    hasData 
                      ? "bg-slate-950/80 border-slate-800 hover:border-amber-500 hover:bg-slate-950 shadow-md group"
                      : "bg-slate-950/30 border-slate-850 opacity-60 hover:opacity-100 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-extrabold text-xs text-white group-hover:text-amber-400 transition-colors uppercase">
                      {m.short}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                      count > 0 ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-slate-900 text-slate-500"
                    }`}>
                      {count} v.
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-sm font-black font-sans text-emerald-400 block truncate">
                      {formatCurrency(val)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 block">
                      {hl.toFixed(2)} HL
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-850 flex items-center justify-between text-[9px] font-mono text-slate-500 group-hover:text-amber-400 transition-colors">
                    <span>Ver Mês</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. RANKING BENTO GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver Ranking Card */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-500" />
              Ranking de Condutores {startDate || endDate ? "(Período Filtrado)" : activeTabMode === "acumulado" ? "(Geral do Ano)" : `(${getSelectedMonthsLabel(selectedMonths, "short")})`}
            </h3>
            <p className="text-[10px] text-slate-450 leading-snug">
              Ordenado pelo impacto em volume (Hectolitros) de vales emitidos
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            {driverRanking.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-[11px] font-mono whitespace-normal leading-normal">
                Nenhum motorista com vales no período selecionado.
              </div>
            ) : (
              driverRanking.map((driver, index) => {
                const colorMap = [
                  "bg-amber-500 text-slate-950", 
                  "bg-slate-300 text-slate-950", 
                  "bg-amber-800 text-white", 
                  "bg-slate-800 text-slate-400", 
                  "bg-slate-850 text-slate-500"
                ];
                return (
                  <div key={driver.name} className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-xl border border-slate-850/60 hover:bg-slate-950 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-6 h-6 rounded-lg ${colorMap[index] || "bg-slate-800 text-slate-500"} flex items-center justify-center font-black text-xs font-mono shrink-0`}>
                        {index + 1}
                      </div>
                      <div className="text-left min-w-0">
                        <strong className="text-xs text-slate-200 block truncate max-w-[170px] uppercase font-sans">{driver.name}</strong>
                        <span className="text-[9px] font-mono text-slate-500">CPF: {driver.cpf || "não cadastrado"}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-white font-mono block">{driver.hl.toFixed(2)} HL</span>
                      <span className="text-[9.5px] text-emerald-400 font-bold block">{formatCurrency(driver.val)} ({driver.count} v.)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Crew / Helper Ranking Card */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Ranking de Ajudantes {startDate || endDate ? "(Período Filtrado)" : activeTabMode === "acumulado" ? "(Geral do Ano)" : `(${getSelectedMonthsLabel(selectedMonths, "short")})`}
            </h3>
            <p className="text-[10px] text-slate-450 leading-snug">
              Rateio individual de responsabilidade proporcional por rota
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            {helperRanking.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-[11px] font-mono whitespace-normal leading-normal">
                Nenhum ajudante com vales no período selecionado.
              </div>
            ) : (
              helperRanking.map((helper, index) => {
                const colorMap = [
                  "bg-indigo-500 text-slate-950", 
                  "bg-slate-300 text-slate-950", 
                  "bg-indigo-800 text-white", 
                  "bg-slate-800 text-slate-400", 
                  "bg-slate-850 text-slate-500"
                ];
                return (
                  <div key={helper.name} className="flex items-center justify-between p-2.5 bg-slate-950/50 rounded-xl border border-slate-850/60 hover:bg-slate-950 transition-colors">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-6 h-6 rounded-lg ${colorMap[index] || "bg-slate-800 text-slate-500"} flex items-center justify-center font-black text-xs font-mono shrink-0`}>
                        {index + 1}
                      </div>
                      <div className="text-left min-w-0">
                        <strong className="text-xs text-slate-200 block truncate max-w-[170px] uppercase font-sans">{helper.name}</strong>
                        <span className="text-[9px] font-mono text-slate-500">CPF: {helper.cpf || "não cadastrado"}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-white font-mono block">{helper.hl.toFixed(2)} HL</span>
                      <span className="text-[9.5px] text-emerald-450 font-bold block">{formatCurrency(helper.val)} ({helper.count} v.)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 6. LOG LISTING TABLE & CUSTOM DATE EXPORT BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        
        {/* FILTRO PERSONALIZADO DE DIAS PARA EXPORTAÇÃO DOS VALES */}
        <div className="bg-slate-950/90 border border-slate-800 p-3.5 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-inner">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 shrink-0">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Filtro de Dias (Exportação):</span>
            </div>

            {/* Data Inicial */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <span className="text-slate-500 font-medium">De:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                title="Data inicial para exportar ou consultar vales"
              />
            </div>

            {/* Data Final */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono">
              <span className="text-slate-500 font-medium">Até:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                title="Data final para exportar ou consultar vales"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => setQuickRange("hoje")}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("7dias")}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Últimos 7 dias
              </button>
              <button
                type="button"
                onClick={() => setQuickRange("15dias")}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Últimos 15 dias
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => setQuickRange("limpar")}
                  className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/50 text-rose-300 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  <span>Limpar Dias</span>
                </button>
              )}
            </div>
          </div>

          {/* Dedicated Export Button for Date Filter */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <button
              type="button"
              onClick={() => exportValesPacotePrejuizoExcel(filteredVales, getExportFilename())}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs font-mono rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all border border-emerald-400 shrink-0"
              title="Exportar planilha Excel (.xlsx) com todos os vales e rateio correspondentes ao filtro atual"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>{getExportButtonLabel()}</span>
            </button>
          </div>
        </div>

        {/* Table Filters header */}
        <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between border-b border-slate-800 pb-4">
          <div className="text-left space-y-1 w-full xl:w-auto">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              {startDate || endDate
                ? `Registros Filtrados por Período (${formatDisplayDate(startDate) || "Início"} até ${formatDisplayDate(endDate) || "Hoje"})`
                : activeTabMode === "acumulado" 
                  ? "Registros Detalhados de Todos os Vales do Ano" 
                  : `Registros de Vales de ${getSelectedMonthsLabel(selectedMonths, "full")} de 2026`}
            </h3>
            <p className="text-[10px] text-slate-400">
              Total listado: <strong>{filteredVales.length} itens</strong> • Volume: <strong>{currentStats.totalHl.toFixed(2)} HL</strong> • Montante: <strong>{formatCurrency(currentStats.totalVal)}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            {/* Search filter input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar NF, Motorista, CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-[220px] bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Status filter selector */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="todos">Todos os Status</option>
              <option value="emitido">🟠 Emitido</option>
              <option value="pendente">🟡 Pendente de Assinatura</option>
              <option value="assinado">🔵 Assinado</option>
              <option value="compensado">🟢 Compensado</option>
            </select>

            {/* Route filter selector */}
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              <option value="todas">Todas as Rotas</option>
              {uniqueRoutes.map(r => (
                <option key={r} value={r}>Rota {r}</option>
              ))}
            </select>

            {/* Recalcular Valores Button */}
            <button
              type="button"
              onClick={handleRecalculateAllVales}
              disabled={isRecalculating || vales.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 border border-indigo-500/40"
              title="Recalcular valor total e hectolitros de todos os vales com tabela Ambev"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-200 ${isRecalculating ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isRecalculating ? "Recalculando..." : "Recalcular"}</span>
            </button>

            {/* Exportar Excel Button */}
            <button
              type="button"
              onClick={() => exportValesPacotePrejuizoExcel(filteredVales, getExportFilename())}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 border border-emerald-500/40"
              title="Baixar planilha Excel com detalhamento completo dos vales e rateio"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>{getExportButtonLabel()}</span>
            </button>

            {/* Gerar Vale Avulso Button */}
            {onCreateAvulsoVale && (
              <button
                type="button"
                onClick={() => {
                  setAvulsoError(null);
                  setIsAvulsoModalOpen(true);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-3 py-1.5 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
                title="Criar um vale manual/avulso digitando mapa, item, data e motorista"
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Vale Avulso</span>
              </button>
            )}
          </div>
        </div>

        {/* Dense Table Layout */}
        <div className="overflow-x-auto rounded-xl">
          {filteredVales.length === 0 ? (
            <div className="p-16 text-center space-y-2 text-slate-500 bg-slate-950/40 rounded-xl">
              <AlertCircle className="w-7 h-7 mx-auto text-slate-600" />
              <p className="text-xs font-mono">Nenhum registro de vale encontrado para os filtros selecionados.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono font-bold text-[9px] uppercase tracking-wider">
                  <th className="p-3">Emissão</th>
                  <th className="p-3">NF</th>
                  <th className="p-3">Mapa</th>
                  <th className="p-3">Motorista / CPF</th>
                  <th className="p-3">Equipe / Ajudantes</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Volume</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 bg-slate-950/10">
                {filteredVales.map((vale) => {
                  const currentStatus = vale.status || "pendente";
                  return (
                  <tr key={vale.id} className="hover:bg-slate-900/40 transition-colors">
                    {/* Emissão Date */}
                    <td className="p-3 font-mono text-slate-300 text-[10.5px] shrink-0 font-medium whitespace-nowrap">
                      {vale.dataEmissao}
                    </td>

                    {/* NF */}
                    <td className="p-3 font-mono font-bold text-blue-400 whitespace-nowrap">
                      {vale.nf}
                    </td>

                    {/* Mapa */}
                    <td className="p-3 font-mono font-bold text-slate-300 whitespace-nowrap">
                      {vale.originalRequest?.mapa || (vale as any).mapa || "S/M"}
                    </td>

                    {/* Driver */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <div className="font-semibold text-slate-200 uppercase truncate max-w-[140px]" title={vale.motorista}>
                          {vale.motorista}
                        </div>
                        {isDriverX(vale.motorista) && (
                          <span className="px-1.5 py-0.2 text-[8px] bg-purple-950 border border-purple-800 text-purple-300 font-bold rounded">
                            ISENTO
                          </span>
                        )}
                      </div>
                      <span className="text-[9.5px] font-mono text-slate-500 block">
                        {vale.motoristaCpf || "Sem CPF"} • Rota {vale.rota}
                      </span>
                    </td>

                    {/* Helpers */}
                    <td className="p-3 max-w-[200px]">
                      <div className="truncate text-slate-300 text-[11px]" title={vale.ajudantes}>
                        {vale.ajudantes || "Sem Ajudantes"}
                      </div>
                      <span className="text-[9px] font-mono text-slate-500 block">
                        {vale.ajudante1Cpf ? `A1: ${vale.ajudante1Cpf}` : ""} {vale.ajudante2Cpf ? `• A2: ${vale.ajudante2Cpf}` : ""}
                      </span>
                    </td>

                    {/* Status Badge with quick dropdown */}
                    <td className="p-3 text-center">
                      <select
                        value={currentStatus}
                        onChange={(e) => {
                          if (onUpdateValeStatus) {
                            onUpdateValeStatus(vale.id, e.target.value as any);
                          }
                        }}
                        className={`text-[9.5px] font-bold font-mono px-2 py-1 rounded-full border cursor-pointer focus:outline-none transition-all ${
                          currentStatus === "compensado"
                            ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
                            : currentStatus === "assinado"
                            ? "bg-blue-950/80 border-blue-800 text-blue-300"
                            : currentStatus === "emitido"
                            ? "bg-amber-950/80 border-amber-800 text-amber-300"
                            : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}
                      >
                        <option value="emitido" className="bg-slate-900 text-white">🟠 Emitido</option>
                        <option value="pendente" className="bg-slate-900 text-white">🟡 Pendente Assinatura</option>
                        <option value="assinado" className="bg-slate-900 text-white">🔵 Assinado</option>
                        <option value="compensado" className="bg-slate-900 text-white">🟢 Compensado</option>
                      </select>
                    </td>

                    {/* Hectoliters */}
                    <td className="p-3 font-mono font-bold text-amber-400 text-center whitespace-nowrap">
                      {(vale.hectolitros || 0).toFixed(2)} HL
                    </td>

                    {/* Total Value */}
                    <td className="p-3 font-mono font-black text-emerald-400 text-right whitespace-nowrap">
                      {formatCurrency(vale.valorTotal || 0)}
                    </td>

                    {/* Action buttons */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Edit Driver / Crew Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditDriverModal(vale)}
                          className="p-1.5 bg-slate-800 hover:bg-amber-950 hover:text-amber-300 text-slate-300 border border-slate-750 hover:border-amber-800 rounded-lg cursor-pointer transition-colors"
                          title="Corrigir Motorista / Ajudantes deste Vale"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Inspect Request Button */}
                        {onInspectRequest && (
                          <button
                            type="button"
                            onClick={() => onInspectRequest(vale)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-750 rounded-lg cursor-pointer transition-colors"
                            title="Ver Detalhes do Lançamento"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-400" />
                          </button>
                        )}

                        {/* Reimprimir Vale Button */}
                        <button
                          type="button"
                          onClick={() => onReimprimir(vale)}
                          className="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg cursor-pointer transition-colors"
                          title="Reimprimir Termo de Vale Oficial"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Vale Button */}
                        {onDeleteSingleVale && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteValeId(vale.id)}
                            className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 rounded-lg cursor-pointer transition-colors"
                            title="Excluir este Vale"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CONFIRM DELETE VALE MODAL */}
      {confirmDeleteValeId && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteValeId(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertCircle className="w-6 h-6" />
              <h3 className="font-extrabold text-sm uppercase font-mono text-white">Confirmar Exclusão de Vale</h3>
            </div>
            <p className="text-xs text-slate-300">
              Tem certeza que deseja excluir este vale do histórico? Esta ação é irreversível.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmDeleteValeId(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteSingleVale) {
                    onDeleteSingleVale(confirmDeleteValeId);
                  }
                  setConfirmDeleteValeId(null);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-mono font-extrabold cursor-pointer transition-all shadow-md"
              >
                Sim, Excluir Vale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT DRIVER & CREW MODAL */}
      {isEditDriverModalOpen && editingVale && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in no-print"
          onClick={() => !isSavingDriverEdit && setIsEditDriverModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">
                    Corrigir Condutor & Equipe do Vale
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Vale NF {editingVale.nf} • Rota {editingVale.rota} • {formatCurrency(editingVale.valorTotal || 0)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditDriverModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-400 font-mono uppercase flex items-center gap-1.5">
                    <User className="w-4 h-4" /> Motorista / Condutor *
                  </label>
                  {isDriverX(editMotoristaName) && (
                    <span className="px-2 py-0.5 bg-purple-950 border border-purple-800 text-purple-300 text-[10px] font-bold rounded-md font-mono">
                      MOTORISTA X (ISENTO)
                    </span>
                  )}
                </div>

                <select
                  value={editMotoristaName}
                  onChange={(e) => {
                    const sel = e.target.value;
                    setEditMotoristaName(sel);
                    if (isDriverX(sel)) {
                      setEditMotoristaCpf("000.000.000-00");
                    } else {
                      const crewMatch = getCrewDetailByName(sel);
                      if (crewMatch?.cpf) setEditMotoristaCpf(crewMatch.cpf);
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 h-10 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                >
                  <option value="">-- Selecionar Motorista da Base --</option>
                  {DEFAULT_LISTA_CREW.filter(c => c.cargo.includes("MOTORISTA")).map((m) => (
                    <option key={m.nome} value={m.nome}>{m.nome}</option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Nome Motorista"
                    value={editMotoristaName}
                    onChange={(e) => setEditMotoristaName(e.target.value.toUpperCase())}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 h-8 text-[11px] text-white font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="CPF Motorista"
                    value={editMotoristaCpf}
                    onChange={(e) => setEditMotoristaCpf(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-750 rounded-xl px-3 h-8 text-[11px] text-slate-300 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Helpers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Ajudante 1 */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 font-mono uppercase block">
                    Ajudante 1 (Obrigatório p/ Condutor X)
                  </label>
                  <select
                    value={editAjudante1Name}
                    onChange={(e) => {
                      const sel = e.target.value;
                      setEditAjudante1Name(sel);
                      const crewMatch = getCrewDetailByName(sel);
                      if (crewMatch?.cpf) setEditAjudante1Cpf(crewMatch.cpf);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none mb-1"
                  >
                    <option value="">-- Selecionar da Equipe --</option>
                    {DEFAULT_LISTA_CREW.filter(c => c.cargo.includes("AJUDANTE")).map((a) => (
                      <option key={a.nome} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nome Ajudante 1"
                    value={editAjudante1Name}
                    onChange={(e) => setEditAjudante1Name(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-8 text-[11px] text-white font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="CPF Ajudante 1"
                    value={editAjudante1Cpf}
                    onChange={(e) => setEditAjudante1Cpf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-8 text-[11px] text-slate-400 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Ajudante 2 */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-300 font-mono uppercase block">
                    Ajudante 2 (Opcional)
                  </label>
                  <select
                    value={editAjudante2Name}
                    onChange={(e) => {
                      const sel = e.target.value;
                      setEditAjudante2Name(sel);
                      const crewMatch = getCrewDetailByName(sel);
                      if (crewMatch?.cpf) setEditAjudante2Cpf(crewMatch.cpf);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none mb-1"
                  >
                    <option value="">-- Selecionar da Equipe --</option>
                    {DEFAULT_LISTA_CREW.filter(c => c.cargo.includes("AJUDANTE")).map((a) => (
                      <option key={a.nome} value={a.nome}>{a.nome}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Nome Ajudante 2"
                    value={editAjudante2Name}
                    onChange={(e) => setEditAjudante2Name(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-8 text-[11px] text-white font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="CPF Ajudante 2"
                    value={editAjudante2Cpf}
                    onChange={(e) => setEditAjudante2Cpf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-8 text-[11px] text-slate-400 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* LIVE RATEIO PREVIEW */}
              {(() => {
                const totalVal = editingVale.valorTotal || 0;
                const isX = isDriverX(editMotoristaName);
                const rateio = calculateValeRateio(
                  totalVal,
                  editMotoristaName,
                  editMotoristaCpf,
                  editAjudante1Name,
                  editAjudante1Cpf,
                  editAjudante2Name,
                  editAjudante2Cpf
                );

                return (
                  <div className={`p-3 rounded-2xl border ${
                    isX 
                      ? "bg-purple-950/40 border-purple-800/60 text-purple-200" 
                      : "bg-slate-950 border-slate-800 text-slate-300"
                  }`}>
                    <div className="flex items-center justify-between font-mono text-[10px] font-bold border-b border-slate-800/80 pb-1.5 mb-2">
                      <span className="uppercase flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        {isX ? "Regra Especial: Motorista X (Isento de Cobrança)" : "Rateio Padrão entre Integrantes"}
                      </span>
                      <span className="text-emerald-400 font-bold">Total: {formatCurrency(totalVal)}</span>
                    </div>

                    {isX ? (
                      <div className="space-y-1 text-[11px]">
                        <p className="text-purple-300 font-sans">
                          ✓ O condutor <strong>X</strong> não participa do desconto. O valor integral de <strong>{formatCurrency(totalVal)}</strong> será rateado exclusivamente entre os <strong>{rateio.count} ajudante(s)</strong> cadastrados ({formatCurrency(rateio.individualValue)} cada).
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 text-[11px]">
                        <p className="text-slate-400 font-sans">
                          Divisão igualitária entre <strong>{rateio.count} integrante(s)</strong> (Condutor + Ajudantes): <strong>{formatCurrency(rateio.individualValue)}</strong> por pessoa.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {driverEditFeedback && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 font-mono text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{driverEditFeedback}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-950">
              <span className="text-[10px] text-slate-500 font-sans">
                A alteração atualiza o Vale e a guia de Faltas/Inversões instantaneamente.
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditDriverModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveDriverEdit}
                  disabled={isSavingDriverEdit}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-extrabold rounded-xl cursor-pointer transition-all shadow-md hover:scale-[1.02] flex items-center gap-1.5"
                >
                  {isSavingDriverEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Salvar & Sincronizar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AVULSO MODAL */}
      {isAvulsoModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in no-print"
          onClick={() => setIsAvulsoModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">Gerar Vale Avulso</h3>
                  <p className="text-[10px] text-slate-400">Emissão direta de recibo de vale com cálculo automático de Hectolitro</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAvulsoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!avulsoMapa.trim()) {
                  setAvulsoError("Informe o Mapa / Número do Documento.");
                  return;
                }
                if (!avulsoItemCode.trim()) {
                  setAvulsoError("Informe o Código do Item / SKU.");
                  return;
                }
                const q = parseInt(avulsoQuantidade, 10);
                if (isNaN(q) || q <= 0) {
                  setAvulsoError("Informe uma quantidade válida.");
                  return;
                }
                if (!avulsoMotorista.trim()) {
                  setAvulsoError("Informe o Nome do Motorista.");
                  return;
                }

                if (onCreateAvulsoVale) {
                  onCreateAvulsoVale({
                    mapa: avulsoMapa.trim(),
                    itemCode: avulsoItemCode.trim(),
                    itemDesc: avulsoItemDesc.trim(),
                    data: avulsoData,
                    quantidade: q,
                    unidadeMedida: avulsoUnidade,
                    motorista: avulsoMotorista.trim(),
                    ajudantes: avulsoAjudantes.trim(),
                    observacao: avulsoObs.trim()
                  });
                }

                setIsAvulsoModalOpen(false);
                setAvulsoMapa("");
                setAvulsoItemCode("");
                setAvulsoItemDesc("");
                setAvulsoQuantidade("1");
                setAvulsoMotorista("");
                setAvulsoAjudantes("");
                setAvulsoObs("");
                setAvulsoError(null);
              }}
              className="p-5 space-y-4"
            >
              {avulsoError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-mono flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{avulsoError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Número do Mapa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 84920"
                    value={avulsoMapa}
                    onChange={(e) => setAvulsoMapa(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Data da Emissão *</label>
                  <input
                    type="date"
                    required
                    value={avulsoData}
                    onChange={(e) => setAvulsoData(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Código Item / SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 34608 ou SKOL 350ML"
                    value={avulsoItemCode}
                    onChange={(e) => setAvulsoItemCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Medida</label>
                  <select
                    value={avulsoUnidade}
                    onChange={(e) => setAvulsoUnidade(e.target.value as "cx" | "und")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  >
                    <option value="cx">📦 SKU Fechado (CX)</option>
                    <option value="und">🧪 UND (Unidade Avulsa)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Quantidade *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={avulsoQuantidade}
                    onChange={(e) => setAvulsoQuantidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Descrição (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: SKOL LATA 350ML"
                    value={avulsoItemDesc}
                    onChange={(e) => setAvulsoItemDesc(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Motorista *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do motorista"
                    value={avulsoMotorista}
                    onChange={(e) => setAvulsoMotorista(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Ajudantes</label>
                  <input
                    type="text"
                    placeholder="Nomes separados por vírgula"
                    value={avulsoAjudantes}
                    onChange={(e) => setAvulsoAjudantes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Observação / Justificativa</label>
                <textarea
                  rows={2}
                  placeholder="Motivo da emissão do vale avulso..."
                  value={avulsoObs}
                  onChange={(e) => setAvulsoObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAvulsoModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-black rounded-xl cursor-pointer transition-all shadow-md"
                >
                  Emitir Vale Avulso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECALCULATE SUMMARY MODAL */}
      {recalculateModalOpen && recalculateSummary && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in no-print"
          onClick={() => setRecalculateModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">Recálculo Concluído</h3>
                  <p className="text-[10px] text-slate-400">Valores e hectolitros auditados com a tabela de produtos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecalculateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Analisados</span>
                  <strong className="text-white text-base">{recalculateSummary.totalAnalyzed}</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Atualizados</span>
                  <strong className="text-amber-400 text-base">{recalculateSummary.totalUpdated}</strong>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">Inversões Limpas</span>
                  <strong className="text-rose-400 text-base">{recalculateSummary.totalDeletedInversions}</strong>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRecalculateModalOpen(false)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-xl cursor-pointer"
                >
                  OK, Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
