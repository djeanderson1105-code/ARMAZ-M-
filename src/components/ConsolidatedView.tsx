import React, { useState, useMemo } from "react";
import { ExchangeRecord } from "../types";
import { getApiUrl } from "../utils/apiUrl";
import { 
  TrendingUp, 
  DollarSign, 
  RefreshCw, 
  Layers, 
  CheckCircle2, 
  HelpCircle, 
  Target, 
  BarChart2, 
  Percent,
  MessageSquare,
  Send,
  Sparkles,
  User,
  Package,
  Clock,
  ChevronRight,
  Calendar,
  ArrowLeft,
  AlertCircle
} from "lucide-react";
import { calculateHL } from "../utils/hectoFactors";

interface ConsolidatedViewProps {
  records: ExchangeRecord[];
  filteredRecords: ExchangeRecord[];
  stats: {
    totalValue: number;
    approvedValue: number;
    pendingValue: number;
    reprovedValue: number;
    totalCount: number;
    approvedCount: number;
    pendingCount: number;
    reprovedCount: number;
    sectorCount: number;
    clientCount: number;
  };
  totalClientsRegistered: number;
  annualApprovedAccumulated: number;
  totalHLFiltered: number;
  totalHLAll: number;
  activeGoal: number;
  activeGoalName: string;
  activeGoalBadge: string;
  monthlyAtingimento: number;
  annualAtingimento: number;
  META_ANUAL: number;
  uniqueReasons: string[];
  sectorMetaConsumption: Array<{
    sector: string;
    approvedSum: number;
    percentOfMeta: number;
    approvedHl?: number;
  }>;
  formatCurrency: (val: number) => string;
  selectedMonthYear: string;
  setSelectedMonthYear: (val: string) => void;
  setFilterMode: (val: "mes" | "dias") => void;
}

