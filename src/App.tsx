import React, { useState, useEffect } from "react";
import { ExchangeRecord, ImportBatch } from "./types";
import { parseCSVToRecords } from "./utils/csvParser";
import { RAW_SAMPLE_DATA } from "./sampleData";
import { initializeSync, startPolling } from "./utils/apiSync";

// Components
import DashboardView from "./components/DashboardView";
import TrackingView from "./components/TrackingView";
import ImportPanel from "./components/ImportPanel";
import ReportView from "./components/ReportView";
import RepresentativePortal from "./components/RepresentativePortal";
import PauBrasilLogo from "./components/PauBrasilLogo";
import ManagerLogin from "./components/ManagerLogin";
import ManagersTab from "./components/ManagersTab";
import PendingRequestsTab from "./components/PendingRequestsTab";
import RankingsView from "./components/RankingsView";
import SstrOperationalAssistant from "./components/SstrOperationalAssistant";

// Icons
import { 
  Building2, 
  BarChart2, 
  Search, 
  Upload, 
  Download, 
  Smartphone, 
  UserCheck, 
  ShieldCheck, 
  Clock, 
  ArrowRight,
  Database,
  CheckCircle2,
  RefreshCw,
  X,
  LogOut,
  Users,
  Award,
  Monitor,
  Laptop,
  Info,
  Sun,
  Moon
} from "lucide-react";

import { SstrDataProvider, useSstrData } from "./context/SstrDataContext";

const STORAGE_RECORDS_KEY = "sstr_cached_records_v1";
const STORAGE_BATCHES_KEY = "sstr_cached_batches_v1";

