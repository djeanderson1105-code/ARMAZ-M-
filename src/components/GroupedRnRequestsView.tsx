import React, { useState, useMemo } from "react";
import { 
  PendingRequest, 
  ExchangeRecord, 
  RepresentativeInfo, 
  RouteDriverInfo, 
  isFaltaOrInversaoReq,
  getDisplayCadastroUser,
  DEFAULT_REPRESENTATIVOS_SETOR
} from "../types";
import { calculateRequestValueAndHL } from "../data/products";
import { 
  Users, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  FileText, 
  Eye, 
  Camera, 
  Printer, 
  Filter, 
  Layers, 
  DollarSign, 
  Package, 
  TrendingUp,
  X,
  ExternalLink,
  ShieldCheck,
  Building2,
  Calendar,
  Truck,
  RotateCw
} from "lucide-react";

interface GroupedRnRequestsViewProps {
  requests: PendingRequest[];
  promaxRecords: ExchangeRecord[];
  repsList?: Record<string, RepresentativeInfo>;
  motoristasList?: Record<string, RouteDriverInfo>;
  onInspectRequest?: (req: PendingRequest) => void;
  onZoomPhoto?: (photoUrl: string) => void;
  onApproveRequest?: (req: PendingRequest) => Promise<void> | void;
  onRejectRequest?: (req: PendingRequest, reason: string) => Promise<void> | void;
}

