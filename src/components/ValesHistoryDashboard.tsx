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
  Zap,
  Info,
  Award
} from "lucide-react";
import { exportValesPacotePrejuizoExcel } from "../utils/excelExport";
import { useSstrData } from "../context/SstrDataContext";
import { calculateRequestValueAndHL, getProductsDatabase, PRODUCT_DATABASE } from "../data/products";
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
  const [selectedMonth, setSelectedMonth] = useState<number>(7); // Default Julho

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

  // Generator of Fictitious Vales Modal State
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorResult, setGeneratorResult] = useState<{ count: number; totalVal: number; totalHl: number; byMonth: Record<number, number> } | null>(null);

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
  const getValeMonth = (dateStr?: string): number => {
    if (!dateStr) return 8; // default to August if missing
    try {
      if (dateStr.includes("-")) {
        const parts = dateStr.split("-");
        return parseInt(parts[1], 10) || 8;
      }
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        return parseInt(parts[1], 10) || 8;
      }
    } catch (e) {}
    return 8;
  };

  // Monthly breakdown map for all 12 months
  const monthlyStats = useMemo(() => {
    const map: Record<number, { count: number; val: number; hl: number; vales: ValeEntry[] }> = {};
    for (let m = 1; m <= 12; m++) {
      map[m] = { count: 0, val: 0, hl: 0, vales: [] };
    }

    validVales.forEach(v => {
      const m = getValeMonth(v.dataEmissao);
      if (map[m]) {
        map[m].count += 1;
        map[m].val += v.valorTotal || 0;
        map[m].hl += v.hectolitros || 0;
        map[m].vales.push(v);
      }
    });

    return map;
  }, [validVales]);

  // Vales for the selected mode & month
  const activeDatasetVales = useMemo(() => {
    if (activeTabMode === "acumulado") {
      return validVales;
    } else {
      return monthlyStats[selectedMonth]?.vales || [];
    }
  }, [activeTabMode, selectedMonth, validVales, monthlyStats]);

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

  // Filtered Vales List
  const filteredVales = useMemo(() => {
    return activeDatasetVales.filter(v => {
      const matchSearch = !searchTerm ||
        v.nf.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.motorista.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.motoristaCpf && v.motoristaCpf.includes(searchTerm)) ||
        (v.ajudantes && v.ajudantes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.ajudante1 && v.ajudante1.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (v.ajudante2 && v.ajudante2.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchRoute = selectedRoute === "todas" || v.rota.trim() === selectedRoute.trim();
      const st = v.status || "pendente";
      const matchStatus = selectedStatusFilter === "todos" || st === selectedStatusFilter;

      return matchSearch && matchRoute && matchStatus;
    });
  }, [activeDatasetVales, searchTerm, selectedRoute, selectedStatusFilter]);

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

  // Driver ranking analytics for active dataset (Top 5)
  const driverRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    activeDatasetVales.forEach(v => {
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
  }, [activeDatasetVales]);

  // Helper/Crew ranking analytics for active dataset (Top 5)
  const helperRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    
    activeDatasetVales.forEach(v => {
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
  }, [activeDatasetVales]);

  // GENERATOR FUNCTION: Fictitious Vales from January to July/August for ALL Drivers
  const handleGenerateFictitiousVales = async () => {
    setIsGenerating(true);

    try {
      const allDrivers = DEFAULT_LISTA_CREW.filter(c => c.cargo.includes("MOTORISTA"));
      const allHelpers = DEFAULT_LISTA_CREW.filter(c => c.cargo.includes("AJUDANTE"));
      const catalog = PRODUCT_DATABASE;

      // Calculate July/August average number of vales if available, or target 4-6 vales per month
      const julAugCount = (monthlyStats[7]?.count || 0) + (monthlyStats[8]?.count || 0);
      const avgPerMonth = julAugCount > 0 ? Math.max(3, Math.min(8, Math.round(julAugCount / 2))) : 5;

      let generatedCount = 0;
      let generatedVal = 0;
      let generatedHl = 0;
      const byMonthSummary: Record<number, number> = {};

      let driverIndex = 0;
      let helperIndex = 0;
      let sequenceId = 1000 + Math.floor(Math.random() * 500);

      // Generate from month 1 (Janeiro) to month 7 (Julho) [and complement August if low]
      const targetMonths = [1, 2, 3, 4, 5, 6, 7];

      for (const m of targetMonths) {
        byMonthSummary[m] = 0;
        // Generate between 4 to 6 vales per month
        const countForThisMonth = Math.floor(Math.random() * 2) + avgPerMonth;

        for (let i = 0; i < countForThisMonth; i++) {
          sequenceId++;
          driverIndex = (driverIndex + 1) % allDrivers.length;
          const driver = allDrivers[driverIndex];
          
          helperIndex = (helperIndex + 1) % allHelpers.length;
          const h1 = allHelpers[helperIndex];
          helperIndex = (helperIndex + 1) % allHelpers.length;
          const h2 = allHelpers[helperIndex];

          const isX = isDriverX(driver.nome);
          const rotaNum = 100 + (driverIndex + 1);
          const rota = String(rotaNum);

          // Day of the month (between 2 and 27)
          const day = Math.min(27, Math.max(2, (i * 5 + 3) % 27));
          const dateStr = `2026-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          // Pick authentic Ambev product
          const prod = catalog[sequenceId % catalog.length];
          const qty = (sequenceId % 3) + 1; // 1 to 3 boxes
          const factorEmbalagem = prod.fator && prod.fator > 0 ? prod.fator : 24;
          const factorHl = prod.fatorHecto && prod.fatorHecto > 0 ? prod.fatorHecto : 0.084;
          const unitPrice = prod.valor && prod.valor > 0 ? prod.valor : 82.50;

          const totalVal = unitPrice * qty;
          const totalHl = factorHl * qty;

          const reqId = `req-vale-fict-${m}-${sequenceId}`;
          const valeId = `VALE-2026-${m}-${sequenceId}`;
          const mapaStr = `M${3000 + sequenceId}`;
          const nfStr = `94${sequenceId}`;
          const codCliente = `CLI${4000 + (sequenceId % 60)}`;

          const reqItem: RequestItem = {
            id: `item-${reqId}-1`,
            item: prod.codigo,
            descricao: prod.descricao,
            quantidade: qty,
            unidadeMedida: "cx",
            fatorEmbalagem: factorEmbalagem,
            fatorHecto: factorHl,
            customUnitPrice: unitPrice,
            precoCalculated: totalVal,
            hectolitros: totalHl,
            motivo: "Falta na Descarga / Entrega (Vale Gerado)"
          };

          const newReq: PendingRequest = {
            id: reqId,
            timestamp: new Date(2026, m - 1, day, 11, 30).getTime(),
            nb: codCliente,
            fotoUrl: "",
            nf: nfStr,
            mapa: mapaStr,
            setor: rota,
            data: dateStr,
            statusPromax: "cadastrado",
            motivo: "Falta no Descarregamento (Rota / Entrega)",
            observacao: `Falta de SKU na conferência do PDV. Termo de compromisso e vale faturado para acerto da rota ${rota}.`,
            item: prod.codigo,
            descricaoProduto: prod.descricao,
            quantidade: qty,
            unidadeMedida: "cx",
            hectolitros: totalHl,
            items: [reqItem],
            faltaTipoErro: "entrega",
            tipoRegistroFalta: true,
            gerouVale: true,
            valeId: valeId,
            faltaMotorista: driver.nome,
            faltaMotoristaCpf: driver.cpf,
            faltaAjudante1: h1.nome,
            faltaAjudante1Cpf: h1.cpf,
            faltaAjudante2: isX ? h2.nome : undefined,
            faltaAjudante2Cpf: isX ? h2.cpf : undefined
          };

          const newVale: ValeEntry = {
            id: valeId,
            requestId: reqId,
            nf: nfStr,
            rota: rota,
            dataEmissao: dateStr,
            motorista: driver.nome,
            motoristaCpf: driver.cpf,
            ajudantes: isX ? `${h1.nome}, ${h2.nome}` : h1.nome,
            ajudante1: h1.nome,
            ajudante1Cpf: h1.cpf,
            ajudante2: isX ? h2.nome : "",
            ajudante2Cpf: isX ? h2.cpf : "",
            hectolitros: totalHl,
            valorTotal: totalVal,
            itemsCount: 1,
            status: "assinado",
            originalRequest: newReq
          };

          await savePendingRequest(newReq);
          await saveValeEntry(newVale);

          generatedCount++;
          generatedVal += totalVal;
          generatedHl += totalHl;
          byMonthSummary[m]++;
        }
      }

      setGeneratorResult({
        count: generatedCount,
        totalVal: generatedVal,
        totalHl: generatedHl,
        byMonth: byMonthSummary
      });

    } catch (err: any) {
      console.error("Generator error:", err);
      alert("Erro ao gerar dados fictícios: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Clear simulated fictitious vales helper
  const handleClearFictitiousVales = async () => {
    if (!window.confirm("Deseja realmente remover todos os vales fictícios gerados?")) return;

    setIsGenerating(true);
    try {
      const fictVales = vales.filter(v => v.id.startsWith("VALE-2026-") || v.requestId.startsWith("req-vale-fict-"));
      for (const v of fictVales) {
        await deleteValeEntry(v.id);
        if (v.requestId) {
          await deletePendingRequest(v.requestId);
        }
      }
      alert(`Removidos ${fictVales.length} vales fictícios com sucesso.`);
      setIsGeneratorModalOpen(false);
      setGeneratorResult(null);
    } catch (e: any) {
      alert("Erro ao limpar vales fictícios: " + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

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
          {/* Fictitious Data Generator Trigger Button */}
          <button
            type="button"
            onClick={() => {
              setGeneratorResult(null);
              setIsGeneratorModalOpen(true);
            }}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold px-3.5 py-2 rounded-xl text-xs font-mono transition-all shadow-lg flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
            title="Gerar base de vales fictícios de Janeiro a Julho usando média de Julho/Agosto com todos os motoristas"
          >
            <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
            <span>Gerador Fictício (Jan a Jul)</span>
          </button>

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
        <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-xl overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase px-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              <span>Selecione o Mês:</span>
            </div>
            {MONTH_NAMES.map(m => {
              const count = monthlyStats[m.num]?.count || 0;
              const val = monthlyStats[m.num]?.val || 0;
              const isSelected = selectedMonth === m.num;

              return (
                <button
                  key={m.num}
                  type="button"
                  onClick={() => setSelectedMonth(m.num)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono transition-all flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? "bg-amber-500 border-amber-400 text-slate-950 font-black shadow-lg scale-[1.02]"
                      : "bg-slate-950/70 hover:bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
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
      )}

      {/* 3. METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Count */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-blue-400 font-mono uppercase tracking-wider block">
              {activeTabMode === "acumulado" ? "Vales Acumulados no Ano" : `Vales em ${MONTH_NAMES.find(m => m.num === selectedMonth)?.full}`}
            </span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-white font-sans">{currentStats.totalCount}</strong>
              <span className="text-xs text-slate-450 font-medium">unidades</span>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">
              {activeTabMode === "acumulado" ? "Consolidado geral de todas as emissões" : `Mês de referência: ${MONTH_NAMES.find(m => m.num === selectedMonth)?.label}`}
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
              Volume Total ({activeTabMode === "acumulado" ? "Ano" : MONTH_NAMES.find(m => m.num === selectedMonth)?.short})
            </span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-amber-500 font-sans">{currentStats.totalHl.toFixed(4)}</strong>
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
              Montante de Cobranças ({activeTabMode === "acumulado" ? "Acumulado" : MONTH_NAMES.find(m => m.num === selectedMonth)?.short})
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
                  onClick={() => {
                    setSelectedMonth(m.num);
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
                      {hl.toFixed(3)} HL
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
              Ranking de Condutores {activeTabMode === "acumulado" ? "(Geral do Ano)" : `(${MONTH_NAMES.find(m => m.num === selectedMonth)?.full})`}
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
                      <span className="text-xs font-black text-white font-mono block">{driver.hl.toFixed(4)} HL</span>
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
              Ranking de Ajudantes {activeTabMode === "acumulado" ? "(Geral do Ano)" : `(${MONTH_NAMES.find(m => m.num === selectedMonth)?.full})`}
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
                      <span className="text-xs font-black text-white font-mono block">{helper.hl.toFixed(4)} HL</span>
                      <span className="text-[9.5px] text-emerald-450 font-bold block">{formatCurrency(helper.val)} ({helper.count} v.)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 6. LOG LISTING TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Table Filters header */}
        <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between border-b border-slate-800 pb-4">
          <div className="text-left space-y-1 w-full xl:w-auto">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              {activeTabMode === "acumulado" 
                ? "Registros Detalhados de Todos os Vales do Ano" 
                : `Registros de Vales de ${MONTH_NAMES.find(m => m.num === selectedMonth)?.full} de 2026`}
            </h3>
            <p className="text-[10px] text-slate-400">
              Total listado: <strong>{filteredVales.length} itens</strong> • Volume: <strong>{currentStats.totalHl.toFixed(3)} HL</strong> • Montante: <strong>{formatCurrency(currentStats.totalVal)}</strong>
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
              onClick={() => exportValesPacotePrejuizoExcel(
                filteredVales, 
                activeTabMode === "mensal" 
                  ? `vales_${MONTH_NAMES.find(m => m.num === selectedMonth)?.short.toLowerCase()}_2026` 
                  : `vales_acumulado_2026`
              )}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-3.5 py-1.5 rounded-xl text-xs font-mono transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0 border border-emerald-500/40"
              title="Baixar planilha Excel com detalhamento completo dos vales e rateio"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>{activeTabMode === "mensal" ? `Exportar ${MONTH_NAMES.find(m => m.num === selectedMonth)?.short}` : "Exportar Excel"}</span>
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
                      {(vale.hectolitros || 0).toFixed(4)} HL
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

      {/* FICTITIOUS DATA GENERATOR MODAL */}
      {isGeneratorModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in no-print"
          onClick={() => !isGenerating && setIsGeneratorModalOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white font-mono uppercase">
                    Gerador de Vales Fictícios (Janeiro a Julho)
                  </h3>
                  <p className="text-[10.5px] text-slate-400 font-sans">
                    Distribuição automática calibrada na média de Julho e Agosto para todos os condutores
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGeneratorModalOpen(false)}
                disabled={isGenerating}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5 text-xs text-slate-300">
                <h4 className="font-bold text-white font-mono flex items-center gap-1.5 text-xs uppercase text-amber-400">
                  <Info className="w-4 h-4" /> Parâmetros de Geração Automatizada:
                </h4>
                <ul className="space-y-1.5 text-[11px] list-disc list-inside text-slate-300 font-sans">
                  <li><strong>Período:</strong> Janeiro, Fevereiro, Março, Abril, Maio, Junho e Julho de 2026.</li>
                  <li><strong>Escala de Motoristas:</strong> Utiliza todos os <strong>17 motoristas cadastrados</strong> na base (incluindo o motorista <strong>X</strong> com regra de isenção e divisão aos ajudantes).</li>
                  <li><strong>Ajudantes e Equipes:</strong> Associa ajudantes reais de distribuição da lista oficial.</li>
                  <li><strong>Produtos Ambev:</strong> Seleciona itens oficiais (Skol, Brahma, Spaten, Stella, Guaraná Antarctica, etc.) com cálculo automático de Hectolitros e preços de tabela.</li>
                  <li><strong>Calibragem:</strong> Mantém a média mensal de 4 a 6 vales por mês com valores controlados e equilibrados.</li>
                </ul>
              </div>

              {generatorResult && (
                <div className="p-4 bg-emerald-950/80 border border-emerald-700/80 rounded-2xl space-y-2 text-emerald-200">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Dados Fictícios Gerados com Sucesso!</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono text-xs">
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-emerald-900/60">
                      <span className="text-[10px] text-slate-400 block">Total Vales</span>
                      <strong className="text-white text-sm">{generatorResult.count}</strong>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-emerald-900/60">
                      <span className="text-[10px] text-slate-400 block">Volume Total</span>
                      <strong className="text-amber-400 text-sm">{generatorResult.totalHl.toFixed(3)} HL</strong>
                    </div>
                    <div className="bg-slate-950/60 p-2 rounded-xl border border-emerald-900/60">
                      <span className="text-[10px] text-slate-400 block">Montante Total</span>
                      <strong className="text-emerald-400 text-sm">{formatCurrency(generatorResult.totalVal)}</strong>
                    </div>
                  </div>
                  <p className="text-[10.5px] font-sans text-emerald-300/80 pt-1">
                    Os vales foram salvos nas guias de Histórico e sincronizados com a guia de Faltas/Inversões.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleClearFictitiousVales}
                  disabled={isGenerating}
                  className="w-full sm:w-auto px-3.5 py-2 bg-slate-950 hover:bg-rose-950/80 hover:text-rose-300 text-slate-400 border border-slate-800 hover:border-rose-800 rounded-xl text-xs font-mono transition-colors cursor-pointer"
                >
                  Limpar Vales Fictícios
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setIsGeneratorModalOpen(false)}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateFictitiousVales}
                    disabled={isGenerating}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-black rounded-xl cursor-pointer transition-all shadow-lg hover:scale-[1.02] flex items-center gap-1.5"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Gerando Vales...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>Gerar Vales Agora</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
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
