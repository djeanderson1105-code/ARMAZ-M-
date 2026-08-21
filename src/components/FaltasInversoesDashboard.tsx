import React, { useState, useMemo, useRef } from "react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  Legend, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ComposedChart, 
  Line 
} from "recharts";
import { 
  PendingRequest, 
  ExchangeRecord, 
  RequestItem, 
  LISTA_CREW, 
  MOTORISTAS_ROTAS, 
  calculateValeRateio, 
  isDriverX,
  isInversaoOrSwapReq 
} from "../types";
import { ValeEntry } from "./ValesHistoryDashboard";
import { useSstrData } from "../context/SstrDataContext";
import { 
  PRODUCT_DATABASE, 
  calculateRequestValueAndHL,
  calculateItemValue,
  calculateItemHL,
  getProductCatalogInfo,
  getProductDescription,
  getProductBoxPrice 
} from "../data/products";
import { isRecordReposicao } from "../utils/processTypes";
import ShortageTreeBreakdown from "./ShortageTreeBreakdown";
import * as XLSX from "xlsx";
import { 
  Layers, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Calendar, 
  Filter, 
  Sparkles, 
  Upload, 
  FileSpreadsheet, 
  Clock, 
  CheckCircle2, 
  Truck, 
  Package, 
  ShieldCheck, 
  ChevronRight, 
  RefreshCw, 
  PlusCircle, 
  UserCheck, 
  Info,
  Sliders,
  Check,
  X,
  RotateCcw
} from "lucide-react";

interface FaltasInversoesDashboardProps {
  requests?: PendingRequest[];
  vales?: ValeEntry[];
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

export default function FaltasInversoesDashboard({
  requests: propRequests,
  vales: propVales,
  onSelectRequest
}: FaltasInversoesDashboardProps) {
  const { 
    savePendingRequest, 
    saveValeEntry, 
    records: promaxRecords, 
    pendingRequests: ctxRequests,
    vales: ctxVales,
    crewList,
    motoristasList 
  } = useSstrData();

  const requests = propRequests || ctxRequests || [];
  const vales = propVales || ctxVales || [];

  // Metric toggles for Charts
  const [donutMetric, setDonutMetric] = useState<"count" | "hl" | "val">("count");
  const [barMetric, setBarMetric] = useState<"count" | "hl" | "val">("hl");
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [timeframeFilter, setTimeframeFilter] = useState<"ano" | "s1" | "s2" | "mes">("ano");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [activeTabSubView, setActiveTabSubView] = useState<"dashboard" | "timeline" | "importar">("dashboard");

  // Mock Generation Modal State
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [demoGenerationMode, setDemoGenerationMode] = useState<"append" | "overwrite">("append");
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [demoSuccessMsg, setDemoSuccessMsg] = useState("");

  // Large File Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMergeMode, setImportMergeMode] = useState<"append" | "overwrite">("append");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val || 0);
  };

  // Filter and unify ALL shortage & reposição requests (Total consolidado de Faltas e Inversões)
  const shortageRequests = useMemo(() => {
    const map = new Map<string, PendingRequest>();

    // Process all representative shortage & reposição requests
    requests.forEach((r, idx) => {
      if (!r) return;
      const rId = String(r.id || "");
      if (rId.startsWith("rec_") || rId.startsWith("req_hist_short_")) return;

      const cast = r as any;
      const m = (r.motivo || "").toLowerCase();
      const subM = (r.subMotivo || cast.subMotivo || "").toLowerCase();
      const obs = (r.observacao || cast.observacao || "").toLowerCase();
      const just = (cast.justificativa || "").toLowerCase();

      const isShortage = 
        m.includes("falta") || 
        m.includes("invers") || 
        m.includes("swap") || 
        m.includes("reposi") || 
        cast.tipoRegistroFalta === true || 
        !!cast.faltaTipoErro;

      if (!isShortage) return;

      // Discard rejected/cancelled requests that do not generate financial cost
      if (cast.status === "reprovado" || cast.status === "cancelado" || cast.statusPromax === "reprovado" || cast.statusPromax === "cancelado") {
        return;
      }

      const rawCode = String(r.item || cast.itemCode || cast.produto || "").trim();
      const cleanCode = rawCode.replace(/^#/, "").trim().replace(/^0+/, "");
      const prod = getProductCatalogInfo(rawCode);

      const isUnd = ["und", "un", "unidade", "unidades"].includes(String(r.unidadeMedida || r.um || "").toLowerCase().trim());
      const qty = Number(r.quantidade) || 1;
      
      const boxPrice = prod?.valor && prod.valor > 0 ? prod.valor : (r.customUnitPrice || cast.valorUnitario || 0);
      const embalagem = prod?.fator || r.fatorEmbalagem || (isUnd ? 12 : 1);
      const unitPrice = isUnd ? (boxPrice / embalagem) : boxPrice;
      
      // Calculate real item financial value based on SKU price and unit of measure (avoiding full NF invoice totals)
      let calculatedVal = calculateItemValue({
        item: rawCode,
        quantidade: qty,
        unidadeMedida: r.unidadeMedida || r.um,
        fatorEmbalagem: embalagem,
        customUnitPrice: r.customUnitPrice,
        precoCalculated: cast.precoCalculated,
        descricao: r.descricaoProduto,
        motivo: r.motivo
      });

      if (!calculatedVal || calculatedVal <= 0) {
        if (r.valorTotal && r.valorTotal > 0 && r.valorTotal < 2000) {
          calculatedVal = Number(r.valorTotal.toFixed(2));
        } else if (unitPrice > 0) {
          calculatedVal = Number((unitPrice * qty).toFixed(2));
        }
      }

      // Discard items with zero financial value
      if (!calculatedVal || calculatedVal <= 0) {
        return;
      }

      // Calculate accurate HL
      let calculatedHl = calculateItemHL({
        item: rawCode,
        quantidade: qty,
        unidadeMedida: r.unidadeMedida || r.um,
        fatorEmbalagem: embalagem,
        fatorHecto: prod?.fatorHecto || r.fatorHecto,
        descricao: r.descricaoProduto
      });
      if (!calculatedHl || calculatedHl <= 0) {
        const factorHl = prod?.fatorHecto || r.fatorHecto || 0.042;
        calculatedHl = isUnd ? Number(((factorHl / embalagem) * qty).toFixed(4)) : Number((factorHl * qty).toFixed(4));
      }

      // Classify error: Carregamento (Armazém CD) vs Descarregamento (Rota / Entrega / Vales)
      let errorType = cast.faltaTipoErro ? cast.faltaTipoErro.toLowerCase() : "";
      if (!errorType) {
        const isCarregamento = 
          m.includes("carregamento") || 
          m.includes("armazém") || 
          m.includes("armazem") || 
          m.includes("doca") || 
          m.includes("separação") || 
          m.includes("separacao") ||
          subM.includes("carregamento") ||
          subM.includes("palete") ||
          subM.includes("doca") ||
          obs.includes("carregamento") ||
          obs.includes("armazém") ||
          obs.includes("armazem") ||
          just.includes("carregamento") ||
          just.includes("armazém");

        errorType = isCarregamento ? "carregamento" : "entrega";
      }

      const driverName = (r.faltaMotorista || cast.motorista || cast.nomeMotorista || "NÃO DECLARADO").trim().toUpperCase();
      const isX = isDriverX(driverName);
      const isCarreg = errorType === "carregamento";

      const key = r.id || `shortage_${r.nf}_${r.item}_${r.data}_${idx}`;
      if (!map.has(key)) {
        map.set(key, {
          ...r,
          id: key,
          descricaoProduto: getProductDescription(rawCode, r.descricaoProduto),
          valorTotal: calculatedVal,
          hectolitros: calculatedHl,
          motivo: isCarreg ? (r.motivo || "Falta de SKU no Carregamento (Armazém)") : (r.motivo || "Falta no Descarregamento (Rota / Entrega)"),
          subMotivo: r.subMotivo || (isCarreg ? "Separação Incompleta no Palete da Doca" : "Divergência na Conferência do PDV"),
          faltaTipoErro: errorType as "carregamento" | "entrega",
          gerouVale: !isCarreg && !isX,
          faltaMotorista: driverName,
          tipoRegistroFalta: true
        });
      }
    });

    return Array.from(map.values());
  }, [requests]);

  // Aggregate Metrics and Analytics
  const analytics = useMemo(() => {
    let totalCarregamentoCount = 0;
    let totalCarregamentoHl = 0;
    let totalCarregamentoVal = 0;

    let totalDescarregamentoCount = 0;
    let totalDescarregamentoHl = 0;
    let totalDescarregamentoVal = 0;

    let totalIndefinidoCount = 0;
    let totalIndefinidoHl = 0;
    let totalIndefinidoVal = 0;

    // Monthly aggregation array (12 months)
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      monthIdx: i,
      monthName: MONTH_ABBR[i],
      fullName: MONTH_NAMES[i],
      carregamentoCount: 0,
      carregamentoHl: 0,
      carregamentoVal: 0,
      descarregamentoCount: 0,
      descarregamentoHl: 0,
      descarregamentoVal: 0,
      valesCount: 0,
      valesTotalVal: 0,
      totalCount: 0,
      totalHl: 0,
      totalVal: 0
    }));

