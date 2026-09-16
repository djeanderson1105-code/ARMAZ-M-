import React, { useState, useMemo } from "react";
import { PendingRequest, calculateValeRateio, isDriverX } from "../types";
import { ValeEntry } from "./ValesHistoryDashboard";
import { 
  getProductDescription, 
  getProductCatalogInfo, 
  getProductByCodeOrName,
  getProductBoxPrice,
  calculateRequestValueAndHL,
  calculateItemValue,
  calculateItemHL,
  classifyShortageErrorType
} from "../data/products";
import { 
  ChevronDown, 
  ChevronRight, 
  Package, 
  Truck, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  Layers, 
  Search, 
  FileSpreadsheet, 
  FileText, 
  UserCheck, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  Info,
  Maximize2,
  Minimize2,
  FolderTree,
  Tag,
  ArrowUpDown,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  X,
  Filter,
  Check
} from "lucide-react";
import * as XLSX from "xlsx";

interface ShortageTreeBreakdownProps {
  requests: PendingRequest[];
  vales?: ValeEntry[];
  selectedMonth?: number | null; // 0 to 11, or null for all months
  onSelectMonth?: (month: number | null) => void;
  onSelectRequest?: (req: PendingRequest) => void;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

type SortCriteria = "val_desc" | "val_asc" | "hl_desc" | "qty_desc" | "date_desc" | "date_asc";

export default function ShortageTreeBreakdown({
  requests,
  vales = [],
  selectedMonth = null,
  onSelectMonth,
  onSelectRequest
}: ShortageTreeBreakdownProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<"all" | "carregamento" | "entrega">("all");
  const [sortBy, setSortBy] = useState<SortCriteria>("val_desc");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "cat_carregamento": true,
    "cat_entrega": true,
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val || 0);
  };

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeKey]: !prev[nodeKey]
    }));
  };

  const expandAll = () => {
    setExpandedNodes({
      "cat_carregamento": true,
      "cat_entrega": true
    });
  };

  const collapseAll = () => {
    setExpandedNodes({});
  };

  // Helper to extract month index from request
  const getRequestMonthIndex = (req: PendingRequest): number => {
    const dateStr = req.data || (req as any).createdAt || "";
    if (dateStr) {
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10) - 1;
          if (!isNaN(m) && m >= 0 && m <= 11) return m;
        }
      } else if (dateStr.includes("-")) {
        const parts = dateStr.split("-");
        if (parts.length >= 2) {
          const m = parseInt(parts[1], 10) - 1;
          if (!isNaN(m) && m >= 0 && m <= 11) return m;
        }
      }
    }
    if (req.timestamp) {
      return new Date(req.timestamp).getMonth();
    }
    return 0;
  };

  // Filter requests based on selected month, non-zero values, and search query
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const cast = req as any;
      const m = (req.motivo || "").toLowerCase();
      const isShortage = m.includes("falta") || m.includes("invers") || m.includes("swap") || m.includes("reposi") || cast.tipoRegistroFalta === true || !!cast.faltaTipoErro;
      if (!isShortage) return false;

      // Discard rejected/cancelled requests
      if (cast.status === "reprovado" || cast.status === "cancelado" || cast.statusPromax === "reprovado" || cast.statusPromax === "cancelado") {
        return false;
      }

      // Discard zero-value items as requested: "essses que estão com o valor zerado exclua"
      const val = req.valorTotal || 0;
      if (val <= 0) return false;

      // Month filter
      if (selectedMonth !== null && selectedMonth !== undefined) {
        const reqMonth = getRequestMonthIndex(req);
        if (reqMonth !== selectedMonth) return false;
      }

      // Category filter
      const errorType = classifyShortageErrorType(req);
      if (filterCategory === "carregamento" && errorType !== "carregamento") return false;
      if (filterCategory === "entrega" && errorType !== "entrega") return false;

      // Search term filter
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const resolvedDesc = getProductDescription(req.item || cast.itemCode || cast.produto, req.descricaoProduto).toLowerCase();
        const match = 
          resolvedDesc.includes(s) ||
          (req.descricaoProduto || "").toLowerCase().includes(s) ||
          (req.item || "").toLowerCase().includes(s) ||
          (req.nf || "").toLowerCase().includes(s) ||
          (req.mapa || "").toLowerCase().includes(s) ||
          (req.data || "").toLowerCase().includes(s) ||
          (cast.faltaMotorista || "").toLowerCase().includes(s) ||
          (cast.faltaAjudantes || "").toLowerCase().includes(s) ||
          (req.motivo || "").toLowerCase().includes(s) ||
          (req.observacao || "").toLowerCase().includes(s) ||
          (req.setor || "").toLowerCase().includes(s);
        if (!match) return false;
      }

      return true;
    });
  }, [requests, selectedMonth, filterCategory, searchTerm]);

  // Sort helper for individual items
  const sortItems = (items: PendingRequest[], sort: SortCriteria): PendingRequest[] => {
    return [...items].sort((a, b) => {
      const valA = a.valorTotal || 0;
      const valB = b.valorTotal || 0;
      const hlA = a.hectolitros || 0;
      const hlB = b.hectolitros || 0;
      const qtyA = a.quantidade || 0;
      const qtyB = b.quantidade || 0;
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;

      switch (sort) {
        case "val_desc":
          return valB - valA;
        case "val_asc":
          return valA - valB;
        case "hl_desc":
          return hlB - hlA;
        case "qty_desc":
          return qtyB - qtyA;
        case "date_asc":
          return timeA - timeB;
        case "date_desc":
        default:
          return timeB - timeA;
      }
    });
  };

  // Build Single-Branch Tree Structure for Carregamento and Descarregamento
  const treeData = useMemo(() => {
    let totalCarregamentoCount = 0;
    let totalCarregamentoHl = 0;
    let totalCarregamentoVal = 0;

    let totalDescarregamentoCount = 0;
    let totalDescarregamentoHl = 0;
    let totalDescarregamentoVal = 0;

    const carregamentoItems: PendingRequest[] = [];
    const descarregamentoItems: PendingRequest[] = [];

    filteredRequests.forEach(req => {
      const errorType = classifyShortageErrorType(req);
      const isCarregamento = errorType === "carregamento";
      const { valorTotal: calcVal, hectolitros: calcHl } = calculateRequestValueAndHL(req);
      const val = calcVal > 0 ? calcVal : (req.valorTotal || 0);
      const hl = calcHl > 0 ? calcHl : (req.hectolitros || 0);

      const normalizedReq: PendingRequest = {
        ...req,
        faltaTipoErro: errorType,
        valorTotal: val,
        hectolitros: hl
      };

      if (isCarregamento) {
        totalCarregamentoCount++;
        totalCarregamentoHl += hl;
        totalCarregamentoVal += val;
        carregamentoItems.push(normalizedReq);
      } else {
        totalDescarregamentoCount++;
        totalDescarregamentoHl += hl;
        totalDescarregamentoVal += val;
        descarregamentoItems.push(normalizedReq);
      }
    });

    const grandTotalCount = totalCarregamentoCount + totalDescarregamentoCount;
    const grandTotalHl = totalCarregamentoHl + totalDescarregamentoHl;
    const grandTotalVal = totalCarregamentoVal + totalDescarregamentoVal;

    const pctCarregamentoCount = grandTotalCount > 0 ? (totalCarregamentoCount / grandTotalCount) * 100 : 0;
    const pctDescarregamentoCount = grandTotalCount > 0 ? (totalDescarregamentoCount / grandTotalCount) * 100 : 0;
    const pctCarregamentoVal = grandTotalVal > 0 ? (totalCarregamentoVal / grandTotalVal) * 100 : 0;
    const pctDescarregamentoVal = grandTotalVal > 0 ? (totalDescarregamentoVal / grandTotalVal) * 100 : 0;

    const categories = [
      {
        id: "cat_carregamento",
        name: "1. ERROS DE CARREGAMENTO (ARMAZÉM / EXPEDIÇÃO CD)",
        badge: `Impacto CD: ${formatCurrency(totalCarregamentoVal)} (${pctCarregamentoVal.toFixed(0)}% do R$) • Sem Emissão de Vale`,
        type: "carregamento" as const,
        count: totalCarregamentoCount,
        hl: totalCarregamentoHl,
        val: totalCarregamentoVal,
        color: "blue",
        items: sortItems(carregamentoItems, sortBy)
      },
      {
        id: "cat_entrega",
        name: "2. ERROS DE DESCARREGAMENTO (ROTA / ENTREGA / VALES)",
        badge: `Impacto Rota: ${formatCurrency(totalDescarregamentoVal)} (${pctDescarregamentoVal.toFixed(0)}% do R$) • Rateio com Condutores`,
        type: "entrega" as const,
        count: totalDescarregamentoCount,
        hl: totalDescarregamentoHl,
        val: totalDescarregamentoVal,
        color: "amber",
        items: sortItems(descarregamentoItems, sortBy)
      }
    ];

    return {
      categories,
      grandTotalCount,
      grandTotalHl,
      grandTotalVal,
      totalCarregamentoCount,
      totalCarregamentoHl,
      totalCarregamentoVal,
      totalDescarregamentoCount,
      totalDescarregamentoHl,
      totalDescarregamentoVal,
      pctCarregamentoCount,
      pctDescarregamentoCount,
      pctCarregamentoVal,
      pctDescarregamentoVal
    };
  }, [filteredRequests, sortBy]);

  // Export stratified tree data to Excel
  const handleExportXLSX = () => {
    const rows: any[] = [];

    filteredRequests.forEach(req => {
      const cast = req as any;
      const errorType = classifyShortageErrorType(req);
      const isCarregamento = errorType === "carregamento";
      
      const monthIdx = getRequestMonthIndex(req);
      const monthName = MONTH_NAMES[monthIdx] || "";
      const driverName = (cast.faltaMotorista || "NÃO DECLARADO").toUpperCase();
      const isX = isDriverX(driverName);
      const resolvedDesc = getProductDescription(req.item || cast.itemCode || cast.produto, req.descricaoProduto);

      rows.push({
        "Mês": `${monthName} 2026`,
        "Categoria": isCarregamento ? "Erros de Carregamento (Armazém CD)" : "Erros de Descarregamento (Rota/Vales)",
        "Quando Foi (Data)": req.data || "",
        "Turno": cast.turno || "Diurno (Turno 1)",
        "NF": req.nf || "",
        "Mapa": req.mapa || "",
        "Setor / Rota": req.setor || "",
        "Código SKU": req.item || "",
        "Descrição Oficial Ambev": resolvedDesc,
        "Quantidade": req.quantidade || 1,
        "Unidade": req.unidadeMedida || "cx",
        "Volume (HL)": Number((req.hectolitros || 0).toFixed(2)),
        "Impacto Financeiro (R$)": Number((req.valorTotal || 0).toFixed(2)),
        "Motorista": driverName,
        "CPF Motorista": cast.faltaMotoristaCpf || "",
        "Ajudantes": cast.faltaAjudantes || "",
        "Motorista X (Isento)": isX ? "SIM" : "NÃO",
        "Status / Tratativa": isCarregamento ? "Regularizado no CD (Sem Vale)" : (cast.gerouVale ? "Vale Emitido / Rateio" : "Baixado"),
        "Motivo Detalhado": req.motivo || "",
        "Observação Operacional": req.observacao || ""
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const periodLabel = selectedMonth !== null && selectedMonth !== undefined ? MONTH_NAMES[selectedMonth] : "Ano_Inteiro_2026";
    XLSX.utils.book_append_sheet(wb, ws, "Estratificacao_Arvore");
    XLSX.writeFile(wb, `Estratificacao_Ocorrencias_SSTR_${periodLabel}.xlsx`);
  };

  return (
    <div id="shortage-tree-breakdown" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-2xl text-left">
      
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white font-mono uppercase tracking-wider flex items-center gap-2 flex-wrap">
                Estratificação em Árvore: Ocorrências & Impacto Financeiro
                {selectedMonth !== null && selectedMonth !== undefined ? (
                  <span className="px-2.5 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-lg text-xs font-bold font-mono">
                    📅 {MONTH_NAMES[selectedMonth]} 2026
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-indigo-950 border border-indigo-800 text-indigo-300 rounded-lg text-xs font-bold font-mono">
                    📅 Ano Inteiro (Jan - Dez 2026)
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">
                Estratificação com SKUs oficiais Ambev, segregação precisa (<strong>Carregamento CD</strong> vs <strong>Descarregamento Vales</strong>) e ordenação por impacto.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Export */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Expandir todos os ramos da árvore"
          >
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Expandir Árvore</span>
          </button>
          
          <button
            type="button"
            onClick={collapseAll}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-xl text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Recolher todos os ramos da árvore"
          >
            <Minimize2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Recolher</span>
          </button>

          <button
            type="button"
            onClick={handleExportXLSX}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs font-mono flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            title="Exportar dados estratificados para planilha Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span>Exportar XLSX</span>
          </button>
        </div>
      </div>

      {/* Interactive Date/Period Notification Banner (Active on Chart Click or Filter) */}
      {selectedMonth !== null && selectedMonth !== undefined && (
        <div className="bg-emerald-950/40 border border-emerald-700/60 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono text-emerald-200 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white uppercase block">
                Filtro Ativo: {MONTH_NAMES[selectedMonth]} de 2026
              </span>
              <span className="text-[11px] text-emerald-300/80">
                Mostrando {filteredRequests.length} ocorrência(s) • Total: {formatCurrency(treeData.grandTotalVal)} ({treeData.grandTotalHl.toFixed(2)} HL)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectMonth?.(null)}
            className="px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-white border border-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>Ver Todos os Meses (Ano Inteiro)</span>
          </button>
        </div>
      )}

      {/* Month Selection Quick Bar (Pills) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-2 rounded-2xl border border-slate-850">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase px-2 flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-400" />
          Mês:
        </span>
        <button
          type="button"
          onClick={() => onSelectMonth?.(null)}
          className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold cursor-pointer transition-colors ${
            selectedMonth === null ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white bg-slate-900/60"
          }`}
        >
          Ano Todo
        </button>
        {MONTH_ABBR.map((abbr, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectMonth?.(idx)}
            className={`px-2 py-1 rounded-xl text-xs font-mono cursor-pointer transition-colors ${
              selectedMonth === idx ? "bg-emerald-600 text-white font-black shadow ring-2 ring-emerald-400" : "text-slate-400 hover:text-white bg-slate-900/40"
            }`}
          >
            {abbr}
          </button>
        ))}
      </div>

      {/* KPI Cards for Selected Filter / Month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Carregamento Card */}
        <div className="bg-slate-950/90 border border-blue-900/40 rounded-2xl p-3.5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              1. Erros de Carregamento
            </span>
            <span className="px-1.5 py-0.5 bg-blue-950 border border-blue-800 text-blue-300 font-mono text-[9px] rounded font-bold">
              {treeData.pctCarregamentoVal.toFixed(0)}% do R$ • Armazém CD
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xl font-extrabold text-white font-mono">
              {formatCurrency(treeData.totalCarregamentoVal)}
            </span>
            <span className="text-xs font-mono text-blue-400 font-bold">
              {treeData.totalCarregamentoCount} caso(s) • {treeData.totalCarregamentoHl.toFixed(2)} HL
            </span>
          </div>
          <p className="text-[9.5px] text-slate-400">Regularizado na expedição • Sem geração de vale aos condutores</p>
        </div>

        {/* Descarregamento / Vales Card */}
        <div className="bg-slate-950/90 border border-amber-900/40 rounded-2xl p-3.5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-amber-400" />
              2. Descarregamento / Vales
            </span>
            <span className="px-1.5 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 font-mono text-[9px] rounded font-bold">
              {treeData.pctDescarregamentoVal.toFixed(0)}% do R$ • Rota / PDV
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xl font-extrabold text-white font-mono">
              {formatCurrency(treeData.totalDescarregamentoVal)}
            </span>
            <span className="text-xs font-mono text-amber-400 font-bold">
              {treeData.totalDescarregamentoCount} caso(s) • {treeData.totalDescarregamentoHl.toFixed(2)} HL
            </span>
          </div>
          <p className="text-[9.5px] text-slate-400">Vales emitidos com rateio entre motorista e ajudantes</p>
        </div>

        {/* Total Consolidado Card */}
        <div className="bg-slate-950/90 border border-emerald-900/40 rounded-2xl p-3.5 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Total Geral Consolidado
            </span>
            <span className="px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono text-[9px] rounded font-bold">
              Impacto 2026
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-xl font-extrabold text-emerald-400 font-mono">
              {formatCurrency(treeData.grandTotalVal)}
            </span>
            <span className="text-xs font-mono text-slate-300 font-bold">
              {treeData.grandTotalCount} caso(s) • {treeData.grandTotalHl.toFixed(2)} HL
            </span>
          </div>
          <p className="text-[9.5px] text-slate-400">Volume total e impacto financeiro somados no período</p>
        </div>
      </div>

      {/* Filters, Sorting & Search Toolbar */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-850">
        
        {/* Search input */}
        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar SKU, Produto, NF, Motorista..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sorting Controls (Do Maior para o Menor) */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
          
          {/* Order by Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-xl">
            <ArrowDownWideNarrow className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortCriteria)}
              className="bg-transparent text-xs text-slate-200 font-mono focus:outline-none cursor-pointer pr-1"
            >
              <option value="val_desc" className="bg-slate-900 text-white">💰 Maior Impacto R$ → Menor</option>
              <option value="val_asc" className="bg-slate-900 text-white">💰 Menor Impacto R$ → Maior</option>
              <option value="hl_desc" className="bg-slate-900 text-white">📦 Maior Volume HL → Menor</option>
              <option value="qty_desc" className="bg-slate-900 text-white">🔢 Maior Qtd (Caixas)</option>
              <option value="date_desc" className="bg-slate-900 text-white">📅 Data Mais Recente</option>
              <option value="date_asc" className="bg-slate-900 text-white">📅 Data Mais Antiga</option>
            </select>
          </div>

          {/* Error Type Filter */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilterCategory("all")}
              className={`px-2.5 py-1 text-xs font-mono rounded-xl cursor-pointer transition-colors ${
                filterCategory === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Todos ({treeData.grandTotalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory("carregamento")}
              className={`px-2.5 py-1 text-xs font-mono rounded-xl cursor-pointer transition-colors ${
                filterCategory === "carregamento" ? "bg-blue-600 text-white font-bold" : "text-blue-400 hover:text-white"
              }`}
            >
              Carregamento ({treeData.totalCarregamentoCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterCategory("entrega")}
              className={`px-2.5 py-1 text-xs font-mono rounded-xl cursor-pointer transition-colors ${
                filterCategory === "entrega" ? "bg-amber-600 text-white font-bold" : "text-amber-400 hover:text-white"
              }`}
            >
              Descarregamento ({treeData.totalDescarregamentoCount})
            </button>
          </div>
        </div>
      </div>

      {/* TREE VIEW TABLE (Estrutura em Árvore Hierárquica) */}
      <div className="space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="p-10 text-center bg-slate-950/60 rounded-2xl border border-slate-850 space-y-2">
            <Info className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-mono text-slate-400">Nenhuma ocorrência encontrada para os filtros selecionados.</p>
            <button
              onClick={() => {
                setSearchTerm("");
                setFilterCategory("all");
                onSelectMonth?.(null);
              }}
              className="text-xs text-emerald-400 hover:underline font-mono"
            >
              Limpar todos os filtros
            </button>
          </div>
        ) : (
          treeData.categories.map((cat) => {
            if (filterCategory !== "all" && filterCategory !== cat.type) return null;
            const isCatExpanded = !!expandedNodes[cat.id];
            const isCarregamento = cat.type === "carregamento";

            return (
              <div 
                key={cat.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isCarregamento 
                    ? "bg-slate-950/80 border-blue-900/40" 
                    : "bg-slate-950/80 border-amber-900/40"
                }`}
              >
                {/* LEVEL 1: Category Header Node */}
                <div
                  onClick={() => toggleNode(cat.id)}
                  className={`p-3.5 flex items-center justify-between cursor-pointer select-none transition-colors ${
                    isCarregamento ? "hover:bg-blue-950/30" : "hover:bg-amber-950/30"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-white shrink-0 ${
                        isCarregamento ? "bg-blue-600" : "bg-amber-600"
                      }`}
                    >
                      {isCatExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className={`text-xs font-mono font-black uppercase tracking-wider ${
                          isCarregamento ? "text-blue-400" : "text-amber-400"
                        }`}>
                          {cat.name}
                        </strong>
                        <span className="text-[9px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-300 rounded-md font-mono font-bold">
                          {cat.badge}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Level 1 Subtotals */}
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div className="hidden sm:block">
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {cat.count} ocorrência(s) • {cat.hl.toFixed(2)} HL
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-emerald-400 font-mono block">
                        {formatCurrency(cat.val)}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 sm:hidden">
                        {cat.count} casos
                      </span>
                    </div>
                  </div>
                </div>

                {/* LEVEL 1 Leaf Table (Direct Stratification for Carregamento or Descarregamento) */}
                {isCatExpanded && (
                  <div className="border-t border-slate-850 p-2 sm:p-3 bg-slate-950/40">
                    {cat.items.length === 0 ? (
                      <p className="text-xs text-slate-500 font-mono p-3">Nenhum registro com custo financeiro nesta ramificação.</p>
                    ) : (
                      <div className="overflow-x-auto bg-slate-900/90 border border-slate-850 rounded-xl overflow-hidden shadow-inner">
                        <table className="w-full text-left text-xs font-sans">
                          <thead className="bg-slate-950/90 text-[10px] font-mono uppercase tracking-wider text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2.5 px-3">Quando Foi (Data/Turno)</th>
                              <th className="py-2.5 px-3">O Que Foi (SKU & Descrição Real)</th>
                              <th className="py-2.5 px-3">Documento / Setor</th>
                              <th className="py-2.5 px-3">Envolvidos / Responsáveis</th>
                              <th className="py-2.5 px-3 text-right">Qtd / HL</th>
                              <th className="py-2.5 px-3 text-right">Impacto Financeiro (R$)</th>
                              <th className="py-2.5 px-3 text-center">Tratativa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850/60 font-mono text-[11px]">
                            {cat.items.map((item, idx) => {
                              const cast = item as any;
                              const driverName = (cast.faltaMotorista || "NÃO DECLARADO").toUpperCase();
                              const isX = isDriverX(driverName);
                              const itemHl = item.hectolitros || 0;
                              const itemVal = item.valorTotal || 0;
                              const resolvedDesc = getProductDescription(item.item || cast.itemCode || cast.produto, item.descricaoProduto);

                              return (
                                <tr 
                                  key={item.id || idx}
                                  onClick={() => onSelectRequest?.(item)}
                                  className="hover:bg-slate-800/50 transition-colors group cursor-pointer"
                                >
                                  {/* Quando foi */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5">
                                      <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span className="font-bold text-slate-200">
                                        {item.data || (item.timestamp ? new Date(item.timestamp).toLocaleDateString("pt-BR") : "Data N/D")}
                                      </span>
                                    </div>
                                    <div className="text-[9.5px] text-slate-500 pl-5">
                                      {cast.turno || "Diurno (Turno 1)"}
                                    </div>
                                  </td>

                                  {/* O que foi (SKU & Descrição Real) */}
                                  <td className="py-2.5 px-3 max-w-xs">
                                    <div className="font-sans font-bold text-slate-100 truncate flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.2 bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono text-[9px] font-bold rounded">
                                        SKU {item.item || "N/D"}
                                      </span>
                                      <span className="truncate">{resolvedDesc}</span>
                                    </div>
                                    <div className="text-[9.5px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                                      <span className="text-slate-400 truncate">{item.observacao || item.motivo || "Falta de mercadoria"}</span>
                                    </div>
                                  </td>

                                  {/* Documentos */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="text-slate-300 font-bold">
                                      NF: <span>{item.nf || "S/N"}</span>
                                    </div>
                                    <div className="text-[9.5px] text-slate-500">
                                      Mapa: {item.mapa || "N/D"} • Rota: {item.setor || "N/D"}
                                    </div>
                                  </td>

                                  {/* Envolvidos */}
                                  <td className="py-2.5 px-3">
                                    {isCarregamento ? (
                                      <div>
                                        <span className="text-blue-300 font-sans font-medium text-[10.5px] block">
                                          Conferente CD Pau Brasil
                                        </span>
                                        <span className="text-[9px] text-slate-500">
                                          Motorista Rota: {driverName}
                                        </span>
                                      </div>
                                    ) : (
                                      <div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-amber-300 font-sans font-medium text-[10.5px] truncate block">
                                            {driverName}
                                          </span>
                                          {isX && (
                                            <span className="px-1 py-0.2 bg-purple-950 border border-purple-800 text-purple-300 text-[8px] font-bold rounded">
                                              Motorista X (Isento)
                                            </span>
                                          )}
                                        </div>
                                        {cast.faltaAjudantes && (
                                          <span className="text-[9px] text-slate-500 block truncate">
                                            Ajudantes: {cast.faltaAjudantes}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* Quantidade / Volume */}
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <span className="text-slate-200 font-bold block">
                                      {item.quantidade || 1} cx
                                    </span>
                                    <span className="text-[9.5px] text-slate-400">
                                      {itemHl.toFixed(2)} HL
                                    </span>
                                  </td>

                                  {/* Impacto Financeiro */}
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    {(() => {
                                      const rawCode = item.item || cast.itemCode || cast.produto;
                                      const prod = getProductCatalogInfo(rawCode) || getProductByCodeOrName(item.descricaoProduto || item.descricao);
                                      const qty = Math.max(1, item.quantidade || 1);
                                      const boxPrice = prod && prod.valor > 0 ? prod.valor : (itemVal / qty);

                                      return (
                                        <>
                                          <span className="text-xs font-black text-emerald-400 block font-mono">
                                            {formatCurrency(itemVal)}
                                          </span>
                                          <span className="text-[9px] text-slate-400 font-mono">
                                            {formatCurrency(boxPrice)}/cx
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </td>

                                  {/* Status / Tratativa */}
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    {isCarregamento ? (
                                      <span className="px-2 py-0.5 bg-blue-950/80 border border-blue-800 text-blue-300 text-[9px] font-bold rounded-lg inline-block">
                                        Regularizado CD
                                      </span>
                                    ) : cast.gerouVale ? (
                                      <span className="px-2 py-0.5 bg-amber-950/80 border border-amber-800 text-amber-300 text-[9px] font-bold rounded-lg inline-block">
                                        Vale Emitido
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[9px] font-bold rounded-lg inline-block">
                                        Baixado
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
