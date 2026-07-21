import React, { useState, useMemo } from "react";
import { ExchangeRecord, REPRESENTATIVOS_SETOR } from "../types";
import { Search, Eye, Filter, CheckCircle2, AlertCircle, HelpCircle, X, ExternalLink, RefreshCw, UserCheck, Calendar, AlertTriangle, Layers, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, DollarSign, ClipboardList, Percent, TrendingUp, Package, Tag } from "lucide-react";
import { calculateHL } from "../utils/hectoFactors";

interface TrackingViewProps {
  records: ExchangeRecord[];
  onUpdateRecordStatus: (id: string, newStatus: string, additionalObservations?: string) => void;
  filteredSector?: string;
  onClearSectorFilter?: () => void;
}

export default function TrackingView({ records, onUpdateRecordStatus, filteredSector, onClearSectorFilter }: TrackingViewProps) {
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState<string>("todos");
  const [selectedStatus, setSelectedStatus] = useState<string>("todos");
  const [selectedSector, setSelectedSector] = useState<string>(filteredSector || "todos");
  const [selectedReason, setSelectedReason] = useState<string>("todos");
  const [selectedGv, setSelectedGv] = useState<string>("todos");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [activeDetailRecord, setActiveDetailRecord] = useState<ExchangeRecord | null>(null);

  // Sorting state for auditoria and rastreamento
  const [sortBy, setSortBy] = useState<"data" | "valor" | "hecto">("data");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Grouped View States
  const [viewMode, setViewMode] = useState<"individual" | "grouped" | "duplicates">("grouped");
  const isGroupedView = viewMode === "grouped";
  const [activeGroupedSol, setActiveGroupedSol] = useState<any | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 24;

  // Metric toggle for status distribution visualization
  const [metricView, setMetricView] = useState<"value" | "volume" | "count">("value");

  // Debounce search input to avoid typing lag
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(localSearchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearchTerm]);

  // Reset page to 1 whenever filters or sorting change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, selectedStatus, selectedSector, selectedReason, selectedGv, startDate, endDate, viewMode, sortBy, sortOrder]);

  // Helper to convert DD/MM/YYYY to YYYY-MM-DD for comparison
  const convertToISODate = (ptDateStr: string): string | null => {
    if (!ptDateStr) return null;
    const parts = ptDateStr.split("/");
    if (parts.length !== 3) return null;
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    const year = parts[2];
    return `${year}-${month}-${day}`;
  };
  
  // Custom manual action states
  const [reviewStatus, setReviewStatus] = useState<string>("");
  const [reviewObs, setReviewObs] = useState<string>("");

  // Sync internal sector filter state with parent if changed
  React.useEffect(() => {
    if (filteredSector) {
      setSelectedSector(filteredSector);
    }
  }, [filteredSector]);

  // List of unique sectors for dropdown filter
  const sectors = useMemo(() => {
    const list = Array.from(new Set(records.map(r => r.setorVenda))).filter(Boolean);
    return list.sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
  }, [records]);

  // Get unique dates sorted descending (newest first)
  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(records.map(r => r.dataSolicitacao))).filter(Boolean);
    return dates.sort((a, b) => {
      const [dayA, monthA, yearA] = a.split("/").map(Number);
      const [dayB, monthB, yearB] = b.split("/").map(Number);
      const timeA = new Date(yearA, monthA - 1, dayA).getTime();
      const timeB = new Date(yearB, monthB - 1, dayB).getTime();
      return timeB - timeA;
    });
  }, [records]);

  // Get unique justifications (motivos) sorted alphabetically
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

  // Find solicitations that need to be re-registered ("Recadastrar"):
  // - Pending solicitations requested last month
  // - That do not have any duplicate (same client and products/quantities) in the current active month
  const recadastrarSolIds = useMemo(() => {
    const parseDateStr = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      const parts = dateStr.split("/");
      if (parts.length !== 3) return new Date(0);
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (isNaN(d) || isNaN(m) || isNaN(y)) return new Date(0);
      return new Date(y, m - 1, d);
    };

    // Determine current month (mês vigente) and year from latest record's date
    let maxTime = 0;
    let activeMonth = new Date().getMonth() + 1;
    let activeYear = new Date().getFullYear();

    records.forEach(r => {
      if (!r.dataSolicitacao) return;
      const d = parseDateStr(r.dataSolicitacao);
      const t = d.getTime();
      if (t > maxTime) {
        maxTime = t;
        activeMonth = d.getMonth() + 1;
        activeYear = d.getFullYear();
      }
    });

    let lastMonth = activeMonth - 1;
    let lastMonthYear = activeYear;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = activeYear - 1;
    }

    // Group all system records by solicitation to find their products key
    const solsMap: Record<string, ExchangeRecord[]> = {};
    records.forEach(r => {
      const solNum = (r.solicitacao || "").trim();
      if (!solNum) return;
      if (!solsMap[solNum]) {
        solsMap[solNum] = [];
      }
      solsMap[solNum].push(r);
    });

    const allSols = Object.entries(solsMap).map(([sol, recs]) => {
      const first = recs[0];
      const productsKey = recs
        .map(r => `${r.produto.trim()}:${r.quantidade}`)
        .sort()
        .join("|");
      
      const parts = (first.dataSolicitacao || "").split("/");
      const m = parts.length === 3 ? parseInt(parts[1], 10) : 0;
      const y = parts.length === 3 ? parseInt(parts[2], 10) : 0;

      return {
        solicitacao: sol,
        codigoCliente: (first.codigoCliente || "").trim(),
        status: (first.status || "").toLowerCase().trim(),
        productsKey,
        month: m,
        year: y
      };
    });

    // We consider "Pendente" (which represents not approved and not reproved) in the last month
    const lastMonthPendingSols = allSols.filter(s => 
      s.month === lastMonth && 
      s.year === lastMonthYear && 
      s.status.includes("pend")
    );

    // Active month (mês vigente) solicitations
    const currentMonthSols = allSols.filter(s => 
      s.month === activeMonth && 
      s.year === activeYear
    );

    const recadastrarSet = new Set<string>();

    lastMonthPendingSols.forEach(lmSol => {
      const hasDuplicateInCurrentMonth = currentMonthSols.some(cmSol => 
        cmSol.codigoCliente === lmSol.codigoCliente && 
        cmSol.productsKey === lmSol.productsKey
      );

      if (!hasDuplicateInCurrentMonth) {
        recadastrarSet.add(lmSol.solicitacao);
      }
    });

    return recadastrarSet;
  }, [records]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    const list = records.filter(r => {
      // 1. Search term match with searchField support
      const normSearch = searchTerm.toLowerCase();
      let matchSearch = true;
      if (searchTerm) {
        if (searchField === "cliente") {
          matchSearch = r.nomeCliente.toLowerCase().includes(normSearch) || r.codigoCliente.includes(normSearch);
        } else if (searchField === "setor") {
          matchSearch = r.setorVenda.toLowerCase().includes(normSearch);
        } else if (searchField === "nf") {
          matchSearch = r.nf.toLowerCase().includes(normSearch);
        } else if (searchField === "motorista") {
          matchSearch = !!r.nomeMotorista && r.nomeMotorista.toLowerCase().includes(normSearch);
        } else if (searchField === "mapa") {
          matchSearch = !!r.mapa && r.mapa.includes(normSearch);
        } else if (searchField === "solicitacao") {
          matchSearch = r.solicitacao.includes(normSearch);
        } else if (searchField === "item") {
          matchSearch = r.produto.includes(normSearch) || r.descricaoProduto.toLowerCase().includes(normSearch);
        } else {
          // searchField === "todos"
          matchSearch = 
            r.nomeCliente.toLowerCase().includes(normSearch) ||
            r.codigoCliente.includes(normSearch) ||
            r.solicitacao.includes(normSearch) ||
            r.descricaoProduto.toLowerCase().includes(normSearch) ||
            r.produto.includes(normSearch) ||
            r.nf.toLowerCase().includes(normSearch) ||
            (r.nomeMotorista && r.nomeMotorista.toLowerCase().includes(normSearch)) ||
            (r.mapa && r.mapa.includes(normSearch));
        }
      }

      // 2. Status match
      const statusClean = r.status.toLowerCase().trim();
      let matchStatus = true;
      if (selectedStatus !== "todos") {
        if (selectedStatus === "aprovada") {
          matchStatus = statusClean.includes("aprov");
        } else if (selectedStatus === "pendente") {
          // Standard Pendentes filter excludes those tagged as Recadastrar
          matchStatus = statusClean.includes("pend") && !recadastrarSolIds.has(r.solicitacao);
        } else if (selectedStatus === "reprovada") {
          matchStatus = statusClean.includes("reprov");
        } else if (selectedStatus === "recadastrar") {
          matchStatus = recadastrarSolIds.has(r.solicitacao);
        }
      }

      // 3. Sector match
      let matchSector = true;
      if (selectedSector !== "todos") {
        matchSector = r.setorVenda === selectedSector;
      }

      // 4. Date match (Data Inicial & Data Final range check)
      let matchDate = true;
      const isoDate = convertToISODate(r.dataSolicitacao);
      if (isoDate) {
        if (startDate && isoDate < startDate) {
          matchDate = false;
        }
        if (endDate && isoDate > endDate) {
          matchDate = false;
        }
      } else if (startDate || endDate) {
        matchDate = false;
      }

      // 5. Reason match
      let matchReason = true;
      if (selectedReason !== "todos") {
        matchReason = (r.justificativa || "").trim() === selectedReason.trim();
      }

      // 6. GV match
      let matchGv = true;
      if (selectedGv !== "todos") {
        const s = (r.setorVenda || "").trim();
        const rep = REPRESENTATIVOS_SETOR[s];
        const recordGv = rep ? rep.gv.toUpperCase() : "OUTROS";
        matchGv = recordGv === selectedGv.toUpperCase();
      }

      return matchSearch && matchStatus && matchSector && matchDate && matchReason && matchGv;
    });

    // Sort dynamically by selected option (date, value, hecto) and direction (asc/desc)
    return list.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "data") {
        const [dayA, monthA, yearA] = (a.dataSolicitacao || "").split("/").map(Number);
        const timeA = yearA && monthA && dayA ? new Date(yearA, monthA - 1, dayA).getTime() : 0;

        const [dayB, monthB, yearB] = (b.dataSolicitacao || "").split("/").map(Number);
        const timeB = yearB && monthB && dayB ? new Date(yearB, monthB - 1, dayB).getTime() : 0;

        if (timeA !== timeB) {
          comparison = timeA - timeB;
        } else {
          if (a.hora && b.hora) {
            const [hA, mA] = a.hora.split(":").map(Number);
            const [hB, mB] = b.hora.split(":").map(Number);
            const minutesA = (hA || 0) * 60 + (mA || 0);
            const minutesB = (hB || 0) * 60 + (mB || 0);
            comparison = minutesA - minutesB;
          } else {
            comparison = (a.importTimestamp || 0) - (b.importTimestamp || 0);
          }
        }
      } else if (sortBy === "valor") {
        comparison = a.valorTotal - b.valorTotal;
      } else if (sortBy === "hecto") {
        const hlA = calculateHL(a.produto, a.quantidade);
        const hlB = calculateHL(b.produto, b.quantidade);
        comparison = hlA - hlB;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [records, searchTerm, searchField, selectedStatus, selectedSector, selectedReason, selectedGv, startDate, endDate, sortBy, sortOrder]);

  // Grouped solicitations memo based on currently filtered records
  const groupedSolicitations = useMemo(() => {
    const groups: Record<string, ExchangeRecord[]> = {};
    filteredRecords.forEach(rec => {
      const sol = rec.solicitacao || "Sem Número";
      if (!groups[sol]) {
        groups[sol] = [];
      }
      groups[sol].push(rec);
    });

    const groupedList = Object.entries(groups).map(([sol, recs]) => {
      const first = recs[0];
      const productsKey = recs
        .map(r => `${r.produto.trim()}:${r.quantidade}`)
        .sort()
        .join("|");

      return {
        id: sol,
        solicitacao: sol,
        codigoCliente: first.codigoCliente || "S/C",
        nomeCliente: first.nomeCliente || "Cliente Desconhecido",
        setorVenda: first.setorVenda || "",
        dataSolicitacao: first.dataSolicitacao || "Sem Data",
        status: first.status || "Pendente",
        mapa: first.mapa || "",
        observacao: first.observacao || "",
        records: recs,
        productsKey,
        totalValue: recs.reduce((sum, r) => sum + r.valorTotal, 0),
        totalHL: recs.reduce((sum, r) => sum + calculateHL(r.produto, r.quantidade), 0)
      };
    });

    return groupedList.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "data") {
        const [dayA, monthA, yearA] = (a.dataSolicitacao || "").split("/").map(Number);
        const timeA = yearA && monthA && dayA ? new Date(yearA, monthA - 1, dayA).getTime() : 0;

        const [dayB, monthB, yearB] = (b.dataSolicitacao || "").split("/").map(Number);
        const timeB = yearB && monthB && dayB ? new Date(yearB, monthB - 1, dayB).getTime() : 0;

        if (timeA !== timeB) {
          comparison = timeA - timeB;
        } else {
          comparison = a.solicitacao.localeCompare(b.solicitacao);
        }
      } else if (sortBy === "valor") {
        comparison = a.totalValue - b.totalValue;
      } else if (sortBy === "hecto") {
        comparison = a.totalHL - b.totalHL;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [filteredRecords, sortBy, sortOrder]);

  // Dynamic statistics for the Auditoria dashboard
  const dashStats = useMemo(() => {
    let totalValor = 0;
    let totalHl = 0;
    const uniqueSols = new Set<string>();

    let bApprovedValor = 0;
    let bApprovedHl = 0;
    let bApprovedItemsCount = 0;
    const bApprovedSols = new Set<string>();

    let bPendingValor = 0;
    let bPendingHl = 0;
    let bPendingItemsCount = 0;
    const bPendingSols = new Set<string>();

    let bRejectedValor = 0;
    let bRejectedHl = 0;
    let bRejectedItemsCount = 0;
    const bRejectedSols = new Set<string>();

    let bRecadastrarValor = 0;
    let bRecadastrarHl = 0;
    let bRecadastrarItemsCount = 0;
    const bRecadastrarSols = new Set<string>();

    // Compute status distribution based on active search/filters EXCEPT the status filter
    records.forEach(r => {
      const normSearch = searchTerm.toLowerCase();
      let matchSearch = true;
      if (searchTerm) {
        if (searchField === "cliente") {
          matchSearch = r.nomeCliente.toLowerCase().includes(normSearch) || r.codigoCliente.includes(normSearch);
        } else if (searchField === "setor") {
          matchSearch = r.setorVenda.toLowerCase().includes(normSearch);
        } else if (searchField === "nf") {
          matchSearch = r.nf.toLowerCase().includes(normSearch);
        } else if (searchField === "motorista") {
          matchSearch = !!r.nomeMotorista && r.nomeMotorista.toLowerCase().includes(normSearch);
        } else if (searchField === "mapa") {
          matchSearch = !!r.mapa && r.mapa.includes(normSearch);
        } else if (searchField === "solicitacao") {
          matchSearch = r.solicitacao.includes(normSearch);
        } else if (searchField === "item") {
          matchSearch = r.produto.includes(normSearch) || r.descricaoProduto.toLowerCase().includes(normSearch);
        } else {
          matchSearch = 
            r.nomeCliente.toLowerCase().includes(normSearch) ||
            r.codigoCliente.includes(normSearch) ||
            r.solicitacao.includes(normSearch) ||
            r.descricaoProduto.toLowerCase().includes(normSearch) ||
            r.produto.includes(normSearch) ||
            r.nf.toLowerCase().includes(normSearch) ||
            (r.nomeMotorista && r.nomeMotorista.toLowerCase().includes(normSearch)) ||
            (r.mapa && r.mapa.includes(normSearch));
        }
      }

      let matchSector = true;
      if (selectedSector !== "todos") {
        matchSector = r.setorVenda === selectedSector;
      }

      let matchDate = true;
      const isoDate = convertToISODate(r.dataSolicitacao);
      if (isoDate) {
        if (startDate && isoDate < startDate) {
          matchDate = false;
        }
        if (endDate && isoDate > endDate) {
          matchDate = false;
        }
      } else if (startDate || endDate) {
        matchDate = false;
      }

      let matchReason = true;
      if (selectedReason !== "todos") {
        matchReason = (r.justificativa || "").trim() === selectedReason.trim();
      }

      let matchGv = true;
      if (selectedGv !== "todos") {
        const s = (r.setorVenda || "").trim();
        const rep = REPRESENTATIVOS_SETOR[s];
        const recordGv = rep ? rep.gv.toUpperCase() : "OUTROS";
        matchGv = recordGv === selectedGv.toUpperCase();
      }

      if (matchSearch && matchSector && matchDate && matchReason && matchGv) {
        const statusClean = r.status.toLowerCase().trim();
        const val = r.valorTotal || 0;
        const hl = r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
        const isRecadastrar = recadastrarSolIds.has(r.solicitacao);

        if (isRecadastrar) {
          bRecadastrarValor += val;
          bRecadastrarHl += hl;
          bRecadastrarItemsCount++;
          if (r.solicitacao) bRecadastrarSols.add(r.solicitacao);
        } else if (statusClean.includes("aprov")) {
          bApprovedValor += val;
          bApprovedHl += hl;
          bApprovedItemsCount++;
          if (r.solicitacao) bApprovedSols.add(r.solicitacao);
        } else if (statusClean.includes("pend")) {
          bPendingValor += val;
          bPendingHl += hl;
          bPendingItemsCount++;
          if (r.solicitacao) bPendingSols.add(r.solicitacao);
        } else if (statusClean.includes("reprov")) {
          bRejectedValor += val;
          bRejectedHl += hl;
          bRejectedItemsCount++;
          if (r.solicitacao) bRejectedSols.add(r.solicitacao);
        }
      }
    });

    // Sum total value and volume based on selected status filter to ensure consistency
    filteredRecords.forEach(r => {
      // Show total of everything in the filtered records (respecting whichever status filter is selected, or all if "todos")
      totalValor += r.valorTotal || 0;
      totalHl += r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
      if (r.solicitacao) {
        uniqueSols.add(r.solicitacao);
      }
    });

    // Baseline records logic: all records matching filters except client search text (searchTerm)
    let baselineValor = 0;
    let baselineHl = 0;
    const baselineSols = new Set<string>();

    records.forEach(r => {
      // 2. Status match
      const statusClean = r.status.toLowerCase().trim();
      let matchStatus = true;
      if (selectedStatus !== "todos") {
        if (selectedStatus === "aprovada") {
          matchStatus = statusClean.includes("aprov");
        } else if (selectedStatus === "pendente") {
          matchStatus = statusClean.includes("pend") && !recadastrarSolIds.has(r.solicitacao);
        } else if (selectedStatus === "reprovada") {
          matchStatus = statusClean.includes("reprov");
        } else if (selectedStatus === "recadastrar") {
          matchStatus = recadastrarSolIds.has(r.solicitacao);
        }
      }

      // 3. Sector match
      let matchSector = true;
      if (selectedSector !== "todos") {
        matchSector = r.setorVenda === selectedSector;
      }

      // 4. Date match (Data Inicial & Data Final range check)
      let matchDate = true;
      const isoDate = convertToISODate(r.dataSolicitacao);
      if (isoDate) {
        if (startDate && isoDate < startDate) {
          matchDate = false;
        }
        if (endDate && isoDate > endDate) {
          matchDate = false;
        }
      } else if (startDate || endDate) {
        matchDate = false;
      }

      // 5. Reason match
      let matchReason = true;
      if (selectedReason !== "todos") {
        matchReason = (r.justificativa || "").trim() === selectedReason.trim();
      }

      // 6. GV match
      let matchGv = true;
      if (selectedGv !== "todos") {
        const s = (r.setorVenda || "").trim();
        const rep = REPRESENTATIVOS_SETOR[s];
        const recordGv = rep ? rep.gv.toUpperCase() : "OUTROS";
        matchGv = recordGv === selectedGv.toUpperCase();
      }

      if (matchStatus && matchSector && matchDate && matchReason && matchGv) {
        // Sum all records matching active filters for baseline comparison
        baselineValor += r.valorTotal || 0;
        baselineHl += r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
        if (r.solicitacao) {
          baselineSols.add(r.solicitacao);
        }
      }
    });

    const percentValor = baselineValor > 0 ? (totalValor / baselineValor) * 100 : 100;
    const percentHl = baselineHl > 0 ? (totalHl / baselineHl) * 100 : 100;
    const percentSols = baselineSols.size > 0 ? (uniqueSols.size / baselineSols.size) * 100 : 100;

    return {
      totalValor,
      totalHl,
      solicitacoesCount: uniqueSols.size,
      itemsCount: filteredRecords.length,
      baselineValor,
      baselineHl,
      baselineSolsCount: baselineSols.size,
      percentValor,
      percentHl,
      percentSols,
      hasActiveSearchTerm: !!searchTerm.trim(),
      // Status breakdown
      bApprovedValor,
      bApprovedHl,
      bApprovedSolsCount: bApprovedSols.size,
      bApprovedItemsCount,
      bPendingValor,
      bPendingHl,
      bPendingSolsCount: bPendingSols.size,
      bPendingItemsCount,
      bRejectedValor,
      bRejectedHl,
      bRejectedSolsCount: bRejectedSols.size,
      bRejectedItemsCount,
      bRecadastrarValor,
      bRecadastrarHl,
      bRecadastrarSolsCount: bRecadastrarSols.size,
      bRecadastrarItemsCount
    };
  }, [filteredRecords, records, selectedStatus, selectedSector, startDate, endDate, selectedReason, selectedGv, searchTerm, recadastrarSolIds]);

  // Find precise duplicates based on: NB (codigoCliente), products and quantities, date window, and current active month constraints
  const allDuplicateGroups = useMemo(() => {
    const parseDateStr = (dateStr: string) => {
      if (!dateStr) return new Date(0);
      const parts = dateStr.split("/");
      if (parts.length !== 3) return new Date(0);
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (isNaN(d) || isNaN(m) || isNaN(y)) return new Date(0);
      return new Date(y, m - 1, d);
    };

    // Determine the "mês vigente" (active month and year) dynamically from the latest record
    let maxTime = 0;
    let activeMonth = new Date().getMonth() + 1;
    let activeYear = new Date().getFullYear();

    records.forEach(r => {
      if (!r.dataSolicitacao) return;
      const d = parseDateStr(r.dataSolicitacao);
      const t = d.getTime();
      if (t > maxTime) {
        maxTime = t;
        activeMonth = d.getMonth() + 1;
        activeYear = d.getFullYear();
      }
    });

    // 1. Group all individual records by their solicitation number
    const solsMap: Record<string, ExchangeRecord[]> = {};
    records.forEach(r => {
      const solNum = (r.solicitacao || "").trim();
      if (!solNum) return;
      if (!solsMap[solNum]) {
        solsMap[solNum] = [];
      }
      solsMap[solNum].push(r);
    });

    // 2. Map solicitation groups to objects with a unique products signature
    const solsList = Object.entries(solsMap).map(([sol, recs]) => {
      const first = recs[0];
      // Build a stable product key. Sort products to make it order-independent.
      // If there is exactly one unit of a product, include the map to require same map.
      const productsKey = recs
        .map(r => {
          const prodCode = (r.produto || "").trim();
          const qty = r.quantidade || 0;
          if (qty === 1) {
            return `${prodCode}_${qty}_map:${(r.mapa || "").trim()}`;
          } else {
            return `${prodCode}_${qty}`;
          }
        })
        .sort()
        .join("|");

      return {
        solicitacao: sol,
        codigoCliente: (first.codigoCliente || "").trim(),
        nomeCliente: first.nomeCliente || "Cliente Desconhecido",
        dataSolicitacao: first.dataSolicitacao || "",
        status: first.status || "Pendente",
        setorVenda: first.setorVenda || "",
        mapa: first.mapa || "",
        nf: first.nf || "",
        records: recs,
        productsKey,
        totalValue: recs.reduce((sum, r) => sum + r.valorTotal, 0)
      };
    });

    // 3. Group solicitations by client NB and products signature
    const candidates: Record<string, typeof solsList> = {};
    solsList.forEach(sol => {
      if (!sol.codigoCliente || !sol.productsKey) return;
      const key = `${sol.codigoCliente}_${sol.productsKey}`;
      if (!candidates[key]) {
        candidates[key] = [];
      }
      candidates[key].push(sol);
    });

    // 4. Cluster duplicates by 30-day date interval and filter by current month
    const list: any[] = [];

    Object.entries(candidates).forEach(([candKey, poolSols]) => {
      if (poolSols.length <= 1) return;

      // Sort solicitations by date (oldest first)
      const sortedSols = [...poolSols].sort((a, b) => {
        return parseDateStr(a.dataSolicitacao).getTime() - parseDateStr(b.dataSolicitacao).getTime();
      });

      // Cluster consecutive solicitations <= 30 days apart
      const clusters: typeof poolSols[] = [];
      let currentCluster: typeof poolSols = [];

      sortedSols.forEach((sol, i) => {
        if (i === 0) {
          currentCluster.push(sol);
        } else {
          const lastSol = currentCluster[currentCluster.length - 1];
          const d1 = parseDateStr(lastSol.dataSolicitacao);
          const d2 = parseDateStr(sol.dataSolicitacao);
          const diffDays = Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);

          if (diffDays <= 30) {
            currentCluster.push(sol);
          } else {
            clusters.push(currentCluster);
            currentCluster = [sol];
          }
        }
      });
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      // Filter clusters: must have size >= 2 and contain at least one pending in the active/current month
      const validClusters = clusters.filter(cluster => {
        if (cluster.length <= 1) return false;

        const pendingCount = cluster.filter(sol => sol.status.toLowerCase().includes("pend")).length;
        const approvedCount = cluster.filter(sol => sol.status.toLowerCase().includes("aprov")).length;
        // Se houver apenas uma solicitação pendente e nenhuma aprovada (ou seja, as demais estão reprovadas),
        // não há conflito ativo que exija atuação do usuário.
        if (pendingCount === 1 && approvedCount === 0) {
          return false;
        }

        return cluster.some(sol => {
          const isPending = sol.records.some(r => r.status.toLowerCase().includes("pend"));
          const parts = sol.dataSolicitacao.split("/");
          if (parts.length !== 3) return false;
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          return isPending && m === activeMonth && y === activeYear;
        });
      });

      // Map valid clusters to duplicate group format
      validClusters.forEach((cluster, clusterIdx) => {
        const hasApproved = cluster.some(sol => sol.status.toLowerCase().includes("aprov"));
        // Sort pending solicitations to find the oldest pending to keep
        const pendingSols = cluster.filter(sol => sol.status.toLowerCase().includes("pend"));
        const recommendedKeepSol = hasApproved ? null : pendingSols[0];

        const mappedSols = cluster.map(sol => {
          const statusClean = sol.status.toLowerCase().trim();
          let adviceType: "keep_approved" | "already_reproved" | "reject_duplicate_approved" | "approve_recommended" | "reject_duplicate_pending" = "already_reproved";
          let adviceText = "";
          let adviceColor = "";

          if (statusClean.includes("aprov")) {
            adviceType = "keep_approved";
            adviceText = "✔️ MANTER APROVADA: Esta solicitação já foi aprovada no sistema.";
            adviceColor = "border-emerald-600/40 bg-emerald-950/20 text-emerald-400";
          } else if (statusClean.includes("reprov")) {
            adviceType = "already_reproved";
            adviceText = "❌ JÁ REPROVADA: Esta duplicata já foi resolvida e reprovada.";
            adviceColor = "border-slate-800 bg-slate-950/40 text-slate-500 opacity-80";
          } else if (statusClean.includes("pend")) {
            if (hasApproved) {
              adviceType = "reject_duplicate_approved";
              adviceText = "⚠️ REPROVAR NO PROMAX: Já existe outra solicitação idêntica aprovada!";
              adviceColor = "border-rose-600/50 bg-rose-950/30 text-rose-400 animate-pulse";
            } else if (recommendedKeepSol && sol.solicitacao === recommendedKeepSol.solicitacao) {
              adviceType = "approve_recommended";
              adviceText = "⭐ RECOMENDAÇÃO: APROVAR esta solicitação e reprovar a outra duplicada.";
              adviceColor = "border-amber-500/50 bg-amber-950/30 text-amber-300";
            } else {
              adviceType = "reject_duplicate_pending";
              adviceText = "⚠️ RECOMENDAÇÃO: REPROVAR esta duplicata no Promax (Mantenha a outra pendente recomendada).";
              adviceColor = "border-rose-500/40 bg-rose-950/20 text-rose-400";
            }
          }

          // Assign advice to each individual item record inside the solicitation for display
          const recordsWithAdvice = sol.records.map(r => ({
            ...r,
            adviceType,
            adviceText,
            adviceColor
          }));

          return {
            ...sol,
            records: recordsWithAdvice,
            adviceType,
            adviceText,
            adviceColor
          };
        });

        const firstSol = mappedSols[0];
        const flatGroupRecords = mappedSols.flatMap(sol => sol.records);

        list.push({
          key: `${candKey}_cluster_${clusterIdx}`,
          codigoCliente: firstSol.codigoCliente,
          nomeCliente: firstSol.nomeCliente,
          records: flatGroupRecords,
          solicitations: mappedSols
        });
      });
    });

    // Sort the duplicate groups by the number of pending solicitations inside them
    list.sort((a, b) => {
      const aPendCount = a.solicitations.filter((sol: any) => sol.status.toLowerCase().includes("pend")).length;
      const bPendCount = b.solicitations.filter((sol: any) => sol.status.toLowerCase().includes("pend")).length;
      return bPendCount - aPendCount;
    });

    return list;
  }, [records]);

  // Filter duplicate groups based on dropdown/search filters
  const filteredDuplicateGroups = useMemo(() => {
    return allDuplicateGroups.filter(g => {
      // Search text match
      if (searchTerm) {
        const norm = searchTerm.toLowerCase();
        let match = false;
        if (searchField === "cliente") {
          match = g.nomeCliente.toLowerCase().includes(norm) || g.codigoCliente.toLowerCase().includes(norm);
        } else if (searchField === "item") {
          match = g.records.some((r: any) => 
            (r.produto || "").toLowerCase().includes(norm) || 
            (r.descricaoProduto || "").toLowerCase().includes(norm)
          );
        } else {
          match = g.nomeCliente.toLowerCase().includes(norm) ||
            g.codigoCliente.toLowerCase().includes(norm) ||
            g.records.some((r: any) => 
              (r.produto || "").toLowerCase().includes(norm) || 
              (r.descricaoProduto || "").toLowerCase().includes(norm)
            );
        }
        if (!match) return false;
      }

      // Sector filter
      if (selectedSector !== "todos") {
        const hasSector = g.records.some(r => r.setorVenda === selectedSector);
        if (!hasSector) return false;
      }

      // Date range filter
      if (startDate || endDate) {
        const hasDateInRange = g.records.some(r => {
          const isoDate = convertToISODate(r.dataSolicitacao);
          if (!isoDate) return false;
          if (startDate && isoDate < startDate) return false;
          if (endDate && isoDate > endDate) return false;
          return true;
        });
        if (!hasDateInRange) return false;
      }

      return true;
    });
  }, [allDuplicateGroups, searchTerm, searchField, selectedSector, startDate, endDate]);

  // Sync back to old set for list highlights
  const duplicateSolicitationIds = useMemo(() => {
    const duplicateSolIds = new Set<string>();
    allDuplicateGroups.forEach(g => {
      g.records.forEach(r => {
        if (r.solicitacao) {
          duplicateSolIds.add(r.solicitacao);
        }
      });
    });
    return duplicateSolIds;
  }, [allDuplicateGroups]);

  // Sliced datasets for pagination
  const paginatedIndividualRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  const paginatedGroupedSolicitations = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedSolicitations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [groupedSolicitations, currentPage]);

  const paginatedDuplicateGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDuplicateGroups.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDuplicateGroups, currentPage]);

  const totalPages = useMemo(() => {
    let count = 0;
    if (viewMode === "individual") {
      count = filteredRecords.length;
    } else if (viewMode === "grouped") {
      count = groupedSolicitations.length;
    } else {
      count = filteredDuplicateGroups.length;
    }
    return Math.max(1, Math.ceil(count / ITEMS_PER_PAGE));
  }, [viewMode, filteredRecords.length, groupedSolicitations.length, filteredDuplicateGroups.length]);

  const openGroupedDetails = (g: any) => {
    setActiveGroupedSol(g);
    setActiveDetailRecord(null);
    setReviewStatus(g.status);
    setReviewObs(g.observacao || "");
  };

  const openRecordDetails = (rec: ExchangeRecord) => {
    setActiveDetailRecord(rec);
    setActiveGroupedSol(null);
    setReviewStatus(rec.status);
    setReviewObs(rec.observacao || "");
  };

  const handleApplyStatusChange = () => {
    if (isGroupedView && activeGroupedSol) {
      // Apply status change to all records in the grouped solicitation
      activeGroupedSol.records.forEach((r: ExchangeRecord) => {
        onUpdateRecordStatus(r.id, reviewStatus, reviewObs);
      });
      
      // Update local grouped object state
      setActiveGroupedSol((prev: any) => {
        if (!prev) return null;
        return {
          ...prev,
          status: reviewStatus,
          observacao: reviewObs,
          records: prev.records.map((r: ExchangeRecord) => ({
            ...r,
            status: reviewStatus,
            observacao: reviewObs,
            dataAcao: new Date().toLocaleDateString("pt-BR"),
            usuarioAcao: "Administrador Logado"
          }))
        };
      });
    } else if (activeDetailRecord) {
      onUpdateRecordStatus(activeDetailRecord.id, reviewStatus, reviewObs);
      
      setActiveDetailRecord(prev => prev ? {
        ...prev,
        status: reviewStatus,
        observacao: reviewObs,
        dataAcao: new Date().toLocaleDateString("pt-BR"),
        usuarioAcao: "Administrador Logado"
      } : null);
    }
  };

  const getStatusBadge = (statusStr: string, solId?: string) => {
    if (solId && recadastrarSolIds.has(solId)) {
      return (
        <span className="px-2.5 py-1 bg-indigo-950/80 text-indigo-400 border border-indigo-900/60 text-xs font-semibold rounded-full flex items-center w-fit space-x-1 font-mono">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recadastrar</span>
        </span>
      );
    }
    const s = statusStr.toLowerCase();
    if (s.includes("aprov")) {
      return (
        <span className="px-2.5 py-1 bg-emerald-950/80 text-emerald-400 border border-emerald-900/60 text-xs font-semibold rounded-full flex items-center w-fit space-x-1 font-mono">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Aprovada</span>
        </span>
      );
    } else if (s.includes("reprov")) {
      return (
        <span className="px-2.5 py-1 bg-red-950/80 text-red-400 border border-red-900/60 text-xs font-semibold rounded-full flex items-center w-fit space-x-1 font-mono">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Reprovada</span>
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 bg-amber-950/80 text-amber-400 border border-amber-900/60 text-xs font-semibold rounded-full flex items-center w-fit space-x-1 font-mono">
          <RefreshCw className="w-3.5 h-3.5 animate-spin-[spin_3s_linear_infinite]" />
          <span>Pendente</span>
        </span>
      );
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const {
    totalAllValor,
    totalAllHl,
    totalAllSols,
    pctApprovedValor,
    pctPendingValor,
    pctRejectedValor,
    pctRecadastrarValor,
    pctApprovedHl,
    pctPendingHl,
    pctRejectedHl,
    pctRecadastrarHl,
    pctApprovedSols,
    pctPendingSols,
    pctRejectedSols,
    pctRecadastrarSols
  } = useMemo(() => {
    const totalV = dashStats.bApprovedValor + dashStats.bPendingValor + dashStats.bRejectedValor + dashStats.bRecadastrarValor;
    const totalH = dashStats.bApprovedHl + dashStats.bPendingHl + dashStats.bRejectedHl + dashStats.bRecadastrarHl;
    const totalS = dashStats.bApprovedSolsCount + dashStats.bPendingSolsCount + dashStats.bRejectedSolsCount + dashStats.bRecadastrarSolsCount;

    return {
      totalAllValor: totalV,
      totalAllHl: totalH,
      totalAllSols: totalS,
      
      pctApprovedValor: totalV > 0 ? (dashStats.bApprovedValor / totalV) * 100 : 0,
      pctPendingValor: totalV > 0 ? (dashStats.bPendingValor / totalV) * 100 : 0,
      pctRejectedValor: totalV > 0 ? (dashStats.bRejectedValor / totalV) * 100 : 0,
      pctRecadastrarValor: totalV > 0 ? (dashStats.bRecadastrarValor / totalV) * 100 : 0,

      pctApprovedHl: totalH > 0 ? (dashStats.bApprovedHl / totalH) * 100 : 0,
      pctPendingHl: totalH > 0 ? (dashStats.bPendingHl / totalH) * 100 : 0,
      pctRejectedHl: totalH > 0 ? (dashStats.bRejectedHl / totalH) * 100 : 0,
      pctRecadastrarHl: totalH > 0 ? (dashStats.bRecadastrarHl / totalH) * 100 : 0,

      pctApprovedSols: totalS > 0 ? (dashStats.bApprovedSolsCount / totalS) * 100 : 0,
      pctPendingSols: totalS > 0 ? (dashStats.bPendingSolsCount / totalS) * 100 : 0,
      pctRejectedSols: totalS > 0 ? (dashStats.bRejectedSolsCount / totalS) * 100 : 0,
      pctRecadastrarSols: totalS > 0 ? (dashStats.bRecadastrarSolsCount / totalS) * 100 : 0,
    };
  }, [dashStats]);

  return (
    <div className="space-y-6 text-slate-100">
      
      {/* Search & Filter Header card */}
      <div className="bg-slate-900/95 p-6 rounded-2xl border border-slate-800 shadow-2xl space-y-5">
        
        {/* Tier 1: Primary Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          
          {/* Quick Search with Field Selection */}
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            {/* Field selection dropdown */}
            <div className="sm:w-60 shrink-0 relative">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                className="w-full pl-3 pr-8 py-3 bg-slate-950 border border-slate-850 rounded-xl text-xs font-bold text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-mono cursor-pointer transition-all shadow-md appearance-none"
              >
                <option value="todos">🔍 Todos os Campos</option>
                <option value="cliente">👤 Cliente (Nome ou NB)</option>
                <option value="setor">📍 Setor de Venda</option>
                <option value="nf">📄 Nota Fiscal (NF-e)</option>
                <option value="motorista">🚚 Motorista</option>
                <option value="mapa">🗺️ Mapa</option>
                <option value="solicitacao">🔢 Nº da Solicitação</option>
                <option value="item">📦 Item (Código/Descrição)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>

            {/* Search Input field */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder={
                  searchField === "todos" ? "Buscar por cliente, produto, NF, motorista, mapa, solicitação..." :
                  searchField === "cliente" ? "Cliente: Digite o Nome ou NB..." :
                  searchField === "setor" ? "Setor: Digite o Setor de Venda..." :
                  searchField === "nf" ? "NF: Digite o número da NF-e..." :
                  searchField === "motorista" ? "Motorista: Digite o nome do motorista..." :
                  searchField === "mapa" ? "Mapa: Digite o número do mapa..." :
                  searchField === "solicitacao" ? "Solicitação: Digite o número da solicitação..." :
                  "Item: Digite o código ou nome do produto..."
                }
                value={localSearchTerm}
                onChange={(e) => setLocalSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-slate-950 border border-slate-850 rounded-xl text-sm text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all font-mono placeholder:font-sans placeholder:text-slate-500 shadow-inner"
              />
              {localSearchTerm && (
                <button
                  onClick={() => setLocalSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-full transition-colors"
                  title="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Right: View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono hidden xl:inline">Visão:</span>
            <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-850 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setViewMode("individual");
                  setActiveDetailRecord(null);
                  setActiveGroupedSol(null);
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === "individual"
                    ? "bg-blue-600 text-white font-semibold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Itens Individuais
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("grouped");
                  setActiveDetailRecord(null);
                  setActiveGroupedSol(null);
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
                  viewMode === "grouped"
                    ? "bg-blue-600 text-white font-semibold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Solicitações ({groupedSolicitations.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode("duplicates");
                  setActiveDetailRecord(null);
                  setActiveGroupedSol(null);
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1 relative ${
                  viewMode === "duplicates"
                    ? "bg-amber-600 text-white font-semibold shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Duplicatas ({filteredDuplicateGroups.length})</span>
                {filteredDuplicateGroups.length > 0 && (
                  <span className="absolute -top-1.5 -right-1 px-1.5 py-0.5 bg-red-600 text-white rounded-full text-[9px] font-bold animate-pulse">
                    {filteredDuplicateGroups.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tier 2: Advanced Granular Filters Grid */}
        <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850/70">
          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3 flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-slate-400" />
            <span>Filtros de Auditoria & Pesquisa Avançada</span>
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Sector filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono block">Setor de Venda</label>
              <select
                value={selectedSector}
                onChange={(e) => {
                  setSelectedSector(e.target.value);
                  if (e.target.value === "todos" && onClearSectorFilter) onClearSectorFilter();
                }}
                className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer transition-colors"
              >
                <option value="todos">Todos os Setores</option>
                {sectors.map(sec => (
                  <option key={sec} value={sec}>Setor {sec}</option>
                ))}
              </select>
            </div>

            {/* Date Inicial Filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono block">Data Inicial</label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer transition-colors"
                  title="Selecione a data inicial"
                />
              </div>
            </div>

            {/* Date Final Filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono block">Data Final</label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer transition-colors"
                  title="Selecione a data final"
                />
              </div>
            </div>

            {/* Motivo filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono block">Motivo / Justificativa</label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer transition-colors truncate"
              >
                <option value="todos">Todos os Motivos</option>
                {uniqueReasons.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* GV filter */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono block">Gerência de Vendas (GV)</label>
              <select
                value={selectedGv}
                onChange={(e) => setSelectedGv(e.target.value)}
                className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer transition-colors"
              >
                <option value="todos">Todas as GVs</option>
                {uniqueGVsList.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Tier 3: Sorting Options Bar */}
        <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-850/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs mt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono mr-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span>Ordenar por:</span>
            </span>
            {[
              { id: "data", label: "Data" },
              { id: "valor", label: "Valor (R$)" },
              { id: "hecto", label: "Volume (HL)" }
            ].map(item => {
              const isActive = sortBy === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isActive) {
                      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
                    } else {
                      setSortBy(item.id as any);
                      setSortOrder("desc"); // Default to desc on change
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center space-x-1.5 ${
                    isActive
                      ? "bg-slate-900 text-blue-400 border-blue-500/50 shadow-md font-semibold font-mono"
                      : "bg-slate-950/40 hover:bg-slate-950 text-slate-400 border-slate-900 font-mono"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    sortOrder === "desc" 
                      ? <ChevronDown className="w-3.5 h-3.5 text-blue-400" /> 
                      : <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-slate-400 font-mono text-[10px] flex items-center gap-1.5">
            <span className="uppercase text-slate-500">Direção:</span>
            <button
              onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-white rounded border border-slate-800 transition-colors uppercase font-bold text-[9px] cursor-pointer"
            >
              {sortOrder === "desc" ? "Decrescente" : "Crescente"}
            </button>
          </div>
        </div>

        {/* Status Selection and Action reset row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3">
          
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono mr-2">Filtro Status:</span>
            {[
              { id: "todos", label: "Todos os Pedidos" },
              { id: "aprovada", label: "Aprovadas" },
              { id: "pendente", label: "Pendentes" },
              { id: "reprovada", label: "Reprovadas" },
              { id: "recadastrar", label: "Recadastrar" }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedStatus(p.id);
                  setActiveDetailRecord(null);
                  setActiveGroupedSol(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border ${
                  selectedStatus === p.id
                    ? "bg-blue-600 text-white border-blue-500 shadow-md font-semibold"
                    : "bg-slate-950 hover:bg-slate-850 text-slate-300 border-slate-850"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Quick Stats / Active Conflicts */}
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 font-mono">
            {allDuplicateGroups.length > 0 && (
              <span className="text-red-400 bg-red-950/40 border border-red-900/40 px-2.5 py-1.5 rounded-lg animate-pulse flex items-center space-x-1 font-sans">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{allDuplicateGroups.length} conflitos detectados</span>
              </span>
            )}
            
            {/* Active filters clear reset button */}
            {(selectedSector !== "todos" || selectedReason !== "todos" || selectedGv !== "todos" || startDate || endDate || selectedStatus !== "todos" || localSearchTerm || searchField !== "todos") && (
              <button
                onClick={() => {
                  setLocalSearchTerm("");
                  setSearchField("todos");
                  setSelectedSector("todos");
                  setSelectedReason("todos");
                  setSelectedGv("todos");
                  setSelectedStatus("todos");
                  setStartDate("");
                  setEndDate("");
                  if (onClearSectorFilter) onClearSectorFilter();
                }}
                className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900/80 border border-rose-900 text-rose-300 text-[10px] font-bold rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
                title="Limpar todos os filtros"
              >
                <X className="w-3 h-3" />
                <span>Limpar Filtros</span>
              </button>
            )}

            <span className="text-slate-400">
              {viewMode === "duplicates" ? (
                `Mostrando ${filteredDuplicateGroups.length} de ${allDuplicateGroups.length} conflitos`
              ) : (
                `Mostrando ${isGroupedView ? groupedSolicitations.length : filteredRecords.length} de ${isGroupedView ? groupedSolicitations.length : records.length} ${isGroupedView ? "solicitações" : "registros"}`
              )}
            </span>
          </div>

        </div>

      </div>

      {filteredSector && (
        <div className="bg-blue-950/80 text-blue-300 border border-blue-900/60 p-3.5 rounded-xl text-xs flex justify-between items-center font-mono animate-fade-in shadow-md">
          <span>Setor <strong>{filteredSector}</strong> filtrado pela Visão Geral de Custos.</span>
          <button
            onClick={() => {
              setSelectedSector("todos");
              if (onClearSectorFilter) onClearSectorFilter();
            }}
            className="px-2.5 py-1 bg-blue-900/50 hover:bg-blue-900 text-white rounded text-[10px] font-bold uppercase transition-colors cursor-pointer"
          >
            Limpar Filtro de Setor
          </button>
        </div>
      )}

      {/* PAINEL DE INDICADORES DINÂMICOS (DASHBOARD DA AUDITORIA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
        {/* Card 1: Valor Total */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between space-x-4 relative overflow-hidden group hover:border-blue-600/40 transition-colors">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono block">
              {selectedStatus === "todos"
                ? "Valor Geral (R$)"
                : selectedStatus === "aprovada"
                ? "Valor Consumido (R$)"
                : selectedStatus === "pendente"
                ? "Valor Pendente (R$)"
                : selectedStatus === "reprovada"
                ? "Valor Reprovado (R$)"
                : "Valor Recadastrar (R$)"}
            </span>
            <span className="text-xl lg:text-2xl font-extrabold text-blue-400 font-mono block">{formatCurrency(dashStats.totalValor)}</span>
            <span className="text-[10px] text-slate-400 font-mono block leading-tight">
              {dashStats.hasActiveSearchTerm ? (
                <>
                  <span className="text-emerald-400 font-bold">{dashStats.percentValor.toFixed(1)}%</span> do período ({formatCurrency(dashStats.baselineValor)})
                </>
              ) : selectedStatus === "todos" ? (
                "Total de todas as solicitações"
              ) : selectedStatus === "aprovada" ? (
                "Apenas solicitações aprovadas"
              ) : selectedStatus === "pendente" ? (
                "Apenas solicitações pendentes"
              ) : selectedStatus === "reprovada" ? (
                "Apenas solicitações reprovadas"
              ) : (
                "Apenas solicitações a recadastrar"
              )}
            </span>
          </div>
          <div className="p-3 bg-blue-950/60 rounded-xl border border-blue-900/40 text-blue-400 group-hover:scale-110 transition-transform">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Volume em Hectolitros */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between space-x-4 relative overflow-hidden group hover:border-indigo-600/40 transition-colors">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono block">
              {selectedStatus === "todos"
                ? "Volume Geral (HL)"
                : selectedStatus === "aprovada"
                ? "Volume em Hectolitros (HL)"
                : selectedStatus === "pendente"
                ? "Volume Pendente (HL)"
                : selectedStatus === "reprovada"
                ? "Volume Reprovado (HL)"
                : "Volume Recadastrar (HL)"}
            </span>
            <span className="text-xl lg:text-2xl font-extrabold text-indigo-400 font-mono block">{dashStats.totalHl.toFixed(3)} HL</span>
            <span className="text-[10px] text-slate-400 font-mono block leading-tight">
              {dashStats.hasActiveSearchTerm ? (
                <>
                  <span className="text-indigo-450 font-bold">{dashStats.percentHl.toFixed(1)}%</span> do período ({dashStats.baselineHl.toFixed(3)} HL)
                </>
              ) : selectedStatus === "todos" ? (
                "Volume total das solicitações"
              ) : selectedStatus === "aprovada" ? (
                "Volume das solicitações aprovadas"
              ) : selectedStatus === "pendente" ? (
                "Volume das solicitações pendentes"
              ) : selectedStatus === "reprovada" ? (
                "Volume das solicitações reprovadas"
              ) : (
                "Volume das solicitações a recadastrar"
              )}
            </span>
          </div>
          <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-900/40 text-indigo-400 group-hover:scale-110 transition-transform">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Número de Solicitações */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between space-x-4 relative overflow-hidden group hover:border-emerald-600/40 transition-colors">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono block">
              {selectedStatus === "todos"
                ? "Solicitações Gerais"
                : selectedStatus === "aprovada"
                ? "Solicitações Atendidas"
                : selectedStatus === "pendente"
                ? "Solicitações Pendentes"
                : selectedStatus === "reprovada"
                ? "Solicitações Reprovadas"
                : "Solicitações Recadastrar"}
            </span>
            <span className="text-xl lg:text-2xl font-extrabold text-emerald-400 font-mono block">{dashStats.solicitacoesCount} Sols.</span>
            <span className="text-[10px] text-slate-400 font-mono block leading-tight">
              {dashStats.hasActiveSearchTerm ? (
                <>
                  <span className="text-emerald-450 font-bold">{dashStats.percentSols.toFixed(1)}%</span> do período ({dashStats.baselineSolsCount} Sols.)
                </>
              ) : selectedStatus === "todos" ? (
                `Total de ${dashStats.itemsCount} itens lançados`
              ) : (
                `Total de ${dashStats.itemsCount} itens lançados`
              )}
            </span>
          </div>
          <div className="p-3 bg-emerald-950/60 rounded-xl border border-emerald-900/40 text-emerald-450 group-hover:scale-110 transition-transform">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Participação do Filtro */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-between space-x-4 relative overflow-hidden group hover:border-amber-600/40 transition-colors">
          <div className="space-y-1 z-10">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider font-mono block">Representatividade Real</span>
            <span className="text-xl lg:text-2xl font-extrabold text-amber-400 font-mono block">
              {dashStats.hasActiveSearchTerm ? `${dashStats.percentValor.toFixed(1)}%` : "100.0%"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block leading-tight">
              {dashStats.hasActiveSearchTerm ? "Participação do cliente/filtro no período" : "Nenhum cliente ou NB restrito"}
            </span>
          </div>
          <div className="p-3 bg-amber-950/60 rounded-xl border border-amber-900/40 text-amber-400 group-hover:scale-110 transition-transform">
            <Percent className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* VISUALIZAÇÃO DE STATUS (APROVADO, PENDENTE, REPROVADO) */}
      <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl mt-6 space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 tracking-wide uppercase font-sans flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Análise de Status e Distribuição das Solicitações</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Visualização detalhada da proporção de solicitações Aprovadas, Pendentes e Reprovadas do filtro ativo.
            </p>
          </div>
          
          {/* Toggle buttons for metric */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs self-start md:self-auto">
            <button
              onClick={() => setMetricView("value")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                metricView === "value"
                  ? "bg-blue-600 text-white shadow-md font-bold"
                  : "text-slate-450 hover:text-slate-200"
              }`}
            >
              Valor (R$)
            </button>
            <button
              onClick={() => setMetricView("volume")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                metricView === "volume"
                  ? "bg-indigo-600 text-white shadow-md font-bold"
                  : "text-slate-450 hover:text-slate-200"
              }`}
            >
              Volume (HL)
            </button>
            <button
              onClick={() => setMetricView("count")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                metricView === "count"
                  ? "bg-emerald-600 text-white shadow-md font-bold"
                  : "text-slate-450 hover:text-slate-200"
              }`}
            >
              Solicitações
            </button>
          </div>
        </div>

        {/* Stacked Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-mono text-slate-400">
            <span>Proporção por Status ({metricView === "value" ? "Valor Financeiro R$" : metricView === "volume" ? "Volume Físico HL" : "Quantidade de Solicitações"})</span>
            <span>Total: {
              metricView === "value" 
                ? formatCurrency(totalAllValor) 
                : metricView === "volume" 
                  ? `${totalAllHl.toFixed(3)} HL` 
                  : `${totalAllSols} Sols.`
            }</span>
          </div>
          
          <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex shadow-inner">
            {/* Approved segment */}
            <div 
              style={{ width: `${Math.max(0.5, metricView === "value" ? pctApprovedValor : metricView === "volume" ? pctApprovedHl : pctApprovedSols)}%` }}
              className={`bg-emerald-500 h-full transition-all duration-500 relative group ${
                (metricView === "value" ? pctApprovedValor : metricView === "volume" ? pctApprovedHl : pctApprovedSols) === 0 ? "hidden" : ""
              }`}
              title={`Aprovado: ${(metricView === "value" ? pctApprovedValor : metricView === "volume" ? pctApprovedHl : pctApprovedSols).toFixed(1)}%`}
            />
            {/* Pending segment */}
            <div 
              style={{ width: `${Math.max(0.5, metricView === "value" ? pctPendingValor : metricView === "volume" ? pctPendingHl : pctPendingSols)}%` }}
              className={`bg-amber-500 h-full transition-all duration-500 ${
                (metricView === "value" ? pctPendingValor : metricView === "volume" ? pctPendingHl : pctPendingSols) === 0 ? "hidden" : ""
              }`}
              title={`Pendente: ${(metricView === "value" ? pctPendingValor : metricView === "volume" ? pctPendingHl : pctPendingSols).toFixed(1)}%`}
            />
            {/* Rejected segment */}
            <div 
              style={{ width: `${Math.max(0.5, metricView === "value" ? pctRejectedValor : metricView === "volume" ? pctRejectedHl : pctRejectedSols)}%` }}
              className={`bg-rose-500 h-full transition-all duration-500 ${
                (metricView === "value" ? pctRejectedValor : metricView === "volume" ? pctRejectedHl : pctRejectedSols) === 0 ? "hidden" : ""
              }`}
              title={`Reprovado: ${(metricView === "value" ? pctRejectedValor : metricView === "volume" ? pctRejectedHl : pctRejectedSols).toFixed(1)}%`}
            />
            {/* Recadastrar segment */}
            <div 
              style={{ width: `${Math.max(0.5, metricView === "value" ? pctRecadastrarValor : metricView === "volume" ? pctRecadastrarHl : pctRecadastrarSols)}%` }}
              className={`bg-indigo-500 h-full transition-all duration-500 ${
                (metricView === "value" ? pctRecadastrarValor : metricView === "volume" ? pctRecadastrarHl : pctRecadastrarSols) === 0 ? "hidden" : ""
              }`}
              title={`Recadastrar: ${(metricView === "value" ? pctRecadastrarValor : metricView === "volume" ? pctRecadastrarHl : pctRecadastrarSols).toFixed(1)}%`}
            />
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[10px] font-semibold text-slate-400 pt-1">
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded bg-emerald-500 block" />
              <span>Aprovadas ({(metricView === "value" ? pctApprovedValor : metricView === "volume" ? pctApprovedHl : pctApprovedSols).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded bg-amber-500 block" />
              <span>Pendentes ({(metricView === "value" ? pctPendingValor : metricView === "volume" ? pctPendingHl : pctPendingSols).toFixed(1)}%)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded bg-rose-500 block" />
              <span>Reprovadas ({(metricView === "value" ? pctRejectedValor : metricView === "volume" ? pctRejectedHl : pctRejectedSols).toFixed(1)}%)</span>
            </div>
            {totalAllValor > 0 && dashStats.bRecadastrarValor > 0 && (
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded bg-indigo-500 block" />
                <span>Recadastrar ({(metricView === "value" ? pctRecadastrarValor : metricView === "volume" ? pctRecadastrarHl : pctRecadastrarSols).toFixed(1)}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Approved Card */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-emerald-950/40 hover:border-emerald-900/40 transition-colors space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Aprovado</h4>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Valor Consumido:</span>
                <span className="font-semibold text-emerald-400 font-mono">{formatCurrency(dashStats.bApprovedValor)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Volume Físico:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bApprovedHl.toFixed(3)} HL</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Solicitações:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bApprovedSolsCount} Sols</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-900/80 flex justify-between text-[10px] text-slate-400">
              <span>Proporção (Valor):</span>
              <span className="text-emerald-400 font-bold font-mono">{pctApprovedValor.toFixed(1)}%</span>
            </div>
          </div>

          {/* Pending Card */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-amber-950/40 hover:border-amber-900/40 transition-colors space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pendente</h4>
              </div>
              <HelpCircle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Valor Retido:</span>
                <span className="font-semibold text-amber-400 font-mono">{formatCurrency(dashStats.bPendingValor)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Volume Físico:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bPendingHl.toFixed(3)} HL</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Solicitações:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bPendingSolsCount} Sols</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-900/80 flex justify-between text-[10px] text-slate-400">
              <span>Proporção (Valor):</span>
              <span className="text-amber-400 font-bold font-mono">{pctPendingValor.toFixed(1)}%</span>
            </div>
          </div>

          {/* Rejected Card */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-rose-950/40 hover:border-rose-900/40 transition-colors space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Reprovado</h4>
              </div>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Valor Recusado:</span>
                <span className="font-semibold text-rose-400 font-mono">{formatCurrency(dashStats.bRejectedValor)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Volume Físico:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bRejectedHl.toFixed(3)} HL</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Solicitações:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bRejectedSolsCount} Sols</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-900/80 flex justify-between text-[10px] text-slate-400">
              <span>Proporção (Valor):</span>
              <span className="text-rose-400 font-bold font-mono">{pctRejectedValor.toFixed(1)}%</span>
            </div>
          </div>

          {/* Recadastrar Card */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-indigo-950/40 hover:border-indigo-900/40 transition-colors space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Recadastrar</h4>
              </div>
              <RefreshCw className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Valor Pendente:</span>
                <span className="font-semibold text-indigo-400 font-mono">{formatCurrency(dashStats.bRecadastrarValor)}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Volume Físico:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bRecadastrarHl.toFixed(3)} HL</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Solicitações:</span>
                <span className="font-semibold text-slate-200 font-mono">{dashStats.bRecadastrarSolsCount} Sols</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-900/80 flex justify-between text-[10px] text-slate-400">
              <span>Proporção (Valor):</span>
              <span className="text-indigo-400 font-bold font-mono">{pctRecadastrarValor.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Orders list */}
        <div className={`space-y-4 ${ (viewMode !== "duplicates" && (isGroupedView ? activeGroupedSol : activeDetailRecord)) ? "lg:col-span-7" : "lg:col-span-12"}`}>
          {viewMode === "duplicates" ? (
            <div className="space-y-6">
              {filteredDuplicateGroups.length === 0 ? (
                <div className="bg-slate-900/90 text-center py-16 rounded-2xl border border-slate-850 text-slate-400 font-mono text-xs">
                  Nenhum conflito de duplicidade encontrado para os filtros selecionados.
                </div>
              ) : (
                filteredDuplicateGroups.map((g, gIdx) => {
                  return (
                  <div key={g.key} className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 space-y-4 shadow-2xl animate-fade-in">
                    {/* Duplicate Group Header */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between border-b border-slate-800 pb-3 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-amber-950/80 text-amber-400 text-[10px] font-bold rounded border border-amber-900/40">
                            CONFLITO #{gIdx + 1}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            Cód. Cliente (NB): <strong className="text-white">{g.codigoCliente}</strong>
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white font-display">
                          {g.nomeCliente}
                        </h3>
                      </div>
                      <div className="text-left md:text-right">
                        <span className="px-2.5 py-1 bg-blue-950/80 border border-blue-900/40 text-blue-400 text-xs font-mono font-semibold rounded-lg">
                          {g.solicitations.length} solicitações idênticas em um período de 30 dias
                        </span>
                      </div>
                    </div>

                    {/* Side-by-Side Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {g.solicitations.map((sol: any) => {
                        const statusLower = sol.status.toLowerCase().trim();
                        return (
                          <div key={sol.solicitacao} className={`bg-slate-950 p-4 rounded-xl border flex flex-col justify-between space-y-4 transition-all duration-200 ${
                            statusLower.includes("aprov") 
                              ? "border-emerald-900 bg-emerald-950/5 shadow-md" 
                              : statusLower.includes("reprov")
                              ? "border-slate-900 opacity-60 bg-slate-950/20"
                              : "border-slate-800 hover:border-slate-700"
                          }`}>
                            {/* Request details */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <span className="px-2 py-0.5 bg-slate-900 text-slate-300 text-[10px] font-bold rounded font-mono border border-slate-850">
                                    SOLICITAÇÃO #{sol.solicitacao}
                                  </span>
                                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                                    Data: {sol.dataSolicitacao}
                                  </p>
                                </div>
                                {getStatusBadge(sol.status)}
                              </div>

                              {/* Logistics details */}
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-mono text-slate-400 bg-slate-900/40 p-2 rounded-lg">
                                <div>Setor: <strong className="text-slate-200">{sol.setorVenda}</strong></div>
                                <div>Mapa: <strong className="text-slate-200">{sol.mapa || "N/A"}</strong></div>
                                <div className="col-span-2 truncate font-sans">Justificativa: <strong className="text-slate-200 font-sans">{sol.records[0]?.justificativa || "N/A"}</strong></div>
                                <div className="col-span-2 truncate">Nota Fiscal: <strong className="text-slate-200">{sol.nf || "Não Informada"}</strong></div>
                              </div>

                              {/* Product list inside the card */}
                              <div className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-lg space-y-2">
                                <div className="text-[10px] text-slate-500 font-mono font-semibold uppercase tracking-wider">Produtos ({sol.records.length})</div>
                                <div className="space-y-1.5 divide-y divide-slate-800/50">
                                  {sol.records.map((item: any, idx: number) => (
                                    <div key={item.id} className={`${idx > 0 ? "pt-1.5" : ""} text-[11px] font-mono flex flex-col justify-between`}>
                                      <div className="text-blue-300 font-bold leading-tight">
                                        [{item.produto}] {item.descricaoProduto}
                                      </div>
                                      <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                                        <span>Qtd: <strong className="text-emerald-400">{item.quantidade} {item.um}</strong></span>
                                        <span>Total: <strong className="text-slate-200">{formatCurrency(item.valorTotal)}</strong></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Recommendation Banner */}
                              <div className={`p-2.5 rounded-lg border text-[11px] leading-relaxed font-semibold ${sol.adviceColor}`}>
                                {sol.adviceText}
                              </div>
                            </div>

                            {/* Interactive Resolution Actions */}
                            <div className="pt-3 border-t border-slate-900/85 flex items-center justify-between gap-2">
                              <div className="text-[10px] font-mono text-slate-500">
                                Total: <span className="font-bold text-slate-300">{formatCurrency(sol.totalValue)}</span>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                {!statusLower.includes("aprov") && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sol.records.forEach((rec: any) => {
                                        if (!rec.status.toLowerCase().includes("aprov")) {
                                          onUpdateRecordStatus(rec.id, "Aprovada", "Aprovado via análise de duplicatas (SSTR)");
                                        }
                                      });
                                    }}
                                    className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-950/60 border border-emerald-900 text-emerald-400 hover:text-emerald-300 rounded text-[10px] font-bold cursor-pointer transition-all"
                                  >
                                    Aprovar
                                  </button>
                                )}
                                {!statusLower.includes("reprov") && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sol.records.forEach((rec: any) => {
                                        if (!rec.status.toLowerCase().includes("reprov")) {
                                          onUpdateRecordStatus(rec.id, "Reprovada", "Duplicata reprovada no Promax");
                                        }
                                      });
                                    }}
                                    className="px-2.5 py-1 bg-red-950 hover:bg-red-950/60 border border-red-900 text-red-400 hover:text-red-300 rounded text-[10px] font-bold cursor-pointer transition-all"
                                  >
                                    Reprovar no Promax
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
              <div className={`grid gap-5 ${
                (viewMode !== "duplicates" && (isGroupedView ? activeGroupedSol : activeDetailRecord))
                  ? "grid-cols-1 xl:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              }`}>
                {isGroupedView ? (
                paginatedGroupedSolicitations.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4 bg-slate-900/90 text-center py-16 rounded-2xl border border-slate-850 text-slate-400 font-mono text-xs">
                    Nenhuma solicitação encontrada para os filtros selecionados.
                  </div>
                ) : (
                  paginatedGroupedSolicitations.map((g) => {
                    const isSelected = activeGroupedSol?.solicitacao === g.solicitacao;
                    const isDuplicate = duplicateSolicitationIds.has(g.solicitacao);
                    const firstRec = g.records[0] || {};
                    return (
                      <div
                        key={g.solicitacao}
                        onClick={() => openGroupedDetails(g)}
                        className={`bg-slate-900/95 p-5 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 @container ${
                          isSelected
                            ? "border-blue-600 ring-4 ring-blue-500/10 bg-slate-900"
                            : isDuplicate
                            ? "border-red-500 bg-gradient-to-b from-slate-900 to-red-950/5 hover:border-red-450"
                            : "border-slate-800 hover:border-slate-700/80"
                        }`}
                      >
                        <div className="grid grid-cols-1 @md:grid-cols-12 gap-4">
                          
                          {/* Left Column: Core Info & Products */}
                          <div className="@md:col-span-7 flex flex-col justify-between space-y-4">
                            
                            {/* Header */}
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-slate-950 text-blue-400 text-[10px] font-bold rounded font-mono border border-slate-850 shrink-0">
                                    SETOR {g.setorVenda}
                                  </span>
                                  {isDuplicate && (
                                    <span className="px-2 py-0.5 bg-red-950/80 text-red-400 text-[10px] font-bold rounded font-mono border border-red-900/40 animate-pulse flex items-center space-x-1 shrink-0">
                                      <AlertTriangle className="w-3 h-3 text-red-455 shrink-0" />
                                      <span>Duplicata</span>
                                    </span>
                                  )}
                                </div>
                                <span className="shrink-0">{getStatusBadge(g.status, g.solicitacao)}</span>
                              </div>
                              <h4 className="text-sm font-bold text-white line-clamp-1 font-display">
                                {g.nomeCliente}
                              </h4>
                              <p className="text-slate-400 text-xs font-mono">
                                Cliente Cód: <span className="font-semibold text-slate-300">{g.codigoCliente}</span>
                              </p>
                            </div>

                            {/* Product & Quantity details */}
                            <div className="bg-slate-950 rounded-xl border border-slate-850 divide-y divide-slate-900/80 overflow-hidden">
                              <div className="px-3 py-1.5 bg-slate-900/45 border-b border-slate-850 flex justify-between items-center">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">Itens ({g.records.length})</span>
                                {g.records.length > 1 && (
                                  <span className="text-[9px] bg-blue-900/50 text-blue-300 border border-blue-850 px-1.5 py-0.5 rounded-md font-bold font-mono">
                                    Agrupado
                                  </span>
                                )}
                              </div>
                              <div className="p-2 space-y-1.5 max-h-[120px] overflow-y-auto">
                                {g.records.map((itemRec: any, index: number) => (
                                  <div key={index} className="flex justify-between items-center text-[11px] font-mono py-0.5">
                                    <div className="truncate max-w-[70%]">
                                      <span className="text-slate-500 font-semibold">[{itemRec.produto}]</span>{" "}
                                      <span className="text-slate-300">{itemRec.descricaoProduto}</span>
                                    </div>
                                    <div className="text-right shrink-0 ml-1">
                                      <span className="text-blue-400 font-semibold">{itemRec.quantidade} {itemRec.um}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Footer Values */}
                            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-850/60">
                              <div className="text-slate-400 text-[10px] font-mono">
                                Solic: <span className="font-bold text-blue-400">{g.solicitacao}</span> | <span className="text-slate-300">{g.dataSolicitacao}</span>
                              </div>
                              <div className="text-right font-mono">
                                <span className="text-[9px] text-slate-500 mr-1">Soma:</span>
                                <span className="font-bold text-emerald-400 text-sm">
                                  {formatCurrency(g.totalValue)}
                                </span>
                              </div>
                            </div>

                          </div>

                          {/* Right Column: Logistics Details (Mais uma Coluna) */}
                          <div className="@md:col-span-5 bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/60 flex flex-col justify-between space-y-3 text-[11px] font-mono text-slate-400">
                            <div className="space-y-2.5">
                              <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5 gap-2">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider shrink-0">Logística</span>
                                <span className="text-slate-300 font-semibold text-[9px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">Série: {firstRec.serie || "S/S"}</span>
                              </div>
                              
                              {firstRec.nomeMotorista && (
                                <div className="space-y-0.5">
                                  <span className="text-[9px] uppercase text-slate-500 font-bold block">Motorista:</span>
                                  <span className="text-slate-300 font-sans font-medium line-clamp-1 truncate block">{firstRec.nomeMotorista}</span>
                                </div>
                              )}

                              {firstRec.mapa && (
                                <div className="flex items-center justify-between pt-1 border-t border-slate-900/30">
                                  <span>Mapa: <strong className="text-slate-300 font-semibold">{firstRec.mapa}</strong></span>
                                  {firstRec.nf && <span>NF: <strong className="text-slate-300 font-semibold">{firstRec.nf}</strong></span>}
                                </div>
                              )}

                              {firstRec.justificativa && (
                                <div className="pt-2 border-t border-slate-900/40 font-sans">
                                  <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Motivos:</p>
                                  <div className="text-slate-300 text-xs leading-relaxed line-clamp-2 mt-1 italic space-y-0.5">
                                    {Array.from(new Set(g.records.map((r: any) => r.justificativa))).slice(0, 2).map((just: any, i) => (
                                      <p key={i} className="truncate">• "{just}"</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Column Footer */}
                            <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-900/40 pt-2 font-sans shrink-0">
                              <span>Regs: <strong className="font-semibold text-slate-400">{g.records.length} itens</strong></span>
                              {firstRec.gv && <span className="bg-blue-950/40 text-blue-400 border border-blue-900/30 px-1.5 py-0.5 rounded font-mono text-[9px]">{firstRec.gv}</span>}
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                paginatedIndividualRecords.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4 bg-slate-900/90 text-center py-16 rounded-2xl border border-slate-850 text-slate-400 font-mono text-xs">
                    Nenhum registro de troca encontrado para os filtros selecionados.
                  </div>
                ) : (
                  paginatedIndividualRecords.map((r) => {
                    const isSelected = activeDetailRecord?.id === r.id;
                    const isDuplicate = duplicateSolicitationIds.has(r.solicitacao);
                    return (
                      <div
                        key={r.id}
                        onClick={() => openRecordDetails(r)}
                        className={`bg-slate-900/95 p-5 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 @container ${
                          isSelected
                            ? "border-blue-600 ring-4 ring-blue-500/10 bg-slate-900"
                            : "border-slate-800 hover:border-slate-700/80"
                        }`}
                      >
                        <div className="grid grid-cols-1 @md:grid-cols-12 gap-4">
                          
                          {/* Left Column: Client & Product Info */}
                          <div className="@md:col-span-7 flex flex-col justify-between space-y-4">
                            
                            {/* Header */}
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-slate-950 text-blue-400 text-[10px] font-bold rounded font-mono border border-slate-850 shrink-0">
                                    SETOR {r.setorVenda}
                                  </span>
                                  {isDuplicate && (
                                    <span className="px-2 py-0.5 bg-red-950/80 text-red-400 text-[10px] font-bold rounded font-mono border border-red-900/40 shrink-0">
                                      Duplicata
                                    </span>
                                  )}
                                </div>
                                <span className="shrink-0">{getStatusBadge(r.status, r.solicitacao)}</span>
                              </div>
                              <h4 className="text-sm font-bold text-white line-clamp-1 font-display">
                                {r.nomeCliente}
                              </h4>
                              <p className="text-slate-400 text-xs font-mono">
                                Cliente Cód: <span className="font-semibold text-slate-300">{r.codigoCliente}</span>
                              </p>
                            </div>

                            {/* Product & Quantity details */}
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850">
                              <p className="text-xs font-semibold text-slate-200 truncate">{r.descricaoProduto}</p>
                              <div className="flex justify-between items-center mt-1.5 text-[10px] text-slate-400 font-mono">
                                <span>Cód: <span className="font-semibold text-slate-300">{r.produto}</span></span>
                                <span className="text-blue-400 font-bold text-xs">{r.quantidade} {r.um}</span>
                              </div>
                            </div>

                            {/* Footer Values */}
                            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-850/60">
                              <div className="text-slate-400 text-[10px] font-mono">
                                Solic: <span className="font-semibold text-slate-300">{r.solicitacao}</span> | <span className="text-slate-300">{r.dataSolicitacao}</span>
                              </div>
                              <span className="font-bold text-blue-400 font-mono text-sm">
                                {formatCurrency(r.valorTotal)}
                              </span>
                            </div>

                          </div>

                          {/* Right Column: Logistics Details (Mais uma Coluna) */}
                          <div className="@md:col-span-5 bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/60 flex flex-col justify-between space-y-3 text-[11px] font-mono text-slate-400">
                            <div className="space-y-2.5">
                              <div className="flex justify-between items-center border-b border-slate-900/60 pb-1.5 gap-2">
                                <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider shrink-0">Logística</span>
                                <span className="text-slate-300 font-semibold text-[9px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">Série: {r.serie || "S/S"}</span>
                              </div>
                              
                              {r.nomeMotorista && (
                                <div className="space-y-0.5">
                                  <span className="text-[9px] uppercase text-slate-500 font-bold block">Motorista:</span>
                                  <span className="text-slate-300 font-sans font-medium line-clamp-1 truncate block">{r.nomeMotorista}</span>
                                </div>
                              )}

                              {r.mapa && (
                                <div className="flex items-center justify-between pt-1 border-t border-slate-900/30">
                                  <span>Mapa: <strong className="text-slate-300 font-semibold">{r.mapa}</strong></span>
                                  {r.nf && <span>NF: <strong className="text-slate-300 font-semibold">{r.nf}</strong></span>}
                                </div>
                              )}

                              {r.justificativa && (
                                <div className="pt-2 border-t border-slate-900/40 font-sans">
                                  <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Motivo / Justificativa:</p>
                                  <p className="text-slate-300 text-xs leading-relaxed line-clamp-2 mt-1 italic">
                                    "{r.justificativa}"
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Column Footer */}
                            <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-900/40 pt-2 font-sans shrink-0">
                              <span>ID: <strong className="font-semibold text-slate-400">{r.id}</strong></span>
                              {r.gv && <span className="bg-blue-950/40 text-blue-400 border border-blue-900/30 px-1.5 py-0.5 rounded font-mono text-[9px]">{r.gv}</span>}
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })
                )
              )}
            </div>

            {/* Pagination controls for main lists */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-lg mt-6 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3.5 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-40 disabled:hover:border-slate-800 text-slate-300 rounded-xl transition-all cursor-pointer flex items-center space-x-1"
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span>Anterior</span>
                </button>
                <span className="text-slate-400 font-medium">
                  Página <strong className="text-white font-bold">{currentPage}</strong> de <strong className="text-white font-bold">{totalPages}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3.5 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-40 disabled:hover:border-slate-800 text-slate-300 rounded-xl transition-all cursor-pointer flex items-center space-x-1"
                >
                  <span>Próxima</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            )}
            </>
          )}
        </div>

        {/* Audit Sheet Sidebar */}
        {viewMode !== "duplicates" && (isGroupedView ? activeGroupedSol : activeDetailRecord) && (
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 shadow-2xl p-6 rounded-2xl space-y-6 sticky top-4 animate-fade-in print-break-inside-none">
            {/* Drawer header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-850">
              <div>
                <span className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold font-mono">
                  SOLICITAÇÃO #{isGroupedView ? activeGroupedSol.solicitacao : activeDetailRecord?.solicitacao}
                </span>
                <h3 className="text-lg font-bold font-display text-white mt-1.5">Ficha de Auditoria</h3>
              </div>
              <button
                onClick={() => {
                  setActiveDetailRecord(null);
                  setActiveGroupedSol(null);
                }}
                className="p-1.5 bg-slate-950 hover:bg-slate-850 text-slate-400 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Audit body details */}
            <div className="space-y-5 text-xs max-h-[500px] overflow-y-auto pr-1 text-slate-200">
              
              {/* Product and Cost block */}
              {isGroupedView && activeGroupedSol ? (
                <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-850">
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest font-mono">Produtos Solicitados ({activeGroupedSol.records.length})</p>
                  <div className="divide-y divide-slate-900/80 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {activeGroupedSol.records.map((r: any, rIdx: number) => (
                      <div key={rIdx} className="pt-2 first:pt-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-white text-xs">{r.descricaoProduto}</h4>
                            <p className="text-slate-500 font-mono text-[9px] mt-0.5">Código: {r.produto} | {r.um}</p>
                          </div>
                          <span className="text-blue-400 font-mono font-bold text-xs shrink-0 ml-2">{r.quantidade} {r.um}</span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-1">
                          <span>Unitário: {formatCurrency(r.valorUnitario)}</span>
                          <span>Subtotal: <strong className="text-slate-300">{formatCurrency(r.valorTotal)}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center font-mono text-xs">
                    <span className="text-[10px] uppercase text-slate-400 font-sans font-semibold">Soma Total Repasse</span>
                    <span className="font-bold text-emerald-450 text-sm">{formatCurrency(activeGroupedSol.totalValue)}</span>
                  </div>
                </div>
              ) : (
                activeDetailRecord && (
                  <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-850">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest font-mono">Produto Solicitado</p>
                    <div>
                      <h4 className="font-bold text-white text-sm">{activeDetailRecord.descricaoProduto}</h4>
                      <p className="text-slate-400 font-mono text-[10px] mt-0.5">Código do Produto: {activeDetailRecord.produto} | Medida: {activeDetailRecord.um}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 font-mono">
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Quantidade</span>
                        <span className="font-bold text-white text-xs">{activeDetailRecord.quantidade}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Unitário</span>
                        <span className="font-bold text-white text-xs">{formatCurrency(activeDetailRecord.valorUnitario)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Total Repasse</span>
                        <span className="font-bold text-blue-400 text-xs">{formatCurrency(activeDetailRecord.valorTotal)}</span>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Justification of repasse */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Justificativa</span>
                  <span className="font-semibold text-white text-xs mt-1 block">
                    {isGroupedView ? activeGroupedSol?.records[0]?.justificativa || "Produto Avariado" : activeDetailRecord?.justificativa || "Produto Avariado"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Setor de Venda</span>
                  <span className="font-mono font-semibold text-slate-300 text-xs mt-1 block">
                    Setor {isGroupedView ? activeGroupedSol?.setorVenda : activeDetailRecord?.setorVenda}
                  </span>
                </div>
              </div>

              {/* Client specifications */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Cliente Destinatário</span>
                <p className="font-semibold text-white text-xs">
                  {isGroupedView ? activeGroupedSol?.nomeCliente : activeDetailRecord?.nomeCliente}
                </p>
                <p className="text-slate-400 text-[10px] font-mono">
                  Código do Cliente: {isGroupedView ? activeGroupedSol?.codigoCliente : activeDetailRecord?.codigoCliente}
                </p>
              </div>

              {/* Status and Actions taken by staff */}
              <div className="space-y-1.5 pt-3 border-t border-slate-850">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-mono">Status e Resolução</span>
                <div className="flex items-center space-x-2">
                  {getStatusBadge(isGroupedView ? activeGroupedSol?.status : (activeDetailRecord?.status || ""))}
                  <span className="text-[10px] text-slate-400 font-mono">
                    NF/Série: <span className="font-semibold text-slate-200">
                      {isGroupedView ? activeGroupedSol?.records[0]?.nf || "Não Gerada" : activeDetailRecord?.nf || "Não Gerada"}
                    </span>
                  </span>
                </div>
                {(isGroupedView ? activeGroupedSol?.records[0]?.usuarioAcao : activeDetailRecord?.usuarioAcao) && (
                  <div className="bg-slate-950 p-2.5 rounded-lg text-[10px] text-slate-400 font-mono space-y-1">
                    <p className="flex items-center">
                      <UserCheck className="w-3 h-3 mr-1 text-blue-450" />
                      Ação por: {isGroupedView ? activeGroupedSol?.records[0]?.usuarioAcao : activeDetailRecord?.usuarioAcao}
                    </p>
                    <p className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1 text-slate-500" />
                      Data: {isGroupedView ? activeGroupedSol?.records[0]?.dataAcao : activeDetailRecord?.dataAcao} {isGroupedView ? (activeGroupedSol?.records[0]?.hora ? `às ${activeGroupedSol?.records[0]?.hora}` : "") : (activeDetailRecord?.hora ? `às ${activeDetailRecord?.hora}` : "")}
                    </p>
                  </div>
                )}
              </div>

              {/* Logistical data */}
              <div className="space-y-2 pt-3 border-t border-slate-850 font-mono text-[10px]">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block font-sans font-semibold">Logística & Entrega (Pau Brasil)</span>
                
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-850">
                  <div>
                    <span className="text-slate-400 block text-[9px]">MOTORISTA:</span>
                    <span className="font-bold text-slate-200 truncate block">
                      {isGroupedView ? activeGroupedSol?.records[0]?.nomeMotorista || "Não Informado" : activeDetailRecord?.nomeMotorista || "Não Informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px]">VEÍCULO / PLACA:</span>
                    <span className="font-bold text-slate-200 block">
                      {isGroupedView ? (activeGroupedSol?.records[0]?.placa ? `${activeGroupedSol?.records[0]?.veiculo || ""} (${activeGroupedSol?.records[0]?.placa})` : "Não Informado") : (activeDetailRecord?.placa ? `${activeDetailRecord.veiculo || ""} (${activeDetailRecord.placa})` : "Não Informado")}
                    </span>
                  </div>
                  <div className="mt-2 text-wrap col-span-2">
                    <span className="text-slate-400 block text-[9px]">TRANSPORTADORA:</span>
                    <span className="font-bold text-slate-200 block line-clamp-1">
                      {isGroupedView ? activeGroupedSol?.records[0]?.nomeTransportadora || "Não Informada" : activeDetailRecord?.nomeTransportadora || "Não Informada"}
                    </span>
                  </div>
                  <div className="mt-2 col-span-2">
                    <span className="text-slate-400 block text-[9px]">MAPA / PEDIDO:</span>
                    <span className="font-bold text-slate-200 block">
                      Mapa {isGroupedView ? activeGroupedSol?.mapa || "Falta" : activeDetailRecord?.mapa || "Falta"}
                    </span>
                  </div>
                  <div className="mt-2 font-sans text-[10px] col-span-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400 block text-[9px] font-mono">CONFERENTE RETIRADA:</span>
                        <span className="font-bold text-slate-200 block">
                          {isGroupedView ? activeGroupedSol?.records[0]?.conferente || "Não Declarado" : activeDetailRecord?.conferente || "Não Declarado"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] font-mono">CONFERENTE CARREGAMENTO:</span>
                        <span className="font-bold text-slate-200 block">
                          {isGroupedView ? activeGroupedSol?.records[0]?.conferenteCarregamento || "Não Declarado" : activeDetailRecord?.conferenteCarregamento || "Não Declarado"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Update Form Panel for Gestores */}
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-4 shadow-inner">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest font-mono">
                  Gerenciar Status {isGroupedView ? "da Solicitação" : "do Pedido"}
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block uppercase font-mono mb-1 font-semibold font-sans">Alterar para Status:</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "Aprovada", label: "Aprovar" },
                        { id: "Pendente", label: "Pendente" },
                        { id: "Reprovada", label: "Reprovar" }
                      ].map(act => (
                        <button
                          key={act.id}
                          type="button"
                          onClick={() => setReviewStatus(act.id)}
                          className={`px-2 py-1.5 rounded text-xs font-semibold text-center cursor-pointer transition-all border ${
                            reviewStatus === act.id
                              ? "bg-blue-600 text-white border-blue-500 font-bold"
                              : "bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800"
                          }`}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block uppercase font-mono mb-1 font-semibold font-sans">Obs Interna / Comentário:</label>
                    <textarea
                      rows={2}
                      value={reviewObs}
                      onChange={(e) => setReviewObs(e.target.value)}
                      placeholder="Adicione notas de auditoria, número da nova nota gerada, ou motivo da alteração..."
                      className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded p-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyStatusChange}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer text-center shadow-lg shadow-blue-900/40"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
