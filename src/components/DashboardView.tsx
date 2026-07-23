import React, { useState, useMemo } from "react";
import { ExchangeRecord, SectorAnalytics, REPRESENTATIVOS_SETOR } from "../types";
import { getApiUrl } from "../utils/apiUrl";
import { parseSectorAnalytics } from "../utils/csvParser";
import { calculateHL, getHectoFactor } from "../utils/hectoFactors";
import { isRecordReposicao, isRecordTroca } from "../utils/processTypes";
import ConsolidatedView from "./ConsolidatedView";
import { 
  TrendingUp, 
  DollarSign, 
  RefreshCw, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  ArrowRight, 
  Filter, 
  Calendar, 
  X, 
  ChevronRight, 
  Target, 
  BarChart2, 
  Percent,
  TrendingDown,
  MessageSquare,
  Send,
  Sparkles,
  Lightbulb,
  FileText,
  User,
  Package,
  Clock
} from "lucide-react";

interface DashboardViewProps {
  records: ExchangeRecord[];
  onSelectSector: (sector: string) => void;
}

// Helper to convert Brazilian date "DD/MM/YYYY" to Date object
const parseToDate = (ptDateStr: string): Date | null => {
  if (!ptDateStr) return null;
  const parts = ptDateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
};

// Month Names mapping
const MONTH_NAMES: { [key: string]: string } = {
  "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
  "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
  "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembra"
};

// Safe formatting helper
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(val);
};