export default function ConsolidatedView({
  records,
  filteredRecords,
  stats,
  totalClientsRegistered,
  annualApprovedAccumulated,
  totalHLFiltered,
  totalHLAll,
  activeGoal,
  activeGoalName,
  activeGoalBadge,
  monthlyAtingimento,
  annualAtingimento,
  META_ANUAL,
  uniqueReasons,
  sectorMetaConsumption,
  formatCurrency,
  selectedMonthYear,
  setSelectedMonthYear,
  setFilterMode
}: ConsolidatedViewProps) {

  // Timeline interactive visualization states
  const [timelineViewMode, setTimelineViewMode] = useState<"months" | "days">("months");
  const [selectedMonth, setSelectedMonth] = useState<string>("06"); // Defaults to June (06) where almost all sample data resides
  const [chartMetric, setChartMetric] = useState<"cost" | "volume">("cost");
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);

  // AI Chat states
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant" | "system"; text: string }>>([
    {
      role: "assistant",
      text: "Olá! Sou o assistente de I.A. das operações do SSTR Pau Brasil Guarabira. Posso analisar os volumes solicitados de reposições (tanto em valor R$ quanto em Hectolitros - HL) e desvendar qual setor, produto ou cliente está impactando mais a meta. Como posso ajudar você hoje?"
    }
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // Sync parent filter with interactive timeline views
  React.useEffect(() => {
    if (selectedMonthYear && selectedMonthYear !== "todos") {
      const [m] = selectedMonthYear.split("/");
      setSelectedMonth(m);
      setTimelineViewMode("days");
    } else {
      setTimelineViewMode("months");
    }
  }, [selectedMonthYear]);

  // Parse Brazilian date "DD/MM/YYYY" to Date
  const parseToDate = (ptDateStr: string): Date | null => {
    if (!ptDateStr) return null;
    const parts = ptDateStr.split("/");
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  };

  // Top Products of all sectors combined
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
      .map((item, idx) => ({ ...item, rank: idx + 1 }))
      .slice(0, 10);
  }, [filteredRecords]);

  // Top Clients of all sectors combined (grouped and sorted descending)
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
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((item, idx) => ({ ...item, rank: idx + 1 }))
      .slice(0, 10);
  }, [filteredRecords]);

  // Monthly aggregated data for annual view with clients calculation
  const monthlyTimelineData = useMemo(() => {
    const monthMap: { [key: string]: { date: string; monthId: string; monthLabel: string; totalSpent: number; totalHL: number; count: number; clientCount: number; clientSet: Set<string> } } = {};
    const monthsList = [
      { id: "01", label: "Jan" },
      { id: "02", label: "Fev" },
      { id: "03", label: "Mar" },
      { id: "04", label: "Abr" },
      { id: "05", label: "Mai" },
      { id: "06", label: "Jun" },
      { id: "07", label: "Jul" },
      { id: "08", label: "Ago" },
      { id: "09", label: "Set" },
      { id: "10", label: "Out" },
      { id: "11", label: "Nov" },
      { id: "12", label: "Dez" },
    ];
    
    monthsList.forEach(m => {
      monthMap[m.id] = {
        date: m.label,
        monthId: m.id,
        monthLabel: m.label,
        totalSpent: 0,
        totalHL: 0,
        count: 0,
        clientCount: 0,
        clientSet: new Set<string>()
      };
    });

    filteredRecords.forEach(r => {
      if (!r.dataSolicitacao) return;
      const parts = r.dataSolicitacao.split("/");
      if (parts.length === 3) {
        const mId = parts[1];
        if (monthMap[mId]) {
          monthMap[mId].totalSpent += r.valorTotal;
          monthMap[mId].totalHL += calculateHL(r.produto, r.quantidade);
          monthMap[mId].count += 1;
          if (r.codigoCliente) {
            monthMap[mId].clientSet.add(r.codigoCliente);
          }
        }
      }
    });

    // Finalize client counts
    Object.values(monthMap).forEach(m => {
      m.clientCount = m.clientSet.size;
    });

    return Object.values(monthMap).sort((a, b) => parseInt(a.monthId) - parseInt(b.monthId));
  }, [filteredRecords]);

  // Daily aggregated data for selected month with clients calculation
  const dailyTimelineData = useMemo(() => {
    const dayMap: { [day: number]: { date: string; day: number; dateStr: string; totalSpent: number; totalHL: number; count: number; approvedCount: number; clientCount: number; clientSet: Set<string> } } = {};
    
    const monthRecords = filteredRecords.filter(r => {
      if (!r.dataSolicitacao) return false;
      const parts = r.dataSolicitacao.split("/");
      return parts.length === 3 && parts[1] === selectedMonth;
    });

    monthRecords.forEach(r => {
      const parts = r.dataSolicitacao.split("/");
      const dayNum = parseInt(parts[0], 10);
      if (!dayMap[dayNum]) {
        dayMap[dayNum] = {
          date: `${dayNum}/${selectedMonth}`,
          day: dayNum,
          dateStr: r.dataSolicitacao,
          totalSpent: 0,
          totalHL: 0,
          count: 0,
          approvedCount: 0,
          clientCount: 0,
          clientSet: new Set<string>()
        };
      }
      dayMap[dayNum].totalSpent += r.valorTotal;
      dayMap[dayNum].totalHL += calculateHL(r.produto, r.quantidade);
      dayMap[dayNum].count += 1;
      if (r.status.toLowerCase().trim().includes("aprov")) {
        dayMap[dayNum].approvedCount += 1;
      }
      if (r.codigoCliente) {
        dayMap[dayNum].clientSet.add(r.codigoCliente);
      }
    });

    // Finalize client counts
    Object.values(dayMap).forEach(d => {
      d.clientCount = d.clientSet.size;
    });

    return Object.values(dayMap).sort((a, b) => a.day - b.day);
  }, [filteredRecords, selectedMonth]);

  // Monthly points coordinates
  const monthlyPoints = useMemo(() => {
    if (monthlyTimelineData.length === 0) return [];
    const maxSpent = Math.max(...monthlyTimelineData.map(d => d.totalSpent)) || 1;
    const maxHL = Math.max(...monthlyTimelineData.map(d => d.totalHL)) || 1;
    
    return monthlyTimelineData.map((d) => {
      // Space Jan (01) through Dec (12) perfectly across 5% to 95%
      const mNum = parseInt(d.monthId, 10);
      const x = 5 + ((mNum - 1) / 11) * 90;
      const ySpent = 90 - (d.totalSpent / maxSpent) * 75; 
      const yHL = 90 - (d.totalHL / maxHL) * 75;
      return {
        ...d,
        x,
        ySpent,
        yHL
      };
    });
  }, [monthlyTimelineData]);

  // Daily points coordinates
  const dailyPoints = useMemo(() => {
    if (dailyTimelineData.length === 0) return [];
    const maxSpent = Math.max(...dailyTimelineData.map(d => d.totalSpent)) || 1;
    const maxHL = Math.max(...dailyTimelineData.map(d => d.totalHL)) || 1;
    
    return dailyTimelineData.map((d) => {
      // Space Day 1 through Day 31 perfectly across 5% to 95%
      const x = 5 + ((d.day - 1) / 30) * 90;
      const ySpent = 90 - (d.totalSpent / maxSpent) * 75; 
      const yHL = 90 - (d.totalHL / maxHL) * 75;
      return {
        ...d,
        x,
        ySpent,
        yHL
      };
    });
  }, [dailyTimelineData]);

  // Quick helper to determine peak day in selected month for highlighting
  const peakDayInfo = useMemo(() => {
    if (dailyTimelineData.length === 0) return null;
    return [...dailyTimelineData].sort((a, b) => b.approvedCount - a.approvedCount || b.totalSpent - a.totalSpent)[0];
  }, [dailyTimelineData]);

  // Semester 1 (1º H Semestral) Approved Accumulated
  const semester1ApprovedAccumulated = useMemo(() => {
    return records.reduce((acc, r) => {
      const statusClean = (r.status || "").toLowerCase().trim();
      if (statusClean.includes("aprov")) {
        if (r.dataSolicitacao) {
          const parts = r.dataSolicitacao.split("/");
          if (parts.length === 3) {
            const m = parseInt(parts[1], 10);
            if (m >= 1 && m <= 6) {
              return acc + r.valorTotal;
            }
            return acc;
          }
        }
      }
      return acc;
    }, 0);
  }, [records]);

  // Semester 2 (2º H Semestral) Approved Accumulated
  const semester2ApprovedAccumulated = useMemo(() => {
    return records.reduce((acc, r) => {
      const statusClean = (r.status || "").toLowerCase().trim();
      if (statusClean.includes("aprov")) {
        if (r.dataSolicitacao) {
          const parts = r.dataSolicitacao.split("/");
          if (parts.length === 3) {
            const m = parseInt(parts[1], 10);
            if (m >= 7 && m <= 12) {
              return acc + r.valorTotal;
            }
            return acc;
          }
        }
      }
      return acc;
    }, 0);
  }, [records]);

  const META_SEMESTRAL = 12000 * 6; // R$ 72.000,00
  const semester1Atingimento = useMemo(() => {
    return (semester1ApprovedAccumulated / META_SEMESTRAL) * 100;
  }, [semester1ApprovedAccumulated, META_SEMESTRAL]);

  const semester2Atingimento = useMemo(() => {
    return (semester2ApprovedAccumulated / META_SEMESTRAL) * 100;
  }, [semester2ApprovedAccumulated, META_SEMESTRAL]);

  // Top Product overall by spent
  const topProductBySpent = useMemo(() => {
    if (filteredRecords.length === 0) return null;
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

    const sorted = Object.values(prodMap).sort((a, b) => b.totalSpent - a.totalSpent);
    return sorted[0] || null;
  }, [filteredRecords]);

  // Peak Day of filtered records
  const peakDayAllTime = useMemo(() => {
    if (filteredRecords.length === 0) return null;
    const dateMap: { [date: string]: { date: string; totalSpent: number; totalHL: number; count: number } } = {};
    
    filteredRecords.forEach(r => {
      if (!r.dataSolicitacao) return;
      const dStr = r.dataSolicitacao;
      if (!dateMap[dStr]) {
        dateMap[dStr] = { date: dStr, totalSpent: 0, totalHL: 0, count: 0 };
      }
      dateMap[dStr].totalSpent += r.valorTotal;
      dateMap[dStr].totalHL += calculateHL(r.produto, r.quantidade);
      dateMap[dStr].count += 1;
    });

    const sorted = Object.values(dateMap).sort((a, b) => b.totalSpent - a.totalSpent);
    return sorted[0] || null;
  }, [filteredRecords]);

  const timelineData = useMemo(() => {
    return timelineViewMode === "months" ? monthlyTimelineData : dailyTimelineData;
  }, [timelineViewMode, monthlyTimelineData, dailyTimelineData]);

  const points = useMemo(() => {
    return timelineViewMode === "months" ? monthlyPoints : dailyPoints;
  }, [timelineViewMode, monthlyPoints, dailyPoints]);

  // Prepare database context payload for LLM assistance
  const chatContextSummary = useMemo(() => {
    const topProds = generalTopProducts.slice(0, 5).map(p => `${p.descricao} (Cód: ${p.code}, Qtd: ${p.quantity}, Vol: ${p.hl.toFixed(3)} HL, Custo: ${formatCurrency(p.totalSpent)})`);
    const topClis = generalTopClients.slice(0, 5).map(c => `${c.nome} (NB: ${c.code}, Pedidos: ${c.requestCount}, Vol: ${c.hl.toFixed(3)} HL, Custo: ${formatCurrency(c.totalSpent)})`);
    const sectorCon = sectorMetaConsumption.slice(0, 6).map(s => `Setor ${s.sector} (Aprovado: ${formatCurrency(s.approvedSum)}, Atingimento: ${s.percentOfMeta.toFixed(1)}%)`);
    
    return {
      totalGeralLancado: formatCurrency(stats.totalValue),
      totalAprovadoNoFiltro: formatCurrency(stats.approvedValue),
      totalPendentesDeAcao: formatCurrency(stats.pendingValue),
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
      principaisMotivosJustificativas: uniqueReasons.slice(0, 8)
    };
  }, [records, filteredRecords, stats, generalTopProducts, generalTopClients, sectorMetaConsumption, totalHLFiltered, totalHLAll, monthlyAtingimento, totalClientsRegistered, uniqueReasons, activeGoal, META_ANUAL, formatCurrency]);

  const handleSubmitChatMessage = async (userPrompt?: string) => {
    const promptToSend = userPrompt?.trim() || chatInput.trim();
    if (!promptToSend) return;

    if (!userPrompt) {
      setChatInput("");
    }

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

  // Dynamically identify the current/vigent date (data vigente) of the platform based on the records
  const today = useMemo(() => {
    if (records.length === 0) return new Date();
    
    let maxDateObj: Date | null = null;
    records.forEach(r => {
      if (!r.dataSolicitacao) return;
      const parts = r.dataSolicitacao.split("/");
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) {
          if (!maxDateObj || dt > maxDateObj) {
            maxDateObj = dt;
          }
        }
      }
    });

    const sysToday = new Date();
    
    // If we have a max date from records, and it's in the same year as system today or the system year is later,
    // we can use the actual system today. This ensures that in live/active operations, 
    // the system date is the absolute source of truth.
    // If we are viewing a historical year, we use the maximum record date in that dataset.
    if (maxDateObj) {
      if (sysToday.getFullYear() === (maxDateObj as Date).getFullYear()) {
        return sysToday;
      }
      return maxDateObj;
    }
    return sysToday;
  }, [records]);

  // Active year dynamically determined
  const activeYear = useMemo(() => {
    if (selectedMonthYear && selectedMonthYear !== "todos") {
      const parts = selectedMonthYear.split("/");
      return parseInt(parts[1], 10);
    }
    return today.getFullYear();
  }, [selectedMonthYear, today]);

  // 1. Calculate number of days dynamically based on the active selection
  const { calculatedDays, fullPeriodDays, periodName } = useMemo(() => {
    if (selectedMonthYear && selectedMonthYear !== "todos") {
      const [mStr, yStr] = selectedMonthYear.split("/");
      const m = parseInt(mStr, 10);
      const y = parseInt(yStr, 10);
      const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
      
      const totalDays = new Date(y, m, 0).getDate();
      const elapsedDays = isCurrentMonth ? Math.min(today.getDate(), totalDays) : totalDays;
      
      return {
        calculatedDays: elapsedDays > 0 ? elapsedDays : 1,
        fullPeriodDays: totalDays,
        periodName: isCurrentMonth ? `${mStr}/${yStr} (Em curso - ${elapsedDays} dias passados)` : `${mStr}/${yStr} (Fechado - ${totalDays} dias)`
      };
    }
    
    if (filteredRecords.length === 0) {
      return { calculatedDays: 30, fullPeriodDays: 30, periodName: "Mês Geral" };
    }
    
    // Fallback: find actual span of dates in filtered dataset
    const dates = filteredRecords.map(r => parseToDate(r.dataSolicitacao)).filter(Boolean) as Date[];
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const diffTime = Math.abs(maxDate.getTime() - minDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      const uniqueMonths = new Set(filteredRecords.map(r => {
        const p = r.dataSolicitacao.split("/");
        return p.length === 3 ? p[1] : null;
      }).filter(Boolean));
      
      const monthsCount = uniqueMonths.size || 1;
      const totalDays = monthsCount * 30;
      
      return {
        calculatedDays: diffDays > 0 ? diffDays : 1,
        fullPeriodDays: totalDays,
        periodName: `Intervalo Geral (${diffDays} dias)`
      };
    }
    
    return { calculatedDays: 30, fullPeriodDays: 30, periodName: "Geral" };
  }, [filteredRecords, selectedMonthYear, today]);

  // Averages calculations (daily)
  const averages = useMemo(() => {
    const days = calculatedDays;
    const dailyRegistrations = filteredRecords.length / days;
    const dailyHecto = totalHLFiltered / days;
    const dailyReal = stats.approvedValue / days;
    return {
      dailyRegistrations,
      dailyHecto,
      dailyReal
    };
  }, [filteredRecords, totalHLFiltered, stats.approvedValue, calculatedDays]);

  // Calculate monthly average based on month in course (mês vigente)
  const currentMonthDailyReal = useMemo(() => {
    const currentMonthStr = String(today.getMonth() + 1).padStart(2, "0");
    const currentYearStr = String(today.getFullYear());
    const defaultMonthYear = `${currentMonthStr}/${currentYearStr}`;

    const activeMonthYearStr = (selectedMonthYear && selectedMonthYear !== "todos") ? selectedMonthYear : defaultMonthYear;
    const [mStr, yStr] = activeMonthYearStr.split("/");
    const m = parseInt(mStr, 10);
    const y = parseInt(yStr, 10);

    const mRecords = records.filter(r => {
      if (!r.dataSolicitacao) return false;
      const parts = r.dataSolicitacao.split("/");
      return parts.length === 3 && parseInt(parts[1], 10) === m && parseInt(parts[2], 10) === y;
    });

    const approvedValue = mRecords
      .filter(r => r.status.toLowerCase().trim().includes("aprov"))
      .reduce((sum, r) => sum + (r.valorTotal || 0), 0);

    const isCurrentMonth = today.getFullYear() === y && (today.getMonth() + 1) === m;
    const totalDays = new Date(y, m, 0).getDate();
    const elapsedDays = isCurrentMonth ? Math.min(today.getDate(), totalDays) : totalDays;
    const days = elapsedDays > 0 ? elapsedDays : 30;

    return {
      dailyReal: approvedValue / days,
      fullPeriodDays: totalDays,
      elapsedDays: days,
      label: `${mStr}/${yStr}`
    };
  }, [records, selectedMonthYear, today]);

  // Calculate annual average based on everything registered in the year so far
  const yearAverages = useMemo(() => {
    const activeYearLocal = today.getFullYear();
    const yearRecords = records.filter(r => {
      if (!r.dataSolicitacao) return false;
      const parts = r.dataSolicitacao.split("/");
      return parts.length === 3 && parts[2] === String(activeYearLocal);
    });

    const approvedValue = yearRecords
      .filter(r => r.status.toLowerCase().trim().includes("aprov"))
      .reduce((sum, r) => sum + (r.valorTotal || 0), 0);

    const startOfYear = new Date(activeYearLocal, 0, 1);
    const diffTime = Math.abs(today.getTime() - startOfYear.getTime());
    const elapsedDaysInYear = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const days = elapsedDaysInYear > 0 ? elapsedDaysInYear : 365;

    return {
      dailyReal: approvedValue / days,
      elapsedDays: days
    };
  }, [records, today]);

  // Calculate semester average based on the active semester window
  const semesterAverages = useMemo(() => {
    let activeSemester: 1 | 2 = 2; // Default to 2nd Semester since today is July 2026
    let activeYearLocal = today.getFullYear();

    if (selectedMonthYear && selectedMonthYear !== "todos") {
      const [mStr, yStr] = selectedMonthYear.split("/");
      const m = parseInt(mStr, 10);
      const y = parseInt(yStr, 10);
      activeYearLocal = y;
      if (m >= 1 && m <= 6) {
        activeSemester = 1;
      } else {
        activeSemester = 2;
      }
    } else {
      const currentMonth = today.getMonth() + 1;
      if (currentMonth >= 1 && currentMonth <= 6) {
        activeSemester = 1;
      } else {
        activeSemester = 2;
      }
    }

    const semesterRecords = records.filter(r => {
      if (!r.dataSolicitacao) return false;
      const parts = r.dataSolicitacao.split("/");
      if (parts.length !== 3) return false;
      const rMonth = parseInt(parts[1], 10);
      const rYear = parseInt(parts[2], 10);
      
      if (rYear !== activeYearLocal) return false;
      
      if (activeSemester === 1) {
        return rMonth >= 1 && rMonth <= 6;
      } else {
        return rMonth >= 7 && rMonth <= 12;
      }
    });

    const approvedValue = semesterRecords
      .filter(r => r.status.toLowerCase().trim().includes("aprov"))
      .reduce((sum, r) => sum + (r.valorTotal || 0), 0);

    let elapsedDays = 180;
    let totalDays = 180;

    if (activeSemester === 1) {
      // 1º Semestre: 01/01 a 30/06
      const isLeap = (activeYearLocal % 4 === 0 && activeYearLocal % 100 !== 0) || (activeYearLocal % 400 === 0);
      totalDays = isLeap ? 182 : 181;
      
      const endOfSem1 = new Date(activeYearLocal, 5, 30); // June 30
      if (today > endOfSem1) {
        elapsedDays = totalDays;
      } else if (today < new Date(activeYearLocal, 0, 1)) {
        elapsedDays = 0;
      } else {
        const startOfSem1 = new Date(activeYearLocal, 0, 1);
        const diffTime = Math.abs(today.getTime() - startOfSem1.getTime());
        elapsedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    } else {
      // 2º Semestre: 01/07 a 31/12
      totalDays = 184; // Jul(31) + Aug(31) + Sep(30) + Oct(31) + Nov(30) + Dec(31)
      
      const endOfSem2 = new Date(activeYearLocal, 11, 31); // Dec 31
      if (today > endOfSem2) {
        elapsedDays = totalDays;
      } else if (today < new Date(activeYearLocal, 6, 1)) {
        elapsedDays = 0;
      } else {
        const startOfSem2 = new Date(activeYearLocal, 6, 1); // July 1
        const diffTime = Math.abs(today.getTime() - startOfSem2.getTime());
        elapsedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    const days = elapsedDays > 0 ? elapsedDays : 1;
    const dailyReal = approvedValue / days;

    return {
      dailyReal,
      approvedValue,
      elapsedDays: days,
      totalDays,
      semesterLabel: activeSemester === 1 ? "1º Semestre" : "2º Semestre",
      semesterNumber: activeSemester
    };
  }, [records, selectedMonthYear, today]);

  // Triple Projection (Mensal, Semestral, Anual)
  const tripleTrend = useMemo(() => {
    // 1. Monthly (projection of the active or current month using currentMonthDailyReal)
    const mDailyReal = currentMonthDailyReal.dailyReal;
    const mDays = currentMonthDailyReal.fullPeriodDays;
    const mProjected = mDailyReal * mDays;
    const mMeta = 12000;
    const mPercent = mMeta > 0 ? (mProjected / mMeta) * 100 : 0;
    
    // 2. Semestral (dynamically using active semester)
    const sDailyReal = semesterAverages.dailyReal;
    const sDays = semesterAverages.totalDays;
    const sProjected = sDailyReal * sDays;
    const sMeta = 72000;
    const sPercent = sMeta > 0 ? (sProjected / sMeta) * 100 : 0;
    
    // 3. Annual (365 days based on the annual average)
    const aDailyReal = yearAverages.dailyReal;
    const aDays = 365;
    const aProjected = aDailyReal * aDays;
    const aMeta = 144000;
    const aPercent = aMeta > 0 ? (aProjected / aMeta) * 100 : 0;
    
    return {
      monthly: {
        name: "Meta Mensal",
        days: mDays,
        projected: mProjected,
        meta: mMeta,
        percent: mPercent,
        isExceeding: mProjected > mMeta,
        diff: Math.abs(mProjected - mMeta)
      },
      semestral: {
        name: `Meta Semestral (${semesterAverages.semesterLabel})`,
        days: sDays,
        projected: sProjected,
        meta: sMeta,
        percent: sPercent,
        isExceeding: sProjected > sMeta,
        diff: Math.abs(sProjected - sMeta)
      },
      annual: {
        name: "Meta Anual",
        days: aDays,
        projected: aProjected,
        meta: aMeta,
        percent: aPercent,
        isExceeding: aProjected > aMeta,
        diff: Math.abs(aProjected - aMeta)
      }
    };
  }, [currentMonthDailyReal, semesterAverages, yearAverages]);

  // Dedicated monthly metric state for the "Atingimento do Mês" card
  const monthlyCardMetrics = useMemo(() => {
    // 1. If a specific month is selected, use it!
    if (selectedMonthYear && selectedMonthYear !== "todos") {
      const [mStr, yStr] = selectedMonthYear.split("/");
      const m = parseInt(mStr, 10);
      const y = parseInt(yStr, 10);
      
      const mRecords = records.filter(r => {
        if (!r.dataSolicitacao) return false;
        const parts = r.dataSolicitacao.split("/");
        return parts.length === 3 && parseInt(parts[1], 10) === m && parseInt(parts[2], 10) === y;
      });

      const approvedValue = mRecords
        .filter(r => r.status.toLowerCase().trim().includes("aprov"))
        .reduce((sum, r) => sum + (r.valorTotal || 0), 0);

      const limit = 12000;
      const percent = limit > 0 ? (approvedValue / limit) * 100 : 0;

      return {
        value: approvedValue,
        limit,
        percent,
        label: `${mStr}/${yStr}`
      };
    }

    // 2. If "todos" is selected, find the "vigent/current" month within the current filtered records or calendar
    let targetMonth = today.getMonth() + 1;
    let targetYear = today.getFullYear();

    // If we have filtered records and our current month/year is NOT in the filtered set (e.g. historical 1º Semestre),
    // let's use the latest month/year from the filtered records
    const filteredMonthYears = Array.from(new Set(filteredRecords.map(r => {
      if (!r.dataSolicitacao) return "";
      const parts = r.dataSolicitacao.split("/");
      return parts.length === 3 ? `${parts[1]}/${parts[2]}` : "";
    }).filter(Boolean)));

    const todayStr = `${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    if (filteredMonthYears.length > 0 && !filteredMonthYears.includes(todayStr)) {
      // Sort filtered month/years chronologically and take the latest
      filteredMonthYears.sort((a, b) => {
        const [mA, yA] = a.split("/").map(Number);
        const [mB, yB] = b.split("/").map(Number);
        return (yB - yA) || (mB - mA);
      });
      const [latestM, latestY] = filteredMonthYears[0].split("/").map(Number);
      targetMonth = latestM;
      targetYear = latestY;
    }

    const mRecords = records.filter(r => {
      if (!r.dataSolicitacao) return false;
      const parts = r.dataSolicitacao.split("/");
      return parts.length === 3 && parseInt(parts[1], 10) === targetMonth && parseInt(parts[2], 10) === targetYear;
    });

    const approvedValue = mRecords
      .filter(r => r.status.toLowerCase().trim().includes("aprov"))
      .reduce((sum, r) => sum + (r.valorTotal || 0), 0);

    const limit = 12000;
    const percent = limit > 0 ? (approvedValue / limit) * 100 : 0;

    return {
      value: approvedValue,
      limit,
      percent,
      label: `${String(targetMonth).padStart(2, "0")}/${targetYear}`
    };
  }, [records, filteredRecords, selectedMonthYear, today]);

  return (
    <div className="space-y-6">
      
      {/* 1. Target Performance Goals Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Painel de Metas & Atingimentos */}
        <div className="lg:col-span-7 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2 mb-4">
              <Target className="w-4 h-4 text-blue-400" />
              Metas & Percentuais de Atingimento SSTR
            </h3>
            
            <div className="space-y-4">
              {/* Mês Section */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-blue-400">
                      Atingimento do Mês ({monthlyCardMetrics.label})
                    </span>
                    <p className="text-white font-bold font-mono text-base mt-0.5">
                      {formatCurrency(monthlyCardMetrics.value)} <span className="text-slate-500 font-normal text-xs">de {formatCurrency(monthlyCardMetrics.limit)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-mono">Status da Meta</span>
                    <span className={`font-bold font-mono text-sm ${monthlyCardMetrics.percent > 100 ? "text-rose-450" : "text-blue-400"}`}>
                      {monthlyCardMetrics.percent.toFixed(1)}% {monthlyCardMetrics.percent > 100 ? "⚠️" : "✓"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      monthlyCardMetrics.percent > 100 
                        ? "bg-gradient-to-r from-blue-600 to-rose-600" 
                        : "bg-gradient-to-r from-blue-600 to-blue-400"
                    }`}
                    style={{ width: `${Math.min(monthlyCardMetrics.percent, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* 1º Semestre Section */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-indigo-400">Atingimento 1º Semestre (1º H)</span>
                    <p className="text-white font-bold font-mono text-base mt-0.5">
                      {formatCurrency(semester1ApprovedAccumulated)} <span className="text-slate-500 font-normal text-xs">de {formatCurrency(META_SEMESTRAL)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-mono">Status da Meta</span>
                    <span className={`font-bold font-mono text-sm ${semester1Atingimento > 100 ? "text-rose-450" : "text-indigo-400"}`}>
                      {semester1Atingimento.toFixed(1)}% {semester1Atingimento > 100 ? "⚠️" : "✓"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      semester1Atingimento > 100 
                        ? "bg-gradient-to-r from-indigo-600 to-rose-600" 
                        : "bg-gradient-to-r from-indigo-600 to-indigo-400"
                    }`}
                    style={{ width: `${Math.min(semester1Atingimento, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* 2º Semestre Section */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-cyan-400">Atingimento 2º Semestre (2º H)</span>
                    <p className="text-white font-bold font-mono text-base mt-0.5">
                      {formatCurrency(semester2ApprovedAccumulated)} <span className="text-slate-500 font-normal text-xs">de {formatCurrency(META_SEMESTRAL)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-mono">Status da Meta</span>
                    <span className={`font-bold font-mono text-sm ${semester2Atingimento > 100 ? "text-rose-450" : "text-cyan-400"}`}>
                      {semester2Atingimento.toFixed(1)}% {semester2Atingimento > 100 ? "⚠️" : "✓"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      semester2Atingimento > 100 
                        ? "bg-gradient-to-r from-cyan-600 to-rose-600" 
                        : "bg-gradient-to-r from-cyan-600 to-cyan-400"
                    }`}
                    style={{ width: `${Math.min(semester2Atingimento, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Ano Section */}
              <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-violet-400">Atingimento do Ano (YTD)</span>
                    <p className="text-white font-bold font-mono text-base mt-0.5">
                      {formatCurrency(annualApprovedAccumulated)} <span className="text-slate-500 font-normal text-xs">de {formatCurrency(META_ANUAL)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-mono">Status da Meta</span>
                    <span className={`font-bold font-mono text-sm ${annualAtingimento > 100 ? "text-rose-450" : "text-violet-400"}`}>
                      {annualAtingimento.toFixed(1)}% {annualAtingimento > 100 ? "⚠️" : "✓"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      annualAtingimento > 100 
                        ? "bg-gradient-to-r from-violet-600 to-rose-600" 
                        : "bg-gradient-to-r from-violet-600 to-violet-400"
                    }`}
                    style={{ width: `${Math.min(annualAtingimento, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-[10px] text-slate-450 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed mt-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>As metas de trocas corporativas são divididas proporcionalmente (Mensal: R$ 12.000 | Semestral: R$ 72.000 | Anual: R$ 144.000).</span>
          </div>
        </div>

        {/* Destaques de Consumo da Operação */}
        <div className="lg:col-span-5 bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Picos de Consumo Operacional Integrado
            </h3>

            <div className="space-y-3">
              {/* Cliente com Maior Consumo */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-850 flex items-start space-x-3">
                <div className="p-2 bg-indigo-950/60 text-indigo-400 rounded-lg border border-indigo-900/30 font-bold shrink-0 text-xs">
                  👤
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] uppercase font-bold tracking-wider font-mono text-slate-450">Cliente com Maior Consumo</span>
                  {generalTopClients && generalTopClients.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={generalTopClients[0].nome}>
                        {generalTopClients[0].nome}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1">
                        <span>NB: <strong>{generalTopClients[0].code}</strong></span>
                        <span className="text-blue-400 font-bold font-mono">{formatCurrency(generalTopClients[0].totalSpent)}</span>
                      </div>
                      <p className="text-[9px] text-indigo-400 font-mono mt-0.5 text-right font-semibold">
                        {generalTopClients[0].hl.toFixed(3)} HL solicitados
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic mt-0.5">Nenhum dado disponível</p>
                  )}
                </div>
              </div>

              {/* Produto com Maior Consumo */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-850 flex items-start space-x-3">
                <div className="p-2 bg-blue-950/60 text-blue-400 rounded-lg border border-blue-900/30 font-bold shrink-0 text-xs">
                  📦
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] uppercase font-bold tracking-wider font-mono text-slate-450">Produto de Maior Consumo</span>
                  {topProductBySpent ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={topProductBySpent.descricao}>
                        {topProductBySpent.descricao}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1">
                        <span>Cód: <strong>{topProductBySpent.code}</strong></span>
                        <span className="text-blue-400 font-bold font-mono">{formatCurrency(topProductBySpent.totalSpent)}</span>
                      </div>
                      <p className="text-[9px] text-indigo-400 font-mono mt-0.5 text-right font-semibold">
                        {topProductBySpent.quantity} un. • {topProductBySpent.hl.toFixed(3)} HL
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic mt-0.5">Nenhum dado disponível</p>
                  )}
                </div>
              </div>

              {/* Dia de Maior Consumo */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-850 flex items-start space-x-3">
                <div className="p-2 bg-emerald-950/60 text-emerald-400 rounded-lg border border-emerald-900/30 font-bold shrink-0 text-xs">
                  📅
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[9px] uppercase font-bold tracking-wider font-mono text-slate-450">Dia de Maior Consumo (Pico)</span>
                  {peakDayAllTime ? (
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 mt-0.5 font-mono">
                        {peakDayAllTime.date}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 mt-1">
                        <span>Lançamentos: <strong>{peakDayAllTime.count} un.</strong></span>
                        <span className="text-rose-400 font-bold font-mono">{formatCurrency(peakDayAllTime.totalSpent)}</span>
                      </div>
                      <p className="text-[9px] text-indigo-400 font-mono mt-0.5 text-right font-semibold">
                        {peakDayAllTime.totalHL.toFixed(3)} HL movimentados
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic mt-0.5">Nenhum dado disponível</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed mt-2 text-center">
            Picos estatísticos calculados automaticamente em tempo real.
          </div>
        </div>

      </div>

      {/* NOVO GATILHO E CARD DE TENDÊNCIA DE ESTOURO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card de Médias Diárias (Gatilho) */}
        <div id="gatilho-medias-diarias" className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-blue-400">
                <BarChart2 className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider font-mono">Gatilho: Médias Diárias</span>
              </div>
              <span className="text-[9px] font-bold font-mono text-blue-400 bg-blue-950/60 border border-blue-900/40 px-2.5 py-0.5 rounded-md">
                Período: {calculatedDays} {calculatedDays === 1 ? "dia" : "dias"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Médias diárias de cadastros, Hectolitros (HL) e valor Real (R$) aprovados.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Média de Cadastro */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider font-mono block">Cadastros / Dia</span>
              <div className="mt-2">
                <span className="text-lg font-bold font-mono text-white block">
                  {averages.dailyRegistrations.toFixed(1)}
                </span>
                <span className="text-[8px] text-slate-400 font-mono">cadastros</span>
              </div>
            </div>

            {/* Média Hecto */}
            {/* Média Hecto */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider font-mono block">Hecto / Dia</span>
              <div className="mt-2">
                <span className="text-lg font-bold font-mono text-indigo-400 block">
                  {averages.dailyHecto.toFixed(3)}
                </span>
                <span className="text-[8px] text-slate-400 font-mono">HL/dia</span>
              </div>
            </div>

            {/* Média Real */}
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850 flex flex-col justify-between">
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider font-mono block">Real / Dia</span>
              <div className="mt-2">
                <span className="text-lg font-bold font-mono text-emerald-400 block truncate">
                  {formatCurrency(averages.dailyReal)}
                </span>
                <span className="text-[8px] text-slate-400 font-mono">R$/dia</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-relaxed">
            Cálculo baseado no intervalo de <strong>{periodName}</strong>.
          </div>
        </div>

        {/* Card de Tendência de Estouro de Meta */}
        <div id="tendencia-estouro-meta" className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-indigo-400">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider font-mono">Tendência & Projeção de Estouro</span>
              </div>
              <span className={`text-[9px] font-bold font-mono px-2.5 py-0.5 rounded-md ${
                tripleTrend.monthly.isExceeding || tripleTrend.semestral.isExceeding || tripleTrend.annual.isExceeding
                  ? "text-rose-450 bg-rose-950/60 border border-rose-900/40 animate-pulse"
                  : "text-emerald-400 bg-emerald-950/60 border border-emerald-900/40"
              }`}>
                {tripleTrend.monthly.isExceeding || tripleTrend.semestral.isExceeding || tripleTrend.annual.isExceeding ? "⚠️ RISCO DE ESTOURO" : "✓ RITMO SEGURO"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ritmo de reposições projetado de forma independente para cada período.
            </p>
          </div>

          <div className="space-y-4">
            {/* 1. MENSAL */}
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200 font-sans">1. Meta Mensal</span>
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                  tripleTrend.monthly.isExceeding ? "text-rose-450 bg-rose-950/65" : "text-emerald-400 bg-emerald-950/65"
                }`}>
                  {tripleTrend.monthly.isExceeding ? "⚠️ Alerta" : "✓ OK"}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block">Previsão</span>
                  <span className={`text-base font-extrabold ${tripleTrend.monthly.isExceeding ? "text-rose-400" : "text-emerald-400"}`}>
                    {formatCurrency(tripleTrend.monthly.projected)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 block">Meta Limite</span>
                  <span className="text-slate-300 font-bold">
                    {formatCurrency(tripleTrend.monthly.meta)}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-450">
                  <span>Atingimento projetado ({tripleTrend.monthly.days} dias)</span>
                  <span className={tripleTrend.monthly.isExceeding ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                    {tripleTrend.monthly.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      tripleTrend.monthly.isExceeding ? "bg-rose-550" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(tripleTrend.monthly.percent, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* 2. SEMESTRAL */}
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200 font-sans">2. {tripleTrend.semestral.name}</span>
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                  tripleTrend.semestral.isExceeding ? "text-rose-450 bg-rose-950/65" : "text-emerald-400 bg-emerald-950/65"
                }`}>
                  {tripleTrend.semestral.isExceeding ? "⚠️ Alerta" : "✓ OK"}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block">Previsão</span>
                  <span className={`text-base font-extrabold ${tripleTrend.semestral.isExceeding ? "text-rose-400" : "text-emerald-400"}`}>
                    {formatCurrency(tripleTrend.semestral.projected)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 block">Meta Limite</span>
                  <span className="text-slate-300 font-bold">
                    {formatCurrency(tripleTrend.semestral.meta)}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-455">
                  <span>Atingimento projetado ({tripleTrend.semestral.days} dias)</span>
                  <span className={tripleTrend.semestral.isExceeding ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                    {tripleTrend.semestral.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      tripleTrend.semestral.isExceeding ? "bg-rose-550" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(tripleTrend.semestral.percent, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* 3. ANUAL */}
            <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850/60 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-200 font-sans">3. Meta Anual</span>
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded ${
                  tripleTrend.annual.isExceeding ? "text-rose-450 bg-rose-950/65" : "text-emerald-400 bg-emerald-950/65"
                }`}>
                  {tripleTrend.annual.isExceeding ? "⚠️ Alerta" : "✓ OK"}
                </span>
              </div>
              <div className="flex justify-between items-baseline text-xs font-mono">
                <div>
                  <span className="text-[9px] text-slate-400 block">Previsão</span>
                  <span className={`text-base font-extrabold ${tripleTrend.annual.isExceeding ? "text-rose-400" : "text-emerald-400"}`}>
                    {formatCurrency(tripleTrend.annual.projected)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 block">Meta Limite</span>
                  <span className="text-slate-300 font-bold">
                    {formatCurrency(tripleTrend.annual.meta)}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-455">
                  <span>Atingimento projetado ({tripleTrend.annual.days} dias)</span>
                  <span className={tripleTrend.annual.isExceeding ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                    {tripleTrend.annual.percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      tripleTrend.annual.isExceeding ? "bg-rose-550" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(tripleTrend.annual.percent, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/60 leading-normal space-y-1">
            <div>
              No ritmo do mês vigente (<strong>{formatCurrency(currentMonthDailyReal.dailyReal)}</strong>/dia), 
              {tripleTrend.monthly.isExceeding ? " haverá estouro no fechamento mensal." : " o teto mensal está sob controle."}
            </div>
            <div>
              Pela média do {semesterAverages.semesterNumber === 1 ? "1º" : "2º"} semestre (<strong>{formatCurrency(semesterAverages.dailyReal)}</strong>/dia), 
              {tripleTrend.semestral.isExceeding ? " haverá estouro no teto semestral." : " o teto semestral está seguro."}
            </div>
            <div>
              Pela média anual (<strong>{formatCurrency(yearAverages.dailyReal)}</strong>/dia), 
              {tripleTrend.annual.isExceeding ? " haverá estouro no teto anual de gastos." : " o teto anual está seguro."}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Core KPI Statistics Row (5 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Total Cost */}
        <div className="bg-slate-900/95 p-4.5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-3.5">
          <div className="p-2.5 bg-blue-950/70 text-blue-400 rounded-xl border border-blue-900/40 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">Total Lançado (Geral)</p>
            <h3 className="text-base font-bold font-mono text-white truncate mt-0.5">
              {formatCurrency(stats.totalValue)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center font-mono truncate">
              {stats.totalCount} Solicitações
            </p>
          </div>
        </div>

        {/* Approved */}
        <div className="bg-slate-900/95 p-4.5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-3.5">
          <div className="p-2.5 bg-emerald-950/70 text-emerald-400 rounded-xl border border-emerald-900/40 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">Aprovado no Filtro</p>
            <h3 className="text-base font-bold font-mono text-emerald-400 truncate mt-0.5">
              {formatCurrency(stats.approvedValue)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center font-mono truncate">
              <span className="w-1 h-1 rounded-full bg-emerald-500 mr-1 shrink-0 animate-pulse"></span>
              {stats.approvedCount} pedidos
            </p>
          </div>
        </div>

        {/* Dynamic LOGISTICS HECTOLITERS (HL) Measurement */}
        <div className="bg-slate-900/95 p-4.5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-3.5 ring-1 ring-blue-500/10">
          <div className="p-2.5 bg-indigo-950/80 text-blue-300 rounded-xl border border-indigo-900/50 shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest font-mono truncate">Volume Reposicionamento</p>
            <h3 className="text-base font-black font-mono text-blue-200 truncate mt-0.5">
              {totalHLFiltered.toFixed(3)} HL
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center font-mono truncate">
              <span className="w-1 h-1 rounded-full bg-blue-500 mr-1 shrink-0"></span>
              Base: {totalHLAll.toFixed(2)} HL total
            </p>
          </div>
        </div>

        {/* Pending */}
        <div className="bg-slate-900/95 p-4.5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-3.5">
          <div className="p-2.5 bg-amber-950/70 text-amber-400 rounded-xl border border-amber-900/40 shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">Aguardando Avaliação</p>
            <h3 className="text-base font-bold font-mono text-amber-400 truncate mt-0.5">
              {formatCurrency(stats.pendingValue)}
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center font-mono truncate">
              {stats.pendingCount} pendentes
            </p>
          </div>
        </div>

        {/* Registered Clients utilizing NB */}
        <div className="bg-slate-900/95 p-4.5 rounded-2xl border border-slate-800/80 shadow-md flex items-center space-x-3.5">
          <div className="p-2.5 bg-violet-950/70 text-violet-400 rounded-xl border border-violet-900/40 shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono truncate">Clientes na Base (NB)</p>
            <h3 className="text-base font-bold font-mono text-white truncate mt-0.5">
              {stats.clientCount} Cli. Ativos <span className="text-xs text-slate-400 font-normal">/ {totalClientsRegistered} total</span>
            </h3>
            <p className="text-[9px] text-slate-400 mt-0.5 flex items-center font-mono truncate">
              Clientes ativos no período selecionado
            </p>
          </div>
        </div>

      </div>

      {/* 3. Custom SVG Linear trend Line Chart */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4 relative">
        {selectedMonthYear === "todos" && (
          <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-3.5 flex flex-col items-center justify-center gap-3.5 text-center font-mono text-[10px] text-blue-300 no-print">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0 animate-ping"></span>
              <span className="font-bold">Análise Geral Ativa:</span>
              <span>Selecione um mês abaixo ou clique nos pontos do gráfico para detalhar as oscilações diárias:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center justify-center w-full">
              {[
                { id: "01", label: "Jan" },
                { id: "02", label: "Fev" },
                { id: "03", label: "Mar" },
                { id: "04", label: "Abr" },
                { id: "05", label: "Mai" },
                { id: "06", label: "Jun" },
                { id: "07", label: "Jul" },
                { id: "08", label: "Ago" },
                { id: "09", label: "Set" },
                { id: "10", label: "Out" },
                { id: "11", label: "Nov" },
                { id: "12", label: "Dez" }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMonthYear(`${m.id}/${activeYear}`);
                    setFilterMode("mes");
                  }}
                  className="px-2.5 py-1 bg-slate-950/80 hover:bg-blue-800 border border-slate-800 hover:border-blue-700 text-blue-400 hover:text-white rounded-lg text-[9px] font-bold font-sans transition-all cursor-pointer"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center flex-wrap gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              {timelineViewMode === "months" 
                ? "Análise Temporal de Solicitações (Anual)" 
                : `Oscilações Diárias: ${
                    selectedMonth === "01" ? "Janeiro" :
                    selectedMonth === "02" ? "Fevereiro" :
                    selectedMonth === "03" ? "Março" :
                    selectedMonth === "04" ? "Abril" :
                    selectedMonth === "05" ? "Maio" :
                    selectedMonth === "06" ? "Junho" :
                    selectedMonth === "07" ? "Julho" :
                    selectedMonth === "08" ? "Agosto" :
                    selectedMonth === "09" ? "Setembro" :
                    selectedMonth === "10" ? "Outubro" :
                    selectedMonth === "11" ? "Novembro" : "Dezembro"
                  }`
              }
              {selectedMonthYear === "todos" && (
                <span className="text-[10px] font-bold font-mono text-amber-500 bg-amber-950/60 border border-amber-900/40 px-2.5 py-0.5 rounded-md animate-pulse ml-2">
                  Selecione o mês
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {timelineViewMode === "months"
                ? "Visão geral das oscilações de reposições agrupadas por mês. Clique em um ponto do mês para ver o detalhado dos dias."
                : "Detalhamento dia a dia das solicitações aprovadas. O nó maior em vermelho indica o pico de solicitações no mês."
              }
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Visual View Mode Back Button */}
            {timelineViewMode === "days" && (
              <button 
                onClick={() => {
                  setSelectedMonthYear("todos");
                  setHoveredNode(null);
                }} 
                className="flex items-center gap-1.5 text-[11px] text-blue-400 font-mono font-bold bg-blue-950/40 border border-blue-900/40 hover:bg-blue-950 hover:text-blue-300 px-2.5 py-1.5 rounded-lg transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Ano
              </button>
            )}

            {/* REAL INTERACTIVE METRIC SELECTOR (FIXES THE HECTOLITER FILTER UNABLE TO CLICK BUG!) */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setChartMetric("cost")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center space-x-1.5 ${
                  chartMetric === "cost"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white"></span>
                <span>Custo (R$)</span>
              </button>
              <button
                onClick={() => setChartMetric("volume")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center space-x-1.5 ${
                  chartMetric === "volume"
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white"></span>
                <span>Volume (HL)</span>
              </button>
            </div>
          </div>
        </div>

        {points.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800/80 p-6 text-center space-y-2">
            <Calendar className="w-6 h-6 text-slate-500 animate-pulse" />
            <span className="text-slate-200 font-mono text-sm font-bold">Selecione o mês</span>
            <span className="text-slate-500 text-xs font-mono max-w-sm">
              {timelineViewMode === "days" 
                ? `Sem registros de reposição para o mês selecionado.`
                : "Sem dados de movimentações no período de datas selecionadas."
              }
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Main Interactive Chart Canvas Area */}
            <div className="relative h-48 w-full bg-slate-950/60 rounded-xl border border-slate-850 p-4 select-none">
              
              {/* Dynamic Overlay Floating Tooltip (Anti-flicker: absolutely positioned left/right opposite of the mouse) */}
              {hoveredNode && (
                <div 
                  className={`absolute top-2 bg-slate-950/95 border border-slate-800 p-3 rounded-xl shadow-2xl z-20 font-mono text-[10px] space-y-1 text-slate-300 min-w-[170px] pointer-events-none transition-all duration-200 ${
                    hoveredNode.x > 50 ? "left-4" : "right-4"
                  }`}
                >
                  <div className="text-white font-bold border-b border-slate-800/80 pb-1 flex justify-between gap-2">
                    <span>
                      {timelineViewMode === "months" 
                        ? `${
                            hoveredNode.monthId === "01" ? "Janeiro" :
                            hoveredNode.monthId === "02" ? "Fevereiro" :
                            hoveredNode.monthId === "03" ? "Março" :
                            hoveredNode.monthId === "04" ? "Abril" :
                            hoveredNode.monthId === "05" ? "Maio" :
                            hoveredNode.monthId === "06" ? "Junho" :
                            hoveredNode.monthId === "07" ? "Julho" :
                            hoveredNode.monthId === "08" ? "Agosto" :
                            hoveredNode.monthId === "09" ? "Setembro" :
                            hoveredNode.monthId === "10" ? "Outubro" :
                            hoveredNode.monthId === "11" ? "Novembro" : "Dezembro"
                          } ${activeYear}`
                        : `Dia ${hoveredNode.day}/${selectedMonth}/${activeYear}`
                      }
                    </span>
                    {timelineViewMode === "days" && peakDayInfo?.day === hoveredNode.day && (
                      <span className="bg-red-900 text-red-200 text-[8px] px-1.5 py-0.5 rounded font-sans uppercase font-bold">Pico</span>
                    )}
                  </div>
                  <div className="flex justify-between gap-4 mt-1">
                    <span className="text-slate-500">Custo:</span>
                    <span className="text-blue-400 font-bold">{formatCurrency(hoveredNode.totalSpent)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Volume:</span>
                    <span className="text-indigo-400 font-semibold">{hoveredNode.totalHL.toFixed(3)} HL</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Ocorrências:</span>
                    <span className="text-slate-300">{hoveredNode.count} trocas</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-slate-900 pt-1">
                    <span className="text-slate-500">Clientes (NB):</span>
                    <span className="text-violet-400 font-bold">{hoveredNode.clientCount} ativos</span>
                  </div>
                  {timelineViewMode === "months" ? (
                    <div className="text-[9px] text-blue-400 mt-1.5 text-center font-bold font-sans">
                      ⚡ Clique para ver dias
                    </div>
                  ) : (
                    hoveredNode.approvedCount > 0 && (
                      <div className="text-[9px] text-emerald-450 mt-1.5 text-center font-bold font-sans">
                        ✓ {hoveredNode.approvedCount} solicitações aprovadas
                      </div>
                    )
                  )}
                </div>
              )}

              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Horizontal Guide Lines */}
                <line x1="0" y1="20" x2="100" y2="20" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="1,1" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="1,1" />
                <line x1="0" y1="80" x2="100" y2="80" stroke="#1e293b" strokeWidth="0.25" strokeDasharray="1,1" />

                {/* Vertical guide lines for hovered node alignment */}
                {hoveredNode && (
                  <line 
                    x1={hoveredNode.x} 
                    y1="15" 
                    x2={hoveredNode.x} 
                    y2="90" 
                    stroke="#3b82f6" 
                    strokeWidth="0.3" 
                    strokeDasharray="2,2" 
                    className="pointer-events-none"
                  />
                )}

                <defs>
                  <linearGradient id="areaGradSpent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="areaGradHL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818cf8" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Shaded Area under Curve - beautifully bound inside horizontal padding */}
                {chartMetric === "cost" ? (
                  <path
                    d={`M${points[0]?.x || 5} 90 ${points.map(p => `L${p.x} ${p.ySpent}`).join(" ")} L${points[points.length - 1]?.x || 95} 90 Z`}
                    fill="url(#areaGradSpent)"
                    className="transition-all duration-300"
                  />
                ) : (
                  <path
                    d={`M${points[0]?.x || 5} 90 ${points.map(p => `L${p.x} ${p.yHL}`).join(" ")} L${points[points.length - 1]?.x || 95} 90 Z`}
                    fill="url(#areaGradHL)"
                    className="transition-all duration-300"
                  />
                )}
                
                {/* Visual Stroke Line (vectorEffect="non-scaling-stroke" guarantees pristine focus & symmetry across any scaling) */}
                {chartMetric === "cost" ? (
                  <path
                    d={points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.ySpent}`).join(" ")}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="transition-all duration-300"
                  />
                ) : (
                  <path
                    d={points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.yHL}`).join(" ")}
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="transition-all duration-300"
                  />
                )}
              </svg>

              {/* Precise HTML absolute overlay matching inner content area padding (Prone-free, perfectly round & crisp circles) */}
              <div className="absolute inset-4 pointer-events-none">
                {points.map((p, idx) => {
                  const yVal = chartMetric === "cost" ? p.ySpent : p.yHL;
                  const isPeak = timelineViewMode === "days" && peakDayInfo?.day === p.day;
                  const isActiveHovered = hoveredNode?.date === p.date;

                  return (
                    <div
                      key={idx}
                      style={{
                        left: `${p.x}%`,
                        top: `${yVal}%`,
                      }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full cursor-pointer transition-all duration-150 pointer-events-auto hover:scale-150 flex items-center justify-center ${
                        isActiveHovered
                          ? isPeak ? "bg-red-400 ring-4 ring-red-500/30" : "bg-blue-400 ring-4 ring-blue-500/30"
                          : isPeak
                            ? "bg-red-550 ring-2 ring-red-400/80 shadow-md shadow-red-500/20"
                            : chartMetric === "cost"
                              ? "bg-blue-500 ring-1 ring-slate-950 hover:bg-blue-400"
                              : "bg-indigo-500 ring-1 ring-slate-950 hover:bg-indigo-400"
                      }`}
                      onMouseEnter={() => setHoveredNode(p)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => {
                        if (timelineViewMode === "months") {
                          setSelectedMonthYear(`${p.monthId}/${activeYear}`);
                          setFilterMode("mes");
                        }
                      }}
                    >
                      {/* Quiet white center for critical peak day dot (no motion and stops disappearing behavior) */}
                      {isPeak && (
                        <span className="w-1 h-1 bg-white rounded-full animate-none"></span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="absolute bottom-1 left-2 right-2 flex justify-between pointer-events-none">
                <span className="text-[9px] text-slate-500 font-mono">
                  {timelineViewMode === "months" ? "Janeiro" : `Dia 1/${selectedMonth}`}
                </span>
                <span className="text-[8px] text-slate-650 font-mono italic">
                  Passe o mouse nos pontos para ver dados de trocas e clientes ativos
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  {timelineViewMode === "months" ? "Dezembro" : `Dia 31/${selectedMonth}`}
                </span>
              </div>
            </div>

            {selectedMonthYear === "todos" && (
              <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400 font-mono">
                  💡 Selecione o mês no menu superior ou clique nos cards mensais abaixo para visualizar o consumo diário de forma detalhada.
                </p>
              </div>
            )}

            {/* List of Details below for quick visual index */}
            <div className="flex gap-2 overflow-x-auto pb-1.5 max-w-full font-mono text-[9px] scrollbar-thin">
              {timelineData.map((d) => {
                const isSelectedDrilldown = timelineViewMode === "months" && selectedMonth === d.monthId;
                const isPeakDay = timelineViewMode === "days" && peakDayInfo?.day === d.day;

                return (
                  <div 
                    key={d.date} 
                    onClick={() => {
                      if (timelineViewMode === "months") {
                        setSelectedMonthYear(`${d.monthId}/${activeYear}`);
                        setFilterMode("mes");
                      }
                    }}
                    className={`p-2.5 rounded-xl border shrink-0 min-w-[135px] flex flex-col justify-between space-y-1 transition-all cursor-pointer ${
                      isPeakDay 
                        ? "bg-red-950/30 border-red-500/40 shadow-inner" 
                        : isSelectedDrilldown 
                          ? "bg-blue-950/40 border-blue-500/50 shadow-md" 
                          : "bg-slate-950/60 border-slate-850 hover:bg-slate-950 hover:border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-slate-200 font-bold flex items-center gap-1">
                        {timelineViewMode === "months" && <Calendar className="w-2.5 h-2.5 text-blue-400" />}
                        {d.date}
                      </span>
                      {isPeakDay && (
                        <span className="bg-red-900 text-red-100 text-[6px] font-sans px-1.5 rounded uppercase font-bold tracking-wider scale-90">Pico</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gasto:</span>
                      <span className="text-blue-400 font-bold">{formatCurrency(d.totalSpent)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Volume:</span>
                      <span className="text-indigo-400 font-semibold">{d.totalHL.toFixed(3)} HL</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] text-slate-500">Clientes:</span>
                      <span className="text-violet-400 font-bold">{d.clientCount} NBs</span>
                    </div>
                    <div className="flex justify-between items-center pt-0.5 border-t border-slate-950/80">
                      <span className="text-[8px] text-slate-500">Solicitações:</span>
                      <span className="text-slate-300 font-bold">{d.count} un.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Top Products and Top Clients of All Sectors Side-By-Side (The 1st, 2nd, 3rd ranking request) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* TOP PRODUCTS OF ALL SECTORS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-400" />
              TOP 10 Itens com Maior Solicitação (Geral)
            </h3>
            <p className="text-xs text-slate-400">Classificação ordenada do volume físico total de reposições de todas as fontes</p>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {generalTopProducts.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                Nenhum produto registrado no banco de dados.
              </div>
            ) : (
              generalTopProducts.map((p, idx) => {
                return (
                  <div key={p.code} className="p-3 bg-slate-950/60 hover:bg-slate-950 rounded-xl border border-slate-850/60 flex items-center justify-between space-x-3 transition-colors">
                    <div className="flex items-center space-x-2.5 min-w-0 max-w-[70%]">
                      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ${
                        idx === 0 ? "bg-blue-600 text-white" : idx === 1 ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-400"
                      }`}>
                        {p.rank}º
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">{p.descricao}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Código: <span className="text-slate-300 font-bold">{p.code}</span> | Qtd: <span className="font-semibold text-slate-300">{p.quantity} físicas</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-bold text-blue-400">{formatCurrency(p.totalSpent)}</p>
                      <p className="text-[9px] text-indigo-400 font-semibold font-mono">{p.hl.toFixed(3)} HL</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* TOP CLIENTS OF ALL SECTORS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-bold font-display text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              TOP 10 Clientes de Maior Custo Operacional (Geral)
            </h3>
            <p className="text-xs text-slate-400">Classificação ordenada de impacto financeiro por cliente (NB) - todos os setores</p>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {generalTopClients.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                Nenhum cliente cadastrado na base de reposições.
              </div>
            ) : (
              generalTopClients.map((c, idx) => {
                return (
                  <div key={c.code} className="p-3 bg-slate-950/60 hover:bg-slate-950 rounded-xl border border-slate-850/60 flex items-center justify-between space-x-3 transition-colors">
                    <div className="flex items-center space-x-2.5 min-w-0 max-w-[70%]">
                      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ${
                        idx === 0 ? "bg-indigo-600 text-white" : idx === 1 ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-400"
                      }`}>
                        {c.rank}º
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">{c.nome}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Código NB: <span className="text-slate-300 font-bold">{c.code}</span> | <span className="font-semibold text-slate-300">{c.requestCount} trocas</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-bold text-blue-400">{formatCurrency(c.totalSpent)}</p>
                      <p className="text-[9px] text-indigo-400 font-semibold font-mono">{c.hl.toFixed(3)} HL</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* 5. INTERACTIVE SSTR AI DATABASE ASSISTANT */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 flex-wrap gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-blue-950/80 border border-blue-950 text-blue-400 rounded-xl shadow-md">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display text-white flex items-center gap-1.5">
                SSTR Assistente I.A. Inteligente
                <span className="text-[8px] uppercase tracking-wider font-mono bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-2 py-0.5 rounded">ONLINE</span>
              </h3>
              <p className="text-xs text-slate-400">Tire dúvidas rápidas, resuma os setores e calcule consumos operacionais da planilha</p>
            </div>
          </div>
          
          <div className="text-[9px] bg-slate-950/80 border border-slate-850 text-slate-400 px-3 py-1 rounded-xl font-mono flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-500" />
            Sincronizado em Tempo Real
          </div>
        </div>

        {/* Suggestion Quick Chips */}
        <div className="space-y-1.5">
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-wider block">Sugestões de Perguntas Rápidas:</span>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setChatInput("Qual produto foi o mais solicitado em quantidade e volumes?");
                handleSubmitChatMessage("Qual produto foi o mais solicitado em quantidade e volumes?");
              }}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-blue-550 font-mono text-[10px] transition-colors cursor-pointer text-left flex items-center space-x-1.5"
            >
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Qual o produto mais pedido?</span>
            </button>
            <button
              onClick={() => {
                setChatInput("Qual setor consumiu mais da meta de limite?");
                handleSubmitChatMessage("Qual setor consumiu mais da meta de limite?");
              }}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-blue-550 font-mono text-[10px] transition-colors cursor-pointer text-left flex items-center space-x-1.5"
            >
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>Qual setor lidera gastos?</span>
            </button>
            <button
              onClick={() => {
                setChatInput("Quais são as principais justificativas para as trocas e reposições cadastradas?");
                handleSubmitChatMessage("Quais são as principais justificativas para as trocas e reposições cadastradas?");
              }}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-blue-550 font-mono text-[10px] transition-colors cursor-pointer text-left flex items-center space-x-1.5"
            >
              <HelpCircle className="w-3 h-3 text-emerald-400" />
              <span>Motivos de trocas comuns</span>
            </button>
            <button
              onClick={() => {
                setChatInput("Resuma os volumes totais em Hectolítros (HL) e o percentual de atingimento financeiro.");
                handleSubmitChatMessage("Resuma os volumes totais em Hectolítros (HL) e o percentual de atingimento financeiro.");
              }}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-blue-550 font-mono text-[10px] transition-colors cursor-pointer text-left flex items-center space-x-1.5"
            >
              <TrendingUp className="w-3 h-3 text-amber-500" />
              <span>Relatório de Hectolitros & Meta</span>
            </button>
          </div>
        </div>

        {/* Chat window body */}
        <div className="border border-slate-800 rounded-xl bg-slate-950/80 p-4 space-y-4 h-[280px] overflow-y-auto font-sans flex flex-col justify-between">
          <div className="space-y-3 overflow-y-auto max-h-[220px]">
            {chatHistory.map((chat, i) => (
              <div 
                key={i} 
                className={`flex flex-col space-y-1 max-w-[85%] ${
                  chat.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                <span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest pl-1">
                  {chat.role === "user" ? "Você (Gestor)" : chat.role === "system" ? "SSTR Alerta" : "SSTR Assistente I.A."}
                </span>
                <div 
                  className={`p-3 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap ${
                    chat.role === "user" 
                      ? "bg-blue-600 text-white rounded-br-none" 
                      : chat.role === "system"
                      ? "bg-rose-950/50 border border-rose-900/40 text-rose-300 font-mono rounded-bl-none"
                      : "bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none"
                  }`}
                >
                  {chat.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex flex-col space-y-1 items-start mr-auto max-w-[85%]">
                <span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest pl-1 animate-pulse">SSTR Assistente I.A.</span>
                <div className="p-3 rounded-2xl bg-slate-900 text-slate-300 border border-slate-800 rounded-bl-none flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-200"></span>
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-300"></span>
                  <span className="text-[10px] font-mono text-slate-400 pl-1">Processando base de dados...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input box */}
        <div className="flex space-x-2">
          <input
            type="text"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !aiLoading) {
                handleSubmitChatMessage();
              }
            }}
            placeholder="Pergunte sobre produtos, clientes NB, hectolitros ou metas..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={aiLoading}
            className="flex-1 bg-slate-950 hover:bg-slate-900 text-slate-100 border border-slate-800 hover:border-slate-700 text-xs rounded-xl px-4 py-3 focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:opacity-50 font-mono"
          />
          <button
            onClick={() => handleSubmitChatMessage()}
            disabled={aiLoading || !chatInput.trim()}
            className="px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all disabled:opacity-40 font-bold text-xs flex items-center justify-center space-x-1 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Perguntar</span>
          </button>
        </div>

      </div>

    </div>
  );
}