export default function GroupedRnRequestsView({
  requests,
  promaxRecords,
  repsList = DEFAULT_REPRESENTATIVOS_SETOR,
  motoristasList = {},
  onInspectRequest,
  onZoomPhoto,
  onApproveRequest,
  onRejectRequest
}: GroupedRnRequestsViewProps) {
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [baseFilter, setBaseFilter] = useState<"todos" | "DIEGO" | "ERIVAN" | "OUTROS">("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | "com_solicitacoes" | "pendentes" | "aprovadas" | "faltas">("todos");
  
  // Expanded sectors map (default to open sectors that have solicitations)
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    // Auto-open sectors with pending or active requests
    requests.forEach(r => {
      const sec = (r.setor || "").replace(/setor/i, "").trim();
      if (sec) initial[sec] = true;
    });
    return initial;
  });

  // Local modals
  const [localInspectReq, setLocalInspectReq] = useState<PendingRequest | null>(null);
  const [localZoomPhoto, setLocalZoomPhoto] = useState<string | null>(null);
  const [photoRotation, setPhotoRotation] = useState<number>(0);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Local PDV database for client name resolution
  const pdvDb = useMemo(() => {
    try {
      const saved = localStorage.getItem("sstr_custom_pdvs_v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const map: Record<string, any> = {};
          parsed.forEach((pdv: any) => {
            if (pdv.nb) map[pdv.nb.toString().trim()] = pdv;
          });
          return map;
        }
        return parsed || {};
      }
    } catch (e) {
      console.error(e);
    }
    return {};
  }, []);

  const resolveClientName = (nb: string | undefined): string => {
    const cleanNb = (nb || "").trim();
    if (!cleanNb) return "CLIENTE NÃO IDENTIFICADO";
    
    // Check in PDV database
    if (pdvDb[cleanNb]?.razaoSocial) return pdvDb[cleanNb].razaoSocial;
    
    // Normalize leading zeros
    const num = parseInt(cleanNb, 10);
    if (!isNaN(num)) {
      const foundKey = Object.keys(pdvDb).find(k => parseInt(k, 10) === num);
      if (foundKey && pdvDb[foundKey]?.razaoSocial) return pdvDb[foundKey].razaoSocial;
    }

    // Match in promax records
    const matching = promaxRecords.find(r => (r.codigoCliente || "").trim() === cleanNb);
    if (matching?.nomeCliente) return matching.nomeCliente;

    return `CLIENTE PARCEIRO (#${cleanNb})`;
  };

  // Group requests by sector
  const groupedData = useMemo(() => {
    // Collect all registered sectors + any extra sectors present in requests
    const allSectors = new Set<string>(Object.keys(repsList));
    requests.forEach(r => {
      const sec = (r.setor || "").replace(/setor/i, "").trim();
      if (sec) allSectors.add(sec);
    });

    const groups = Array.from(allSectors).map(secKey => {
      const rep = repsList[secKey] || {
        setor: secKey,
        nome: `REPRESENTANTE SETOR ${secKey}`,
        gv: secKey.startsWith("6") ? "DIEGO" : secKey.startsWith("7") ? "ERIVAN" : "OUTRO",
        cpf: "-",
        base: secKey.startsWith("6") ? "DIEGO" : secKey.startsWith("7") ? "ERIVAN" : "OUTRO"
      };

      // Filter requests belonging to this sector
      const sectorReqs = requests.filter(r => {
        const rSec = (r.setor || "").replace(/setor/i, "").trim();
        return rSec.toLowerCase() === secKey.toLowerCase();
      });

      // Calculate totals
      let pendingCount = 0;
      let approvedCount = 0;
      let rejectedCount = 0;
      let faltasCount = 0;
      let valesCount = 0;
      let totalVal = 0;
      let totalHl = 0;

      sectorReqs.forEach(req => {
        const { valorTotal, hectolitros } = calculateRequestValueAndHL(req, promaxRecords);
        totalVal += valorTotal || 0;
        totalHl += hectolitros || 0;

        if (req.statusPromax === "pendente") pendingCount++;
        else if (req.statusPromax === "cadastrado" || req.status === "concluido" || req.status === "aprovado") approvedCount++;
        else if (req.statusPromax === "reprovado") rejectedCount++;

        if (isFaltaOrInversaoReq(req)) faltasCount++;
        if (req.gerouVale) valesCount++;
      });

      return {
        setor: secKey,
        rep,
        requests: sectorReqs,
        totalCount: sectorReqs.length,
        pendingCount,
        approvedCount,
        rejectedCount,
        faltasCount,
        valesCount,
        totalVal,
        totalHl
      };
    });

    // Sort numerically by sector
    return groups.sort((a, b) => {
      const numA = parseInt(a.setor, 10);
      const numB = parseInt(b.setor, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.setor.localeCompare(b.setor);
    });
  }, [requests, repsList, promaxRecords]);

  // Apply filters to groups
  const filteredGroups = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return groupedData.filter(group => {
      // Base Filter
      if (baseFilter === "DIEGO" && group.rep.gv !== "DIEGO") return false;
      if (baseFilter === "ERIVAN" && group.rep.gv !== "ERIVAN") return false;
      if (baseFilter === "OUTROS" && (group.rep.gv === "DIEGO" || group.rep.gv === "ERIVAN")) return false;

      // Status Filter
      if (statusFilter === "com_solicitacoes" && group.totalCount === 0) return false;
      if (statusFilter === "pendentes" && group.pendingCount === 0) return false;
      if (statusFilter === "aprovadas" && group.approvedCount === 0) return false;
      if (statusFilter === "faltas" && group.faltasCount === 0) return false;

      // Search Query Filter
      if (q) {
        const matchSector = group.setor.toLowerCase().includes(q);
        const matchRepName = group.rep.nome.toLowerCase().includes(q);
        const matchCpf = (group.rep.cpf || "").toLowerCase().includes(q);
        const matchGv = (group.rep.gv || "").toLowerCase().includes(q);

        const matchInternalReq = group.requests.some(r => {
          const clientName = resolveClientName(r.nb).toLowerCase();
          return (
            (r.nb || "").toLowerCase().includes(q) ||
            (r.nf || "").toLowerCase().includes(q) ||
            (r.mapa || "").toLowerCase().includes(q) ||
            (r.motivo || "").toLowerCase().includes(q) ||
            (r.item || "").toLowerCase().includes(q) ||
            (r.descricaoProduto || "").toLowerCase().includes(q) ||
            clientName.includes(q)
          );
        });

        if (!matchSector && !matchRepName && !matchCpf && !matchGv && !matchInternalReq) {
          return false;
        }
      }

      return true;
    });
  }, [groupedData, baseFilter, statusFilter, searchTerm]);

  // Global KPIs summary
  const summaryKpis = useMemo(() => {
    let totalReqs = 0;
    let pendingReqs = 0;
    let approvedReqs = 0;
    let faltasReqs = 0;
    let totalVal = 0;
    let totalHl = 0;
    let rnsWithRequests = 0;
    let rnsWithPending = 0;

    groupedData.forEach(g => {
      totalReqs += g.totalCount;
      pendingReqs += g.pendingCount;
      approvedReqs += g.approvedCount;
      faltasReqs += g.faltasCount;
      totalVal += g.totalVal;
      totalHl += g.totalHl;
      if (g.totalCount > 0) rnsWithRequests++;
      if (g.pendingCount > 0) rnsWithPending++;
    });

    return {
      totalRns: groupedData.length,
      rnsWithRequests,
      rnsWithPending,
      totalReqs,
      pendingReqs,
      approvedReqs,
      faltasReqs,
      totalVal,
      totalHl
    };
  }, [groupedData]);

  // Toggle single sector expansion
  const toggleSector = (sec: string) => {
    setExpandedSectors(prev => ({
      ...prev,
      [sec]: !prev[sec]
    }));
  };

  // Expand / Collapse all
  const handleExpandAll = () => {
    const allOpen: Record<string, boolean> = {};
    filteredGroups.forEach(g => {
      allOpen[g.setor] = true;
    });
    setExpandedSectors(allOpen);
  };

  const handleCollapseAll = () => {
    setExpandedSectors({});
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
  };

  const formatHl = (val: number) => {
    return `${val.toFixed(2).replace(".", ",")} HL`;
  };

  const handleOpenInspect = (req: PendingRequest) => {
    if (onInspectRequest) {
      onInspectRequest(req);
    } else {
      setLocalInspectReq(req);
    }
  };

  const handleOpenPhoto = (url: string) => {
    if (onZoomPhoto) {
      onZoomPhoto(url);
    } else {
      setLocalZoomPhoto(url);
      setPhotoRotation(0);
    }
  };

  // Print view handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 text-slate-100 animate-fade-in">
      
      {/* 1. TOP HEADER & KPI SUMMARY */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-3xl shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-800/60 text-blue-300 text-[10px] font-mono font-bold uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Painel Centralizado dos Representantes de Negócios (RN)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black font-display text-white tracking-tight flex items-center gap-2.5">
              <span>Todas as Solicitações Agrupadas por RN & Setor</span>
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed font-sans">
              Consulte e audite todas as solicitações de trocas, reposições, inversões e faltas de campo em um único local, organizadas por setor de venda com alinhamento claro de valores, status e comprovantes.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExpandAll}
              className="px-3 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-xl border border-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Expandir todas as pastas de RNs"
            >
              <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
              <span>Expandir Todos</span>
            </button>
            <button
              onClick={handleCollapseAll}
              className="px-3 py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-mono font-bold rounded-xl border border-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Recolher todas as pastas de RNs"
            >
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              <span>Recolher Todos</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold rounded-xl shadow-lg shadow-blue-950/40 transition-all cursor-pointer flex items-center gap-1.5"
              title="Imprimir visualização consolidada dos RNs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>

        {/* 2. SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
          {/* Card 1: RNs Total */}
          <div className="bg-slate-950/70 border border-slate-850 p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden">
            <span className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block flex items-center gap-1">
              <Users className="w-3 h-3 text-blue-400" /> RNs Cadastrados
            </span>
            <p className="text-xl font-black text-white font-mono">{summaryKpis.totalRns}</p>
            <span className="text-[9px] text-slate-500 font-sans block">{summaryKpis.rnsWithRequests} com solicitações</span>
          </div>

          {/* Card 2: Total Solicitations */}
          <div className="bg-slate-950/70 border border-slate-850 p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden">
            <span className="text-[9.5px] font-mono text-slate-400 uppercase font-bold block flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-400" /> Total Solicitações
            </span>
            <p className="text-xl font-black text-indigo-400 font-mono">{summaryKpis.totalReqs}</p>
            <span className="text-[9px] text-slate-500 font-sans block">Base geral registrada</span>
          </div>

          {/* Card 3: Pending */}
          <div className={`border p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden ${
            summaryKpis.pendingReqs > 0 ? "bg-amber-950/40 border-amber-800/60" : "bg-slate-950/70 border-slate-850"
          }`}>
            <span className="text-[9.5px] font-mono text-amber-400 uppercase font-bold block flex items-center gap-1">
              <Clock className={`w-3 h-3 ${summaryKpis.pendingReqs > 0 ? "animate-pulse" : ""}`} /> Pendentes
            </span>
            <p className="text-xl font-black text-amber-400 font-mono flex items-center gap-1.5">
              <span>{summaryKpis.pendingReqs}</span>
              {summaryKpis.pendingReqs > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              )}
            </p>
            <span className="text-[9px] text-amber-400/80 font-sans block">Em {summaryKpis.rnsWithPending} setor(es)</span>
          </div>

          {/* Card 4: Approved */}
          <div className="bg-slate-950/70 border border-slate-850 p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden">
            <span className="text-[9.5px] font-mono text-emerald-400 uppercase font-bold block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Aprovadas / Cad.
            </span>
            <p className="text-xl font-black text-emerald-400 font-mono">{summaryKpis.approvedReqs}</p>
            <span className="text-[9px] text-slate-500 font-sans block">Homologadas no Promax</span>
          </div>

          {/* Card 5: Financial Total */}
          <div className="bg-slate-950/70 border border-slate-850 p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden">
            <span className="text-[9.5px] font-mono text-emerald-400 uppercase font-bold block flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400" /> Impacto Financeiro
            </span>
            <p className="text-lg font-black text-emerald-300 font-mono truncate">{formatCurrency(summaryKpis.totalVal)}</p>
            <span className="text-[9px] text-slate-500 font-sans block">Repasse consolidado</span>
          </div>

          {/* Card 6: Hectolitros Total */}
          <div className="bg-slate-950/70 border border-slate-850 p-3.5 rounded-2xl space-y-1 text-left relative overflow-hidden">
            <span className="text-[9.5px] font-mono text-cyan-400 uppercase font-bold block flex items-center gap-1">
              <Package className="w-3 h-3 text-cyan-400" /> Volume Hectolitros
            </span>
            <p className="text-lg font-black text-cyan-300 font-mono truncate">{formatHl(summaryKpis.totalHl)}</p>
            <span className="text-[9px] text-slate-500 font-sans block">Cálculo proporcional HL</span>
          </div>
        </div>
      </div>

      {/* 3. TOOLBAR & ADVANCED FILTERS */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3 no-print">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          
          {/* Search Bar */}
          <div className="md:col-span-5 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por RN, Setor, CPF, Cód. NB, Razão Social, NF, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter by Base / GV */}
          <div className="md:col-span-4 flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] font-mono text-slate-400 px-2 font-bold uppercase shrink-0">Base / GV:</span>
            <button
              onClick={() => setBaseFilter("todos")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all cursor-pointer text-center ${
                baseFilter === "todos" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setBaseFilter("DIEGO")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all cursor-pointer text-center ${
                baseFilter === "DIEGO" ? "bg-blue-700 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Diego (600)
            </button>
            <button
              onClick={() => setBaseFilter("ERIVAN")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition-all cursor-pointer text-center ${
                baseFilter === "ERIVAN" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"
              }`}
            >
              Erivan (700)
            </button>
          </div>

          {/* Filter by Status */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
            >
              <option value="todos">Exibir Todos os RNs</option>
              <option value="com_solicitacoes">Apenas com Solicitações</option>
              <option value="pendentes">Apenas com Pendências (⚠️)</option>
              <option value="aprovadas">Com Aprovadas / Cadastradas</option>
              <option value="faltas">Com Faltas & Inversões</option>
            </select>
          </div>
        </div>

        {/* Counter of matched sectors */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
          <span>
            Exibindo <strong className="text-white">{filteredGroups.length}</strong> de <strong className="text-white">{groupedData.length}</strong> setores/RNs
          </span>
          {(searchTerm || baseFilter !== "todos" || statusFilter !== "todos") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setBaseFilter("todos");
                setStatusFilter("todos");
              }}
              className="text-blue-400 hover:text-blue-300 underline font-bold cursor-pointer"
            >
              Limpar Todos os Filtros
            </button>
          )}
        </div>
      </div>

      {/* 4. GROUPED LIST (ACCORDION PER RN / SETOR) */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 p-12 rounded-3xl text-center space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h4 className="text-base font-bold text-white">Nenhum Representante ou Solicitação Encontrada</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Não foram encontrados resultados para os filtros selecionados. Tente ajustar os termos de busca ou mudar os critérios de base/status.
            </p>
          </div>
        ) : (
          filteredGroups.map(group => {
            const isExpanded = !!expandedSectors[group.setor];
            const hasPending = group.pendingCount > 0;

            return (
              <div
                key={group.setor}
                className={`bg-slate-900 border rounded-3xl shadow-xl transition-all overflow-hidden ${
                  hasPending 
                    ? "border-amber-500/50 shadow-amber-950/20" 
                    : isExpanded 
                      ? "border-blue-500/40 shadow-blue-950/20" 
                      : "border-slate-800 hover:border-slate-750"
                }`}
              >
                {/* ACCORDION HEADER (RN SUMMARY BAR) */}
                <div
                  onClick={() => toggleSector(group.setor)}
                  className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                    isExpanded 
                      ? "bg-slate-850/80 border-b border-slate-800" 
                      : "bg-slate-900/90 hover:bg-slate-850/50"
                  }`}
                >
                  {/* Left: Sector & RN Identity */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    {/* Sector Badge */}
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex flex-col items-center justify-center font-mono font-black shadow-lg shadow-blue-950/50 shrink-0 border border-blue-400/30">
                      <span className="text-[9px] uppercase font-bold opacity-80 leading-none">SETOR</span>
                      <span className="text-base leading-tight">{group.setor}</span>
                    </div>

                    <div className="space-y-1 text-left min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase truncate">
                          {group.rep.nome}
                        </h3>
                        {/* Base Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                          group.rep.gv === "DIEGO"
                            ? "bg-blue-950/80 text-blue-300 border-blue-800/60"
                            : group.rep.gv === "ERIVAN"
                              ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}>
                          GV: {group.rep.gv}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono">
                        {group.rep.cpf && (
                          <span>CPF: <strong className="text-slate-300">{group.rep.cpf}</strong></span>
                        )}
                        <span className="text-slate-650">•</span>
                        <span>Base de Atuação: <strong className="text-slate-300">{group.rep.base || group.rep.gv}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Metrics & Expand Chevron */}
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
                    {/* Total Count Badge */}
                    <div className="px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-center">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Solicitações</span>
                      <span className="text-xs font-bold font-mono text-white">{group.totalCount}</span>
                    </div>

                    {/* Pending Alert Badge */}
                    {group.pendingCount > 0 && (
                      <div className="px-3 py-1.5 bg-amber-950/80 border border-amber-700/80 rounded-xl text-center animate-pulse">
                        <span className="text-[9px] font-mono text-amber-300 block uppercase font-bold">Pendentes</span>
                        <span className="text-xs font-black font-mono text-amber-300 flex items-center justify-center gap-1">
                          <span>{group.pendingCount}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                        </span>
                      </div>
                    )}

                    {/* Approved Badge */}
                    {group.approvedCount > 0 && (
                      <div className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-center">
                        <span className="text-[9px] font-mono text-emerald-400 block uppercase">Aprovadas</span>
                        <span className="text-xs font-bold font-mono text-emerald-300">{group.approvedCount}</span>
                      </div>
                    )}

                    {/* Faltas / Inversões Badge */}
                    {group.faltasCount > 0 && (
                      <div className="px-3 py-1.5 bg-indigo-950/60 border border-indigo-800/60 rounded-xl text-center">
                        <span className="text-[9px] font-mono text-indigo-400 block uppercase">Faltas/Inv.</span>
                        <span className="text-xs font-bold font-mono text-indigo-300">{group.faltasCount}</span>
                      </div>
                    )}

                    {/* Financial Value Badge */}
                    <div className="px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-center min-w-[90px]">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Valor Total</span>
                      <span className="text-xs font-bold font-mono text-emerald-400">{formatCurrency(group.totalVal)}</span>
                    </div>

                    {/* Hectolitros Badge */}
                    <div className="hidden sm:block px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-center min-w-[75px]">
                      <span className="text-[9px] font-mono text-slate-400 block uppercase">Volume</span>
                      <span className="text-xs font-bold font-mono text-cyan-400">{formatHl(group.totalHl)}</span>
                    </div>

                    {/* Expand/Collapse Chevron Button */}
                    <div className={`p-2 rounded-xl border transition-all ${
                      isExpanded 
                        ? "bg-blue-600 border-blue-500 text-white" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* ACCORDION CONTENT: DETAILED SOLICITATIONS TABLE */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-4 bg-slate-950/50">
                    {group.requests.length === 0 ? (
                      <div className="p-8 text-center bg-slate-900/60 rounded-2xl border border-slate-850 space-y-2">
                        <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                        <p className="text-xs font-mono text-slate-400 font-bold">
                          Nenhuma solicitação registrada até o momento para o Setor {group.setor} ({group.rep.nome}).
                        </p>
                        <p className="text-[10px] text-slate-500">
                          As solicitações enviadas através do Portal do Representante ou inseridas no Promax aparecerão aqui automaticamente.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-800 shadow-inner">
                        <table className="w-full text-left border-collapse font-sans text-xs">
                          <thead>
                            <tr className="bg-slate-950 text-slate-400 font-mono text-[9px] uppercase font-bold border-b border-slate-800 tracking-wider">
                              <th className="p-3 text-center">Status</th>
                              <th className="p-3">Data / Hora</th>
                              <th className="p-3">Cliente / Razão Social</th>
                              <th className="p-3">Documentos (NF / Mapa)</th>
                              <th className="p-3">Produto / SKU & Qtd</th>
                              <th className="p-3">Motivo / Tipo</th>
                              <th className="p-3 text-right">Valor (R$)</th>
                              <th className="p-3 text-right">Volume (HL)</th>
                              <th className="p-3 text-center">Comprovante</th>
                              <th className="p-3 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {group.requests.map((req, idx) => {
                              const { valorTotal, hectolitros } = calculateRequestValueAndHL(req, promaxRecords);
                              const clientName = resolveClientName(req.nb);
                              const isFalta = isFaltaOrInversaoReq(req);
                              const hasPhoto = !!req.fotoUrl;

                              return (
                                <tr
                                  key={req.id || idx}
                                  className="hover:bg-slate-900/80 transition-colors group"
                                >
                                  {/* 1. Status */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {req.statusPromax === "pendente" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[9.5px] font-mono font-bold shadow-sm">
                                        <Clock className="w-3 h-3 animate-pulse" />
                                        <span>Pendente</span>
                                      </span>
                                    ) : req.statusPromax === "cadastrado" || req.status === "concluido" || req.status === "aprovado" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 text-[9.5px] font-mono font-bold">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        <span>Cadastrado</span>
                                      </span>
                                    ) : req.statusPromax === "reprovado" ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800/80 text-[9.5px] font-mono font-bold">
                                        <XCircle className="w-3 h-3 text-rose-400" />
                                        <span>Reprovado</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-[9.5px] font-mono">
                                        {req.statusPromax || "Concluído"}
                                      </span>
                                    )}

                                    {isFalta && (
                                      <span className="block mt-1 text-[8px] font-mono text-indigo-400 font-bold uppercase">
                                        📦 Falta Física
                                      </span>
                                    )}
                                  </td>

                                  {/* 2. Data & Hora */}
                                  <td className="p-3 font-mono text-slate-300 whitespace-nowrap text-[10.5px]">
                                    <div className="flex items-center gap-1 font-bold">
                                      <Calendar className="w-3 h-3 text-slate-500" />
                                      <span>{req.data || "N/A"}</span>
                                    </div>
                                    {req.hora && (
                                      <span className="text-[9px] text-slate-500 block">{req.hora}</span>
                                    )}
                                  </td>

                                  {/* 3. Cliente / NB */}
                                  <td className="p-3 min-w-[200px] max-w-[260px]">
                                    <span className="inline-block px-1.5 py-0.5 bg-blue-950 text-blue-300 font-mono text-[9px] font-bold rounded border border-blue-900/60 mb-0.5">
                                      NB: {req.nb || "S/N"}
                                    </span>
                                    <p className="font-bold text-white text-[11.5px] truncate uppercase" title={clientName}>
                                      {clientName}
                                    </p>
                                    <span className="text-[9px] text-slate-500 font-mono truncate block">
                                      {req.cadastroUser ? `Cadastrado por: ${req.cadastroUser}` : "Origem: Portal de Campo"}
                                    </span>
                                  </td>

                                  {/* 4. Documentos */}
                                  <td className="p-3 font-mono text-[10.5px] whitespace-nowrap">
                                    <div className="space-y-0.5">
                                      <span className="block text-slate-200">
                                        NF: <strong className="text-indigo-400">{req.nf || "N/A"}</strong>
                                      </span>
                                      <span className="block text-slate-400 text-[9.5px]">
                                        Mapa: {req.mapa || "N/A"}
                                      </span>
                                    </div>
                                  </td>

                                  {/* 5. Produto / SKU */}
                                  <td className="p-3 min-w-[180px] max-w-[240px]">
                                    {req.items && req.items.length > 1 ? (
                                      <div>
                                        <span className="font-bold text-white text-[11px] block">
                                          {req.items.length} itens inclusos
                                        </span>
                                        <span className="text-[9.5px] text-indigo-400 font-mono">
                                          {req.items.map(it => `${it.quantidade} ${it.unidadeMedida || "cx"} de ${it.descricaoProduto || it.item}`).slice(0, 2).join(", ")}
                                          {req.items.length > 2 && "..."}
                                        </span>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="font-bold text-white text-[11px] block truncate" title={req.descricaoProduto || req.item}>
                                          {req.descricaoProduto || req.item || "PRODUTO NÃO ESPECIFICADO"}
                                        </span>
                                        <span className="text-[9.5px] font-mono text-slate-400">
                                          SKU: {req.item || req.produto || "-"} • <strong className="text-amber-400">{req.quantidade || 0} {req.unidadeMedida || "cx"}</strong>
                                        </span>
                                      </div>
                                    )}
                                  </td>

                                  {/* 6. Motivo / Tipo */}
                                  <td className="p-3 text-[10.5px] whitespace-nowrap">
                                    <span className="inline-block px-2 py-0.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 font-medium">
                                      {req.motivo || "Troca Operacional"}
                                    </span>
                                    {req.gerouVale && (
                                      <span className="block mt-1 text-[8.5px] font-mono text-purple-400 font-bold">
                                        🎫 Vale Emitido
                                      </span>
                                    )}
                                  </td>

                                  {/* 7. Valor */}
                                  <td className="p-3 text-right font-mono text-emerald-400 font-bold text-[11px] whitespace-nowrap">
                                    {formatCurrency(valorTotal)}
                                  </td>

                                  {/* 8. HL */}
                                  <td className="p-3 text-right font-mono text-cyan-400 text-[10.5px] whitespace-nowrap">
                                    {formatHl(hectolitros)}
                                  </td>

                                  {/* 9. Comprovante */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    {hasPhoto ? (
                                      <button
                                        onClick={() => handleOpenPhoto(req.fotoUrl)}
                                        className="p-1.5 bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-blue-300 hover:text-white rounded-xl transition-all cursor-pointer inline-flex items-center gap-1 shadow"
                                        title="Clique para ampliar a foto do comprovante"
                                      >
                                        <Camera className="w-3.5 h-3.5" />
                                        <span className="text-[9px] font-mono font-bold">Ver Foto</span>
                                      </button>
                                    ) : (
                                      <span className="text-[9px] font-mono text-slate-600">Sem foto</span>
                                    )}
                                  </td>

                                  {/* 10. Ações */}
                                  <td className="p-3 text-center whitespace-nowrap">
                                    <button
                                      onClick={() => handleOpenInspect(req)}
                                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition-all cursor-pointer inline-flex items-center gap-1 font-mono text-[10px] font-bold"
                                      title="Visualizar ficha completa da solicitação"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                                      <span>Detalhes</span>
                                    </button>
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

      {/* 5. LOCAL INSPECT MODAL (FALLBACK IF NOT CONTROLLED EXTERNALLY) */}
      {localInspectReq && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 text-left max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider block">
                  Ficha da Solicitação • Setor {localInspectReq.setor}
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  Detalhes da Solicitação de Campo
                </h3>
              </div>
              <button
                onClick={() => setLocalInspectReq(null)}
                className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Cliente (NB)</span>
                <span className="font-bold font-mono text-blue-400">{localInspectReq.nb}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Nota Fiscal</span>
                <span className="font-bold font-mono text-white">{localInspectReq.nf || "N/A"}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Mapa de Carga</span>
                <span className="font-bold font-mono text-white">{localInspectReq.mapa || "N/A"}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 col-span-2">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Razão Social / Nome</span>
                <span className="font-bold text-white uppercase">{resolveClientName(localInspectReq.nb)}</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Data / Hora</span>
                <span className="font-mono text-slate-300">{localInspectReq.data} {localInspectReq.hora || ""}</span>
              </div>
            </div>

            {/* Motivo & Observação */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-1.5 text-xs">
              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Motivo Informado:</span>
              <p className="text-white font-medium">{localInspectReq.motivo || "Não especificado"}</p>
              {localInspectReq.observacao && (
                <p className="text-slate-400 italic text-[11px] pt-1 border-t border-slate-850 mt-1">
                  "{localInspectReq.observacao}"
                </p>
              )}
            </div>

            {/* Photo preview inside modal if available */}
            {localInspectReq.fotoUrl && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Comprovante / Foto anexada:</span>
                <div 
                  onClick={() => handleOpenPhoto(localInspectReq.fotoUrl)}
                  className="w-full max-h-52 bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center cursor-pointer group relative"
                >
                  <img
                    src={localInspectReq.fotoUrl}
                    alt="Comprovante"
                    className="max-h-52 object-contain group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-mono font-bold gap-1.5">
                    <Eye className="w-4 h-4" />
                    <span>Clique para ampliar foto</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setLocalInspectReq(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold rounded-xl transition-colors cursor-pointer"
              >
                Fechar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. LOCAL PHOTO ZOOM MODAL */}
      {localZoomPhoto && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-fade-in">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            {/* Action Bar */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button
                onClick={() => setPhotoRotation(prev => (prev + 90) % 360)}
                className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-white rounded-xl border border-slate-700 shadow-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold"
                title="Girar foto em 90 graus"
              >
                <RotateCw className="w-4 h-4" />
                <span>Girar</span>
              </button>
              <button
                onClick={() => setLocalZoomPhoto(null)}
                className="p-2.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-xl shadow-xl transition-all cursor-pointer"
                title="Fechar visualização de foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image */}
            <img
              src={localZoomPhoto}
              alt="Comprovante em Alta Resolução"
              style={{ transform: `rotate(${photoRotation}deg)` }}
              className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl transition-transform duration-300"
            />
          </div>
        </div>
      )}

    </div>
  );
}