export default function DashboardView({ records: rawRecords, onSelectSector }: DashboardViewProps) {
  // Exclude manual representative portal entries so we only count officially imported Promax data (User request)
  const records = useMemo(() => {
    return rawRecords.filter(r => r.sistemaOrigem !== "Portal de Campo SSTR");
  }, [rawRecords]);

  const [selectedSector, setSelectedSector] = useState<string>("");
  
  // Tab control: "consolidado" (Visão Geral) or "setores" (Explorador Individual de Audit)
  const [dashboardTab, setDashboardTab] = useState<"consolidado" | "setores">("consolidado");

  // AI Chat Assistant States
  const [chatInput, setChatInput] = useState<string>("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant" | "system"; text: string }>>([
    {
      role: "assistant",
      text: "Olá! Sou o assistente de I.A. das operações do SSTR Pau Brasil Guarabira. Posso analisar os volumes solicitados de reposições (tanto em valor R$ quanto em Hectolitros - HL) e desvendar qual setor, produto ou cliente está impactando mais a meta. Como posso ajudar você hoje?"
    }
  ]);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Filter mode: "mes" (mês a mês) or "dias" (entre dias)
  const [filterMode, setFilterMode] = useState<"mes" | "dias">("mes");
  
  // Process Type Filter state: "todos" | "reposicao" | "troca"
  const [processTypeFilter, setProcessTypeFilter] = useState<"todos" | "reposicao" | "troca">("todos");

  // States for dynamic filters
  const [semesterFilter, setSemesterFilter] = useState<"1H" | "2H" | "all">("1H");
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>("todos");
  const [startDateStr, setStartDateStr] = useState<string>("");
  const [endDateStr, setEndDateStr] = useState<string>("");
  const [selectedReason, setSelectedReason] = useState<string>("todos");
  const [selectedGv, setSelectedGv] = useState<string>("todos");
  const [sectorStatusFilter, setSectorStatusFilter] = useState<"todos" | "aprovado" | "reprovado" | "pendente">("todos");

  // Interactive inner states for clicking products or clients
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);

  // Clear inner states on sector change
  React.useEffect(() => {
    setSelectedProductCode(null);
    setSelectedClientName(null);
  }, [selectedSector]);

  // Reset selectedMonthYear when semester filter changes to a period that doesn't contain the month
  React.useEffect(() => {
    if (selectedMonthYear !== "todos") {
      const [m] = selectedMonthYear.split("/");
      const mNum = parseInt(m, 10);
      if (semesterFilter === "1H" && (mNum < 1 || mNum > 6)) {
        setSelectedMonthYear("todos");
      } else if (semesterFilter === "2H" && (mNum < 7 || mNum > 12)) {
        setSelectedMonthYear("todos");
      }
    }
  }, [semesterFilter]);

  // Constant Meta Values
  const META_MENSAL = 12000; // R$ 12.000,00
  const META_ANUAL = META_MENSAL * 12; // R$ 144.000,00

  // 1. Extract unique Months/Years found in the CSV records
  const uniqueMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    records.forEach(r => {
      if (r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const m = parts[1];
          const y = parts[2];
          monthsSet.add(`${m}/${y}`);
        }
      }
    });

    return Array.from(monthsSet).sort((a, b) => {
      const [mA, yA] = a.split("/").map(Number);
      const [mB, yB] = b.split("/").map(Number);
      if (yA !== yB) return yB - yA;
      return mB - mA;
    });
  }, [records]);

  // Filter months to only show those of the selected semester
  const filteredMonths = useMemo(() => {
    if (semesterFilter === "all") return uniqueMonths;
    return uniqueMonths.filter(my => {
      const [m] = my.split("/");
      const mNum = parseInt(m, 10);
      if (semesterFilter === "1H") return mNum >= 1 && mNum <= 6;
      if (semesterFilter === "2H") return mNum >= 7 && mNum <= 12;
      return true;
    });
  }, [uniqueMonths, semesterFilter]);

  // Helper to format MM/YYYY to nice Portuguese text
  const formatMonthYearLabel = (myStr: string) => {
    const [m, y] = myStr.split("/");
    const name = MONTH_NAMES[m] || `Mês ${m}`;
    return `${name} de ${y}`;
  };

  // Get unique reasons (justificativas/motivos) sorted alphabetically
  const uniqueReasons = useMemo(() => {
    const reasons = Array.from(new Set(records.map(r => r.justificativa))).filter(Boolean);
    return reasons.sort();
  }, [records]);

  // Unique GVs list dynamically populated matching SSTR settings
  const uniqueGVsList = useMemo(() => {
    const list = new Set<string>();
    records.forEach(r => {
      const s = (r.setorVenda || "").trim();
      const rep = REPRESENTATIVOS_SETOR[s];
      if (rep && rep.gv) {
        list.add(rep.gv.toUpperCase());
      } else {
        list.add("OUTROS");
      }
    });
    return Array.from(list).sort();
  }, [records]);

  // Process breakdown metrics for Dashboard Geral (Reposição vs. Troca)
  const processSummaryDashboard = useMemo(() => {
    let repVal = 0;
    let repCount = 0;
    let repHl = 0;
    let trocaVal = 0;
    let trocaCount = 0;
    let trocaHl = 0;

    records.forEach(r => {
      // Reason & GV & Date filters check (without processTypeFilter itself)
      const matchReason = selectedReason === "todos" || (r.justificativa || "").trim() === selectedReason.trim();
      if (!matchReason) return;

      if (selectedGv !== "todos") {
        const s = (r.setorVenda || "").trim();
        const rep = REPRESENTATIVOS_SETOR[s];
        const recordGv = rep ? rep.gv.toUpperCase() : "OUTROS";
        if (recordGv !== selectedGv.toUpperCase()) return;
      }

      if (semesterFilter !== "all" && r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          if (semesterFilter === "1H" && (m < 1 || m > 6)) return;
          if (semesterFilter === "2H" && (m < 7 || m > 12)) return;
        } else {
          return;
        }
      }

      if (filterMode === "mes") {
        if (selectedMonthYear !== "todos" && r.dataSolicitacao) {
          const parts = r.dataSolicitacao.split("/");
          if (parts.length === 3) {
            const my = `${parts[1]}/${parts[2]}`;
            if (my !== selectedMonthYear) return;
          } else {
            return;
          }
        }
      } else {
        if (startDateStr || endDateStr) {
          const recDate = parseToDate(r.dataSolicitacao);
          if (!recDate) return;
          if (startDateStr && recDate < new Date(startDateStr + "T00:00:00")) return;
          if (endDateStr && recDate > new Date(endDateStr + "T23:59:59")) return;
        }
      }

      const hl = r.hectolitros || calculateHL(r.produto, r.quantidade || 0);

      if (isRecordReposicao(r)) {
        repVal += r.valorTotal || 0;
        repCount++;
        repHl += hl;
      } else {
        trocaVal += r.valorTotal || 0;
        trocaCount++;
        trocaHl += hl;
      }
    });

    return {
      repVal,
      repCount,
      repHl,
      trocaVal,
      trocaCount,
      trocaHl,
      totalVal: repVal + trocaVal,
      totalCount: repCount + trocaCount,
      totalHl: repHl + trocaHl
    };
  }, [records, filterMode, selectedMonthYear, startDateStr, endDateStr, selectedReason, selectedGv, semesterFilter]);

  // Filter records dynamically based on selected date & motivo/reason & GV & process type
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 0. Process Type match (Reposição vs. Troca)
      if (processTypeFilter === "reposicao" && !isRecordReposicao(r)) {
        return false;
      }
      if (processTypeFilter === "troca" && !isRecordTroca(r)) {
        return false;
      }

      // 1. Reason match
      const matchReason = selectedReason === "todos" || (r.justificativa || "").trim() === selectedReason.trim();
      if (!matchReason) return false;

      // 2. GV match
      if (selectedGv !== "todos") {
        const s = (r.setorVenda || "").trim();
        const rep = REPRESENTATIVOS_SETOR[s];
        const recordGv = rep ? rep.gv.toUpperCase() : "OUTROS";
        if (recordGv !== selectedGv.toUpperCase()) {
          return false;
        }
      }

      // 2.5. Semester match
      if (semesterFilter !== "all" && r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          if (semesterFilter === "1H" && (m < 1 || m > 6)) return false;
          if (semesterFilter === "2H" && (m < 7 || m > 12)) return false;
        } else {
          return false;
        }
      }

      // 3. Date match according to mode
      if (filterMode === "mes") {
        if (selectedMonthYear === "todos") return true;
        if (!r.dataSolicitacao) return false;
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const my = `${parts[1]}/${parts[2]}`;
          return my === selectedMonthYear;
        }
        return false;
      } else {
        // Mode "dias"
        if (!startDateStr && !endDateStr) return true;
        const recDate = parseToDate(r.dataSolicitacao);
        if (!recDate) return false;
        
        if (startDateStr) {
          const start = new Date(startDateStr + "T00:00:00");
          if (recDate < start) return false;
        }
        if (endDateStr) {
          const end = new Date(endDateStr + "T23:59:59");
          if (recDate > end) return false;
        }
        return true;
      }
    });
  }, [records, filterMode, selectedMonthYear, startDateStr, endDateStr, selectedReason, selectedGv, semesterFilter, processTypeFilter]);

  // Calculate high level stats on filtered records
  const stats = useMemo(() => {
    let totalValue = 0;
    let approvedValue = 0;
    let pendingValue = 0;
    let reprovedValue = 0;

    let approvedCount = 0;
    let pendingCount = 0;
    let reprovedCount = 0;

    filteredRecords.forEach(r => {
      totalValue += r.valorTotal;
      const statusClean = r.status.toLowerCase().trim();
      
      if (statusClean.includes("aprov")) {
        approvedValue += r.valorTotal;
        approvedCount++;
      } else if (statusClean.includes("pend")) {
        pendingValue += r.valorTotal;
        pendingCount++;
      } else if (statusClean.includes("reprov")) {
        reprovedValue += r.valorTotal;
        reprovedCount++;
      } else {
        // Fallback or unaligned
        approvedValue += r.valorTotal;
        approvedCount++;
      }
    });

    const uniqueSectors = Array.from(new Set(filteredRecords.map(r => r.setorVenda))).filter(Boolean);
    const uniqueClients = Array.from(new Set(filteredRecords.map(r => r.codigoCliente))).filter(Boolean);

    return {
      totalValue,
      approvedValue,
      pendingValue,
      reprovedValue,
      totalCount: filteredRecords.length,
      approvedCount,
      pendingCount,
      reprovedCount,
      sectorCount: uniqueSectors.length,
      clientCount: uniqueClients.length,
    };
  }, [filteredRecords]);

  // Total of unique clients registered with replacements (unfiltered, representing all registered records)
  const totalClientsRegistered = useMemo(() => {
    return Array.from(new Set(records.map(r => r.codigoCliente))).filter(Boolean).length;
  }, [records]);

  // Year Accumulative approved value (all approved requests in the entire database of year 2026 or all records)
  const annualApprovedAccumulated = useMemo(() => {
    let sum = 0;
    records.forEach(r => {
      const statusClean = r.status.toLowerCase().trim();
      if (statusClean.includes("aprov")) {
        sum += r.valorTotal;
      }
    });
    return sum;
  }, [records]);

  // Hectoliters volume calculator - active filter view
  const totalHLFiltered = useMemo(() => {
    return filteredRecords.reduce((sum, r) => sum + calculateHL(r.produto, r.quantidade), 0);
  }, [filteredRecords]);

  // Hectoliters volume calculator - entire database
  const totalHLAll = useMemo(() => {
    return records.reduce((sum, r) => sum + calculateHL(r.produto, r.quantidade), 0);
  }, [records]);

  // Top Products of all sectors combined (unfiltered by selectedSector)
  const generalTopProducts = useMemo(() => {
    if (filteredRecords.length === 0) return [];
    const prodMap: { [code: string]: { code: string; descricao: string; quantity: number; totalSpent: number; hl: number } } = {};
    
    filteredRecords.forEach(r => {
      const pCode = r.produto;
      if (!prodMap[pCode]) {
        prodMap[pCode] = { code: pCode, descricao: r.descricaoProduto, quantity: 0, totalSpent: 0, hl: 0 };
      }
      prodMap[pCode].quantity += r.quantidade;
      prodMap[pCode].totalSpent += r.valorTotal;
      prodMap[pCode].hl += calculateHL(pCode, r.quantidade);
    });

    return Object.values(prodMap)
      .sort((a, b) => b.quantity - a.quantity)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [filteredRecords]);

  // Top Clients of all sectors combined (unfiltered by selectedSector)
  const generalTopClients = useMemo(() => {
    if (filteredRecords.length === 0) return [];
    const clientMap: { [code: string]: { code: string; nome: string; requestCount: number; totalSpent: number; hl: number } } = {};
    
    filteredRecords.forEach(r => {
      const cCode = r.codigoCliente;
      if (!clientMap[cCode]) {
        clientMap[cCode] = { code: cCode, nome: r.nomeCliente, requestCount: 0, totalSpent: 0, hl: 0 };
      }
      clientMap[cCode].requestCount += 1;
      clientMap[cCode].totalSpent += r.valorTotal;
      clientMap[cCode].hl += calculateHL(r.produto, r.quantidade);
    });

    return Object.values(clientMap)
      .sort((a, b) => b.requestCount - a.requestCount)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [filteredRecords]);

  // Timeline chronology data for line-plots
  const timelineData = useMemo(() => {
    const dateMap: { [dateStr: string]: { date: string; timestamp: number; count: number; totalSpent: number; totalHL: number } } = {};
    
    filteredRecords.forEach(r => {
      if (!r.dataSolicitacao) return;
      const dStr = r.dataSolicitacao;
      const dateObj = parseToDate(dStr);
      const timestamp = dateObj ? dateObj.getTime() : 0;
      
      if (!dateMap[dStr]) {
        dateMap[dStr] = { date: dStr, timestamp, count: 0, totalSpent: 0, totalHL: 0 };
      }
      dateMap[dStr].count += 1;
      dateMap[dStr].totalSpent += r.valorTotal;
      dateMap[dStr].totalHL += calculateHL(r.produto, r.quantidade);
    });

    return Object.values(dateMap).sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredRecords]);

  // Dynamic goal determination: 12.000 if specific month is selected, else 12.000 * active months
  const isMonthSelected = useMemo(() => {
    return filterMode === "mes" && selectedMonthYear !== "todos";
  }, [filterMode, selectedMonthYear]);

  // Count the number of unique months with records in the current filtered set to scale the target limit appropriately
  const distinctMonthsCount = useMemo(() => {
    const months = new Set<string>();
    filteredRecords.forEach(r => {
      if (r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          // Store "MM/YYYY" to correctly group distinct months
          months.add(`${parts[1]}/${parts[2]}`);
        }
      }
    });
    return months.size || 1;
  }, [filteredRecords]);

  const activeGoal = useMemo(() => {
    if (filterMode === "mes") {
      if (selectedMonthYear !== "todos") return META_MENSAL;
      // If month is "todos", scale the meta dynamically by the number of months with actual records
      return META_MENSAL * distinctMonthsCount;
    } else {
      // filterMode === "dias"
      if (startDateStr && endDateStr) {
        const start = new Date(startDateStr + "T00:00:00");
        const end = new Date(endDateStr + "T23:59:59");
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        return Number((diffDays * (META_MENSAL / 30.41)).toFixed(2)); // Dynamic daily-weighted goal
      } else if (startDateStr || endDateStr) {
        // Just one day
        const dayCount = 1;
        return Number((dayCount * (META_MENSAL / 30.41)).toFixed(2));
      }
      return META_MENSAL * distinctMonthsCount;
    }
  }, [filterMode, selectedMonthYear, distinctMonthsCount, startDateStr, endDateStr, META_MENSAL]);

  const activeGoalName = useMemo(() => {
    if (filterMode === "mes") {
      if (selectedMonthYear !== "todos") return `Meta Mensal de Reposições (${MONTH_NAMES[selectedMonthYear.split("-")[1]] || selectedMonthYear})`;
      if (semesterFilter === "1H") return "Meta 1º Semestre (1º H)";
      if (semesterFilter === "2H") return "Meta 2º Semestre (2º H)";
      return "Meta Anual Acumulada";
    } else {
      if (startDateStr && endDateStr) {
        const startLabel = startDateStr.split("-").reverse().join("/");
        const endLabel = endDateStr.split("-").reverse().join("/");
        return `Meta de Reposições do Período (${startLabel} a ${endLabel})`;
      } else if (startDateStr || endDateStr) {
        const singleLabel = (startDateStr || endDateStr).split("-").reverse().join("/");
        return `Meta de Reposição do Dia (${singleLabel})`;
      }
      if (semesterFilter === "1H") return "Meta 1º Semestre (1º H)";
      if (semesterFilter === "2H") return "Meta 2º Semestre (2º H)";
      return "Meta Anual Acumulada";
    }
  }, [filterMode, selectedMonthYear, semesterFilter, startDateStr, endDateStr]);

  const activeGoalBadge = useMemo(() => {
    if (filterMode === "mes") {
      if (selectedMonthYear !== "todos") return "Somente Aprovadas";
      if (semesterFilter === "1H") return "1º Semestre - Aprovadas";
      if (semesterFilter === "2H") return "2º Semestre - Aprovadas";
      return "Ano Completo - Aprovadas";
    } else {
      if (startDateStr || endDateStr) return "Intervalo Personalizado";
      if (semesterFilter === "1H") return "1º Semestre - Aprovadas";
      if (semesterFilter === "2H") return "2º Semestre - Aprovadas";
      return "Ano Completo - Aprovadas";
    }
  }, [filterMode, selectedMonthYear, semesterFilter, startDateStr, endDateStr]);

  // Progress metrics
  const monthlyAtingimento = useMemo(() => {
    // Current selected period/month approved sum / activeGoal
    return (stats.approvedValue / activeGoal) * 100;
  }, [stats.approvedValue, activeGoal]);

  const annualAtingimento = useMemo(() => {
    return (annualApprovedAccumulated / META_ANUAL) * 100;
  }, [annualApprovedAccumulated]);

  // Filter sector records based on status filter
  const sectorRecordsForTree = useMemo(() => {
    if (sectorStatusFilter === "todos") return filteredRecords;
    return filteredRecords.filter(r => {
      const statusClean = r.status.toLowerCase().trim();
      if (sectorStatusFilter === "aprovado") return statusClean.includes("aprov");
      if (sectorStatusFilter === "reprovado") return statusClean.includes("reprov");
      if (sectorStatusFilter === "pendente") return statusClean.includes("pend");
      return true;
    });
  }, [filteredRecords, sectorStatusFilter]);

  // Sector Analytics based on filtered records
  const sectorAnalytics = useMemo(() => {
    return parseSectorAnalytics(sectorRecordsForTree);
  }, [sectorRecordsForTree]);

  // --- Dynamic Sector Audit Exploration & Inner Rankings ---
  // Records specifically belonging to the active sector
  const activeSectorRecords = useMemo(() => {
    if (!selectedSector) return [];
    return sectorRecordsForTree.filter(r => r.setorVenda === selectedSector);
  }, [sectorRecordsForTree, selectedSector]);

  // Total spent in this active sector
  const activeSectorTotalSpent = useMemo(() => {
    return activeSectorRecords.reduce((sum, r) => sum + r.valorTotal, 0);
  }, [activeSectorRecords]);

  // Ranking of ALL products in this sector (unfiltered by selection, sorted descending by cost)
  const productsRanking = useMemo(() => {
    if (activeSectorRecords.length === 0) return [];
    
    const prodMap: { [code: string]: { code: string; descricao: string; quantity: number; totalSpent: number } } = {};
    
    activeSectorRecords.forEach(r => {
      const pCode = r.produto;
      if (!prodMap[pCode]) {
        prodMap[pCode] = { code: pCode, descricao: r.descricaoProduto, quantity: 0, totalSpent: 0 };
      }
      prodMap[pCode].quantity += r.quantidade;
      prodMap[pCode].totalSpent += r.valorTotal;
    });

    return Object.values(prodMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((item, idx) => {
        const percentImpact = activeSectorTotalSpent > 0 ? (item.totalSpent / activeSectorTotalSpent) * 100 : 0;
        return {
          ...item,
          rank: idx + 1,
          percentImpact
        };
      });
  }, [activeSectorRecords, activeSectorTotalSpent]);

  // Ranking of ALL clients in this sector (unfiltered by selection, sorted descending by cost)
  const clientsRanking = useMemo(() => {
    if (activeSectorRecords.length === 0) return [];

    const clientMap: { [name: string]: { code: string; nome: string; requestCount: number; totalSpent: number } } = {};

    activeSectorRecords.forEach(r => {
      const cName = r.nomeCliente;
      if (!clientMap[cName]) {
        clientMap[cName] = { code: r.codigoCliente, nome: cName, requestCount: 0, totalSpent: 0 };
      }
      clientMap[cName].requestCount += 1;
      clientMap[cName].totalSpent += r.valorTotal;
    });

    return Object.values(clientMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((item, idx) => {
        const percentImpact = activeSectorTotalSpent > 0 ? (item.totalSpent / activeSectorTotalSpent) * 100 : 0;
        return {
          ...item,
          rank: idx + 1,
          percentImpact
        };
      });
  }, [activeSectorRecords, activeSectorTotalSpent]);

  // If a product is selected, find the ranking of clients who requested this product
  const clientsForSelectedProduct = useMemo(() => {
    if (!selectedProductCode || activeSectorRecords.length === 0) return [];

    const clientMap: { [name: string]: { code: string; nome: string; quantity: number; totalSpent: number } } = {};

    activeSectorRecords.forEach(r => {
      if (r.produto === selectedProductCode) {
        const cName = r.nomeCliente;
        if (!clientMap[cName]) {
          clientMap[cName] = { code: r.codigoCliente, nome: cName, quantity: 0, totalSpent: 0 };
        }
        clientMap[cName].quantity += r.quantidade;
        clientMap[cName].totalSpent += r.valorTotal;
      }
    });

    const productTotal = Object.values(clientMap).reduce((sum, c) => sum + c.totalSpent, 0);

    return Object.values(clientMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((item, idx) => {
        const percentOfProduct = productTotal > 0 ? (item.totalSpent / productTotal) * 100 : 0;
        return {
          ...item,
          rank: idx + 1,
          percentOfProduct
        };
      });
  }, [selectedProductCode, activeSectorRecords]);

  // If a client is selected, find the ranking of items requested by this client
  const productsForSelectedClient = useMemo(() => {
    if (!selectedClientName || activeSectorRecords.length === 0) return [];

    const prodMap: { [code: string]: { code: string; descricao: string; quantity: number; totalSpent: number } } = {};

    activeSectorRecords.forEach(r => {
      if (r.nomeCliente === selectedClientName) {
        const pCode = r.produto;
        if (!prodMap[pCode]) {
          prodMap[pCode] = { code: pCode, descricao: r.descricaoProduto, quantity: 0, totalSpent: 0 };
        }
        prodMap[pCode].quantity += r.quantidade;
        prodMap[pCode].totalSpent += r.valorTotal;
      }
    });

    const clientTotal = Object.values(prodMap).reduce((sum, p) => sum + p.totalSpent, 0);

    return Object.values(prodMap)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((item, idx) => {
        const percentOfClient = clientTotal > 0 ? (item.totalSpent / clientTotal) * 100 : 0;
        return {
          ...item,
          rank: idx + 1,
          percentOfClient
        };
      });
  }, [selectedClientName, activeSectorRecords]);

  // Calculate sector consumption breakdown relative to active meta
  // "grafico informando qual o setor consome mais da meta"
  // ONLY taking approved requests for active meta breakdown
  const sectorMetaConsumption = useMemo(() => {
    // Group approved value and Hectoliter volume by sector
    const sectorMap: { [key: string]: number } = {};
    const sectorHlMap: { [key: string]: number } = {};
    
    filteredRecords.forEach(r => {
      const statusClean = r.status.toLowerCase().trim();
      if (statusClean.includes("aprov") && r.setorVenda) {
        const sec = r.setorVenda.trim();
        sectorMap[sec] = (sectorMap[sec] || 0) + r.valorTotal;
        sectorHlMap[sec] = (sectorHlMap[sec] || 0) + calculateHL(r.produto, r.quantidade);
      }
    });

    const sortedSectors = Object.entries(sectorMap)
      .map(([sector, approvedSum]) => {
        const percentOfMeta = activeGoal > 0 ? (approvedSum / activeGoal) * 100 : 0;
        const approvedHl = sectorHlMap[sector] || 0;
        return {
          sector,
          approvedSum,
          percentOfMeta,
          approvedHl
        };
      })
      .sort((a, b) => b.approvedSum - a.approvedSum);

    return sortedSectors;
  }, [filteredRecords, activeGoal]);

  // Rich context summary of the database compiled for the Gemini Model
  const chatContextSummary = useMemo(() => {
    const topProds = generalTopProducts.slice(0, 6).map(p => `${p.descricao} (Código: ${p.code}, Qtd: ${p.quantity}, Vol: ${p.hl.toFixed(3)} HL, Custo: ${formatCurrency(p.totalSpent)})`);
    const topClis = generalTopClients.slice(0, 6).map(c => `${c.nome} (Código NB: ${c.code}, Pedidos: ${c.requestCount}, Vol: ${c.hl.toFixed(3)} HL, Custo: ${formatCurrency(c.totalSpent)})`);
    const sectorCon = sectorMetaConsumption.slice(0, 6).map(s => `Setor ${s.sector} (Aprovado: ${formatCurrency(s.approvedSum)}, Atingimento: ${s.percentOfMeta.toFixed(1)}%)`);
    
    return {
      totalGeralLancado: formatCurrency(stats.totalValue),
      totalAprovadoNoFiltro: formatCurrency(stats.approvedValue),
      totalPendentesDeAcao: formatCurrency(stats.pendingValue),
      totalReprovadosNoFiltro: formatCurrency(stats.reprovedValue),
      quantidadeDeRegistrosFiltrados: stats.totalCount,
      quantidadeDeRegistrosTotalNoBanco: records.length,
      volumeTotalHectolitrosNoFiltro: `${totalHLFiltered.toFixed(3)} HL`,
      volumeTotalHectolitrosGeral: `${totalHLAll.toFixed(3)} HL`,
      limiteMetaAtivoNoPeriodo: formatCurrency(activeGoal),
      metaAnualTotalSSTR: formatCurrency(META_ANUAL),
      percentualAtingimentoNoPeriodo: `${monthlyAtingimento.toFixed(1)}%`,
      totalClientesCadastradosNoSSTR: totalClientsRegistered,
      melhoresProdutosGerais: topProds,
      melhoresClientesGerais: topClis,
      consumoMetaPorSetor: sectorCon,
      principaisMotivosJustificativas: uniqueReasons.slice(0, 10)
    };
  }, [records, filteredRecords, stats, generalTopProducts, generalTopClients, sectorMetaConsumption, totalHLFiltered, totalHLAll, monthlyAtingimento, totalClientsRegistered, uniqueReasons, activeGoal]);

  // Dispatcher for the Gemini assistant chat
  const handleSubmitChatMessage = async (userPrompt?: string) => {
    const promptToSend = userPrompt?.trim() || chatInput.trim();
    if (!promptToSend) return;

    if (!userPrompt) {
      setChatInput("");
    }

    // Append user message to state
    setChatHistory(prev => [...prev, { role: "user", text: promptToSend }]);
    setAiLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/gemini/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptToSend,
          context: chatContextSummary
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro geral do servidor ao processar.");
      }

      setChatHistory(prev => [...prev, { role: "assistant", text: data.text || "Não obtive resposta." }]);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: "system", text: `Falha: ${err.message || "Sem conexão com o SSTR-AI"}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Set first sector as default selected if not set and available
  useMemo(() => {
    if (!selectedSector && sectorAnalytics.length > 0) {
      setSelectedSector(sectorAnalytics[0].setor);
    }
  }, [sectorAnalytics, selectedSector]);

  const activeAnalytics = useMemo(() => {
    return sectorAnalytics.find(sa => sa.setor === selectedSector);
  }, [sectorAnalytics, selectedSector]);

  const maxSectorSpent = useMemo(() => {
    if (sectorAnalytics.length === 0) return 1;
    return Math.max(...sectorAnalytics.map(s => s.totalSpent));
  }, [sectorAnalytics]);

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* 1. Header Filter Controls / Settings (Dark Minimalist with royal blue accents) */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        
        {/* Switch layout & title */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-start space-x-3">
            <div className="p-3 bg-blue-950/60 rounded-xl border border-blue-800/40 text-blue-400 shadow-inner">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display text-white flex items-center gap-2">
                Filtros do Painel Gerencial
                <span className="hidden sm:inline-block font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-900/40">
                  Paleta Azul Ativa
                </span>
              </h2>
              <p className="text-xs text-slate-400">Analise a evolução das trocas escolhendo o tipo de filtro ideal</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Process Type Pill Filter replicated from Auditoria e Rastreamento */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setProcessTypeFilter("todos")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  processTypeFilter === "todos"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🌐 Todos
              </button>
              <button
                type="button"
                onClick={() => setProcessTypeFilter("reposicao")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  processTypeFilter === "reposicao"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📦 Reposição (Falta)
              </button>
              <button
                type="button"
                onClick={() => setProcessTypeFilter("troca")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                  processTypeFilter === "troca"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🔁 Troca (Outros)
              </button>
            </div>

            {/* Toggle Button for Filter Mode */}
            <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                onClick={() => setFilterMode("mes")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  filterMode === "mes"
                    ? "bg-blue-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Filtro Mês a Mês</span>
              </button>
              <button
                onClick={() => setFilterMode("dias")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  filterMode === "dias"
                    ? "bg-blue-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Filtro Entre Dias</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inputs depending on Filter Mode */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          
          {/* Semester Selector Focus */}
          <div className="md:col-span-3 flex flex-col space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
              🎯 Semestre (Período)
            </label>
            <select
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value as any)}
              className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
            >
              <option value="1H">1º Semestre (1º H)</option>
              <option value="2H">2º Semestre (2º H)</option>
              <option value="all">Todo o Ano</option>
            </select>
          </div>

          {filterMode === "mes" ? (
            /* Month selection dropdown */
            <div className="md:col-span-3 flex flex-col space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
                📅 Selecione o Mês/Ano
              </label>
              <select
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
              >
                <option value="todos">📅 {semesterFilter === "1H" ? "Todos do 1º Semestre" : semesterFilter === "2H" ? "Todos do 2º Semestre" : "Todos os Meses"}</option>
                {filteredMonths.map(my => (
                  <option key={my} value={my}>
                    {formatMonthYearLabel(my)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            /* Date range input selectors */
            <div className="md:col-span-3 grid grid-cols-2 gap-3">
              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  📅 De
                </label>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
                />
              </div>
              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  📅 Até
                </label>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
                />
              </div>
            </div>
          )}

          {/* Reason / Justificativa filtro comum */}
          <div className="md:col-span-3 flex flex-col space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
              🔍 Causa Raiz / Motivo
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
            >
              <option value="todos">🔍 Todas os Motivos / Justificativas</option>
              {uniqueReasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* GV (Gerente de Vendas) filter */}
          <div className="md:col-span-2 flex flex-col space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
              👤 Gerente (GV)
            </label>
            <select
              value={selectedGv}
              onChange={(e) => setSelectedGv(e.target.value)}
              className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
            >
              <option value="todos">👤 Todos os GVs</option>
              {uniqueGVsList.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Process Type Filter (Reposição vs Troca) */}
          <div className="md:col-span-2 flex flex-col space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
              📦 Tipo de Processo
            </label>
            <select
              value={processTypeFilter}
              onChange={(e) => setProcessTypeFilter(e.target.value as any)}
              className="bg-slate-950 text-slate-100 hover:bg-slate-900 border border-slate-800 font-mono text-xs rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer w-full"
            >
              <option value="todos">🌐 Todos os Processos</option>
              <option value="reposicao">📦 Reposição (Falta de Produto)</option>
              <option value="troca">🔁 Troca (Outros Motivos)</option>
            </select>
          </div>

          {/* Clear Button */}
          <div className="md:col-span-2 lg:col-span-1">
            {(semesterFilter !== "1H" || selectedMonthYear !== "todos" || startDateStr !== "" || endDateStr !== "" || selectedReason !== "todos" || selectedGv !== "todos" || processTypeFilter !== "todos") ? (
              <button
                onClick={() => {
                  setSemesterFilter("1H");
                  setSelectedMonthYear("todos");
                  setStartDateStr("");
                  setEndDateStr("");
                  setSelectedReason("todos");
                  setSelectedGv("todos");
                  setProcessTypeFilter("todos");
                }}
                className="w-full py-2.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/40 text-rose-300 text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span className="md:hidden lg:inline">Limpar</span>
              </button>
            ) : (
              <div className="text-[10px] text-slate-500 font-mono text-center pb-2.5">
                Sem filtros
              </div>
            )}
          </div>
        </div>

        {/* Process Type Quick Selector Cards (Reposição vs Troca) */}
        <div className="pt-3 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Classificação de Processos (Reposição vs. Troca)</span>
            </span>
            {processTypeFilter !== "todos" && (
              <button
                onClick={() => setProcessTypeFilter("todos")}
                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 underline font-bold cursor-pointer"
              >
                Exibindo: {processTypeFilter === "reposicao" ? "REPOSIÇÃO (Falta)" : "TROCAS (Demais Motivos)"} (Limpar)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Todos */}
            <button
              type="button"
              onClick={() => setProcessTypeFilter("todos")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                processTypeFilter === "todos"
                  ? "bg-blue-950/80 border-blue-500 ring-1 ring-blue-500 shadow-lg"
                  : "bg-slate-950/60 hover:bg-slate-950 border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-blue-400 font-bold uppercase">🌐 Todos os Processos</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  {processSummaryDashboard.totalCount} reg.
                </span>
              </div>
              <p className="text-base font-black font-mono text-white mt-1">
                {formatCurrency(processSummaryDashboard.totalVal)}
              </p>
              <span className="text-[9.5px] text-slate-400 block mt-0.5 font-sans leading-tight">
                {processSummaryDashboard.totalHl.toFixed(1)} HL • Visão Consolidada do Sistema
              </span>
            </button>

            {/* Card 2: Reposição */}
            <button
              type="button"
              onClick={() => setProcessTypeFilter(processTypeFilter === "reposicao" ? "todos" : "reposicao")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                processTypeFilter === "reposicao"
                  ? "bg-indigo-950/80 border-indigo-500 ring-1 ring-indigo-500 shadow-lg"
                  : "bg-slate-950/60 hover:bg-slate-950 border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">📦 Reposição (Falta de Produto)</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {processSummaryDashboard.repCount} reg.
                </span>
              </div>
              <p className="text-base font-black font-mono text-white mt-1">
                {formatCurrency(processSummaryDashboard.repVal)}
              </p>
              <span className="text-[9.5px] text-slate-400 block mt-0.5 font-sans leading-tight">
                {processSummaryDashboard.repHl.toFixed(1)} HL • Relatório 03.18.05 Informa / Falta no Entrega
              </span>
            </button>

            {/* Card 3: Trocas */}
            <button
              type="button"
              onClick={() => setProcessTypeFilter(processTypeFilter === "troca" ? "todos" : "troca")}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                processTypeFilter === "troca"
                  ? "bg-emerald-950/80 border-emerald-500 ring-1 ring-emerald-500 shadow-lg"
                  : "bg-slate-950/60 hover:bg-slate-950 border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">🔁 Troca (Outros Motivos)</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {processSummaryDashboard.trocaCount} reg.
                </span>
              </div>
              <p className="text-base font-black font-mono text-white mt-1">
                {formatCurrency(processSummaryDashboard.trocaVal)}
              </p>
              <span className="text-[9.5px] text-slate-400 block mt-0.5 font-sans leading-tight">
                {processSummaryDashboard.trocaHl.toFixed(1)} HL • Avaria, Inversão, Vencimento, Vasilhame, Qualidade
              </span>
            </button>
          </div>
        </div>

        {/* Filter explanation overlay */}
        <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
            <span>Exibindo <strong>{stats.totalCount}</strong> de <strong>{records.length}</strong> registros do banco de dados</span>
          </div>
          {filterMode === "dias" && (startDateStr || endDateStr) && (
            <span className="text-blue-400">
              Período: {startDateStr ? startDateStr.split("-").reverse().join("/") : "Início"} até {endDateStr ? endDateStr.split("-").reverse().join("/") : "Fim"}
            </span>
          )}
        </div>
      </div>


      {/* 2. Dashboard Tabs Switcher */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 max-w-sm self-start mb-2">
        <button
          onClick={() => setDashboardTab("consolidado")}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold font-mono tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            dashboardTab === "consolidado"
              ? "bg-blue-600 text-white shadow-xl"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>Visão Geral</span>
        </button>
        <button
          onClick={() => setDashboardTab("setores")}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold font-mono tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
            dashboardTab === "setores"
              ? "bg-blue-600 text-white shadow-xl"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Auditoria por Setor</span>
        </button>
      </div>

      {dashboardTab === "consolidado" ? (
        <ConsolidatedView
          records={records}
          filteredRecords={filteredRecords}
          stats={stats}
          totalClientsRegistered={totalClientsRegistered}
          annualApprovedAccumulated={annualApprovedAccumulated}
          totalHLFiltered={totalHLFiltered}
          totalHLAll={totalHLAll}
          activeGoal={activeGoal}
          activeGoalName={activeGoalName}
          activeGoalBadge={activeGoalBadge}
          monthlyAtingimento={monthlyAtingimento}
          annualAtingimento={annualAtingimento}
          META_ANUAL={META_ANUAL}
          uniqueReasons={uniqueReasons}
          sectorMetaConsumption={sectorMetaConsumption}
          formatCurrency={formatCurrency}
          selectedMonthYear={selectedMonthYear}
          setSelectedMonthYear={setSelectedMonthYear}
          setFilterMode={setFilterMode}
        />
      ) : (
        <>
          {/* 2. Target Performance & Goals Card (Meta Mensal ou Fallback 1ºH) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Monthly/Semestral Meta Progress Widget */}
        <div className="lg:col-span-6 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-blue-400">
                <Target className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider font-mono">{activeGoalName}</span>
              </div>
              <span className="text-[10px] font-bold font-mono text-blue-500 bg-blue-950/80 border border-blue-900/50 px-2 py-0.5 rounded-md">
                {activeGoalBadge}
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Consumido no período</span>
                <span className="text-3xl font-extrabold font-display leading-tight text-white">
                  {formatCurrency(stats.approvedValue)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Meta Limite</span>
                <span className="text-xl font-bold font-mono text-blue-400">
                  {formatCurrency(activeGoal)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Percentual de Atingimento</span>
              <span className={`font-bold ${monthlyAtingimento > 100 ? "text-rose-400" : "text-blue-400"}`}>
                {monthlyAtingimento.toFixed(1)}%
              </span>
            </div>
            
            {/* Real progress bar */}
            <div className="w-full bg-slate-950 h-3 rounded-full border border-slate-800 overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  monthlyAtingimento > 100 
                    ? "bg-gradient-to-r from-blue-600 to-rose-600" 
                    : "bg-gradient-to-r from-blue-600 to-blue-400"
                }`}
                style={{ width: `${Math.min(monthlyAtingimento, 100)}%` }}
              ></div>
              {monthlyAtingimento > 100 && (
                <div className="absolute right-2 top-0.5 text-[8px] font-extrabold font-mono text-rose-200">
                  ESTOURO {formatCurrency(stats.approvedValue - activeGoal)}
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed">
            {monthlyAtingimento <= 100 ? (
              <span>🟢 A operação de reposição está dentro da meta limite estipulada de <strong>{formatCurrency(activeGoal)}</strong>. Margem disponível: <strong>{formatCurrency(activeGoal - stats.approvedValue)}</strong>.</span>
            ) : (
              <span className="text-rose-300">⚠️ Alerta de Limite Excedido! O volume acumulado extrapola a meta estipulada de {formatCurrency(activeGoal)} por <strong>{formatCurrency(stats.approvedValue - activeGoal)}</strong>.</span>
            )}
          </div>
        </div>

        {/* Annual Meta Progress Widget (Meta Anual R$ 144.000) */}
        <div className="lg:col-span-6 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-400">
                <Percent className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider font-mono">Meta Anual Acumulada</span>
              </div>
              <span className="text-[10px] font-bold font-mono text-indigo-400 bg-indigo-950/80 border border-indigo-900/50 px-2 py-0.5 rounded-md">
                Meta Mensal x 12
              </span>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-xs text-slate-400 block">Acumulado do ano (YTD)</span>
                <span className="text-3xl font-extrabold font-display leading-tight text-white">
                  {formatCurrency(annualApprovedAccumulated)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Meta Anual</span>
                <span className="text-xl font-bold font-mono text-indigo-400">
                  {formatCurrency(META_ANUAL)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Atingimento do Ano</span>
              <span className="font-bold text-indigo-400">
                {annualAtingimento.toFixed(1)}%
              </span>
            </div>
            
            {/* Annual progress bar */}
            <div className="w-full bg-slate-950 h-3 rounded-full border border-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-700 to-indigo-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(annualAtingimento, 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed">
            <span>📊 O acumulado de todo o ano de 2026 registra <strong>{formatCurrency(annualApprovedAccumulated)}</strong> aprovados, correspondendo a {annualAtingimento.toFixed(1)}% da meta de custo total anual de <strong>{formatCurrency(META_ANUAL)}</strong>.</span>
          </div>
        </div>

      </div>


      {/* 3. Core KPI Statistics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Cost card */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-4">
          <div className="p-3 bg-blue-950/70 text-blue-400 rounded-xl border border-blue-900/40">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest font-mono">Total Lançado (Geral)</p>
            <h3 className="text-xl font-bold font-mono text-white tracking-tight mt-0.5">
              {formatCurrency(stats.totalValue)}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center font-mono">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400 mr-1" />
              {stats.totalCount} Solicitações
            </p>
          </div>
        </div>

        {/* Approved card */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-4">
          <div className="p-3 bg-emerald-950/70 text-emerald-400 rounded-xl border border-emerald-900/40">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest font-mono">Valor Total Aprovado</p>
            <h3 className="text-xl font-bold font-mono text-emerald-400 tracking-tight mt-0.5">
              {formatCurrency(stats.approvedValue)}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
              {stats.approvedCount} pedidos liberados
            </p>
          </div>
        </div>

        {/* Pending card */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-4">
          <div className="p-3 bg-amber-950/70 text-amber-400 rounded-xl border border-amber-900/40 animate-pulse">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest font-mono">Aguardando Avaliação</p>
            <h3 className="text-xl font-bold font-mono text-amber-400 tracking-tight mt-0.5">
              {formatCurrency(stats.pendingValue)}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
              {stats.pendingCount} pendentes de ação
            </p>
          </div>
        </div>

        {/* Active Sectors card */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-4">
          <div className="p-3 bg-indigo-950/70 text-indigo-400 rounded-xl border border-indigo-900/40">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest font-mono">Setores Lançando</p>
            <h3 className="text-xl font-bold font-mono text-white tracking-tight mt-0.5">
              {stats.sectorCount} Setores
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5"></span>
              {stats.clientCount} clientes atendidos
            </p>
          </div>
        </div>
      </div>


      {/* 4. Graphical Budget Sector Analysis ("gráfico informando o setor que mais consome a meta") */}
      <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div>
          <h3 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            Consumo da Meta de {formatCurrency(activeGoal)} por Setor de Venda
          </h3>
          <p className="text-sm text-slate-400">Classificação ordenada por consumo de cada setor em relação ao limite estipulado nas solicitações aprovadas</p>
        </div>

        {sectorMetaConsumption.length === 0 ? (
          <div className="text-center py-12 text-slate-400 font-mono text-xs bg-slate-950/50 rounded-xl border border-dashed border-slate-800">
            Sem trocas aprovadas neste período para cálculo do gráfico.
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* SVG Visual Bars Layout for High-End aesthetic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              
              {/* Left Bar list */}
              <div className="space-y-3.5">
                {sectorMetaConsumption.map((item, index) => {
                  return (
                    <div key={item.sector} className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2 hover:border-blue-500/30 transition-colors">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center space-x-2">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ${
                            index === 0 ? "bg-blue-600 text-white animate-pulse" : "bg-slate-800 text-slate-300"
                          }`}>
                            {index + 1}
                          </span>
                          <span className="font-bold text-white font-mono">SETOR {item.sector}</span>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div>
                            <span className="font-extrabold text-blue-400 font-mono">{formatCurrency(item.approvedSum)}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-2">({item.percentOfMeta.toFixed(1)}% da meta)</span>
                          </div>
                          <span className="text-[10px] text-indigo-400 font-mono font-semibold">
                            {item.approvedHl?.toFixed(3) || "0.000"} HL
                          </span>
                        </div>
                      </div>

                      {/* Bar comparison layout */}
                      <div className="relative w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            index === 0 
                              ? "bg-gradient-to-r from-blue-700 to-blue-400" 
                              : "bg-slate-600"
                          }`}
                          style={{ width: `${Math.min(item.percentOfMeta, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Graphical Summary Insights */}
              <div className="bg-slate-950/90 p-5 rounded-xl border border-slate-800/60 flex flex-col justify-between h-full space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-blue-500 font-mono">Destaque de Utilização</span>
                  <p className="text-sm text-slate-300 leading-relaxed font-sans">
                    O maior consumidor de verba do portal de trocas neste fluxo é o <strong className="text-white">Setor {sectorMetaConsumption[0]?.sector}</strong>, totalizando <strong className="text-blue-400 font-mono">{formatCurrency(sectorMetaConsumption[0]?.approvedSum)}</strong> aprovados. Isso consome sozinho <strong className="text-white">{sectorMetaConsumption[0]?.percentOfMeta.toFixed(1)}%</strong> de todo o limite de {formatCurrency(activeGoal)} da companhia.
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-mono">Consumo Geral vs Meta Limite</span>
                  
                  {/* Gauge indicator */}
                  <div className="flex items-center space-x-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800/50">
                    <div className="w-12 h-12 rounded-full border-4 border-blue-600 flex items-center justify-center font-mono font-bold text-xs text-blue-400 shrink-0">
                      {Math.min(monthlyAtingimento, 999).toFixed(0)}%
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white">Percentual Restante</h5>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {monthlyAtingimento <= 100 
                          ? `Disponível ainda ${formatCurrency(activeGoal - stats.approvedValue)} (${(100 - monthlyAtingimento).toFixed(1)}%)`
                          : `Ultrapassado em ${formatCurrency(stats.approvedValue - activeGoal)}`
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}
      </div>


      {/* 5. Main analytical division */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* SECTION 1: Sector Expenses Tree */}
        <div className="lg:col-span-5 bg-slate-900/90 p-5 rounded-2xl border border-slate-800/80 shadow-md">
          <div className="mb-4 space-y-3">
            <div>
              <h3 className="text-md font-bold font-display text-white">Árvore de Custos por Setor</h3>
              <p className="text-xs text-slate-400">Selecione um Setor da lista abaixo para uma auditoria pormenorizada</p>
            </div>

            {/* Status Filter for Tree */}
            <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-850/60">
              <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono block mb-1.5 px-1">Filtro de Status na Árvore:</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "todos", label: "Todos" },
                  { id: "aprovado", label: "Aprovados" },
                  { id: "pendente", label: "Pendentes" },
                  { id: "reprovado", label: "Reprovados" }
                ].map(item => {
                  const isActive = sectorStatusFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSectorStatusFilter(item.id as any)}
                      className={`py-1 rounded text-[11px] font-semibold transition-all cursor-pointer border text-center ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                          : "bg-slate-900/40 hover:bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {sectorAnalytics.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs bg-slate-950/20 rounded-xl border border-dashed border-slate-800">
                Sem lançamentos para os filtros ativos.
              </div>
            ) : (
              sectorAnalytics.map((sa) => {
                const isSelected = selectedSector === sa.setor;
                const percentage = maxSectorSpent > 0 ? (sa.totalSpent / maxSectorSpent) * 100 : 0;
                
                return (
                  <button
                    key={sa.setor}
                    onClick={() => setSelectedSector(sa.setor)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col space-y-2 cursor-pointer ${
                      isSelected
                        ? "bg-slate-950 border-blue-600 text-white shadow-lg ring-2 ring-blue-500/20"
                        : "bg-slate-950/40 hover:bg-slate-950 border-slate-800 text-slate-300"
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                            isSelected ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"
                          }`}>
                            Setor {sa.setor}
                          </span>
                          <span className="text-[11px] font-mono text-slate-450">
                            {sa.requestCount} solicitações
                          </span>
                        </div>
                        {sa.setor && REPRESENTATIVOS_SETOR[sa.setor.trim()] && (
                          <div className="text-[10px] text-slate-400 font-sans leading-tight mt-0.5">
                            <span className="font-semibold text-slate-200">{REPRESENTATIVOS_SETOR[sa.setor.trim()].nome}</span>
                            <span className="text-[8px] bg-slate-900 text-blue-400 px-1 py-0.2 rounded ml-1.5 font-mono font-bold">
                              GV: {REPRESENTATIVOS_SETOR[sa.setor.trim()].gv}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="font-bold text-sm font-mono text-blue-400 shrink-0">
                        {formatCurrency(sa.totalSpent)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isSelected ? "bg-blue-400" : "bg-slate-700"
                        }`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      ></div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* SECTION 2: Details of Active Sector (Dark blue cards) */}
        <div className="lg:col-span-7 space-y-6">
          {activeAnalytics ? (
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-6">
              
              {/* Sector Header Callout */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center pb-4 border-b border-slate-800/80">
                <div>
                  <h3 className="text-base font-bold font-display text-white flex items-center">
                    Auditoria Completa: Setor {selectedSector}
                  </h3>
                  <p className="text-xs text-slate-400">Identificação de produtos e clientes críticos no setor</p>
                </div>
                {selectedSector && (
                  <button
                    onClick={() => onSelectSector(selectedSector)}
                    className="mt-3 sm:mt-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors font-mono cursor-pointer shrink-0"
                  >
                    <span>Ver Pedidos do Setor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Representative and GV Info Card */}
              {selectedSector && REPRESENTATIVOS_SETOR[selectedSector.trim()] && (
                <div className="bg-slate-950/85 p-3.5 rounded-xl border border-blue-900/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs font-sans">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block">Representante de Vendas (RN)</span>
                    <span className="font-bold text-white text-sm">{REPRESENTATIVOS_SETOR[selectedSector.trim()].nome}</span>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 block">Gerente de Vendas (GV)</span>
                    <span className="font-bold text-blue-400 text-sm flex items-center gap-1.5 justify-end mt-0.5">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                      {REPRESENTATIVOS_SETOR[selectedSector.trim()].gv}
                    </span>
                  </div>
                </div>
              )}

              {/* Sector stats row */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-850">
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Gasto Geral</p>
                  <p className="text-base font-bold text-blue-400 font-mono mt-0.5">
                    {formatCurrency(activeAnalytics.totalSpent)}
                  </p>
                </div>
                <div className="text-center border-x border-slate-800/85">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Média por Item</p>
                  <p className="text-base font-bold text-white font-mono mt-0.5">
                    {formatCurrency(activeAnalytics.averageSpent)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Itens de Troca</p>
                  <p className="text-base font-bold text-white font-mono mt-0.5">
                    {activeAnalytics.requestCount}
                  </p>
                </div>
              </div>

              {/* Interactive Path Indicator / Breadcrumbs */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-slate-400">Análise de Vínculos:</span>
                <span className="text-blue-400 font-bold">Setor {selectedSector}</span>
                
                {selectedProductCode && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                    <span className="px-2 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-900/60 flex items-center gap-1.5 shadow-sm text-[10px]">
                      📦 Produto: <strong>{selectedProductCode}</strong>
                      <button 
                        onClick={() => setSelectedProductCode(null)} 
                        className="hover:text-rose-405 ml-1 font-extrabold text-xs cursor-pointer focus:outline-hidden"
                        title="Limpar filtro de produto"
                      >
                        ×
                      </button>
                    </span>
                  </>
                )}

                {selectedClientName && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                    <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded border border-indigo-900/60 flex items-center gap-1.5 shadow-sm text-[10px]">
                      👤 Cliente: <strong>{selectedClientName}</strong>
                      <button 
                        onClick={() => setSelectedClientName(null)} 
                        className="hover:text-rose-405 ml-1 font-extrabold text-xs cursor-pointer focus:outline-hidden"
                        title="Limpar filtro de cliente"
                      >
                        ×
                      </button>
                    </span>
                  </>
                )}

                {(!selectedProductCode && !selectedClientName) && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
                    <span className="text-slate-500 italic">Selecione um Produto ou Cliente para explorar relações</span>
                  </>
                )}
              </div>

              {/* Detailed Breakdown block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* 1. Products Panel */}
                <div className="space-y-4">
                  {selectedClientName ? (
                    // When Client is selected -> Show ranking of items requested by this client
                    <>
                      <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-widest font-mono pb-2 border-b border-indigo-900/40 flex justify-between items-center">
                        <span>📦 Itens Solicitados (Ranking)</span>
                        <span className="text-[10px] lowercase text-slate-400">por {selectedClientName}</span>
                      </h4>
                      <div className="space-y-2 overflow-y-auto max-h-[280px] bg-slate-950/45 p-2 rounded-xl border border-slate-850">
                        {productsForSelectedClient.length === 0 ? (
                          <div className="text-center py-10 text-slate-500 font-mono text-[10px]">
                            Sem itens cadastrados para este cliente.
                          </div>
                        ) : (
                          productsForSelectedClient.map((p) => {
                            const isProductActive = selectedProductCode === p.code;
                            return (
                              <button
                                key={p.code}
                                onClick={() => {
                                  setSelectedProductCode(p.code);
                                }}
                                className={`w-full text-left flex justify-between items-start text-xs p-2.5 rounded-lg transition-all border ${
                                  isProductActive
                                    ? "bg-blue-950/70 border-blue-700/60 text-white"
                                    : "bg-transparent hover:bg-slate-900 border-transparent hover:border-slate-800 text-slate-300"
                                }`}
                              >
                                <div className="max-w-[70%]">
                                  <p className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                    <span className="text-indigo-400 font-mono font-bold text-[10px]">{p.rank}º</span>
                                    <span className="truncate">{p.descricao}</span>
                                  </p>
                                  <p className="text-slate-400 text-[10px] font-mono mt-0.5 pl-5">
                                    Cód: <span className="text-slate-300">{p.code}</span> | Qtd: <span className="text-slate-250 font-bold">{p.quantity}</span> | {p.percentOfClient.toFixed(1)}% do client
                                  </p>
                                </div>
                                <span className="font-bold text-blue-400 font-mono shrink-0 text-right">
                                  {formatCurrency(p.totalSpent)}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    // Default / Active Selector -> Show ALL products by impact
                    <>
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono pb-2 border-b border-slate-800/60 flex justify-between items-center">
                        <span>📦 Ranking de Itens do Setor</span>
                        <span className="text-[9px] font-mono text-slate-500 lowercase">Organizados por impacto de custo</span>
                      </h4>
                      <div className="space-y-2 overflow-y-auto max-h-[280px] bg-slate-950/20 p-1.5 rounded-xl border border-slate-850/40">
                        {productsRanking.length === 0 ? (
                          <div className="text-center py-10 text-slate-500 font-mono text-[10px]">
                            Nenhum produto cadastrado no setor.
                          </div>
                        ) : (
                          productsRanking.map((p) => {
                            const isProductActive = selectedProductCode === p.code;
                            return (
                              <button
                                key={p.code}
                                onClick={() => {
                                  setSelectedProductCode(p.code);
                                  setSelectedClientName(null); // focusing product swaps details
                                }}
                                className={`w-full text-left flex justify-between items-start text-xs p-2.5 rounded-xl transition-all border ${
                                  isProductActive
                                    ? "bg-blue-950 border-blue-600 text-white shadow-md ring-1 ring-blue-500/20"
                                    : "bg-transparent hover:bg-slate-955 border-transparent hover:border-slate-800 text-slate-300"
                                }`}
                              >
                                <div className="max-w-[70%]">
                                  <p className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                    <span className="text-blue-400 font-mono font-bold text-[10px] bg-slate-950 px-1 py-0.5 rounded border border-slate-850">{p.rank}º</span>
                                    <span className="truncate">{p.descricao}</span>
                                  </p>
                                  <p className="text-slate-400 text-[10px] font-mono mt-1 pl-1">
                                    Cód: <span className="font-semibold text-slate-300">{p.code}</span> | Qtd: <span className="text-slate-200 font-semibold">{p.quantity}</span> | Impacto: <span className="text-blue-450 font-bold font-mono">{p.percentImpact.toFixed(1)}%</span>
                                  </p>
                                </div>
                                <span className="font-bold text-blue-400 font-mono shrink-0 pt-0.5">
                                  {formatCurrency(p.totalSpent)}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 2. Clients Panel */}
                <div className="space-y-4">
                  {selectedProductCode ? (
                    // When Product is selected -> Show ranking of clients purchasing this item
                    <>
                      <h4 className="text-xs font-bold text-blue-300 uppercase tracking-widest font-mono pb-2 border-b border-blue-900/40 flex justify-between items-center">
                        <span>👤 Ranking Clientes deste Produto</span>
                        <span className="text-[10px] lowercase text-slate-400 font-mono">Mais para menos solicitante</span>
                      </h4>
                      <div className="space-y-2 overflow-y-auto max-h-[280px] bg-slate-950/45 p-2 rounded-xl border border-slate-850">
                        {clientsForSelectedProduct.length === 0 ? (
                          <div className="text-center py-10 text-slate-500 font-mono text-[10px]">
                            Nenhum cliente solicitou este item.
                          </div>
                        ) : (
                          clientsForSelectedProduct.map((c) => {
                            const isClientActive = selectedClientName === c.nome;
                            return (
                              <button
                                key={c.nome}
                                onClick={() => {
                                  setSelectedClientName(c.nome);
                                }}
                                className={`w-full text-left flex justify-between items-start text-xs p-2.5 rounded-lg transition-all border ${
                                  isClientActive
                                    ? "bg-indigo-950/70 border-indigo-700/60 text-white"
                                    : "bg-transparent hover:bg-slate-900 border-transparent hover:border-slate-800 text-slate-300"
                                }`}
                              >
                                <div className="max-w-[70%]">
                                  <p className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                    <span className="text-blue-400 font-mono font-bold text-[10px]">{c.rank}º</span>
                                    <span className="truncate">{c.nome}</span>
                                  </p>
                                  <p className="text-slate-400 text-[10px] font-mono mt-0.5 pl-5">
                                    Cód: <span className="text-slate-300">{c.code}</span> | Qtd: <span className="text-slate-250 font-bold">{c.quantity} un</span> | {c.percentOfProduct.toFixed(1)}% do prod
                                  </p>
                                </div>
                                <span className="font-bold text-blue-400 font-mono shrink-0 text-right">
                                  {formatCurrency(c.totalSpent)}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    // Default / Active Selector -> Show ALL clients by volume
                    <>
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono pb-2 border-b border-slate-800/60 flex justify-between items-center">
                        <span>👤 Clientes de Maior Volume</span>
                        <span className="text-[9px] font-mono text-slate-500 lowercase">Organizados por impacto de custo</span>
                      </h4>
                      <div className="space-y-2 overflow-y-auto max-h-[280px] bg-slate-950/20 p-1.5 rounded-xl border border-slate-850/40">
                        {clientsRanking.length === 0 ? (
                          <div className="text-center py-10 text-slate-500 font-mono text-[10px]">
                            Nenhum cliente cadastrado no setor.
                          </div>
                        ) : (
                          clientsRanking.map((c) => {
                            const isClientActive = selectedClientName === c.nome;
                            return (
                              <button
                                key={c.nome}
                                onClick={() => {
                                  setSelectedClientName(c.nome);
                                  setSelectedProductCode(null); // focusing client swaps details
                                }}
                                className={`w-full text-left flex justify-between items-start text-xs p-2.5 rounded-xl transition-all border ${
                                  isClientActive
                                    ? "bg-indigo-950 border-indigo-600 text-white shadow-md ring-1 ring-indigo-500/20"
                                    : "bg-transparent hover:bg-slate-955 border-transparent hover:border-slate-800 text-slate-300"
                                }`}
                              >
                                <div className="max-w-[70%]">
                                  <p className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                    <span className="text-indigo-400 font-mono font-bold text-[10px] bg-slate-950 px-1 py-0.5 rounded border border-slate-850">{c.rank}º</span>
                                    <span className="truncate">{c.nome}</span>
                                  </p>
                                  <p className="text-slate-400 text-[10px] font-mono mt-1 pl-1">
                                    Cód: <span className="font-semibold text-slate-300">{c.code}</span> | {c.requestCount} trocas | Impacto: <span className="text-indigo-400 font-bold font-mono">{c.percentImpact.toFixed(1)}%</span>
                                  </p>
                                </div>
                                <span className="font-bold text-blue-400 font-mono shrink-0 pt-0.5">
                                  {formatCurrency(c.totalSpent)}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </div>

              </div>

              {/* 3. Reason mapping widgets (Justify reasons in selector) */}
              <div className="pt-4 border-t border-slate-800/80">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono pb-3">
                  Detalhamento de Causa Raiz do Setor
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(activeAnalytics.justificationCounts).map(([just, info]) => {
                    const typedInfo = info as { count: number; totalSpent: number };
                    return (
                      <div key={just} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <p className="text-[10px] uppercase font-bold text-slate-400 font-mono line-clamp-1">{just}</p>
                        <p className="text-xs font-mono font-bold text-blue-400">{formatCurrency(typedInfo.totalSpent)}</p>
                        <p className="text-[9px] text-slate-400 font-mono">{typedInfo.count} registros</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800/80 shadow-md flex flex-col items-center justify-center py-20 text-center text-slate-500">
              <Layers className="w-12 h-12 text-slate-700 mb-2" />
              <p className="font-mono text-xs">Selecione um setor da lista para auditar as informações completas.</p>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