    // Driver Loss Rank Map
    const driverLossMap: Record<string, { name: string; count: number; val: number; hl: number; isX: boolean }> = {};

    shortageRequests.forEach(req => {
      const cast = req as any;
      const valorTotal = req.valorTotal || 0;
      const hectolitros = req.hectolitros || 0;
      const isSwap = isInversaoOrSwapReq(req);
      const errorType = (cast.faltaTipoErro || "").toLowerCase();
      
      // Determine error category
      const isCarregamento = errorType === "carregamento" || (!errorType && isSwap);
      const isDescarregamento = errorType === "entrega" || errorType === "descarregamento" || (!errorType && !isSwap);

      // Parse date for monthly breakdown
      const dateStr = req.data || (req as any).createdAt || "";
      let monthIndex = 0;
      if (dateStr) {
        if (dateStr.includes("/")) {
          const parts = dateStr.split("/");
          if (parts.length >= 2) {
            const m = parseInt(parts[1], 10) - 1;
            if (!isNaN(m) && m >= 0 && m <= 11) monthIndex = m;
          }
        } else if (dateStr.includes("-")) {
          const parts = dateStr.split("-");
          if (parts.length >= 2) {
            const m = parseInt(parts[1], 10) - 1;
            if (!isNaN(m) && m >= 0 && m <= 11) monthIndex = m;
          }
        }
      } else if (req.timestamp) {
        monthIndex = new Date(req.timestamp).getMonth();
      }

      if (isCarregamento) {
        totalCarregamentoCount++;
        totalCarregamentoHl += hectolitros;
        totalCarregamentoVal += valorTotal;
        if (monthlyData[monthIndex]) {
          monthlyData[monthIndex].carregamentoCount += 1;
          monthlyData[monthIndex].carregamentoHl += hectolitros;
          monthlyData[monthIndex].carregamentoVal += valorTotal;
          monthlyData[monthIndex].totalCount += 1;
          monthlyData[monthIndex].totalHl += hectolitros;
          monthlyData[monthIndex].totalVal += valorTotal;
        }
      } else if (isDescarregamento) {
        totalDescarregamentoCount++;
        totalDescarregamentoHl += hectolitros;
        totalDescarregamentoVal += valorTotal;
        if (monthlyData[monthIndex]) {
          monthlyData[monthIndex].descarregamentoCount += 1;
          monthlyData[monthIndex].descarregamentoHl += hectolitros;
          monthlyData[monthIndex].descarregamentoVal += valorTotal;
          monthlyData[monthIndex].valesCount += 1;
          monthlyData[monthIndex].valesTotalVal += valorTotal;
          monthlyData[monthIndex].totalCount += 1;
          monthlyData[monthIndex].totalHl += hectolitros;
          monthlyData[monthIndex].totalVal += valorTotal;
        }

        // Driver ranking
        const driverName = (cast.faltaMotorista || "MOTORISTA NÃO DECLARADO").trim().toUpperCase();
        const isX = isDriverX(driverName);
        if (!driverLossMap[driverName]) {
          driverLossMap[driverName] = { name: driverName, count: 0, val: 0, hl: 0, isX };
        }
        driverLossMap[driverName].count += 1;
        driverLossMap[driverName].val += valorTotal;
        driverLossMap[driverName].hl += hectolitros;
      } else {
        totalIndefinidoCount++;
        totalIndefinidoHl += hectolitros;
        totalIndefinidoVal += valorTotal;
      }
    });

    // Compute monthly average for Vales (months with data or Jan-Jun = 6 months)
    const activeMonths = monthlyData.filter(m => m.totalCount > 0);
    const monthsDivisor = Math.max(1, activeMonths.length);
    const avgMonthlyValesVal = totalDescarregamentoVal / monthsDivisor;

    const totalGeneralCount = totalCarregamentoCount + totalDescarregamentoCount + totalIndefinidoCount;
    const totalGeneralHl = totalCarregamentoHl + totalDescarregamentoHl + totalIndefinidoHl;
    const totalGeneralVal = totalCarregamentoVal + totalDescarregamentoVal + totalIndefinidoVal;

    // Percentages
    const pctCarregamentoCount = totalGeneralCount > 0 ? (totalCarregamentoCount / totalGeneralCount) * 100 : 0;
    const pctDescarregamentoCount = totalGeneralCount > 0 ? (totalDescarregamentoCount / totalGeneralCount) * 100 : 0;
    
    const pctCarregamentoHl = totalGeneralHl > 0 ? (totalCarregamentoHl / totalGeneralHl) * 100 : 0;
    const pctDescarregamentoHl = totalGeneralHl > 0 ? (totalDescarregamentoHl / totalGeneralHl) * 100 : 0;

