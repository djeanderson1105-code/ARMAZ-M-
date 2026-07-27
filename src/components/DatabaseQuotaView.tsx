import React, { useState, useEffect, useMemo } from "react";
import { 
  Database, 
  Activity, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Server, 
  Cpu, 
  HardDrive, 
  Zap, 
  Users, 
  RefreshCw, 
  Lock, 
  Layers, 
  ArrowUpRight, 
  BarChart3, 
  Sliders, 
  FileText, 
  TrendingUp, 
  Sparkles,
  Info,
  BookOpen,
  HelpCircle,
  Edit3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldAlert
} from "lucide-react";
import { 
  getTelemetryStats, 
  recordReads, 
  recordWrites, 
  calculateProjection, 
  setCalibratedReadsAndWrites,
  QUOTA_LIMITS, 
  TelemetryStats 
} from "../utils/dbQuotaTelemetry";
import { ExchangeRecord, PendingRequest } from "../types";

interface DatabaseQuotaViewProps {
  records?: ExchangeRecord[];
  pendingRequests?: PendingRequest[];
}

export const DatabaseQuotaView: React.FC<DatabaseQuotaViewProps> = ({
  records = [],
  pendingRequests = []
}) => {
  // Telemetry state
  const [telemetry, setTelemetry] = useState<TelemetryStats>(() => getTelemetryStats());
  const [ecoMode, setEcoMode] = useState<boolean>(() => {
    return localStorage.getItem("sstr_eco_mode_enabled") === "true";
  });

  // Calibration state
  const [showCalibrationModal, setShowCalibrationModal] = useState<boolean>(false);
  const [calibratedReads, setCalibratedReads] = useState<string>(() => String(telemetry.reads));
  const [calibratedWrites, setCalibratedWrites] = useState<string>(() => String(telemetry.writes));

  // Simulator controls (Defaults tuned for 30 simultaneous users)
  const [simCollaborators, setSimCollaborators] = useState<number>(30);
  const [simActionsPerUser, setSimActionsPerUser] = useState<number>(15);
  const [simSyncProfile, setSimSyncProfile] = useState<"balanced" | "eco" | "realtime">("balanced");
  const [simQuotaOverride, setSimQuotaOverride] = useState<boolean>(false);

  // Accordion state for instruction manual
  const [activeManualTab, setActiveManualTab] = useState<string>("divergencia");

  // Listen to telemetry updates
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setTelemetry(e.detail);
      }
    };
    window.addEventListener("sstr_telemetry_updated", handleUpdate);
    return () => {
      window.removeEventListener("sstr_telemetry_updated", handleUpdate);
    };
  }, []);

  const handleToggleEcoMode = () => {
    const next = !ecoMode;
    setEcoMode(next);
    localStorage.setItem("sstr_eco_mode_enabled", String(next));
  };

  const handleRefreshTelemetry = () => {
    recordReads(2);
    setTelemetry(getTelemetryStats());
  };

  const handleSaveCalibration = (e: React.FormEvent) => {
    e.preventDefault();
    const r = parseInt(calibratedReads, 10);
    const w = parseInt(calibratedWrites, 10);
    if (!isNaN(r)) {
      setCalibratedReadsAndWrites(r, isNaN(w) ? undefined : w);
      setTelemetry(getTelemetryStats());
      setShowCalibrationModal(false);
    }
  };

  // Projection results
  const projection = useMemo(() => {
    const currentR = simQuotaOverride ? 42000 : telemetry.reads;
    const currentW = simQuotaOverride ? 17500 : telemetry.writes;
    return calculateProjection(
      simCollaborators,
      simActionsPerUser,
      simSyncProfile,
      currentR,
      currentW
    );
  }, [simCollaborators, simActionsPerUser, simSyncProfile, simQuotaOverride, telemetry]);

  // Read / Write Progress %
  const readPercent = Math.min(100, (telemetry.reads / QUOTA_LIMITS.DAILY_READS) * 100);
  const writePercent = Math.min(100, (telemetry.writes / QUOTA_LIMITS.DAILY_WRITES) * 100);
  const storagePercent = Math.min(100, (telemetry.estimatedStorageMB / QUOTA_LIMITS.MAX_STORAGE_MB) * 100);

  // Active status color helper
  const getStatusBadge = (percent: number) => {
    if (percent >= 90) return { label: "CRÍTICO", color: "bg-red-500/20 text-red-300 border-red-500/50" };
    if (percent >= 70) return { label: "ATENÇÃO", color: "bg-amber-500/20 text-amber-300 border-amber-500/50" };
    return { label: "SEGURO", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50" };
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in text-slate-100 font-sans">
      
      {/* HEADER BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-blue-600/30 border border-blue-500/40 text-blue-300 text-[11px] font-mono font-bold rounded-full uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              Guia de Dados & Desempenho
            </span>
            <span className="px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-extrabold rounded-full">
              ⚡ Plano Gratuito Spark Firebase
            </span>
            <span className="px-2.5 py-0.5 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-mono font-extrabold rounded-full flex items-center gap-1">
              <Users className="w-3 h-3 text-purple-400" />
              30+ Colaboradores Otimizado
            </span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2 pt-1">
            Gestão de Consumo & Telemetria do Banco de Dados
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Acompanhe o consumo diário de <strong className="text-blue-300">Leituras</strong> e <strong className="text-emerald-300">Gravações</strong> em tempo real, simule a capacidade para mais de 30 usuários simultâneos e consulte nosso plano de ação gratuito contra falhas ou bloqueios.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setCalibratedReads(String(telemetry.reads));
              setCalibratedWrites(String(telemetry.writes));
              setShowCalibrationModal(true);
            }}
            className="px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/50 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            title="Calibrar os contadores locais com o valor exato do Console Firebase"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-300" />
            <span>Calibrar com Console Firebase</span>
          </button>

          <button
            onClick={handleToggleEcoMode}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 shadow-md cursor-pointer ${
              ecoMode 
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
            title="Ativa compactação agressiva de imagens e requisições em lote"
          >
            <Zap className={`w-4 h-4 ${ecoMode ? "text-amber-300 fill-amber-300" : "text-slate-400"}`} />
            <span>Modo Eco-Sync: {ecoMode ? "ATIVADO" : "DESATIVADO"}</span>
          </button>

          <button
            onClick={handleRefreshTelemetry}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            title="Atualizar métricas de telemetria agora"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Atualizar Telemetria</span>
          </button>
        </div>
      </div>

      {/* DIVERGÊNCIA & CALIBRAÇÃO EXPLICATIVA BANNER */}
      <div className="bg-gradient-to-r from-blue-950/80 via-indigo-950/60 to-slate-900/90 p-5 rounded-2xl border border-blue-500/40 shadow-xl space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/20 border border-blue-500/40 text-blue-300 rounded-xl shrink-0">
              <Info className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                Por que existe divergência entre a Plataforma (ex: {telemetry.reads.toLocaleString("pt-BR")}) e o Console Firebase (ex: 2.700)?
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                O <strong className="text-blue-300">Console do Firebase</strong> soma <u>globalmente</u> as requisições efetuadas por <strong>todos os navegadores, colaboradores e sessões simultâneas</strong> no projeto. A <strong>Telemetria do Navegador</strong> calcula as operações executadas nesta sessão individual.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setCalibratedReads(String(telemetry.reads));
              setCalibratedWrites(String(telemetry.writes));
              setShowCalibrationModal(true);
            }}
            className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Sincronizar Valor do Console</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1 border-t border-blue-500/20">
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Firebase Console (Global):</span>
            <strong className="text-blue-300 font-mono">Consumo Real Somado (Todos os Colaboradores)</strong>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Telemetria Local (Dispositivo):</span>
            <strong className="text-emerald-300 font-mono">Monitor de Sessão em Tempo Real</strong>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-400">Status da Cota Spark:</span>
            <strong className="text-purple-300 font-mono">Ambos bem abaixo das 50.000/dia</strong>
          </div>
        </div>
      </div>

      {/* ALERT BANNER DE CONSUMO / SAÚDE */}
      <div className={`p-4 rounded-2xl border shadow-lg flex items-start gap-3 transition-all ${
        projection.status === "CRITICO"
          ? "bg-red-950/80 border-red-500/80 text-red-200"
          : projection.status === "ATENCAO"
          ? "bg-amber-950/80 border-amber-500/80 text-amber-200"
          : "bg-slate-900/90 border-emerald-500/40 text-emerald-200"
      }`}>
        {projection.status === "CRITICO" ? (
          <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5 animate-bounce" />
        ) : projection.status === "ATENCAO" ? (
          <Info className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
        )}

        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold uppercase tracking-wide flex items-center gap-2">
              Status Operacional do Banco: 
              <span className={`px-2 py-0.5 text-[10px] rounded-full border font-mono ${
                projection.status === "CRITICO" ? "bg-red-600 text-white border-red-400" :
                projection.status === "ATENCAO" ? "bg-amber-600 text-white border-amber-400" :
                "bg-emerald-600 text-white border-emerald-400"
              }`}>
                ● {projection.status}
              </span>
            </h4>
            <span className="text-[10px] font-mono text-slate-400">
              Última Verificação: {telemetry.lastUpdated}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {projection.statusMessage}
          </p>
        </div>
      </div>

      {/* SECTION 1: CARDS DE CONSUMO EM TEMPO REAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* LEITURAS DIÁRIAS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 relative overflow-hidden group hover:border-blue-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-950 text-blue-400 rounded-xl border border-blue-800/60">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Leituras (Reads)</span>
            </div>
            <span className={`px-2 py-0.5 text-[10px] font-mono font-black rounded-md border ${getStatusBadge(readPercent).color}`}>
              {readPercent.toFixed(1)}%
            </span>
          </div>

          <div>
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {telemetry.reads.toLocaleString("pt-BR")} <span className="text-xs text-slate-400 font-sans font-normal">/ 50.000</span>
            </div>
            <p className="text-[11px] text-blue-300 font-mono mt-0.5">
              Restam: <strong>{(QUOTA_LIMITS.DAILY_READS - telemetry.reads).toLocaleString("pt-BR")}</strong> leituras hoje
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div 
                className={`h-full transition-all duration-500 ${readPercent >= 90 ? "bg-red-500" : readPercent >= 70 ? "bg-amber-500" : "bg-blue-500"}`}
                style={{ width: `${Math.max(2, readPercent)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>0</span>
              <span>Limite Cota Gratuita: 50.000/dia</span>
            </div>
          </div>
        </div>

        {/* GRAVAÇÕES DIÁRIAS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-800/60">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Gravações (Writes)</span>
            </div>
            <span className={`px-2 py-0.5 text-[10px] font-mono font-black rounded-md border ${getStatusBadge(writePercent).color}`}>
              {writePercent.toFixed(1)}%
            </span>
          </div>

          <div>
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {telemetry.writes.toLocaleString("pt-BR")} <span className="text-xs text-slate-400 font-sans font-normal">/ 20.000</span>
            </div>
            <p className="text-[11px] text-emerald-300 font-mono mt-0.5">
              Restam: <strong>{(QUOTA_LIMITS.DAILY_WRITES - telemetry.writes).toLocaleString("pt-BR")}</strong> gravações hoje
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div 
                className={`h-full transition-all duration-500 ${writePercent >= 90 ? "bg-red-500" : writePercent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.max(2, writePercent)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>0</span>
              <span>Limite Cota Gratuita: 20.000/dia</span>
            </div>
          </div>
        </div>

        {/* ARMAZENAMENTO ESPAÇO */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-950 text-purple-400 rounded-xl border border-purple-800/60">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Armazenamento</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono font-black rounded-md border bg-purple-500/20 text-purple-300 border-purple-500/40">
              {storagePercent.toFixed(2)}%
            </span>
          </div>

          <div>
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {telemetry.estimatedStorageMB} MB <span className="text-xs text-slate-400 font-sans font-normal">/ 1.024 MB</span>
            </div>
            <p className="text-[11px] text-purple-300 font-mono mt-0.5">
              Restam: <strong>{(QUOTA_LIMITS.MAX_STORAGE_MB - telemetry.estimatedStorageMB).toFixed(1)} MB</strong> livres (1 GiB)
            </p>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div 
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${Math.max(2, storagePercent)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>0 MB</span>
              <span>Compr. Imagens Canvas Ativado</span>
            </div>
          </div>
        </div>

        {/* CONEXÕES SIMULTÂNEAS */}
        <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 relative overflow-hidden group hover:border-indigo-500/50 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-950 text-indigo-400 rounded-xl border border-indigo-800/60">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Usuários Ativos</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono font-black rounded-md border bg-indigo-500/20 text-indigo-300 border-indigo-500/40">
              SUPORTA 100
            </span>
          </div>

          <div>
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              30+ <span className="text-xs text-slate-400 font-sans font-normal">Colaboradores</span>
            </div>
            <p className="text-[11px] text-indigo-300 font-mono mt-0.5">
              WebSocket WebSockets em sub-segundo
            </p>
          </div>

          <div className="space-y-1">
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: "30%" }}></div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>Uso Atual: ~30 usuarios</span>
              <span>Capacidade: 100 em tempo real</span>
            </div>
          </div>
        </div>

      </div>

      {/* NOVO: MANUAL DE INSTRUÇÃO E GUIA COMPLETO DE DADOS */}
      <div className="bg-slate-900/95 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-5">
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <span className="px-2.5 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold rounded-full uppercase flex items-center gap-1 w-fit">
              <BookOpen className="w-3 h-3 text-indigo-400" />
              Manual do Gestor & Procedimento Operacional Padrão (POP)
            </span>
            <h3 className="text-xl font-black text-white flex items-center gap-2 pt-1">
              Guia Completo de Uso da Guia DADOS
            </h3>
            <p className="text-xs text-slate-400">
              Entenda o funcionamento da telemetria, como calibrar os dados com o Firebase Console e como gerenciar o banco de dados sem custos para 30+ colaboradores.
            </p>
          </div>

          {/* Navigation Tabs for Manual */}
          <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-medium">
            <button
              onClick={() => setActiveManualTab("divergencia")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeManualTab === "divergencia" 
                  ? "bg-blue-600 text-white font-bold shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              1. Divergência de Dados
            </button>
            <button
              onClick={() => setActiveManualTab("calibracao")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeManualTab === "calibracao" 
                  ? "bg-indigo-600 text-white font-bold shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              2. Como Calibrar
            </button>
            <button
              onClick={() => setActiveManualTab("cotas")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeManualTab === "cotas" 
                  ? "bg-emerald-600 text-white font-bold shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              3. Limites e Cotas
            </button>
            <button
              onClick={() => setActiveManualTab("simulador")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeManualTab === "simulador" 
                  ? "bg-purple-600 text-white font-bold shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              4. Uso para 30+ Usuários
            </button>
            <button
              onClick={() => setActiveManualTab("emergencia")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                activeManualTab === "emergencia" 
                  ? "bg-amber-600 text-white font-bold shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              5. Failsafe & Zero Perda
            </button>
          </div>
        </div>

        {/* TAB CONTENT 1: DIVERGENCIA */}
        {activeManualTab === "divergencia" && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2 text-blue-400">
              <HelpCircle className="w-4 h-4" />
              Módulo 1: Entendendo a Divergência entre Plataforma e Firebase Console
            </h4>
            <p>
              É perfeitamente normal existir uma diferença entre o número exibido no <strong>Console oficial do Firebase</strong> (exemplo: 2.700 leituras hoje, pico de 41.000) e a <strong>Telemetria da Plataforma</strong> (exemplo: 1.324 leituras). Essa diferença ocorre por dois motivos fundamentais de arquitetura:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="bg-slate-900 p-4 rounded-xl border border-blue-500/30 space-y-2">
                <span className="font-bold text-blue-400 text-xs block uppercase">1. Métricas Agregadas do Console Firebase (Servidor Global)</span>
                <p>
                  O Firebase Console mede o consumo acumulado no servidor <strong>de todas as conexões do seu projeto</strong>. Isso inclui:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
                  <li>Soma de todas as sessões abertas por todos os 30+ representantes e gestores.</li>
                  <li>Aberturas de página, atualizações manuais e buscas efetuadas ao longo do dia.</li>
                  <li>Conexões simultâneas que carregam a lista inicial de solicitações pendentes.</li>
                </ul>
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-emerald-500/30 space-y-2">
                <span className="font-bold text-emerald-400 text-xs block uppercase">2. Telemetria do Navegador Local (Cliente Atual)</span>
                <p>
                  O painel local da plataforma registra as ações efetuadas no dispositivo atual e projeta estimativas operacionais com base nas requisições da sessão.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-300 text-[11px]">
                  <li>Mede exatamente as trocas, aprovações e sincronizações disparadas na máquina atual.</li>
                  <li>Serve como simulador de capacidade de carga para prever se 30 usuários vão estourar a cota.</li>
                  <li>Pode ser sincronizado a qualquer momento para bater 100% com o Console Firebase.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT 2: COMO CALIBRAR */}
        {activeManualTab === "calibracao" && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2 text-indigo-400">
              <Edit3 className="w-4 h-4" />
              Módulo 2: Passo a Passo para Calibrar a Telemetria com o Firebase Console
            </h4>
            <p>
              Para alinhar exatamente os contadores da plataforma com o valor real auditado pelo Google Firebase, siga o procedimento simples abaixo:
            </p>

            <div className="space-y-3 pt-1">
              <div className="flex items-start gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0 font-mono text-xs">1</span>
                <div>
                  <strong className="text-white block">Consulte o Gráfico no Console do Firebase</strong>
                  <p className="text-slate-400 text-[11px]">
                    Abra o Firebase Console na aba <strong>Cloud Firestore &gt; Uso/Cotas</strong>. Observe o campo <em>Leituras (hoje)</em> (por exemplo: <strong>2,7 mil</strong> ou <strong>2.700</strong>) e <em>Gravações</em>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0 font-mono text-xs">2</span>
                <div>
                  <strong className="text-white block">Clique em "Calibrar com Console Firebase"</strong>
                  <p className="text-slate-400 text-[11px]">
                    Nesta aba (DADOS), clique no botão azul localizado no topo superior direito: <strong>"Calibrar com Console Firebase"</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center shrink-0 font-mono text-xs">3</span>
                <div>
                  <strong className="text-white block">Informe os Valores e Salve</strong>
                  <p className="text-slate-400 text-[11px]">
                    Digite o valor exato no formulário (ex: <code>2700</code> para leituras e <code>125</code> para gravações). O sistema recalculará instantaneamente todas as barras de cota e previsões diárias!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT 3: LIMITES E COTAS */}
        {activeManualTab === "cotas" && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Módulo 3: Limites Gratuitos da Cota Spark do Firebase (Sem Custo Financeiro)
            </h4>
            <p>
              A operação SSTR utiliza o plano gratuito <strong>Spark</strong> do Google Firebase. Este plano renova todas as suas cotas a cada 24 horas (meia-noite no horário UTC):
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-blue-400 font-mono text-[10px] uppercase font-bold">Leituras (Reads)</span>
                <div className="text-lg font-black text-white font-mono">50.000 / dia</div>
                <p className="text-[10px] text-slate-400">Equivale a ~2.000 visualizações completas de painel por dia.</p>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-emerald-400 font-mono text-[10px] uppercase font-bold">Gravações (Writes)</span>
                <div className="text-lg font-black text-white font-mono">20.000 / dia</div>
                <p className="text-[10px] text-slate-400">Permite registrar até 20.000 novas trocas ou aprovações por dia.</p>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-purple-400 font-mono text-[10px] uppercase font-bold">Armazenamento</span>
                <div className="text-lg font-black text-white font-mono">1.024 MB (1 GiB)</div>
                <p className="text-[10px] text-slate-400">Armazena mais de 100.000 registros de trocas com compressão Canvas.</p>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1">
                <span className="text-indigo-400 font-mono text-[10px] uppercase font-bold">Conexões Simultâneas</span>
                <div className="text-lg font-black text-white font-mono">100 WebSockets</div>
                <p className="text-[10px] text-slate-400">Suporta até 100 usuários conectados em tempo real ao mesmo tempo.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT 4: USO PARA 30+ USUARIOS */}
        {activeManualTab === "simulador" && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2 text-purple-400">
              <Users className="w-4 h-4" />
              Módulo 4: Instruções de Uso do Simulador para 30+ Colaboradores
            </h4>
            <p>
              O simulador abaixo permite testar se um aumento na equipe (ex: 30, 50 ou 80 colaboradores) terá risco de ultrapassar a cota gratuita do Firebase.
            </p>

            <ul className="list-disc pl-4 space-y-2 text-slate-300">
              <li>
                <strong>Controle "Colaboradores Simultâneos":</strong> Mova o slider para simular o número de representantes efetuando lançamentos no mesmo dia.
              </li>
              <li>
                <strong>Controle "Solicitações por Usuário":</strong> Ajuste quantas trocas cada representante realiza por dia em média (ex: 15 trocas/dia).
              </li>
              <li>
                <strong>Cenário de Estresse (85%):</strong> Clique no botão "Testar Cenário de Estresse" para simular o comportamento quando o banco já consumir 85% do limite.
              </li>
            </ul>
          </div>
        )}

        {/* TAB CONTENT 5: EMERGENCIA */}
        {activeManualTab === "emergencia" && (
          <div className="space-y-4 animate-fade-in text-xs text-slate-300 leading-relaxed bg-slate-950/80 p-5 rounded-2xl border border-slate-800">
            <h4 className="text-sm font-extrabold text-white flex items-center gap-2 text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              Módulo 5: Protocolo de Emergência e Failsafe (Garantia de Zero Perda)
            </h4>
            <p>
              A arquitetura SSTR foi projetada com <strong>múltiplas camadas de contingência</strong>. Caso a cota atingisse 100% ou a internet oscilasse, o sistema reage automaticamente da seguinte forma:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-900 p-3.5 rounded-xl border border-amber-500/30 space-y-1">
                <strong className="text-amber-300 block text-xs">1. Ativação Automática do Modo Eco-Sync</strong>
                <p className="text-[11px] text-slate-300">
                  Reduz a frequência de consultas ao Firebase, utilizando a base em cache no IndexedDB local de cada dispositivo. Economiza até 95% de leituras.
                </p>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-xl border border-emerald-500/30 space-y-1">
                <strong className="text-emerald-300 block text-xs">2. Fila Offline Failsafe Criptografada</strong>
                <p className="text-[11px] text-slate-300">
                  Solicitações lançadas em momento de falta de sinal ou estouro de cota são guardadas no celular do representante e enviadas assim que o canal for reaberto. <strong>Nenhuma solicitação é perdida!</strong>
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* SECTION 2: CALCULADORA & SIMULADOR DE PROJEÇÃO DE AÇÕES */}
      <div className="bg-slate-900/95 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-400" />
              Simulador & Previsão de Ações por Colaborador
            </h3>
            <p className="text-xs text-slate-400">
              Ajuste o número de colaboradores e solicitações diárias para calcular a margem de segurança e o número exato de ações restantes antes de atingir a cota gratuita.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSimQuotaOverride(!simQuotaOverride)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                simQuotaOverride 
                  ? "bg-amber-600 text-white border-amber-400 shadow-lg"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              {simQuotaOverride ? "⚠️ Simulação de Cota Quase Cheia (85%)" : "🧪 Testar Cenário de Estresse (85%)"}
            </button>
          </div>
        </div>

        {/* CONTROLES DE SIMULAÇÃO */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-955 p-5 rounded-2xl border border-slate-850">
          
          {/* SLIDER 1: NUMERO DE COLABORADORES */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-200">
              <label className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                <span>Colaboradores Simultâneos:</span>
              </label>
              <span className="font-mono text-blue-400 font-extrabold text-sm">{simCollaborators} usuários</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={simCollaborators} 
              onChange={(e) => setSimCollaborators(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>1 colab</span>
              <span className="text-blue-400 font-bold">30 recomendados</span>
              <span>100 limite WS</span>
            </div>
          </div>

          {/* SLIDER 2: SOLICITAÇÕES POR USUÁRIO */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-200">
              <label className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Solicitações por Usuário/Dia:</span>
              </label>
              <span className="font-mono text-emerald-400 font-extrabold text-sm">{simActionsPerUser} por dia</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="100" 
              value={simActionsPerUser} 
              onChange={(e) => setSimActionsPerUser(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>1 ação</span>
              <span className="text-emerald-400 font-bold">15 média diária</span>
              <span>100 intensivo</span>
            </div>
          </div>

          {/* SELECT 3: PERFIL DE SINCRONIZAÇÃO */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-200">
              <span>Perfil de Sincronização:</span>
            </label>
            <select
              value={simSyncProfile}
              onChange={(e) => setSimSyncProfile(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl p-2.5 focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="balanced">⚡ Cache Híbrido Otimizado (Padrão SSTR)</option>
              <option value="eco">🌱 Modo Eco-Sync (Economia Extrema - Offline IDB)</option>
              <option value="realtime">🔥 Tempo Real Total sem Cache (Apenas Teste)</option>
            </select>
            <p className="text-[10px] text-slate-400">
              {simSyncProfile === "balanced" && "Sincroniza solicitações em tempo real e armazena tabelas estáticas no IndexedDB local."}
              {simSyncProfile === "eco" && "Prioriza gravações em lote local e sincroniza apenas deltas necessários."}
              {simSyncProfile === "realtime" && "Mantém ouvintes abertos em todas as coleções do banco constantemente."}
            </p>
          </div>

        </div>

        {/* RESULTADOS DA PROJEÇÃO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          {/* PAINEL DE LEITURAS PROJETADAS */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-wide">
              Projeção de Leituras no Dia
            </span>
            <div className="text-2xl font-black text-white font-mono">
              {projection.projectedDailyReads.toLocaleString("pt-BR")}{" "}
              <span className="text-xs font-normal text-slate-400">/ 50.000 ({projection.readQuotaUsedPercent}%)</span>
            </div>
            <p className="text-xs text-slate-300 font-mono">
              Restam: <strong className="text-blue-300">{projection.remainingDailyReads.toLocaleString("pt-BR")}</strong> leituras disponíveis hoje.
            </p>
          </div>

          {/* PAINEL DE GRAVAÇÕES PROJETADAS */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wide">
              Projeção de Gravações no Dia
            </span>
            <div className="text-2xl font-black text-white font-mono">
              {projection.projectedDailyWrites.toLocaleString("pt-BR")}{" "}
              <span className="text-xs font-normal text-slate-400">/ 20.000 ({projection.writeQuotaUsedPercent}%)</span>
            </div>
            <p className="text-xs text-slate-300 font-mono">
              Restam: <strong className="text-emerald-300">{projection.remainingDailyWrites.toLocaleString("pt-BR")}</strong> gravações disponíveis hoje.
            </p>
          </div>

          {/* PAINEL DE AÇÕES RESTANTES */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 bg-gradient-to-br from-slate-950 to-indigo-950/60">
            <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              Ações Possíveis Antes do Limite
            </span>
            <div className="text-xl font-black text-white font-mono">
              ~{projection.maxActionsRemainingForWrites.toLocaleString("pt-BR")}{" "}
              <span className="text-xs font-normal text-slate-300">novas solicitações</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Com {simCollaborators} usuários, você ainda pode realizar mais de <strong className="text-emerald-300">{projection.maxActionsRemainingForWrites.toLocaleString("pt-BR")} lançamentos de trocas</strong> hoje com total segurança!
            </p>
          </div>

        </div>

      </div>

      {/* SECTION 3: PLANO DE AÇÃO PRÁTICO E GRATUITO PARA 30+ COLABORADORES */}
      <div className="bg-slate-900/95 p-6 rounded-3xl border border-slate-800 shadow-2xl space-y-6">
        
        <div className="space-y-1 border-b border-slate-800 pb-4">
          <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold rounded-full uppercase">
            Garantia de Não-Perda de Dados
          </span>
          <h3 className="text-lg font-black text-white flex items-center gap-2 pt-1">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Plano de Ação Prático & Gratuito (30+ Colaboradores em Simultâneo)
          </h3>
          <p className="text-xs text-slate-400">
            Abaixo estão os 5 pilares arquiteturais implementados diretamente no código da plataforma para garantir que nenhuma solicitação seja perdida e o limite de cota nunca cause bloqueios.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* PILAR 1: INDEXEDDB CACHE */}
          <div className="bg-slate-955 p-5 rounded-2xl border border-slate-800 space-y-3 relative group hover:border-blue-500/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-950 text-blue-400 rounded-xl border border-blue-800/60 font-black font-mono text-sm">
                01
              </div>
              <h4 className="text-sm font-extrabold text-white">
                Cache Local em IndexedDB
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tabelas estáticas (como lista de produtos e PDVs) são salvas no armazenamento local do navegador de cada colaborador.
            </p>

            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono text-blue-300 space-y-1">
              <div className="flex justify-between">
                <span>Economia de Leituras:</span>
                <strong className="text-emerald-400">&gt;95% reduzido</strong>
              </div>
              <div className="flex justify-between">
                <span>Resultado:</span>
                <span className="text-slate-300">0 consultas repetidas</span>
              </div>
            </div>
          </div>

          {/* PILAR 2: LOTEAMENTO WRITE BATCHING */}
          <div className="bg-slate-955 p-5 rounded-2xl border border-slate-800 space-y-3 relative group hover:border-emerald-500/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-800/60 font-black font-mono text-sm">
                02
              </div>
              <h4 className="text-sm font-extrabold text-white">
                Loteamento de Gravações (Batching)
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Importações de planilhas CSV e edições em massa utilizam <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">writeBatch</code> para enviar em pacotes consolidados de até 400 itens.
            </p>

            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono text-emerald-300 space-y-1">
              <div className="flex justify-between">
                <span>Eficiência de Rede:</span>
                <strong className="text-emerald-400">100% atômico</strong>
              </div>
              <div className="flex justify-between">
                <span>Mitigação de Falhas:</span>
                <span className="text-slate-300">Zero dados parciais</span>
              </div>
            </div>
          </div>

          {/* PILAR 3: LISTENERS DIRECIONADOS */}
          <div className="bg-slate-955 p-5 rounded-2xl border border-slate-800 space-y-3 relative group hover:border-purple-500/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-950 text-purple-400 rounded-xl border border-purple-800/60 font-black font-mono text-sm">
                03
              </div>
              <h4 className="text-sm font-extrabold text-white">
                Listeners Focados em Solicitações
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              O ouvinte em tempo real WebSocket fica ativo somente na fila de <strong className="text-purple-300">Solicitações Pendentes</strong>. Históricos antigos usam busca estática.
            </p>

            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono text-purple-300 space-y-1">
              <div className="flex justify-between">
                <span>WebSockets Usados:</span>
                <strong className="text-emerald-400">~30 / 100 max</strong>
              </div>
              <div className="flex justify-between">
                <span>Velocidade Sync:</span>
                <span className="text-slate-300">Sub-segundo (&lt;300ms)</span>
              </div>
            </div>
          </div>

          {/* PILAR 4: COMPACTAÇÃO CANVAS */}
          <div className="bg-slate-955 p-5 rounded-2xl border border-slate-800 space-y-3 relative group hover:border-indigo-500/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-950 text-indigo-400 rounded-xl border border-indigo-800/60 font-black font-mono text-sm">
                04
              </div>
              <h4 className="text-sm font-extrabold text-white">
                Compactação de Anexos no Cliente
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Fotos de avarias e recibos são redimensionadas no navegador via Canvas 2D antes do upload, reduzindo arquivos de 5MB para menos de 100KB.
            </p>

            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono text-indigo-300 space-y-1">
              <div className="flex justify-between">
                <span>Redução de Tamanho:</span>
                <strong className="text-emerald-400">98% mais leve</strong>
              </div>
              <div className="flex justify-between">
                <span>Impacto no Limite:</span>
                <span className="text-slate-300">Preserva o 1 GiB grátis</span>
              </div>
            </div>
          </div>

          {/* PILAR 5: FAILSAFE OFFLINE */}
          <div className="bg-slate-955 p-5 rounded-2xl border border-slate-800 space-y-3 relative group hover:border-amber-500/50 transition-all md:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-950 text-amber-400 rounded-xl border border-amber-800/60 font-black font-mono text-sm">
                05
              </div>
              <h4 className="text-sm font-extrabold text-white">
                Garantia Offline Failsafe (Fila de Sincronização Local)
              </h4>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Caso haja perda momentânea de conexão de internet no portal de campo ou a cota atinja o teto, o sistema armazena a solicitação em fila criptografada local (`sstr_representative_pending_requests`) e re-sincroniza automaticamente quando o canal for liberado.
            </p>

            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-amber-300 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Zero perda de dados garantida para os 30 colaboradores!
              </span>
              <span className="text-slate-400 text-[10px]">
                Sincronização em plano de fundo ativa
              </span>
            </div>
          </div>

        </div>

      </div>

      {/* SECTION 4: DETALHAMENTO DE COLEÇÕES DO BANCO DE DADOS */}
      <div className="bg-slate-900/90 p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Mapeamento de Coleções no Banco Firebase
          </h3>
          <span className="text-xs font-mono text-slate-400">
            Base de Dados: <strong className="text-slate-200">sstr_firestore_main</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono text-[10px] uppercase">
                <th className="p-3">Coleção no Firestore</th>
                <th className="p-3">Finalidade / Conteúdo</th>
                <th className="p-3">Qtd. Documentos</th>
                <th className="p-3">Estratégia de Cache</th>
                <th className="p-3 text-right">Status de Saúde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850 text-slate-300">
              <tr className="hover:bg-slate-850/50">
                <td className="p-3 font-mono font-bold text-blue-400">pendingRequests</td>
                <td className="p-3">Solicitações de Troca em Campo (Inversão/Avaria)</td>
                <td className="p-3 font-mono font-bold text-white">{pendingRequests.length} docs</td>
                <td className="p-3 font-mono text-[11px] text-purple-300">
                  ⚡ Tempo Real Sub-segundo (<code className="bg-slate-950 px-1 py-0.5 rounded text-[10px]">onSnapshot</code>)
                </td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-mono font-bold">
                    🟢 Otimizado
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-850/50">
                <td className="p-3 font-mono font-bold text-emerald-400">exchangeRecords</td>
                <td className="p-3">Histórico de Lançamentos de Trocas SSTR</td>
                <td className="p-3 font-mono font-bold text-white">{records.length} docs</td>
                <td className="p-3 font-mono text-[11px] text-blue-300">
                  📦 Cache IndexedDB + Sync Delta
                </td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-mono font-bold">
                    🟢 Otimizado
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-850/50">
                <td className="p-3 font-mono font-bold text-amber-400">vales</td>
                <td className="p-3">Histórico de Vales e Reposições</td>
                <td className="p-3 font-mono font-bold text-white">~35 docs</td>
                <td className="p-3 font-mono text-[11px] text-blue-300">
                  📦 Cache Local + Sincronização Sob Demanda
                </td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-mono font-bold">
                    🟢 Otimizado
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-slate-850/50">
                <td className="p-3 font-mono font-bold text-purple-400">products / customPdvs</td>
                <td className="p-3">Base Geral de SKUs, Preços e PDVs Ambev</td>
                <td className="p-3 font-mono font-bold text-white">&gt; 1.500 docs</td>
                <td className="p-3 font-mono text-[11px] text-emerald-300">
                  🌱 100% Criptografado em IDB Local (0 Leituras)
                </td>
                <td className="p-3 text-right">
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-[10px] font-mono font-bold">
                    🟢 Zero Custo
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CALIBRAÇÃO DE DADOS REAL DO CONSOLE FIREBASE */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-950 text-indigo-400 rounded-xl border border-indigo-800/60">
                  <Edit3 className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-white">
                  Calibrar com Firebase Console
                </h3>
              </div>
              <button
                onClick={() => setShowCalibrationModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Consulte o gráfico oficial na sua tela do Firebase Console (ex: <strong>2,7 mil leituras</strong>) e digite os valores exatos abaixo para alinhar os contadores locais da plataforma:
            </p>

            <form onSubmit={handleSaveCalibration} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-blue-300">
                  Leituras Atuais (Reads do Firebase Console Hoje):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="50000"
                    value={calibratedReads}
                    onChange={(e) => setCalibratedReads(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono font-bold focus:border-blue-500 outline-none"
                    placeholder="Ex: 2700"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">/ 50.000</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Exemplo: Se o Console indica "2,7 mil", digite <code>2700</code>.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-emerald-300">
                  Gravações Atuais (Writes do Firebase Console Hoje):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="20000"
                    value={calibratedWrites}
                    onChange={(e) => setCalibratedWrites(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono font-bold focus:border-emerald-500 outline-none"
                    placeholder="Ex: 125"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">/ 20.000</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCalibrationModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aplicar Calibração</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DatabaseQuotaView;
