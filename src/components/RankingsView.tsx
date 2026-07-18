import React, { useState, useMemo } from "react";
import { ExchangeRecord } from "../types";
import { calculateHL } from "../utils/hectoFactors";
import { 
  Award, 
  MapPin, 
  TrendingUp, 
  Package, 
  User, 
  Flame, 
  Compass, 
  Truck, 
  FileText, 
  HelpCircle, 
  DollarSign, 
  Clock, 
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  BarChart2,
  Calendar,
  Layers,
  Sparkles,
  Search,
  Users
} from "lucide-react";

interface RankingsViewProps {
  records: ExchangeRecord[];
}

export default function RankingsView({ records: rawRecords }: RankingsViewProps) {
  // Option to filter out representative manual input or show all
  const [filterSource, setFilterSource] = useState<"all" | "promax">("all");
  const [rankingMetric, setRankingMetric] = useState<"spent" | "count" | "hl">("spent");
  const [activeSubTab, setActiveSubTab] = useState<"motoristas" | "clientes" | "motivos">("motoristas");

  // Selected driver for detailed sidebar
  const [selectedDriverName, setSelectedDriverName] = useState<string>("");
  
  // Client tab state
  const [clientSearch, setClientSearch] = useState<string>("");
  const [selectedClientDriverFilter, setSelectedClientDriverFilter] = useState<string>("all");

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Filter records based on source filter
  const records = useMemo(() => {
    if (filterSource === "promax") {
      return rawRecords.filter(r => r.sistemaOrigem !== "Portal de Campo SSTR");
    }
    return rawRecords;
  }, [rawRecords, filterSource]);

  // List of all unique driver names for filter selectors
  const uniqueDrivers = useMemo(() => {
    const list = new Set<string>();
    rawRecords.forEach(r => {
      const d = (r.nomeMotorista || r.motorista || "").trim();
      if (d) list.add(d);
    });
    return Array.from(list).sort();
  }, [rawRecords]);

  // --- MOTORISTAS RANKING GENERATOR ---
  const driverRankings = useMemo(() => {
    const driverGroup: { [name: string]: {
      name: string;
      totalSpent: number;
      requestCount: number;
      totalHL: number;
      totalQty: number;
      vehiclePlates: Set<string>;
      transporters: Set<string>;
      sectors: { [sector: string]: { spent: number; count: number } };
      reasons: { [reason: string]: { spent: number; count: number } };
      products: { [prod: string]: { desc: string; qty: number; spent: number } };
      clients: { [clientCode: string]: { name: string; count: number; spent: number; qty: number } };
    }} = {};

    records.forEach(r => {
      let driverName = (r.nomeMotorista || r.motorista || "").trim();
      if (!driverName) {
        driverName = "MOTORISTA NÃO IDENTIFICADO";
      }

      if (!driverGroup[driverName]) {
        driverGroup[driverName] = {
          name: driverName,
          totalSpent: 0,
          requestCount: 0,
          totalHL: 0,
          totalQty: 0,
          vehiclePlates: new Set<string>(),
          transporters: new Set<string>(),
          sectors: {},
          reasons: {},
          products: {},
          clients: {}
        };
      }

      const dg = driverGroup[driverName];
      dg.totalSpent += r.valorTotal || 0;
      dg.requestCount += 1;
      dg.totalQty += r.quantidade || 0;
      
      const hlValue = r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
      dg.totalHL += hlValue;

      if (r.placa) dg.vehiclePlates.add(r.placa.trim().toUpperCase());
      if (r.veiculo) dg.vehiclePlates.add(r.veiculo.trim().toUpperCase());
      if (r.nomeTransportadora) dg.transporters.add(r.nomeTransportadora.trim());

      // Sector aggregation
      const sector = (r.setorVenda || "OUTROS").trim();
      if (!dg.sectors[sector]) {
        dg.sectors[sector] = { spent: 0, count: 0 };
      }
      dg.sectors[sector].spent += r.valorTotal || 0;
      dg.sectors[sector].count += 1;

      // Reason aggregation
      const reason = (r.justificativa || "MOTIVO NÃO ESPECIFICADO").trim();
      if (!dg.reasons[reason]) {
        dg.reasons[reason] = { spent: 0, count: 0 };
      }
      dg.reasons[reason].spent += r.valorTotal || 0;
      dg.reasons[reason].count += 1;

      // Product aggregation
      const pCode = (r.produto || "").trim();
      if (pCode) {
        if (!dg.products[pCode]) {
          dg.products[pCode] = { desc: r.descricaoProduto || "Produto " + pCode, qty: 0, spent: 0 };
        }
        dg.products[pCode].qty += r.quantidade || 0;
        dg.products[pCode].spent += r.valorTotal || 0;
      }

      // Client aggregation per driver
      const clientCode = (r.codigoCliente || "").trim();
      const clientName = (r.nomeCliente || "Cliente " + clientCode).trim();
      if (clientCode) {
        if (!dg.clients[clientCode]) {
          dg.clients[clientCode] = { name: clientName, count: 0, spent: 0, qty: 0 };
        }
        dg.clients[clientCode].count += 1;
        dg.clients[clientCode].spent += r.valorTotal || 0;
        dg.clients[clientCode].qty += r.quantidade || 0;
      }
    });

    // Convert to sorted array
    const result = Object.values(driverGroup).map(dg => {
      // Sort sectors
      const sortedSectors = Object.entries(dg.sectors)
        .map(([sector, data]) => ({ sector, ...data }))
        .sort((a, b) => b.spent - a.spent);

      // Sort reasons
      const sortedReasons = Object.entries(dg.reasons)
        .map(([reason, data]) => ({ reason, ...data }))
        .sort((a, b) => b.spent - a.spent);

      // Sort products
      const sortedProducts = Object.entries(dg.products)
        .map(([code, p]) => ({ code, ...p }))
        .sort((a, b) => b.spent - a.spent);

      // Sort clients
      const sortedClients = Object.entries(dg.clients)
        .map(([code, c]) => ({ code, name: c.name, count: c.count, spent: c.spent, qty: c.qty }))
        .sort((a, b) => b.count - a.count);

      return {
        name: dg.name,
        totalSpent: dg.totalSpent,
        requestCount: dg.requestCount,
        totalHL: dg.totalHL,
        totalQty: dg.totalQty,
        plates: Array.from(dg.vehiclePlates).filter(Boolean).slice(0, 2),
        transporters: Array.from(dg.transporters).filter(Boolean).slice(0, 1),
        sectors: sortedSectors,
        reasons: sortedReasons,
        products: sortedProducts,
        clients: sortedClients
      };
    });

    // Sort by selected ranking metric
    if (rankingMetric === "spent") {
      result.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (rankingMetric === "count") {
      result.sort((a, b) => b.requestCount - a.requestCount);
    } else {
      result.sort((a, b) => b.totalHL - a.totalHL);
    }

    return result;
  }, [records, rankingMetric]);

  // Max value for driver charts progress bar
  const maxDriverMetricValue = useMemo(() => {
    if (driverRankings.length === 0) return 1;
    const first = driverRankings[0];
    if (rankingMetric === "spent") return first.totalSpent || 1;
    if (rankingMetric === "count") return first.requestCount || 1;
    return first.totalHL || 1;
  }, [driverRankings, rankingMetric]);


  // --- CLIENTS RANKING GENERATOR (Ranking Geral de Clientes) ---
  const clientRankings = useMemo(() => {
    const clientGroup: { [code: string]: {
      code: string;
      name: string;
      totalSpent: number;
      requestCount: number;
      totalHL: number;
      totalQty: number;
      drivers: { [drv: string]: { spent: number; count: number; qty: number } };
      reasons: { [reason: string]: { spent: number; count: number } };
    }} = {};

    records.forEach(r => {
      const clientCode = (r.codigoCliente || "").trim();
      const clientName = (r.nomeCliente || "Cliente " + clientCode).trim();
      if (!clientCode) return;

      // Filter by selected driver if applicable
      if (selectedClientDriverFilter !== "all") {
        const dName = (r.nomeMotorista || r.motorista || "").trim();
        if (dName !== selectedClientDriverFilter) return;
      }

      if (!clientGroup[clientCode]) {
        clientGroup[clientCode] = {
          code: clientCode,
          name: clientName,
          totalSpent: 0,
          requestCount: 0,
          totalHL: 0,
          totalQty: 0,
          drivers: {},
          reasons: {}
        };
      }

      const cg = clientGroup[clientCode];
      cg.totalSpent += r.valorTotal || 0;
      cg.requestCount += 1;
      cg.totalQty += r.quantidade || 0;
      
      const hlValue = r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
      cg.totalHL += hlValue;

      // Driver details
      const driver = (r.nomeMotorista || r.motorista || "NÃO IDENTIFICADO").trim();
      if (!cg.drivers[driver]) {
        cg.drivers[driver] = { spent: 0, count: 0, qty: 0 };
      }
      cg.drivers[driver].spent += r.valorTotal || 0;
      cg.drivers[driver].count += 1;
      cg.drivers[driver].qty += r.quantidade || 0;

      // Reason details
      const reason = (r.justificativa || "MOTO NÃO ESPECIFICADO").trim();
      if (!cg.reasons[reason]) {
        cg.reasons[reason] = { spent: 0, count: 0 };
      }
      cg.reasons[reason].spent += r.valorTotal || 0;
      cg.reasons[reason].count += 1;
    });

    const result = Object.values(clientGroup).map(cg => {
      const sortedDrivers = Object.entries(cg.drivers)
        .map(([driver, data]) => ({ driver, ...data }))
        .sort((a, b) => b.count - a.count);

      const sortedReasons = Object.entries(cg.reasons)
        .map(([reason, data]) => ({ reason, ...data }))
        .sort((a, b) => b.count - a.count);

      return {
        code: cg.code,
        name: cg.name,
        totalSpent: cg.totalSpent,
        requestCount: cg.requestCount,
        totalHL: cg.totalHL,
        totalQty: cg.totalQty,
        drivers: sortedDrivers,
        reasons: sortedReasons
      };
    });

    // Sort client rankings
    if (rankingMetric === "spent") {
      result.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (rankingMetric === "count") {
      result.sort((a, b) => b.requestCount - a.requestCount);
    } else {
      result.sort((a, b) => b.totalHL - a.totalHL);
    }

    return result;
  }, [records, rankingMetric, selectedClientDriverFilter]);

  // Filtered Client Rankings by Search Box
  const filteredClientRankings = useMemo(() => {
    if (!clientSearch.trim()) return clientRankings;
    const query = clientSearch.toLowerCase();
    return clientRankings.filter(c => 
      c.code.toLowerCase().includes(query) || 
      c.name.toLowerCase().includes(query)
    );
  }, [clientRankings, clientSearch]);

  const maxClientMetricValue = useMemo(() => {
    if (filteredClientRankings.length === 0) return 1;
    const first = filteredClientRankings[0];
    if (rankingMetric === "spent") return first.totalSpent || 1;
    if (rankingMetric === "count") return first.requestCount || 1;
    return first.totalHL || 1;
  }, [filteredClientRankings, rankingMetric]);


  // --- MOTIVOS (JUSTIFICATIVAS) RANKING GENERATOR ---
  const motiveRankings = useMemo(() => {
    const motiveGroup: { [motive: string]: {
      reason: string;
      totalSpent: number;
      requestCount: number;
      totalHL: number;
      totalQty: number;
      sectors: { [sector: string]: { spent: number; count: number } };
      drivers: { [drv: string]: { spent: number; count: number } };
    }} = {};

    records.forEach(r => {
      const reason = (r.justificativa || "MOTIVO NÃO ESPECIFICADO").trim();
      
      if (!motiveGroup[reason]) {
        motiveGroup[reason] = {
          reason,
          totalSpent: 0,
          requestCount: 0,
          totalHL: 0,
          totalQty: 0,
          sectors: {},
          drivers: {}
        };
      }

      const mg = motiveGroup[reason];
      mg.totalSpent += r.valorTotal || 0;
      mg.requestCount += 1;
      mg.totalQty += r.quantidade || 0;

      const hlValue = r.hectolitros || calculateHL(r.produto, r.quantidade || 0);
      mg.totalHL += hlValue;

      // Sector and driver details
      const sector = (r.setorVenda || "OUTROS").trim();
      if (!mg.sectors[sector]) {
        mg.sectors[sector] = { spent: 0, count: 0 };
      }
      mg.sectors[sector].spent += r.valorTotal || 0;
      mg.sectors[sector].count += 1;

      const driver = (r.nomeMotorista || r.motorista || "NÃO CONFIGURADO").trim();
      if (!mg.drivers[driver]) {
        mg.drivers[driver] = { spent: 0, count: 0 };
      }
      mg.drivers[driver].spent += r.valorTotal || 0;
      mg.drivers[driver].count += 1;
    });

    const result = Object.values(motiveGroup).map(mg => {
      const sortedSectors = Object.entries(mg.sectors)
        .map(([sector, data]) => ({ sector, ...data }))
        .sort((a, b) => b.spent - a.spent);

      const sortedDrivers = Object.entries(mg.drivers)
        .map(([driver, data]) => ({ driver, ...data }))
        .sort((a, b) => b.spent - a.spent);

      return {
        reason: mg.reason,
        totalSpent: mg.totalSpent,
        requestCount: mg.requestCount,
        totalHL: mg.totalHL,
        totalQty: mg.totalQty,
        sectors: sortedSectors,
        drivers: sortedDrivers
      };
    });

    // Sorting motives
    if (rankingMetric === "spent") {
      result.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (rankingMetric === "count") {
      result.sort((a, b) => b.requestCount - a.requestCount);
    } else {
      result.sort((a, b) => b.totalHL - a.totalHL);
    }

    return result;
  }, [records, rankingMetric]);

  // Max value for motive charts progress bar
  const maxMotiveMetricValue = useMemo(() => {
    if (motiveRankings.length === 0) return 1;
    const first = motiveRankings[0];
    if (rankingMetric === "spent") return first.totalSpent || 1;
    if (rankingMetric === "count") return first.requestCount || 1;
    return first.totalHL || 1;
  }, [motiveRankings, rankingMetric]);


  // Active driver details selector
  const activeDriver = useMemo(() => {
    return driverRankings.find(d => d.name === selectedDriverName) || driverRankings[0];
  }, [driverRankings, selectedDriverName]);

  // Update default selected driver when list loads or changes
  React.useEffect(() => {
    if (driverRankings.length > 0) {
      if (!selectedDriverName || !driverRankings.some(d => d.name === selectedDriverName)) {
        setSelectedDriverName(driverRankings[0].name);
      }
    } else {
      setSelectedDriverName("");
    }
  }, [driverRankings]);


  return (
    <div id="rankings-tab-view" className="space-y-6">
      
      {/* HEADER CONTROLS BANNER */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500 animate-pulse" />
            <span>Métricas e Rankings Operacionais Rota</span>
          </h2>
          <p className="text-xs text-slate-400">
            Comparativo estatístico líder de custos, volumes e recorrências de reposição por motorista, cliente e motivo.
          </p>
        </div>

        {/* Global Filters & Switch Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Source Toggle */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-850 flex items-center space-x-1">
            <button
              onClick={() => setFilterSource("all")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterSource === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Todos Lançamentos
            </button>
            <button
              onClick={() => setFilterSource("promax")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterSource === "promax" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Apenas Promax (Oficial)
            </button>
          </div>

          {/* Metric Chooser */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-850 flex items-center space-x-1">
            <button
              onClick={() => setRankingMetric("spent")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                rankingMetric === "spent" ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
              title="Ordenar por total financeiro em R$"
            >
              R$ Gasto
            </button>
            <button
              onClick={() => setRankingMetric("count")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                rankingMetric === "count" ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
              title="Ordenar pela frequência de ocorrências"
            >
              Qtd. Solicitações
            </button>
            <button
              onClick={() => setRankingMetric("hl")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                rankingMetric === "hl" ? "bg-blue-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
              title="Ordenar pelo volume físico total em Hectolitros (HL)"
            >
              Volume (HL)
            </button>
          </div>
        </div>
      </div>

      {/* SUBTABS BAR SELECTOR (Drivers vs Clients vs Motives) */}
      <div className="flex border-b border-slate-800 gap-1.5 no-print">
        <button
          onClick={() => {
            setActiveSubTab("motoristas");
            setSelectedClientDriverFilter("all");
          }}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeSubTab === "motoristas"
              ? "border-blue-500 text-blue-400 font-bold bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Ranking de Motoristas</span>
        </button>

        <button
          onClick={() => setActiveSubTab("clientes")}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeSubTab === "clientes"
              ? "border-blue-500 text-blue-400 font-bold bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Ranking de Clientes</span>
        </button>

        <button
          onClick={() => setActiveSubTab("motivos")}
          className={`px-5 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeSubTab === "motivos"
              ? "border-blue-500 text-blue-400 font-bold bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Ranking de Motivos / Justificativas</span>
        </button>
      </div>

      {/* MAIN LAYOUT ACCORDING TO TIMELINE TAB CHOICE */}
      {activeSubTab === "motoristas" ? (
        /* PANEL 1: MOTORISTAS VIEW (Splitted layout exactly like active Sectors) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* DRIVERS TREE LIST (Lefthand Column) */}
          <div className="lg:col-span-5 bg-slate-900/95 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-400" />
                <span>Árvore de Custos por Motorista</span>
              </h3>
              <p className="text-xs text-slate-400">Visualização comparativa de liderança operacional. Selecione um motorista para ver o detalhamento.</p>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              {driverRankings.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs">
                  Sem motoristas registrados nesta base.
                </div>
              ) : (
                driverRankings.map((dg, idx) => {
                  const isSelected = selectedDriverName === dg.name;
                  
                  // Progress metrics depending on active metric
                  let activeVal = dg.totalSpent;
                  let suffix = formatCurrency(dg.totalSpent);
                  
                  if (rankingMetric === "count") {
                    activeVal = dg.requestCount;
                    suffix = `${dg.requestCount} solicitações`;
                  } else if (rankingMetric === "hl") {
                    activeVal = dg.totalHL;
                    suffix = `${dg.totalHL.toFixed(2)} HL`;
                  }

                  const percentage = maxDriverMetricValue > 0 ? (activeVal / maxDriverMetricValue) * 100 : 0;

                  return (
                    <button
                      key={dg.name}
                      onClick={() => setSelectedDriverName(dg.name)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 flex flex-col space-y-2 cursor-pointer ${
                        isSelected
                          ? "bg-slate-950 border-blue-600 text-white shadow-lg ring-2 ring-blue-500/20"
                          : "bg-slate-950/40 hover:bg-slate-950 border-slate-850 text-slate-400"
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] font-mono shrink-0 ${
                              idx === 0 
                                ? "bg-amber-500 text-black font-bold" 
                                : idx === 1 
                                  ? "bg-slate-300 text-black" 
                                  : idx === 2 
                                    ? "bg-amber-700 text-white" 
                                    : "bg-slate-800 text-slate-300"
                            }`}>
                              {idx + 1}º
                            </span>
                            <span className="text-xs font-bold text-slate-200 truncate max-w-[180px] md:max-w-xs block leading-snug">
                              {dg.name}
                            </span>
                          </div>
                          
                          {/* Sub informational notes */}
                          <div className="text-[10px] text-slate-500 font-mono pl-7">
                            {dg.transporters.length > 0 && <span>{dg.transporters[0]}</span>}
                            {dg.plates.length > 0 && <span className="ml-2 font-bold text-slate-400">Placa: {dg.plates[0]}</span>}
                          </div>
                        </div>

                        {/* Metric text output */}
                        <span className="font-bold text-xs font-mono text-blue-400 shrink-0 select-none">
                          {suffix}
                        </span>
                      </div>

                      {/* Micro Progress Bar mimics the RN sector style */}
                      <div className="pl-7 w-full flex items-center">
                        <div className="w-full bg-slate-900 border border-slate-850 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isSelected ? "bg-blue-400 animate-pulse" : "bg-slate-700"
                            }`}
                            style={{ width: `${Math.max(percentage, 2.5)}%` }}
                          ></div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* DRIVER ANALYTICS DRILLDOWN (Righthand Column - Multi-Grid) */}
          <div className="lg:col-span-7 space-y-6">
            {activeDriver ? (
              <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-md space-y-6 animate-fade-in">
                
                {/* Active driver header card */}
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-900/40 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <Truck className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-md tracking-wider uppercase leading-none">{activeDriver.name}</h3>
                      <p className="text-[10px] uppercase font-mono text-slate-400 mt-1">
                        Transportador: <span className="text-slate-300 font-bold">{activeDriver.transporters.join(", ") || "NÃO CADASTRADO"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[9px] uppercase tracking-wider font-mono text-slate-500 font-bold">Mapeado na Operação</span>
                    <span className="font-bold text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-2.5 py-1 rounded-lg mt-1 flex items-center gap-1.5 font-mono">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                      MOTORISTA ATIVO
                    </span>
                  </div>
                </div>

                {/* Grid stats overview for active driver */}
                <div className="grid grid-cols-3 gap-3 bg-slate-950 p-4.5 rounded-xl border border-slate-800">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Custo Financeiro</p>
                    <p className="text-sm font-bold text-blue-400 font-mono mt-0.5">
                      {formatCurrency(activeDriver.totalSpent)}
                    </p>
                  </div>
                  <div className="text-center border-x border-slate-850">
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Solicitações</p>
                    <p className="text-sm font-bold text-white font-mono mt-0.5">
                      {activeDriver.requestCount} un.
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wider font-mono">Volume Físico</p>
                    <p className="text-sm font-bold text-indigo-400 font-mono mt-0.5">
                      {activeDriver.totalHL.toFixed(2)} HL
                    </p>
                  </div>
                </div>

                {/* Sub Rankings bento lists */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Sectors/RNs serviced */}
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 font-sans">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        <span>Setores & RNs Atendidos</span>
                      </h4>
                      <span className="text-[9px] text-slate-550 font-mono font-bold">R$ Total</span>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin">
                      {activeDriver.sectors.map((s, idx) => (
                        <div key={s.sector} className="flex justify-between items-center text-xs p-1 hover:bg-slate-950 rounded">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-500 text-[9px] font-mono">{idx + 1}º</span>
                            <span className="font-mono bg-slate-900 border border-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-300 font-bold">
                              Setor {s.sector}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate">
                              ({s.count} trocas)
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-slate-300">
                            {formatCurrency(s.spent)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Main motives for replacements of this driver */}
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 font-sans">
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span>Principais Motivos de Troca</span>
                      </h4>
                      <span className="text-[9px] text-slate-550 font-mono font-bold">Trocas</span>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[160px] pr-1 scrollbar-thin">
                      {activeDriver.reasons.map((r, idx) => (
                        <div key={r.reason} className="flex justify-between items-center text-xs p-1 hover:bg-slate-950 rounded">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-slate-500 text-[9px] font-mono shrink-0">{idx + 1}º</span>
                            <span className="text-slate-300 text-xs truncate uppercase font-bold leading-none">
                              {r.reason}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded text-[9.5px]">
                            {r.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* CLIENTS ATTENDED BY THIS DRIVER WITH GREATEST OCCURRENCES */}
                {/* Solves request: "identificar quais clientes tem maior quantidade de solicitações por motoritas" */}
                <div className="bg-slate-950/50 p-4.5 rounded-xl border border-slate-850 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-500" />
                      <span>Clientes Atendidos Por Ele com Maior Número de Reclamações / Solicitações</span>
                    </h4>
                    <span className="text-[9px] text-slate-550 font-mono font-bold font-semibold uppercase">Frequência</span>
                  </div>

                  <div className="space-y-2 overflow-y-auto max-h-[190px] pr-1 scrollbar-thin">
                    {activeDriver.clients.length === 0 ? (
                      <div className="text-[11px] text-slate-500 italic py-2 text-center">Nenhum cliente mapeado com trocas para este motorista.</div>
                    ) : (
                      activeDriver.clients.slice(0, 5).map((cl, idx) => (
                        <div key={cl.code} className="flex justify-between items-center text-xs p-2.5 bg-slate-950/80 rounded-lg border border-slate-850/60 hover:border-slate-805 transition-colors">
                          <div className="min-w-0 max-w-[70%]">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-mono text-slate-500 font-semibold">{idx + 1}º</span>
                              <span className="font-bold text-slate-200 truncate block text-xs">
                                {cl.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-550 block mt-0.5">
                              PDV: <span className="text-slate-400 font-bold">{cl.code}</span> | Volume acumulado: {cl.qty} un físicas
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-red-400 bg-red-950/20 px-2 py-0.5 rounded text-[10px] border border-red-950/30">
                              {cl.count} ocorrências
                            </span>
                            <span className="text-[9.5px] font-mono text-slate-500 block mt-1">{formatCurrency(cl.spent)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Product items replaced in this driver's shipments */}
                <div className="bg-slate-950/40 p-4.5 rounded-xl border border-slate-850/80 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5 font-sans">
                      <Package className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Produtos Reincidentes sob Responsabilidade do Motorista</span>
                    </h4>
                    <span className="text-[9.5px] text-slate-550 font-mono font-bold">Soma R$</span>
                  </div>

                  <div className="space-y-2 overflow-y-auto max-h-[150px] pr-1 scrollbar-thin">
                    {activeDriver.products.slice(0, 5).map((p, idx) => (
                      <div key={p.code} className="flex justify-between items-center text-xs p-2 bg-slate-950 rounded border border-slate-850/40">
                        <div className="flex items-center gap-2 min-w-0 max-w-[75%]">
                          <span className="text-slate-500 text-[9px] font-mono shrink-0">{idx + 1}º</span>
                          <div className="min-w-0">
                            <span className="text-slate-200 text-xs font-semibold truncate block">
                              {p.desc}
                            </span>
                            <span className="text-[10px] font-mono text-slate-550">
                              SKU: <span className="font-bold text-slate-350">{p.code}</span> | Qtd total: <span className="font-bold text-slate-350">{p.qty} un</span>
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-blue-400 text-xs shrink-0 select-all">
                          {formatCurrency(p.spent)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-slate-900 p-12 text-center rounded-2xl border border-slate-800 text-slate-500 font-mono text-xs">
                Selecione um motorista para inspecionar métricas do canal de logística.
              </div>
            )}
          </div>

        </div>
      ) : activeSubTab === "clientes" ? (
        /* PANEL 2: CLIENTS RANKING (Ranking Geral de Clientes e por Motoristas) */
        /* Solves request: "ranking geral, e raking por motoristas do clientes" */
        <div className="space-y-4 animate-fade-in">
          
          {/* CLIENT FILTERS */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between shadow">
            
            {/* Search client input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Buscar cliente por razão, nome ou código (PDV)..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Filter by driver dropdown */}
            <div className="flex items-center space-x-3 w-full md:w-auto">
              <span className="text-xs font-bold text-slate-400 shrink-0 uppercase tracking-wide font-mono">Filtrar por Motorista:</span>
              <select
                value={selectedClientDriverFilter}
                onChange={(e) => setSelectedClientDriverFilter(e.target.value)}
                className="w-full md:w-64 bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">-- Todos Motoristas (Ranking Geral) --</option>
                {uniqueDrivers.map(drv => (
                  <option key={drv} value={drv}>{drv}</option>
                ))}
              </select>
            </div>
          </div>

          {/* MAIN CLIENTS LIST */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>
                  {selectedClientDriverFilter === "all" 
                    ? "Classificação Geral de Clientes (Mais Reincidentes SSTR / Rota)" 
                    : `Clientes Atendidos com Ocorrências sob o Motorista: ${selectedClientDriverFilter}`}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualização detalhada por cliente de anomalias logísticas faturadas ou reclamadas. Ordenado por {rankingMetric === "spent" ? "Impacto Financeiro R$" : rankingMetric === "count" ? "Número de Solicitações" : "Volume Hectolitros"}.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Clients Rankings Table */}
              <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 space-y-3.5 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
                {filteredClientRankings.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 font-mono text-xs">
                    Nenhum cliente correspondente encontrado com esses filtros.
                  </div>
                ) : (
                  filteredClientRankings.map((c, idx) => {
                    let activeVal = c.totalSpent;
                    let textVal = formatCurrency(c.totalSpent);
                    
                    if (rankingMetric === "count") {
                      activeVal = c.requestCount;
                      textVal = `${c.requestCount} trocas`;
                    } else if (rankingMetric === "hl") {
                      activeVal = c.totalHL;
                      textVal = `${c.totalHL.toFixed(2)} HL`;
                    }

                    const percentage = maxClientMetricValue > 0 ? (activeVal / maxClientMetricValue) * 100 : 0;

                    return (
                      <div 
                        key={c.code}
                        className="p-3 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col space-y-2 hover:border-slate-801 hover:bg-slate-900/80 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 max-w-[70%]">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded shrink-0">
                                {idx + 1}º
                              </span>
                              <span className="text-[10px] font-mono text-blue-400 font-bold tracking-wider select-all">
                                {c.code}
                              </span>
                              <span className="text-xs font-bold text-slate-200 truncate block">
                                {c.name}
                              </span>
                            </div>
                            
                            {/* Primary Delivery Crew mapped */}
                            {c.drivers.length > 0 && (
                              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                                Motorista mais frequente: <strong className="text-slate-400">{c.drivers[0].driver}</strong> ({c.drivers[0].count}x)
                              </p>
                            )}
                          </div>
                          
                          <span className="font-mono text-xs font-bold text-blue-400 shrink-0">
                            {textVal}
                          </span>
                        </div>

                        {/* Progress Bar and stats sub info */}
                        <div className="flex items-center space-x-2">
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                            <div 
                              className="bg-blue-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.max(percentage, 2.5)}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Summary small blocks */}
                        <div className="flex gap-4 text-[9.5px] font-mono text-slate-500 leading-none">
                          <span>Volume: <strong className="text-slate-400">{c.totalHL.toFixed(2)} HL</strong></span>
                          <span>Fitas: <strong className="text-slate-400">{c.totalQty} un</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Clients Correlation and Details */}
              <div className="bg-slate-950/50 rounded-xl border border-slate-850 p-5 space-y-5">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">Fatos e Análises de Pontos de Venda (PDVs)</h4>
                  <p className="text-[11px] text-slate-450">Interações críticas reveladas pela base de auditoria de entregas da Ambev.</p>
                </div>

                {filteredClientRankings.length > 0 ? (
                  <div className="space-y-5">
                    {/* LEADER CLIENT CRITICAL DETAILS */}
                    <div className="bg-slate-900/60 p-4.5 rounded-xl border border-slate-800 space-y-3">
                      <span className="text-[8.5px] uppercase font-mono px-2 py-0.5 bg-red-950 text-red-400 border border-red-900 rounded-md font-bold">Impacto Crítico Geral</span>
                      <div>
                        <h5 className="text-xs font-mono text-blue-400 font-bold mt-1 select-all">PDV: {filteredClientRankings[0].code}</h5>
                        <h4 className="text-sm font-bold text-white uppercase mt-0.5 font-sans leading-snug">{filteredClientRankings[0].name}</h4>
                      </div>
                      <p className="text-xs text-slate-450">
                        Este cliente concentrou o maior volume de inconsistência e solicitações comerciais, com <strong className="text-blue-400">{filteredClientRankings[0].requestCount} ocorrências registradas</strong> e custo total faturado/reclamado de <strong className="text-blue-400 font-mono">{formatCurrency(filteredClientRankings[0].totalSpent)}</strong>.
                      </p>
                    </div>

                    {/* MAPPED CREWS ASSOCIATED WITH LEADER */}
                    <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-850 space-y-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-900">
                        <Truck className="w-3.5 h-3.5 text-blue-450" />
                        <span>Equipes / Motoristas Envolvidos neste Cliente</span>
                      </h4>

                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                        {filteredClientRankings[0].drivers.map((d, index) => (
                          <div key={d.driver} className="flex justify-between items-center text-xs">
                            <span className="text-slate-300 font-medium truncate max-w-[190px]">
                              {index + 1}º. {d.driver}
                            </span>
                            <span className="font-mono bg-slate-950 border border-slate-850 text-[10px] px-2 py-0.5 rounded text-slate-400 font-bold font-semibold shrink-0">
                              {d.count} entregas com anomalia
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* REASONS ASSOCIATED WITH THIS CLIENT */}
                    <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-850 space-y-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-900 font-sans">
                        <FileText className="w-3.5 h-3.5 text-rose-400" />
                        <span>Justificativas de Troca no Cliente Líder</span>
                      </h4>

                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                        {filteredClientRankings[0].reasons.map((r, idx) => (
                          <div key={r.reason} className="flex justify-between items-center text-xs">
                            <span className="text-slate-350 truncate font-semibold uppercase leading-none max-w-[210px]">
                              {idx + 1}º. {r.reason}
                            </span>
                            <span className="font-mono text-[9.5px] text-slate-500 font-bold shrink-0">
                              {r.count} ocorrências
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-center py-12 text-xs">
                    Carregando detalhes do cliente...
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      ) : (
        /* PANEL 3: REASONS / MOTIVOS RANKING (Beautiful listings, indicators, counts) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          
          {/* LEFT COLUMN: JUSTIFICATIVAS / MOTIVATIONS LIST */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>Classificação de Motivos (Análise Geral)</span>
              </h3>
              <p className="text-xs text-slate-400">Impacto e reincidência de reposições agrupadas pela Justificativa digitada pelos líderes.</p>
            </div>

            <div className="space-y-3">
              {motiveRankings.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs">
                  Sem motivos de troca mapeados na base atual.
                </div>
              ) : (
                motiveRankings.map((m, idx) => {
                  let activeVal = m.totalSpent;
                  let prefixLabel = formatCurrency(m.totalSpent);
                  
                  if (rankingMetric === "count") {
                    activeVal = m.requestCount;
                    prefixLabel = `${m.requestCount} trocas`;
                  } else if (rankingMetric === "hl") {
                    activeVal = m.totalHL;
                    prefixLabel = `${m.totalHL.toFixed(2)} HL`;
                  }

                  const percentage = maxMotiveMetricValue > 0 ? (activeVal / maxMotiveMetricValue) * 100 : 0;

                  return (
                    <div
                      key={m.reason}
                      className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-850 hover:border-slate-800 transition-colors flex flex-col space-y-2"
                    >
                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-start space-x-2.5 min-w-0 max-w-[70%]">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[9px] font-mono shrink-0 ${
                            idx === 0 ? "bg-red-650 text-white font-bold" : idx === 1 ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-400"
                          }`}>
                            {idx + 1}º
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-200 leading-tight uppercase font-sans tracking-wide">
                              {m.reason}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-mono">
                              Ocorrências: <span className="font-bold text-slate-350">{m.requestCount}</span> | Volume: <span className="font-bold text-slate-350">{m.totalHL.toFixed(2)} HL</span>
                            </p>
                          </div>
                        </div>

                        <span className="font-bold text-xs font-mono text-blue-400 shrink-0">
                          {prefixLabel}
                        </span>
                      </div>

                      {/* Progress chart representation */}
                      <div className="w-full bg-slate-900 h-2 border border-slate-850 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: CORRELATION GRID FOR JUSTIFICATIVAS / MOTIVATIONS */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-6">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span>Correlações e Lançamentos Críticos</span>
              </h3>
              <p className="text-xs text-slate-400">Inspeção dos maiores setores de venda e dos motoristas mapeados para o motivo líder.</p>
            </div>

            {motiveRankings.length > 0 ? (
              <div className="space-y-6">
                {/* LÍDER DE REPOSIÇÃO */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                    <span>MOTIVO DE MAIOR CUSTO OPERACIONAL</span>
                    <span className="text-red-400 font-bold uppercase animate-pulse">Impacto Crítico</span>
                  </div>
                  <h4 className="font-bold text-white text-md uppercase font-sans tracking-wide">{motiveRankings[0].reason}</h4>
                  <p className="text-xs text-slate-450 mt-1 font-sans">
                    Este motivo gerou um custo acumulado de <span className="text-blue-400 font-bold font-mono">{formatCurrency(motiveRankings[0].totalSpent)}</span> e representou <span className="text-blue-400 font-bold font-mono">{motiveRankings[0].requestCount} solicitações de devoluções</span> na base.
                  </p>
                </div>

                {/* Sub Ranking card 1: Top Sectors for Motive líder */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3.5">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-900">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    <span>Setores com Maior Frequência Deste Motivo</span>
                  </h4>

                  <div className="space-y-2.5 max-h-[165px] overflow-y-auto pr-1 scrollbar-thin">
                    {motiveRankings[0].sectors.slice(0, 5).map((s, idx) => (
                      <div key={s.sector} className="flex justify-between items-center text-xs">
                        <span className="font-mono bg-slate-900 border border-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-350 font-bold">
                          Setor {s.sector}
                        </span>
                        <div className="flex items-center space-x-3">
                          <span className="text-slate-500 font-mono text-[10px]">{s.count} solicitações</span>
                          <span className="font-mono font-bold text-slate-200">{formatCurrency(s.spent)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sub Ranking card 2: Top Drivers for Motive líder */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3.5">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-900">
                    <Truck className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Motoristas com Maior Custo Neste Motivo</span>
                  </h4>

                  <div className="space-y-2.5 max-h-[165px] overflow-y-auto pr-1 scrollbar-thin">
                    {motiveRankings[0].drivers.slice(0, 5).map((d, index) => (
                      <div key={d.driver} className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-semibold truncate max-w-[200px]">
                          {index + 1}º. {d.driver}
                        </span>
                        <div className="flex items-center space-x-3">
                          <span className="text-slate-500 font-mono text-[10px]">{d.count} trocas</span>
                          <span className="font-mono font-bold text-slate-200">{formatCurrency(d.spent)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 font-mono text-xs">
                Carregando correlações operacionais...
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