    const pctCarregamentoVal = totalGeneralVal > 0 ? (totalCarregamentoVal / totalGeneralVal) * 100 : 0;
    const pctDescarregamentoVal = totalGeneralVal > 0 ? (totalDescarregamentoVal / totalGeneralVal) * 100 : 0;

    // Donut chart dataset based on selected metric
    const donutData = [
      {
        name: "Erros de Carregamento (Armazém)",
        value: donutMetric === "count" ? totalCarregamentoCount : donutMetric === "hl" ? Number(totalCarregamentoHl.toFixed(4)) : Number(totalCarregamentoVal.toFixed(2)),
        count: totalCarregamentoCount,
        hl: totalCarregamentoHl,
        val: totalCarregamentoVal,
        pct: donutMetric === "count" ? pctCarregamentoCount : donutMetric === "hl" ? pctCarregamentoHl : pctCarregamentoVal,
        color: "#3b82f6" // blue
      },
      {
        name: "Erros de Descarregamento / Vales (Rota)",
        value: donutMetric === "count" ? totalDescarregamentoCount : donutMetric === "hl" ? Number(totalDescarregamentoHl.toFixed(4)) : Number(totalDescarregamentoVal.toFixed(2)),
        count: totalDescarregamentoCount,
        hl: totalDescarregamentoHl,
        val: totalDescarregamentoVal,
        pct: donutMetric === "count" ? pctDescarregamentoCount : donutMetric === "hl" ? pctDescarregamentoHl : pctDescarregamentoVal,
        color: "#f59e0b" // amber
      }
    ];

    if (totalIndefinidoCount > 0) {
      donutData.push({
        name: "Aguardando Classificação",
        value: donutMetric === "count" ? totalIndefinidoCount : donutMetric === "hl" ? Number(totalIndefinidoHl.toFixed(4)) : Number(totalIndefinidoVal.toFixed(2)),
        count: totalIndefinidoCount,
        hl: totalIndefinidoHl,
        val: totalIndefinidoVal,
        pct: totalGeneralCount > 0 ? (totalIndefinidoCount / totalGeneralCount) * 100 : 0,
        color: "#ef4444" // red
      });
    }

    const topDrivers = Object.values(driverLossMap)
      .sort((a, b) => b.val - a.val)
      .slice(0, 6);

