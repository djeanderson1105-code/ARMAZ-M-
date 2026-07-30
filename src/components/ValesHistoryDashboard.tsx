import React, { useState, useMemo } from "react";
import { Search, Printer, DollarSign, TrendingUp, Layers, UserCheck, AlertCircle, Trash2, PlusCircle, X } from "lucide-react";

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

export default function ValesHistoryDashboard({ vales, onReimprimir, onDeleteSingleVale, onUpdateValeStatus, onCreateAvulsoVale }: ValesHistoryDashboardProps) {
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
    vales.forEach(v => {
      if (v.rota) rSet.add(v.rota.trim());
    });
    return Array.from(rSet).sort();
  }, [vales]);

  // General Filtered Vales List
  const filteredVales = useMemo(() => {
    return vales.filter(v => {
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
  }, [vales, searchTerm, selectedRoute, selectedStatusFilter]);

  // Aggregate stats of filtered vales
  const stats = useMemo(() => {
    const totalCount = filteredVales.length;
    const totalVal = filteredVales.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const totalHl = filteredVales.reduce((s, v) => s + (v.hectolitros || 0), 0);
    return { totalCount, totalVal, totalHl };
  }, [filteredVales]);

  // Driver ranking analytics (Top 5)
  const driverRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    vales.forEach(v => {
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
      .sort((a, b) => b.hl - a.hl) // Sort sorted by HL descending (standard Ambev metrics)
      .slice(0, 5);
  }, [vales]);

  // Helper/Crew ranking analytics (Top 5)
  const helperRanking = useMemo(() => {
    const rankMap: Record<string, { name: string; cpf: string; count: number; val: number; hl: number }> = {};
    
    vales.forEach(v => {
      const helpersList = [];
      if (v.ajudante1 && v.ajudante1.trim()) {
        helpersList.push({ name: v.ajudante1.trim(), cpf: v.ajudante1Cpf });
      }
      if (v.ajudante2 && v.ajudante2.trim()) {
        helpersList.push({ name: v.ajudante2.trim(), cpf: v.ajudante2Cpf });
      }

      // If they only have the comma-separated string, parse it
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
        rankMap[key].val += (v.valorTotal || 0) / (helpersList.length || 1); // Split share
        rankMap[key].hl += (v.hectolitros || 0) / (helpersList.length || 1); 
      });
    });

    return Array.from(Object.values(rankMap))
      .sort((a, b) => b.hl - a.hl) // Sort sorted by HL descending (volume impact)
      .slice(0, 5);
  }, [vales]);

  return (
    <div className="space-y-6 text-left" id="vales-dashboard-container">
      
      {/* 1. METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-blue-400 font-mono uppercase tracking-wider block">Vales Faturados</span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-white font-sans">{stats.totalCount}</strong>
              <span className="text-xs text-slate-450 font-medium">unidades</span>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Vias físicas geradas com assinatura digital ou física</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/30 flex items-center justify-center shrink-0 z-10">
            <Layers className="w-6 h-6 text-blue-400" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-all duration-300"></div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-amber-500 font-mono uppercase tracking-wider block">Volume Total do Vale</span>
            <div className="flex items-baseline space-x-1.5">
              <strong className="text-3xl font-black text-amber-500 font-sans">{stats.totalHl.toFixed(4)}</strong>
              <span className="text-xs text-slate-450 font-mono">HL</span>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Hectolitros totais de acerto das equipes operacionais</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-900/30 flex items-center justify-center shrink-0 z-10">
            <TrendingUp className="w-6 h-6 text-amber-500" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all duration-300"></div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden group">
          <div className="space-y-1.5 z-10">
            <span className="text-[10px] font-extrabold text-emerald-400 font-mono uppercase tracking-wider block">Valor Total das Cobranças</span>
            <div className="flex items-baseline space-x-1 hover:scale-[1.01] transition-transform">
              <strong className="text-2xl sm:text-3xl font-black text-emerald-400 font-sans">{formatCurrency(stats.totalVal)}</strong>
            </div>
            <p className="text-[9.5px] text-slate-500 leading-none">Montante financeiro de responsabilidade da distribuição</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-900/30 flex items-center justify-center shrink-0 z-10">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>
        </div>
      </div>

      {/* 2. RANKING BENTO GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Driver Ranking Card */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-2xl flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-500" /> Ranking Geral: Motoristas com Mais Vales
            </h3>
            <p className="text-[10px] text-slate-450 leading-snug">Calculado pelo volume acumulado em Hectolitros de vales emitidos</p>
          </div>

          <div className="space-y-2.5 pt-2">
            {driverRanking.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-[11px] font-mono whitespace-normal leading-normal">
                Nenhum motorista com vales gerados ainda.
              </div>
            ) : (
              driverRanking.map((driver, index) => {
                const colorMap = ["bg-amber-500 text-slate-950", "bg-slate-300 text-slate-950", "bg-amber-800 text-white", "bg-slate-800 text-slate-400", "bg-slate-850 text-slate-500"];
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
              <UserCheck className="w-4 h-4 text-indigo-400" /> Ranking SSTR: Ajudantes com Mais Vales
            </h3>
            <p className="text-[10px] text-slate-450 leading-snug">Rateado proporcionalmente entre os ajudantes participantes da rota</p>
          </div>

          <div className="space-y-2.5 pt-2">
            {helperRanking.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-[11px] font-mono whitespace-normal leading-normal">
                Nenhum ajudante com vales gerados ainda.
              </div>
            ) : (
              helperRanking.map((helper, index) => {
                const colorMap = ["bg-indigo-500 text-slate-950", "bg-slate-300 text-slate-950", "bg-indigo-800 text-white", "bg-slate-800 text-slate-400", "bg-slate-850 text-slate-500"];
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

      {/* 3. LOG LISTING TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Table Filters header */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between border-b border-slate-800 pb-4">
          <div className="text-left space-y-1 w-full md:w-auto">
            <h3 className="font-extrabold text-white text-xs uppercase tracking-widest font-mono">
              Registros Detalhados dos Vales Emitidos
            </h3>
            <p className="text-[10px] text-slate-400">Total filtrado correspondente: <strong>{filteredVales.length} itens</strong></p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            {/* Search filter input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar NF, CPF ou CPF do Ajudante..."
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
                <span>Gerar Vale Avulso</span>
              </button>
            )}
          </div>
        </div>

        {/* Dense Table Layout */}
        <div className="overflow-x-auto rounded-xl">
          {filteredVales.length === 0 ? (
            <div className="p-16 text-center space-y-2 text-slate-500 bg-slate-950/40 rounded-xl">
              <AlertCircle className="w-7 h-7 mx-auto text-slate-600" />
              <p className="text-xs font-mono">Nenhum registro se enquadra nos filtros de busca selecionados.</p>
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
                  <th className="p-3 text-center">Ação</th>
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
                      <div className="font-semibold text-slate-200 uppercase truncate max-w-[140px]" title={vale.motorista}>
                        {vale.motorista}
                      </div>
                      <span className="font-mono text-[9px] text-slate-500 block">CPF: {vale.motoristaCpf || "Ausente"}</span>
                    </td>

                    {/* Helpers */}
                    <td className="p-3">
                      <div className="text-slate-300 uppercase truncate max-w-[160px] text-[11px]" title={vale.ajudante1 ? `${vale.ajudante1} & ${vale.ajudante2 || ""}` : vale.ajudantes}>
                        {vale.ajudante1 ? (
                          <span>{vale.ajudante1}{vale.ajudante2 && `, ${vale.ajudante2}`}</span>
                        ) : (
                          vale.ajudantes || <em className="text-slate-600 font-serif">Sem ajudantes</em>
                        )}
                      </div>
                      {vale.ajudante1 ? (
                        <span className="text-[8.5px] font-mono text-slate-500 leading-none">
                          CPF: {vale.ajudante1Cpf || "Ausente"} {vale.ajudante2Cpf && `| CPF: ${vale.ajudante2Cpf}`}
                        </span>
                      ) : null}
                    </td>

                    {/* Status Dropdown / Pill */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <select
                        value={currentStatus}
                        onChange={(e) => onUpdateValeStatus && onUpdateValeStatus(vale.id, e.target.value as any)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-extrabold font-mono border cursor-pointer focus:outline-none transition-colors ${
                          currentStatus === "compensado"
                            ? "bg-emerald-950/90 text-emerald-300 border-emerald-800/80"
                            : currentStatus === "assinado"
                            ? "bg-blue-950/90 text-blue-300 border-blue-800/80"
                            : currentStatus === "emitido"
                            ? "bg-orange-950/90 text-orange-300 border-orange-800/80"
                            : "bg-amber-950/90 text-amber-300 border-amber-800/80"
                        }`}
                      >
                        <option value="emitido" className="bg-slate-900 text-orange-300 font-bold">🟠 Emitido</option>
                        <option value="pendente" className="bg-slate-900 text-amber-300 font-bold">🟡 Pendente de Assinatura</option>
                        <option value="assinado" className="bg-slate-900 text-blue-300 font-bold">🔵 Assinado</option>
                        <option value="compensado" className="bg-slate-900 text-emerald-300 font-bold">🟢 Compensado</option>
                      </select>
                    </td>

                    {/* Volume */}
                    <td className="p-3 text-center font-mono font-bold text-amber-500 shrink-0 whitespace-nowrap">
                      {vale.hectolitros.toFixed(4)} HL
                    </td>

                    {/* Total billing slip value */}
                    <td className="p-3 text-right font-mono font-extrabold text-emerald-400 whitespace-nowrap">
                      {formatCurrency(vale.valorTotal)}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center shrink-0">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            if (onUpdateValeStatus && currentStatus !== "assinado" && currentStatus !== "compensado") {
                              onUpdateValeStatus(vale.id, "emitido");
                            }
                            onReimprimir(vale);
                          }}
                          className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/80 rounded-lg text-[10px] font-bold text-indigo-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          title="Visualizar faturas e reimprimir via timbrada Ambev"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Reimprimir</span>
                        </button>
                        
                        {onDeleteSingleVale && (
                          confirmDeleteValeId === vale.id ? (
                            <div className="inline-flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-red-900/60 animate-fade-in whitespace-nowrap">
                              <span className="text-[9px] text-red-400 font-mono font-bold uppercase pl-1">Excluir?</span>
                              <button
                                onClick={() => {
                                  onDeleteSingleVale(vale.id);
                                  setConfirmDeleteValeId(null);
                                }}
                                className="px-2 py-0.5 bg-rose-600 text-white font-sans font-bold rounded text-[9.5px] cursor-pointer"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setConfirmDeleteValeId(null)}
                                className="px-2 py-0.5 bg-slate-800 text-slate-300 font-sans rounded text-[9.5px] cursor-pointer"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteValeId(vale.id)}
                              className="p-1 bg-slate-950 text-slate-600 hover:text-red-450 border border-slate-900 hover:border-red-950 rounded-lg cursor-pointer transition-colors"
                              title="Remover do histórico"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
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
      
      {/* Modal: Gerar Vale Avulso */}
      {isAvulsoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-left">
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
                onClick={() => setIsAvulsoModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
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
                // Reset fields
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
                    <option value="cx">📦 CX (Caixa)</option>
                    <option value="und">🥫 UND (Lata/Avulso)</option>
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
                  <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Ajudante(s)</label>
                  <input
                    type="text"
                    placeholder="Nome do ajudante"
                    value={avulsoAjudantes}
                    onChange={(e) => setAvulsoAjudantes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 h-9 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 font-mono uppercase block">Observações / Motivo</label>
                <textarea
                  rows={2}
                  placeholder="Observação referente ao vale avulso..."
                  value={avulsoObs}
                  onChange={(e) => setAvulsoObs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono focus:border-amber-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAvulsoModalOpen(false)}
                  className="px-4 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 h-9 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono text-xs font-extrabold rounded-xl cursor-pointer transition-all shadow-md hover:scale-[1.02]"
                >
                  Confirmar & Gerar Vale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