function MainApp() {
  const { 
    records, 
    batches, 
    saveRecordsAndBatches, 
    isInitialLoading, 
    isHeavyLoading,
    shiftMode,
    setShiftMode
  } = useSstrData();

  const [activePortal, setActivePortal] = useState<"gestor" | "representante">("representante");
  const [activeTab, setActiveTab] = useState<"dashboard" | "tracking" | "import" | "export" | "pending" | "managers" | "rankings">("dashboard");
  const [isManagerLoggedIn, setIsManagerLoggedIn] = useState<boolean>(() => {
    return sessionStorage.getItem("is_sstr_manager_authenticated") === "true";
  });
  const [currentManagerName, setCurrentManagerName] = useState<string>(() => {
    return sessionStorage.getItem("sstr_current_manager_name") || "";
  });
  const [toastMessage, setToastMessage] = useState<{title: string, subtitle: string} | null>(null);

  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };

  const triggerWelcomeToast = (managerName: string) => {
    const trimmed = managerName.trim();
    const firstName = trimmed.split(/\s+/)[0] || trimmed;
    const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

    setToastMessage({
      title: "Bem-vindo a plataforma de gestão de trocas",
      subtitle: `Bem-vindo, ${formattedName}`
    });
    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };
  
  // Specific filter from clicking sector in dashboard view
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Force clean up of legacy localStorage authentication keys
    localStorage.removeItem("is_sstr_manager_authenticated");
    localStorage.removeItem("sstr_current_manager_name");
  }, []);

  const resetToDefaultDemoData = () => {
    const defaultRecords = parseCSVToRecords(RAW_SAMPLE_DATA, "Planilha Base Pau Brasil");
    const initialBatch: ImportBatch = {
      id: "batch_default",
      timestamp: Date.now(),
      fileName: "Planilha Base Pau Brasil.csv",
      recordCount: defaultRecords.length,
      totalValue: defaultRecords.reduce((acc, r) => acc + r.valorTotal, 0)
    };

    saveRecordsAndBatches(defaultRecords, [initialBatch], "overwrite");
  };

  const saveStateToStorage = (updatedRecords: ExchangeRecord[], updatedBatches: ImportBatch[]) => {
    saveRecordsAndBatches(updatedRecords, updatedBatches, "overwrite");
  };

  // Handle import triggered from ImportPanel
  const handleImportRecords = (newRecords: ExchangeRecord[], mergeMode: "append" | "overwrite", fileName: string) => {
    let finalRecords: ExchangeRecord[] = [];
    const newBatchId = `batch_${Date.now()}`;
    
    const newBatch: ImportBatch = {
      id: newBatchId,
      timestamp: Date.now(),
      fileName,
      recordCount: newRecords.length,
      totalValue: newRecords.reduce((acc, r) => acc + r.valorTotal, 0)
    };

    const taggedRecords = newRecords.map(r => ({
      ...r,
      importBatchName: fileName,
      importTimestamp: Date.now()
    }));

    if (mergeMode === "overwrite") {
      finalRecords = taggedRecords;
      saveStateToStorage(finalRecords, [newBatch]);
    } else {
      // Append mode - merge by uniquely matching Solicitação + Produto id keys
      const existingMap = new Map<string, ExchangeRecord>();
      records.forEach(r => {
        // Compose tracking key
        const key = `${r.solicitacao}_${r.produto}`;
        existingMap.set(key, r);
      });

      taggedRecords.forEach(r => {
        const key = `${r.solicitacao}_${r.produto}`;
        existingMap.set(key, r); // Updates matching or adds new
      });

      finalRecords = Array.from(existingMap.values());
      saveStateToStorage(finalRecords, [...batches, newBatch]);
    }
  };

  // Delete a specific file batch import
  const handleDeleteBatch = (batchId: string) => {
    const batchToDelete = batches.find(b => b.id === batchId);
    if (!batchToDelete) return;

    // Filter out records imported under this batch name
    const finalRecords = records.filter(r => r.importBatchName !== batchToDelete.fileName);
    const finalBatches = batches.filter(b => b.id !== batchId);

    saveStateToStorage(finalRecords, finalBatches);
  };

  // Status updates in real-time
  const handleUpdateRecordStatus = (id: string, newStatus: string, additionalObservations?: string) => {
    const finalRecords = records.map(r => {
      if (r.id === id) {
        return {
          ...r,
          status: newStatus,
          observacao: additionalObservations || r.observacao,
          dataAcao: new Date().toLocaleDateString("pt-BR"),
          usuarioAcao: "Administrador Logado"
        };
      }
      return r;
    });

    saveStateToStorage(finalRecords, batches);
  };

  // Trigger from Dashboard to go directly to Tracking tab with a select sector filter
  const handleSelectSectorFromDashboard = (sector: string) => {
    setSelectedSectorFilter(sector);
    setActiveTab("tracking");
  };



  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative ${shiftMode === "dia" ? "shift-mode-dia bg-slate-100 text-slate-900" : "shift-mode-noite bg-slate-950 text-slate-100"}`}>
      
      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-100 max-w-xs sm:max-w-sm w-full p-1 animate-fade-in no-print">
          <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.15)] rounded-2xl p-4 flex items-start gap-3">
            <div className="p-2 bg-emerald-950/80 text-emerald-400 rounded-xl border border-emerald-900 shrink-0">
              <CheckCircle2 className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex-1 text-left space-y-0.5 min-w-0">
              <h4 className="text-xs font-bold text-white tracking-wide font-sans">
                {toastMessage.title}
              </h4>
              <p className="text-[10px] text-emerald-400 font-mono">
                {toastMessage.subtitle}
              </p>
            </div>
            <button 
              onClick={() => setToastMessage(null)} 
              className="text-slate-550 hover:text-white transition-colors cursor-pointer p-0.5 rounded-lg shrink-0 self-start"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      
      {/* Top Professional Header no-print */}
      <header className="bg-slate-900 text-white border-b border-slate-950 px-6 py-4 shadow-xl shrink-0 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Logo Brand using Pau Brasil Corporate Identity */}
          <div className="flex items-center space-x-4 animate-fade-in">
            <PauBrasilLogo size="md" textColor="white" />
            <div className="hidden sm:flex flex-col border-l border-slate-850 pl-4 py-0.5">
              <span className="text-[10px] font-mono text-blue-400 font-bold uppercase tracking-wider leading-none">
                Operações & Trocas
              </span>
              <span className="text-[9px] text-slate-500 font-mono mt-1">
                SSTR v1.5 • Guarabira-PB
              </span>
            </div>
          </div>

          {/* Modes selector, Turno / Versão Switcher and gestor login session info */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            {/* Versão Dia / Versão Noite Selector */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800/90 flex items-center space-x-1 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => setShiftMode("dia")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  shiftMode === "dia"
                    ? "bg-amber-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-amber-300 hover:bg-slate-900"
                }`}
                title="Versão Operacional do Dia (Operação Diurna)"
              >
                <Sun className={`w-3.5 h-3.5 ${shiftMode === "dia" ? "text-slate-950" : "text-amber-400"}`} />
                <span>Versão Dia</span>
              </button>
              <button
                type="button"
                onClick={() => setShiftMode("noite")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  shiftMode === "noite"
                    ? "bg-indigo-600 text-white shadow-md font-black"
                    : "text-slate-400 hover:text-indigo-300 hover:bg-slate-900"
                }`}
                title="Versão Operacional da Noite (Carregamento & Noturno)"
              >
                <Moon className={`w-3.5 h-3.5 ${shiftMode === "noite" ? "text-white" : "text-indigo-400"}`} />
                <span>Versão Noite</span>
              </button>
            </div>

            {/* Quick Access modes (Gestor Administrative vs Acesso Representante via Linktree) */}
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center space-x-1.5 shadow-inner">
              <button
                onClick={() => setActivePortal("gestor")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activePortal === "gestor"
                    ? "bg-blue-650 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                <span>Painel do Gestor (Adm)</span>
              </button>
              <button
                onClick={() => setActivePortal("representante")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                  activePortal === "representante"
                    ? "bg-blue-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 mr-1" />
                <span>Canal de Campo (RN & Rota)</span>
              </button>
            </div>

            {/* Top Right Gestor Card & Logout */}
            {isManagerLoggedIn && (
              <div className="flex items-center space-x-2 animate-fade-in bg-slate-950/60 p-1 rounded-xl border border-slate-850 shrink-0">
                <div className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-900/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{currentManagerName ? currentManagerName.toUpperCase() : "GESTOR"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsManagerLoggedIn(false);
                    setCurrentManagerName("");
                    sessionStorage.removeItem("is_sstr_manager_authenticated");
                    sessionStorage.removeItem("sstr_current_manager_name");
                    localStorage.removeItem("is_sstr_manager_authenticated");
                    localStorage.removeItem("sstr_current_manager_name");
                    setActivePortal("representante");
                  }}
                  className="px-3 py-1.5 bg-rose-950/30 hover:bg-rose-900/80 border border-rose-900/40 hover:border-rose-600 text-rose-350 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none shrink-0"
                  title="Sair do Painel de Gestão"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Render active tracking mode */}
        {activePortal === "representante" ? (
          <div className="no-print animate-fade-in text-slate-100">
            {/* Information warning inside representative mode */}
            <div className="max-w-md mx-auto mb-4 bg-slate-900 border border-slate-850 p-3.5 rounded-2xl text-[10px] text-blue-300 font-mono flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-blue-550 rounded-full shrink-0 animate-ping"></span>
                <span>Acesso de Campo: Roteiro e Liberações para os representantes.</span>
              </div>
              <button
                onClick={() => setActivePortal("gestor")}
                className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-blue-400 hover:text-white font-sans font-bold rounded-lg border border-slate-800 text-[9.5px] cursor-pointer transition-all"
              >
                Acesso Gestor &rarr;
              </button>
            </div>
            <RepresentativePortal 
              records={records} 
              onTransferApprovedRequest={(newRecordOrRecords) => {
                const newArray = Array.isArray(newRecordOrRecords) 
                  ? newRecordOrRecords 
                  : [newRecordOrRecords];
                const updatedRecords = [...newArray, ...records];
                saveStateToStorage(updatedRecords, batches);
              }}
            />
          </div>
        ) : !isManagerLoggedIn ? (
          <ManagerLogin
            onLoginSuccess={(username) => {
              setIsManagerLoggedIn(true);
              setCurrentManagerName(username);
              sessionStorage.setItem("is_sstr_manager_authenticated", "true");
              sessionStorage.setItem("sstr_current_manager_name", username);
              triggerWelcomeToast(username);
            }}
            onCancel={() => {
              setActivePortal("representante");
            }}
          />
        ) : (
          /* GESTOR (ADMINISTRATOR) ADM TABS */
          <div className="space-y-6 animate-fade-in">
            
            {/* Sidebar/Horizontal Navigation Tabs no-print */}
            <div className="bg-slate-900 p-2 rounded-2xl border border-slate-800/80 shadow-xl flex items-center justify-between no-print overflow-x-auto gap-4">
              <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
                {[
                  { id: "dashboard", label: "Dashboard Geral", icon: BarChart2 },
                  { id: "tracking", label: "Auditoria & Rastreamento", icon: Search },
                  { id: "pending", label: "Solicitações Pendentes", icon: Clock },
                  { id: "rankings", label: "Rankings SSTR", icon: Award },
                  { id: "import", label: "Atualizar Base (Lançamentos)", icon: Upload },
                  { id: "export", label: "Exportador & PDF", icon: Download },
                  { id: "managers", label: "Gestão de Cadastros", icon: Users }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isSelected = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30 font-bold"
                          : "bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-850"
                      }`}
                    >
                      <Icon className={`w-4 h-4 mr-1 ${isSelected ? "text-white" : "text-blue-400"}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Data integrity status indicator */}
              <div className="flex items-center space-x-3 shrink-0">
                {isHeavyLoading && (
                  <div className="flex items-center space-x-1.5 text-[10px] font-mono text-blue-400 bg-blue-950/40 border border-blue-900/30 px-2.5 py-1 rounded-xl shrink-0">
                    <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                    <span>Sincronizando Banco...</span>
                  </div>
                )}
                <div className="hidden lg:flex items-center space-x-2 text-xs font-mono text-slate-400 shrink-0 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-850">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span>Fechamento Auditável</span>
                </div>
              </div>
            </div>

            {/* active tab panels */}
            <div>
              {activeTab === "dashboard" && (
                <DashboardView 
                  records={records} 
                  onSelectSector={handleSelectSectorFromDashboard} 
                />
              )}

              {activeTab === "tracking" && (
                <TrackingView 
                  records={records} 
                  onUpdateRecordStatus={handleUpdateRecordStatus}
                  filteredSector={selectedSectorFilter}
                  onClearSectorFilter={() => setSelectedSectorFilter(undefined)}
                />
              )}

              {activeTab === "import" && (
                <ImportPanel
                  records={records}
                  onImportRecords={handleImportRecords}
                  onResetToDemo={resetToDefaultDemoData}
                  importHistory={batches}
                  onDeleteBatch={handleDeleteBatch}
                  totalRecordsCount={records.length}
                />
              )}

              {activeTab === "export" && (
                <ReportView records={records} />
              )}

              {activeTab === "pending" && (
                <PendingRequestsTab />
              )}

              {activeTab === "rankings" && (
                <RankingsView records={records} />
              )}

              {activeTab === "managers" && (
                <ManagersTab />
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer Branding credits no-print */}
      <footer className="bg-slate-900 border-t border-slate-950 text-slate-500 text-xs py-6 px-6 text-center mt-12 shrink-0 no-print font-mono space-y-1">
        <p className="font-semibold text-white">SSTR - Pau Brasil Guarabira • Logística & Trade</p>
        <p>Integridade em Lançamentos, Auditorias Integradas e Rastreabilidade Baseada no Promax PW - ERP</p>
        <p className="text-[10px] text-slate-600 pt-2">Guarabira - PB • Brasil • 2026</p>
      </footer>

      {/* Floating Operational Standard Manual and AI Assistant */}
      <SstrOperationalAssistant records={records} />

    </div>
  );
}

export default function App() {
  return (
    <SstrDataProvider>
      <MainApp />
    </SstrDataProvider>
  );
}