    return {
      totalCarregamentoCount,
      totalCarregamentoHl,
      totalCarregamentoVal,
      totalDescarregamentoCount,
      totalDescarregamentoHl,
      totalDescarregamentoVal,
      totalIndefinidoCount,
      totalIndefinidoHl,
      totalIndefinidoVal,
      totalGeneralCount,
      totalGeneralHl,
      totalGeneralVal,
      pctCarregamentoCount,
      pctDescarregamentoCount,
      pctCarregamentoHl,
      pctDescarregamentoHl,
      pctCarregamentoVal,
      pctDescarregamentoVal,
      avgMonthlyValesVal,
      monthlyData,
      donutData,
      topDrivers
    };
  }, [shortageRequests, promaxRecords, donutMetric]);

  // Filtered monthly data for timeline chart based on selected timeframe
  const filteredBarData = useMemo(() => {
    if (timeframeFilter === "s1") {
      return analytics.monthlyData.slice(0, 6);
    }
    if (timeframeFilter === "s2") {
      return analytics.monthlyData.slice(6, 12);
    }
    if (timeframeFilter === "mes") {
      return [analytics.monthlyData[selectedMonth] || analytics.monthlyData[0]];
    }
    return analytics.monthlyData;
  }, [analytics.monthlyData, timeframeFilter, selectedMonth]);

  // Generate Realistic Fictitious Demo Data from Jan to Jun (< R$ 500/month in Vales)
  const handleGenerateJanJunDemoData = async () => {
    setIsGeneratingDemo(true);
    setDemoSuccessMsg("");

    try {
      const generatedRequests: PendingRequest[] = [];
      const generatedVales: ValeEntry[] = [];

      // Available drivers including driver "X"
      const driverPool = [
        { nome: "EDENILSON DE SOUSA SILVA", cpf: "104.695.814-33", rota: "R101" },
        { nome: "VALDKLEBER DE SOUZA ALEXANDRE", cpf: "058.129.184-06", rota: "R110" },
        { nome: "DANILLO PEREIRA DOS SANTOS SILVA", cpf: "713.650.714-64", rota: "R111" },
        { nome: "EWERTON RODRIGUES DA SILVA", cpf: "116.515.224-05", rota: "R112" },
        { nome: "ADELSON SANTOS DE ARAUJO", cpf: "101.598.524-63", rota: "R113" },
        { nome: "GILMAR DOS SANTOS FERNANDES", cpf: "058.142.584-70", rota: "R114" },
        { nome: "X", cpf: "000.000.000-00", rota: "X" }
      ];

      const helperPool = [
        { nome: "GEOVANE ARAUJO DA SILVA", cpf: "099.123.694-75" },
        { nome: "FELIPE GOMES DA SILVA", cpf: "700.552.584-17" },
        { nome: "VITOR MACENA GOMES", cpf: "705.138.374-42" },
        { nome: "WALLISON PONTES DA SILVA", cpf: "180.471.404-69" },
        { nome: "IDALMO FELIPE DOS SANTOS", cpf: "067.166.734-31" },
        { nome: "ROMARIO RODRIGUES DA SILVA", cpf: "125.316.744-38" }
      ];

      // Products to use for realistic low value shortages (Official Ambev SKUs)
      const sampleProducts = [
        { code: "9068", name: "SKOL LATA 350ML CX CART C 24", price: 80.40, factor: 24, hl: 0.0840 },
        { code: "28164", name: "CERV BRAHMA DUPLO MALTE 350ML CX 24", price: 89.76, factor: 24, hl: 0.0840 },
        { code: "18836", name: "CORONA EXTRA N LONG NECK 330ML CX CART C 24", price: 118.01, factor: 24, hl: 0.0792 },
        { code: "37450", name: "CERV BUDWEISER LATA 350ML C12", price: 41.69, factor: 12, hl: 0.0420 },
        { code: "21020", name: "CERV SPATEN PURO MALTE LN 355ML C24", price: 104.90, factor: 24, hl: 0.0852 },
        { code: "2349", name: "REFRIG GUARANA ANTARCTICA PET 2L C06", price: 28.50, factor: 6, hl: 0.1200 }
      ];

      // Target monthly loss values (< R$ 500 / month)
      // Jan: ~R$ 320, Feb: ~R$ 275, Mar: ~R$ 380, Apr: ~R$ 210, May: ~R$ 340, Jun: ~R$ 290
      const monthlyProfiles = [
        { month: 1, name: "01/2026", loadingCases: 3, deliveryCases: 3 },
        { month: 2, name: "02/2026", loadingCases: 2, deliveryCases: 2 },
        { month: 3, name: "03/2026", loadingCases: 4, deliveryCases: 3 },
        { month: 4, name: "04/2026", loadingCases: 2, deliveryCases: 2 },
        { month: 5, name: "05/2026", loadingCases: 3, deliveryCases: 3 },
        { month: 6, name: "06/2026", loadingCases: 2, deliveryCases: 2 }
      ];

      let sequenceId = 1000;

      for (const profile of monthlyProfiles) {
        const mStr = profile.month < 10 ? `0${profile.month}` : `${profile.month}`;
        
        // 1. Generate Loading Errors (Erros de Carregamento - No vale generated)
        for (let i = 0; i < profile.loadingCases; i++) {
          sequenceId++;
          const day = Math.min(28, 3 + i * 7);
          const dayStr = day < 10 ? `0${day}` : `${day}`;
          const date = `${dayStr}/${mStr}/2026`;
          const reqId = `req_demo_carg_${sequenceId}`;
          const prod = sampleProducts[i % sampleProducts.length];
          const qty = 1 + (i % 2); // 1 or 2 boxes
          const totalVal = qty * prod.price;
          const totalHl = qty * prod.hl;
          const driver = driverPool[i % driverPool.length];

          const reqItem: RequestItem = {
            id: `item_${sequenceId}`,
            item: prod.code,
            itemCode: prod.code,
            descricao: prod.name,
            itemDesc: prod.name,
            quantidade: qty,
            unidadeMedida: "cx",
            fatorEmbalagem: prod.factor,
            fatorHecto: prod.hl,
            customUnitPrice: prod.price,
            precoCalculated: totalVal,
            hectolitros: totalHl,
            motivo: "Falta de SKU no Carregamento (Armazém)"
          };

          const newReq: PendingRequest = {
            id: reqId,
            timestamp: new Date(2026, profile.month - 1, day, 8, 30).getTime(),
            nb: `CLI${2000 + (sequenceId % 50)}`,
            fotoUrl: "",
            nf: `98${sequenceId}`,
            mapa: `M${1000 + sequenceId}`,
            setor: driver.rota,
            data: date,
            statusPromax: "cadastrado",
            motivo: "Falta de SKU (Carregamento Armazém)",
            observacao: "Falta física constatada na conferência de saída do CD Pau Brasil. Sem cobrança aos condutores.",
            item: prod.code,
            descricaoProduto: prod.name,
            quantidade: qty,
            unidadeMedida: "cx",
            hectolitros: totalHl,
            valorTotal: totalVal,
            items: [reqItem],
            faltaTipoErro: "carregamento",
            tipoRegistroFalta: true,
            faltaMotorista: driver.nome,
            faltaMotoristaCpf: driver.cpf,
            faltaBaixa: true,
            faltaDataBaixa: date,
            faltaUsuarioBaixa: "Controle Operacional SSTR"
          };

          generatedRequests.push(newReq);
        }

        // 2. Generate Delivery Shortage Errors with Vales (Erros de Descarregamento - Gera Vale)
        for (let i = 0; i < profile.deliveryCases; i++) {
          sequenceId++;
          const day = Math.min(28, 5 + i * 8);
          const dayStr = day < 10 ? `0${day}` : `${day}`;
          const date = `${dayStr}/${mStr}/2026`;
          const reqId = `req_demo_desc_${sequenceId}`;
          const valeId = `vale_demo_${sequenceId}`;
          
          // Select product ensuring low monthly total (< R$ 500)
          const prod = sampleProducts[(i + 2) % sampleProducts.length];
          const qty = 1; // 1 box
          const totalVal = prod.price;
          const totalHl = prod.hl;
          
          // Rotate drivers, deliberately using Driver "X" in some slots to demonstrate the rule
          const driver = (profile.month === 2 && i === 0) || (profile.month === 5 && i === 1) 
            ? driverPool.find(d => d.nome === "X")! 
            : driverPool[(i + profile.month) % driverPool.length];
          
          const h1 = helperPool[(i) % helperPool.length];
          const h2 = (i % 2 === 1) ? helperPool[(i + 3) % helperPool.length] : undefined;

          const reqItem: RequestItem = {
            id: `item_${sequenceId}`,
            item: prod.code,
            itemCode: prod.code,
            descricao: prod.name,
            itemDesc: prod.name,
            quantidade: qty,
            unidadeMedida: "cx",
            fatorEmbalagem: prod.factor,
            fatorHecto: prod.hl,
            customUnitPrice: prod.price,
            precoCalculated: totalVal,
            hectolitros: totalHl,
            motivo: "Erro de Descarregamento / Troca no PDV"
          };

          const newReq: PendingRequest = {
            id: reqId,
            timestamp: new Date(2026, profile.month - 1, day, 14, 15).getTime(),
            nb: `CLI${3000 + (sequenceId % 40)}`,
            fotoUrl: "",
            nf: `87${sequenceId}`,
            mapa: `M${2000 + sequenceId}`,
            setor: driver.rota,
            data: date,
            statusPromax: "cadastrado",
            motivo: "Falta no Descarregamento (Rota / Entrega)",
            observacao: "Mercadoria não localizada na descarga do PDV. Vale gerado e assinado pela equipe para acerto de contas.",
            item: prod.code,
            descricaoProduto: prod.name,
            quantidade: qty,
            unidadeMedida: "cx",
            hectolitros: totalHl,
            valorTotal: totalVal,
            items: [reqItem],
            faltaTipoErro: "entrega",
            tipoRegistroFalta: true,
            faltaMotorista: driver.nome,
            faltaMotoristaCpf: driver.cpf,
            faltaAjudante1: h1.nome,
            faltaAjudante1Cpf: h1.cpf,
            faltaAjudante2: h2?.nome,
            faltaAjudante2Cpf: h2?.cpf,
            faltaAjudantes: h2 ? `${h1.nome}, ${h2.nome}` : h1.nome,
            faltaBaixa: true,
            faltaDataBaixa: date,
            faltaUsuarioBaixa: "Gestor Logística Ambev",
            reviewedByControle: true
          };

          const newVale: ValeEntry = {
            id: valeId,
            requestId: reqId,
            nf: newReq.nf || `87${sequenceId}`,
            rota: driver.rota,
            dataEmissao: date,
            motorista: driver.nome,
            motoristaCpf: driver.cpf,
            ajudante1: h1.nome,
            ajudante1Cpf: h1.cpf,
            ajudante2: h2?.nome || "",
            ajudante2Cpf: h2?.cpf || "",
            ajudantes: h2 ? `${h1.nome}, ${h2.nome}` : h1.nome,
            hectolitros: totalHl,
            valorTotal: totalVal,
            itemsCount: 1,
            status: (profile.month <= 4) ? "compensado" : "assinado",
            originalRequest: newReq
          };

          generatedRequests.push(newReq);
          generatedVales.push(newVale);
        }
      }

      // Save all generated requests and vales
      for (const r of generatedRequests) {
        await savePendingRequest(r);
      }
      for (const v of generatedVales) {
        await saveValeEntry(v);
      }

      setDemoSuccessMsg(`Base gerada com sucesso! ${generatedRequests.length} solicitações e ${generatedVales.length} vales criados entre Jan e Jun (valores controlados abaixo de R$ 500/mês).`);
      setTimeout(() => {
        setIsDemoModalOpen(false);
        setDemoSuccessMsg("");
      }, 2500);

    } catch (err: any) {
      alert("Erro ao gerar dados fictícios: " + err.message);
    } finally {
      setIsGeneratingDemo(false);
    }
  };

  // Handle Large File Import / Merge
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setImportProgress(10);
    setImportFeedback(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setImportProgress(30);
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawJson: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

        setImportProgress(50);

        if (!rawJson || rawJson.length === 0) {
          throw new Error("A planilha importada não possui linhas de dados válidas.");
        }

        let importedCount = 0;
        let createdValesCount = 0;

        // Process in chunks of 50 to maintain high performance on massive files
        const chunkSize = 50;
        for (let i = 0; i < rawJson.length; i += chunkSize) {
          const chunk = rawJson.slice(i, i + chunkSize);

          for (const row of chunk) {
            const nf = String(row["NF"] || row["Nota Fiscal"] || row["Nota"] || row["nf"] || `NF-${Date.now()}-${importedCount}`).trim();
            const mapa = String(row["Mapa"] || row["Mapa Carga"] || row["mapa"] || "").trim();
            const dataStr = String(row["Data"] || row["Data Emissão"] || row["Data Lançamento"] || row["data"] || new Date().toLocaleDateString("pt-BR")).trim();
            const motorista = String(row["Motorista"] || row["Nome Motorista"] || row["motorista"] || "").trim();
            const rota = String(row["Rota"] || row["Setor"] || row["rota"] || "R101").trim();
            const cliente = String(row["Cliente"] || row["Nome Cliente"] || row["Razão Social"] || row["cliente"] || "Ponto de Venda").trim();
            const codCliente = String(row["Código Cliente"] || row["Cód Cliente"] || row["codigoCliente"] || "000000").trim();
            const itemCode = String(row["Código Produto"] || row["Produto"] || row["SKU"] || row["item"] || "1002").trim();
            const itemDesc = String(row["Descrição Produto"] || row["Descrição"] || row["descricao"] || "SKOL LATA 350ML").trim();
            const qtd = Number(row["Quantidade"] || row["Qtd"] || row["quantidade"] || 1);
            const tipoErroRaw = String(row["Tipo Erro"] || row["Origem Erro"] || row["Processo"] || row["faltaTipoErro"] || "").toLowerCase();
            const isCarregamento = tipoErroRaw.includes("carreg") || tipoErroRaw.includes("armaz");
            const isEntrega = tipoErroRaw.includes("entreg") || tipoErroRaw.includes("desc") || tipoErroRaw.includes("vale") || tipoErroRaw.includes("rota");
            const finalTipoErro = isCarregamento ? "carregamento" : isEntrega ? "entrega" : "indefinido";

            const dbProduct = PRODUCT_DATABASE.find(p => p.codigo === itemCode || p.codigo === itemCode.replace(/^0+/, ""));
            const factorHl = dbProduct?.fatorHecto || 0.0840;
            const factorEmbalagem = dbProduct?.fator || 24;
            const unitPrice = dbProduct?.valor || Number(row["Valor Total"] || row["Valor"] || 85.00) / (qtd || 1);
            const totalVal = Number(row["Valor Total"] || row["Valor"] || qtd * unitPrice);
            const totalHl = Number(row["Volume HL"] || row["Hectolitros"] || qtd * factorHl);

            const reqId = `req_imp_${Date.now()}_${importedCount}`;
            const valeId = `vale_imp_${Date.now()}_${importedCount}`;

            const reqItem: RequestItem = {
              id: `item_imp_${Date.now()}_${importedCount}`,
              item: itemCode,
              itemCode: itemCode,
              descricao: itemDesc,
              itemDesc: itemDesc,
              quantidade: qtd,
              unidadeMedida: "cx",
              fatorEmbalagem: factorEmbalagem,
              fatorHecto: factorHl,
              customUnitPrice: unitPrice,
              precoCalculated: totalVal,
              hectolitros: totalHl,
              motivo: isCarregamento ? "Falta no Carregamento" : "Falta no Descarregamento / Rota"
            };

            const newReq: PendingRequest = {
              id: reqId,
              timestamp: Date.now() + importedCount,
              nb: codCliente || `CLI${importedCount}`,
              fotoUrl: "",
              nf: nf,
              mapa: mapa,
              setor: rota,
              data: dataStr,
              statusPromax: "cadastrado",
              motivo: isCarregamento ? "Falta de SKU (Carregamento Armazém)" : "Falta de SKU (Descarregamento)",
              observacao: String(row["Observação"] || row["Motivo"] || "Registro importado via planilha unificada."),
              item: itemCode,
              descricaoProduto: itemDesc,
              quantidade: qtd,
              unidadeMedida: "cx",
              hectolitros: totalHl,
              valorTotal: totalVal,
              items: [reqItem],
              faltaTipoErro: finalTipoErro as any,
              tipoRegistroFalta: true,
              gerouVale: finalTipoErro === "entrega",
              valeId: finalTipoErro === "entrega" ? valeId : undefined,
              faltaMotorista: motorista || undefined,
              faltaMotoristaCpf: String(row["CPF Motorista"] || ""),
              faltaAjudante1: String(row["Ajudante 1"] || row["Ajudante"] || ""),
              faltaAjudantes: String(row["Equipe"] || row["Ajudantes"] || ""),
              faltaBaixa: true,
              faltaDataBaixa: dataStr,
              faltaUsuarioBaixa: "Importador Anual SSTR",
              reviewedByControle: true
            };

            await savePendingRequest(newReq);
            importedCount++;

            if (finalTipoErro === "entrega") {
              const newVale: ValeEntry = {
                id: valeId,
                requestId: reqId,
                nf: nf,
                rota: rota,
                dataEmissao: dataStr,
                motorista: motorista || "Motorista Não Declarado",
                motoristaCpf: String(row["CPF Motorista"] || ""),
                ajudante1: String(row["Ajudante 1"] || ""),
                ajudante1Cpf: String(row["CPF Ajudante 1"] || ""),
                ajudante2: String(row["Ajudante 2"] || ""),
                ajudante2Cpf: String(row["CPF Ajudante 2"] || ""),
                ajudantes: String(row["Equipe"] || row["Ajudantes"] || ""),
                hectolitros: totalHl,
                valorTotal: totalVal,
                itemsCount: 1,
                status: "emitido",
                originalRequest: newReq
              };
              await saveValeEntry(newVale);
              createdValesCount++;
            }
          }

          setImportProgress(Math.min(95, Math.round(((i + chunkSize) / rawJson.length) * 100)));
        }

        setImportProgress(100);
        setImportFeedback({
          success: true,
          message: `Arquivo importado com sucesso! ${importedCount} ocorrências processadas e ${createdValesCount} vales sincronizados.`,
          count: importedCount
        });

      } catch (err: any) {
        setImportFeedback({
          success: false,
          message: "Erro ao processar planilha: " + err.message,
          count: 0
        });
      } finally {
        setIsProcessingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6 text-left" id="faltas-inversoes-dashboard-root">
      
      {/* 1. TOP HEADER & ACTION CONTROLS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white font-mono uppercase tracking-wide">
                Dashboard & Linha do Tempo: Faltas e Inversões
              </h2>
              <p className="text-xs text-slate-400">
                Auditoria executiva de percentual de erros de carregamento vs descarregamento e impacto em HL / R$
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons: Demo Generator & Large File Import */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* Fictitious Data Button */}
          <button
            type="button"
            onClick={() => setIsDemoModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 border border-indigo-400/30 shrink-0"
            title="Gerar/mesclar informações fictícias de Janeiro até Junho com vales controlados (< R$ 500/mês)"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            <span>Gerar Dados Jan-Jun (&lt;R$500/mês)</span>
          </button>

          {/* Import Large Files Button */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 border border-emerald-400/30 shrink-0"
            title="Importar planilhas grandes ou mesclar múltiplos arquivos de datas do ano inteiro"
          >
            <Upload className="w-4 h-4 text-emerald-200" />
            <span>Importar / Mesclar Planilha Anual</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total General Shortages */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 font-mono uppercase tracking-wider">
              Total Faltas & Inversões
            </span>
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-3xl font-black text-white font-sans">{analytics.totalGeneralCount}</div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Volume: <strong className="text-amber-400">{analytics.totalGeneralHl.toFixed(4)} HL</strong> | <strong className="text-emerald-400">{formatCurrency(analytics.totalGeneralVal)}</strong>
            </p>
          </div>
          <div className="text-[9.5px] text-slate-500 border-t border-slate-850 pt-1.5 flex justify-between">
            <span>Todas as ocorrências registradas</span>
            <span className="font-mono text-indigo-400 font-bold">100% Base</span>
          </div>
        </div>

        {/* Loading Errors KPI (Carregamento) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-blue-400 font-mono uppercase tracking-wider">
              Erros de Carregamento
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-950/60 border border-blue-800/40 text-blue-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-blue-400 font-sans">{analytics.totalCarregamentoCount}</span>
              <span className="text-xs font-mono font-bold text-blue-300">({analytics.pctCarregamentoCount.toFixed(1)}%)</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Volume: <strong className="text-blue-300">{analytics.totalCarregamentoHl.toFixed(4)} HL</strong> | <strong className="text-slate-300">{formatCurrency(analytics.totalCarregamentoVal)}</strong>
            </p>
          </div>
          <div className="text-[9.5px] text-blue-400/80 border-t border-slate-850 pt-1.5 flex justify-between">
            <span>Origem: Armazém CD (Sem Vales)</span>
            <span className="font-mono font-bold">{analytics.pctCarregamentoHl.toFixed(1)}% em HL</span>
          </div>
        </div>

        {/* Delivery Errors KPI (Descarregamento / Vales) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-amber-500 font-mono uppercase tracking-wider">
              Erros de Descarregamento
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-800/40 text-amber-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-500 font-sans">{analytics.totalDescarregamentoCount}</span>
              <span className="text-xs font-mono font-bold text-amber-400">({analytics.pctDescarregamentoCount.toFixed(1)}%)</span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Volume: <strong className="text-amber-400">{analytics.totalDescarregamentoHl.toFixed(4)} HL</strong> | <strong className="text-emerald-400">{formatCurrency(analytics.totalDescarregamentoVal)}</strong>
            </p>
          </div>
          <div className="text-[9.5px] text-amber-400/80 border-t border-slate-850 pt-1.5 flex justify-between">
            <span>Origem: Rota / Vales Gerados</span>
            <span className="font-mono font-bold">{analytics.pctDescarregamentoHl.toFixed(1)}% em HL</span>
          </div>
        </div>

        {/* Monthly Average Vales & Compliance Target */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-emerald-400 font-mono uppercase tracking-wider">
              Média Mensal de Vales
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-sans">
              {formatCurrency(analytics.avgMonthlyValesVal)}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-mono font-bold ${
                analytics.avgMonthlyValesVal <= 500 
                  ? "bg-emerald-950 border border-emerald-800 text-emerald-300" 
                  : "bg-rose-950 border border-rose-800 text-rose-300"
              }`}>
                {analytics.avgMonthlyValesVal <= 500 ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Controlado (&le; R$ 500/mês)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>Acima da Meta</span>
                  </>
                )}
              </span>
            </div>
          </div>
          <div className="text-[9.5px] text-slate-500 border-t border-slate-850 pt-1.5 flex justify-between">
            <span>Meta orçamentária de perdas</span>
            <span className="font-mono text-slate-400 font-bold">&le; R$ 500,00</span>
          </div>
        </div>
      </div>

      {/* 3. CHARTS GRID: DONUT PERCENTUAL & ANNUAL TIMELINE BAR CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* DONUT CHART (Gráfico de Rosca) - 5 Cols */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="text-left space-y-0.5">
              <h3 className="font-extrabold text-white text-xs uppercase tracking-wider font-mono flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                Percentual: Carregamento vs Descarregamento
              </h3>
              <p className="text-[10px] text-slate-400">Impacto comparativo proporcional entre os processos</p>
            </div>

            {/* Metric Switcher */}
            <div className="bg-slate-950 border border-slate-800 p-0.5 rounded-xl flex items-center">
              <button
                type="button"
                onClick={() => setDonutMetric("count")}
                className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                  donutMetric === "count" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Qtd
              </button>
              <button
                type="button"
                onClick={() => setDonutMetric("hl")}
                className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                  donutMetric === "hl" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                HL (Vol.)
              </button>
              <button
                type="button"
                onClick={() => setDonutMetric("val")}
                className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                  donutMetric === "val" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                R$ (Fin.)
              </button>
            </div>
          </div>

          {/* Recharts Donut Pie */}
          <div className="h-64 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analytics.donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {analytics.donutData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-left font-sans text-xs space-y-1 z-50">
                          <p className="font-bold text-white uppercase text-[10.5px]">{data.name}</p>
                          <div className="text-[10px] text-slate-300 font-mono space-y-0.5">
                            <p>Ocorrências: <strong className="text-white">{data.count}</strong> ({data.pct.toFixed(1)}%)</p>
                            <p>Volume Físico: <strong className="text-amber-400">{data.hl.toFixed(4)} HL</strong></p>
                            <p>Impacto Financeiro: <strong className="text-emerald-400">{formatCurrency(data.val)}</strong></p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] font-mono font-extrabold text-slate-500 uppercase">Impacto Total</span>
              <span className="text-sm font-black text-white font-mono">
                {donutMetric === "count" ? `${analytics.totalGeneralCount} Casos` : donutMetric === "hl" ? `${analytics.totalGeneralHl.toFixed(2)} HL` : formatCurrency(analytics.totalGeneralVal)}
              </span>
            </div>
          </div>

          {/* Process Breakdown Metrics Cards below Donut */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
            {/* Loading Box */}
            <div className="p-2.5 bg-blue-950/30 border border-blue-900/30 rounded-xl space-y-1 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-blue-400 uppercase">1. Carregamento</span>
                <span className="text-[10px] font-mono font-bold text-blue-300">{analytics.pctCarregamentoCount.toFixed(1)}%</span>
              </div>
              <div className="text-xs font-mono font-bold text-white">{analytics.totalCarregamentoHl.toFixed(4)} HL</div>
              <div className="text-[9.5px] font-mono text-slate-400">{formatCurrency(analytics.totalCarregamentoVal)} (Sem Vale)</div>
            </div>

            {/* Delivery Box */}
            <div className="p-2.5 bg-amber-950/30 border border-amber-900/30 rounded-xl space-y-1 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold text-amber-400 uppercase">2. Descarregamento</span>
                <span className="text-[10px] font-mono font-bold text-amber-300">{analytics.pctDescarregamentoCount.toFixed(1)}%</span>
              </div>
              <div className="text-xs font-mono font-bold text-white">{analytics.totalDescarregamentoHl.toFixed(4)} HL</div>
              <div className="text-[9.5px] font-mono text-emerald-400 font-bold">{formatCurrency(analytics.totalDescarregamentoVal)} (Vales)</div>
            </div>
          </div>
        </div>

        {/* ANNUAL TIMELINE BAR CHART (Linha do Tempo / Gráfico de Barras com Datas do Ano) - 7 Cols */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="text-left space-y-0.5">
              <h3 className="font-extrabold text-white text-xs uppercase tracking-wider font-mono flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Linha do Tempo Anual: Ocorrências de Carregamento e Vales ({selectedYear})
              </h3>
              <p className="text-[10px] text-slate-400">Distribuição temporal mês a mês ao longo de todas as datas do ano</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Timeframe Selector */}
              <select
                value={timeframeFilter}
                onChange={(e) => setTimeframeFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ano">Ano Inteiro (Jan-Dez)</option>
                <option value="s1">1º Semestre (Jan-Jun)</option>
                <option value="s2">2º Semestre (Jul-Dez)</option>
                <option value="mes">Mês Específico</option>
              </select>

              {timeframeFilter === "mes" && (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={idx} value={idx}>{m}</option>
                  ))}
                </select>
              )}

              {/* Metric Mode */}
              <div className="bg-slate-950 border border-slate-800 p-0.5 rounded-xl flex items-center">
                <button
                  type="button"
                  onClick={() => setBarMetric("hl")}
                  className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                    barMetric === "hl" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Exibir em Volume Hectolitros"
                >
                  HL
                </button>
                <button
                  type="button"
                  onClick={() => setBarMetric("val")}
                  className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                    barMetric === "val" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Exibir em Reais (R$)"
                >
                  R$
                </button>
                <button
                  type="button"
                  onClick={() => setBarMetric("count")}
                  className={`px-2.5 py-1 text-[9.5px] font-mono font-bold rounded-lg cursor-pointer transition-colors ${
                    barMetric === "count" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  title="Exibir em Quantidade de Casos"
                >
                  Qtd
                </button>
              </div>
            </div>
          </div>

          {/* Bar Chart Visualization with Click to Stratify */}
          <div className="h-72 w-full cursor-pointer" title="Clique em qualquer mês para abrir a estratificação em árvore detalhada">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredBarData}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                onClick={(data: any) => {
                  if (data && data.activePayload && data.activePayload.length > 0) {
                    const payload = data.activePayload[0].payload;
                    if (payload && payload.monthIdx !== undefined) {
                      setSelectedMonth(payload.monthIdx);
                      setTimeframeFilter("mes");
                      setTimeout(() => {
                        const el = document.getElementById("shortage-tree-breakdown");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis 
                  dataKey="monthName" 
                  stroke="#64748b" 
                  fontSize={11} 
                  tickLine={false} 
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={10} 
                  tickLine={false}
                  tickFormatter={(val) => barMetric === "val" ? `R$${val}` : barMetric === "hl" ? `${val}HL` : val}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-2xl text-left font-sans text-xs space-y-1.5 z-50">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1">
                            <p className="font-extrabold text-white uppercase text-[11px]">
                              {data.fullName} {selectedYear}
                            </p>
                            <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800">
                              Clique p/ Estratificar  árvore
                            </span>
                          </div>
                          <div className="space-y-1 text-[10px] font-mono">
                            <div className="flex justify-between items-center gap-4 text-blue-400">
                              <span>📦 Carregamento:</span>
                              <strong>
                                {barMetric === "hl" ? `${data.carregamentoHl.toFixed(4)} HL` : barMetric === "val" ? formatCurrency(data.carregamentoVal) : `${data.carregamentoCount} casos`}
                              </strong>
                            </div>
                            <div className="flex justify-between items-center gap-4 text-amber-400">
                              <span>🚚 Descarregamento / Vales:</span>
                              <strong>
                                {barMetric === "hl" ? `${data.descarregamentoHl.toFixed(4)} HL` : barMetric === "val" ? formatCurrency(data.descarregamentoVal) : `${data.descarregamentoCount} casos`}
                              </strong>
                            </div>
                            <div className="border-t border-slate-850 pt-1 flex justify-between items-center gap-4 text-slate-300 font-bold">
                              <span>Total Consolidado:</span>
                              <strong className="text-emerald-400">
                                {barMetric === "hl" ? `${data.totalHl.toFixed(4)} HL` : barMetric === "val" ? formatCurrency(data.totalVal) : `${data.totalCount} casos`}
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={30} 
                  formatter={(value) => (
                    <span className="text-[10px] font-mono text-slate-300 font-medium">{value}</span>
                  )}
                />
                <Bar 
                  name="Erros de Carregamento" 
                  dataKey={barMetric === "hl" ? "carregamentoHl" : barMetric === "val" ? "carregamentoVal" : "carregamentoCount"} 
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]} 
                />
                <Bar 
                  name="Erros de Descarregamento (Vales)" 
                  dataKey={barMetric === "hl" ? "descarregamentoHl" : barMetric === "val" ? "descarregamentoVal" : "descarregamentoCount"} 
                  fill="#f59e0b" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800 pt-2 font-sans">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">💡 Dica:</span>
              <span>Clique em qualquer mês ou barra do gráfico para estratificar os erros e o impacto financeiro em árvore.</span>
            </span>
            <span className="font-mono text-slate-500 font-semibold">{filteredBarData.reduce((s, c) => s + c.totalCount, 0)} ocorrências no período</span>
          </div>
        </div>
      </div>

      {/* 3.1 ESTRATIFICAÇÃO DETALHADA EM ÁRVORE HIERÁRQUICA (Hierarchical Tree Table Breakdown) */}
      <ShortageTreeBreakdown
        requests={shortageRequests}
        vales={vales}
        selectedMonth={timeframeFilter === "mes" ? selectedMonth : null}
        onSelectMonth={(m) => {
          if (m === null) {
            setTimeframeFilter("ano");
          } else {
            setSelectedMonth(m);
            setTimeframeFilter("mes");
          }
        }}
        onSelectRequest={onSelectRequest}
      />

      {/* 4. DRIVER RANKING & TIMELINE HIGHLIGHTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Top Impacted Drivers Card */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-2xl text-left">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-wider font-mono flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-500" />
              Condutores com Vales Gerados na Distribuição
            </h3>
            <span className="text-[9px] font-mono text-slate-500">Top Ocorrências</span>
          </div>

          <div className="space-y-2">
            {analytics.topDrivers.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-mono">
                Nenhum vale gerado para motoristas ainda.
              </div>
            ) : (
              analytics.topDrivers.map((driver, idx) => (
                <div 
                  key={driver.name}
                  className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-850 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs font-mono shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-200 block truncate uppercase font-sans">
                          {driver.name}
                        </strong>
                        {driver.isX && (
                          <span className="px-1.5 py-0.2 bg-purple-950 border border-purple-800 text-purple-300 font-mono text-[8px] font-bold rounded">
                            Motorista X (Isento de Rateio)
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">
                        {driver.count} vale(s) emitido(s)
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-emerald-400 font-mono block">
                      {formatCurrency(driver.val)}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      {driver.hl.toFixed(4)} HL
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Process Rules and Guidance */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-3 shadow-2xl text-left flex flex-col justify-between">
          <div className="space-y-1 border-b border-slate-800 pb-2">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Diretrizes de Auditoria & Regras Operacionais SSTR
            </h3>
            <p className="text-[10px] text-slate-400">Conformidade e padrões estabelecidos pela distribuição Pau Brasil</p>
          </div>

          <div className="space-y-2 text-xs font-sans text-slate-300 leading-relaxed">
            <div className="p-2.5 bg-blue-950/20 border border-blue-900/30 rounded-xl space-y-1">
              <strong className="text-blue-400 font-mono text-[10px] uppercase block">1. Erros de Carregamento (Armazém):</strong>
              <p className="text-[10.5px] text-slate-400">
                Ocorrem na separação/carregamento interno. São regularizados via baixa física ou inversão logística. <strong>Não geram vale de cobrança nem faturamento comercial.</strong>
              </p>
            </div>

            <div className="p-2.5 bg-amber-950/20 border border-amber-900/30 rounded-xl space-y-1">
              <strong className="text-amber-400 font-mono text-[10px] uppercase block">2. Erros de Descarregamento (Rota / Entrega):</strong>
              <p className="text-[10.5px] text-slate-400">
                Ocorrem durante o transporte/entrega ao PDV. Geram emissão de vale e cobrança compartilhada entre os integrantes da equipe da rota.
              </p>
            </div>

            <div className="p-2.5 bg-purple-950/20 border border-purple-900/30 rounded-xl space-y-1">
              <strong className="text-purple-400 font-mono text-[10px] uppercase block">3. Regra Especial do Motorista "X":</strong>
              <p className="text-[10.5px] text-slate-400">
                Quando o motorista selecionado for <strong>"X"</strong>, o vale <strong>não é dividido com ele</strong>: se houver 2 ajudantes o valor é dividido 50% entre eles; se houver 1 ajudante, vai integral (100%) para o ajudante.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: GERAR DADOS FICTÍCIOS DE JAN A JUNHO */}
      {isDemoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">
                    Gerar Base Fictícia (Janeiro a Junho)
                  </h3>
                  <p className="text-[10px] text-slate-400">Dados realistas com valores controlados (&lt; R$ 500/mês)</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDemoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 font-sans leading-relaxed">
              <p>
                Esta rotina criará ocorrências mensais de <strong>Janeiro a Junho de 2026</strong> na plataforma:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-400">
                <li>Erros de carregamento no armazém (sem vale).</li>
                <li>Erros de descarregamento com vales gerados para motoristas reais da lista (Edenilson, Valdkleber, Danillo, Ewerton, Adelson, Gilmar, e Motorista X).</li>
                <li><strong>Valores baixos e controlados</strong> que não ultrapassam R$ 500,00 por mês.</li>
              </ul>

              {demoSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 font-mono text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{demoSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setIsDemoModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateJanJunDemoData}
                disabled={isGeneratingDemo}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs font-mono shadow-md flex items-center gap-2 cursor-pointer"
              >
                {isGeneratingDemo ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                    <span>Gerando Ocorrências...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Confirmar e Gerar Base Jan-Jun</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAÇÃO E MESCLAGEM DE ARQUIVOS GRANDES */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in text-left">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">
                    Importar / Mesclar Planilha Anual (Arquivos Grandes)
                  </h3>
                  <p className="text-[10px] text-slate-400">Atualização do ano inteiro com suporte a planilhas pesadas XLSX e CSV</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFeedback(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-2xl space-y-2 text-xs text-slate-300">
                <span className="font-mono font-bold text-slate-400 uppercase text-[10px] block">Instruções de Importação:</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  O sistema aceita planilhas com colunas como: <strong>NF, Mapa, Data, Motorista, CPF Motorista, Ajudante 1, Tipo Erro (Carregamento/Entrega), SKU, Quantidade, Valor</strong>.
                </p>
                <div className="text-[10px] text-emerald-400 font-mono">
                  ✓ Suporta dezenas de milhares de linhas com processamento otimizado em lotes.
                </div>
              </div>

              {/* File Dropzone / Picker */}
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-950/40">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="large-file-input"
                />
                <label htmlFor="large-file-input" className="cursor-pointer space-y-2 block">
                  <Upload className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-xs font-bold text-white">Clique para selecionar a planilha (.xlsx ou .csv)</p>
                  <p className="text-[10px] text-slate-500">Arquivos grandes do ano inteiro são processados automaticamente</p>
                </label>
              </div>

              {/* Progress Bar during large file processing */}
              {isProcessingFile && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Processando e integrando banco de dados...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Import Feedback Result */}
              {importFeedback && (
                <div className={`p-3.5 rounded-2xl text-xs font-mono border flex items-center gap-2.5 ${
                  importFeedback.success 
                    ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" 
                    : "bg-rose-950/80 border-rose-800 text-rose-300"
                }`}>
                  {importFeedback.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                  <span className="leading-snug">{importFeedback.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFeedback(null);
                }}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-mono cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
