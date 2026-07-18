import React, { useState, useRef, useMemo } from "react";
import { ExchangeRecord } from "../types";
import { parseCSVToRecords } from "../utils/csvParser";
import { 
  UploadCloud, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Database, 
  RotateCcw, 
  Trash2, 
  Calendar, 
  HardDrive, 
  X, 
  Layers, 
  Search, 
  AlertCircle, 
  Info, 
  Copy, 
  ChevronRight, 
  Filter 
} from "lucide-react";

interface ImportPanelProps {
  records: ExchangeRecord[];
  onImportRecords: (newRecords: ExchangeRecord[], mergeMode: "append" | "overwrite", fileName: string) => void;
  onResetToDemo: () => void;
  importHistory: { id: string; timestamp: number; fileName: string; recordCount: number; totalValue: number }[];
  onDeleteBatch: (batchId: string) => void;
  totalRecordsCount: number;
}

interface GroupedSolicitation {
  solicitacao: string;
  codigoCliente: string;
  nomeCliente: string;
  mapa: string;
  data: string;
  observacao: string;
  records: ExchangeRecord[];
  productsKey: string; // SKU:qty format sorted
  totalValue: number;
}

export default function ImportPanel({ 
  records, 
  onImportRecords, 
  onResetToDemo, 
  importHistory, 
  onDeleteBatch, 
  totalRecordsCount 
}: ImportPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<{
    records: ExchangeRecord[];
    fileName: string;
    totalValue: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Panel Tabs: "upload" (main file panel) | "agrupado" (grouped cards) | "duplicata" (requested duplicate check tab)
  const [activeTab, setActiveTab] = useState<"upload" | "agrupado" | "duplicata">("upload");

  // Search & Filter for Grouped View
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "duplicates" | "obs_duplicates">("all");

  // Helper to standard format cash values
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processRawText = (text: string, title: string) => {
    try {
      setErrorMessage("");
      const parsed = parseCSVToRecords(text, title);
      
      if (parsed.length === 0) {
        setErrorMessage("Nenhum registro de troca pôde ser decodificado. Verifique a presença de ponto-e-vírgula (;) e cabeçalhos adequados.");
        setParsedPreview(null);
        return;
      }

      const totalValue = parsed.reduce((acc, r) => acc + r.valorTotal, 0);
      setParsedPreview({
        records: parsed,
        fileName: title,
        totalValue
      });
      // Automatically shift to the "agrupado" view to let users inspect grouped cards before importing
      setActiveTab("agrupado");
    } catch (err: any) {
      setErrorMessage("Erro ao processar arquivo: " + err.message);
      setParsedPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        processRawText(text, file.name);
      };
      reader.readAsText(file, "UTF-8");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        processRawText(text, file.name);
      };
      reader.readAsText(file, "UTF-8");
    }
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) {
      setErrorMessage("Insira algum texto ponto-e-vírgula antes de prosseguir.");
      return;
    }
    processRawText(pasteText, "Texto Copiado (" + new Date().toLocaleDateString("pt-BR") + ")");
  };

  const executeImport = (mode: "append" | "overwrite") => {
    if (!parsedPreview) return;
    onImportRecords(parsedPreview.records, mode, parsedPreview.fileName);
    setParsedPreview(null);
    setPasteText("");
    setActiveTab("upload");
  };

  // Dynamic analysis & grouping engine
  const analysisData = useMemo(() => {
    // Determine source records: analyze parsed file preview if available, otherwise analyze the active database
    const sourceRecords = parsedPreview ? parsedPreview.records : records;
    const isPreview = !!parsedPreview;

    // 1. Group records by Column E "solicitacao" (replenishment request number)
    const groups: Record<string, ExchangeRecord[]> = {};
    sourceRecords.forEach(rec => {
      const sol = rec.solicitacao || "Sem Número";
      if (!groups[sol]) {
        groups[sol] = [];
      }
      groups[sol].push(rec);
    });

    const groupedList: GroupedSolicitation[] = Object.entries(groups).map(([sol, recs]) => {
      const first = recs[0];
      
      // Create a unique products key to represent the list of products and quantities
      // (Sorted SKU:Qty pairs) for exact duplication matching
      const productsKey = recs
        .map(r => `${r.produto.trim()}:${r.quantidade}`)
        .sort()
        .join("|");

      return {
        solicitacao: sol,
        codigoCliente: first.codigoCliente || "S/C",
        nomeCliente: first.nomeCliente || "Consumidor Desconhecido",
        mapa: first.mapa || "",
        data: first.dataSolicitacao || first.dataAcao || "Sem Data",
        observacao: first.observacao || "",
        records: recs,
        productsKey,
        totalValue: recs.reduce((sum, r) => sum + r.valorTotal, 0)
      };
    });

    // 2. Detect duplicate solicitations (same mapa, same nb/client code, and same products in same quantities)
    // Duplicate map key format: "mapa_nb_productsKey"
    const duplicateKeyMap: Record<string, GroupedSolicitation[]> = {};
    groupedList.forEach(g => {
      if (g.mapa && g.codigoCliente !== "S/C") {
        const key = `${g.mapa.trim()}_${g.codigoCliente.trim()}_${g.productsKey}`;
        if (!duplicateKeyMap[key]) {
          duplicateKeyMap[key] = [];
        }
        duplicateKeyMap[key].push(g);
      }
    });

    // Filter out keys that have more than 1 solicitation (actual duplicates)
    const duplicateGroups = Object.values(duplicateKeyMap).filter(arr => arr.length > 1);

    // 3. Detect duplicate observations across different solicitations
    const observationMap: Record<string, GroupedSolicitation[]> = {};
    groupedList.forEach(g => {
      const obsNormalized = g.observacao.trim().toLowerCase();
      // Only verify if comment is meaningful (longer than 4 characters and not placeholder)
      if (obsNormalized && obsNormalized.length > 4 && !obsNormalized.includes("nota gerada") && !obsNormalized.includes("pedido criado")) {
        if (!observationMap[obsNormalized]) {
          observationMap[obsNormalized] = [];
        }
        observationMap[obsNormalized].push(g);
      }
    });

    const duplicateObsGroups = Object.values(observationMap).filter(arr => arr.length > 1);

    // Set of solicitation IDs that are identical duplicates
    const duplicateSolIds = new Set<string>();
    duplicateGroups.forEach(arr => arr.forEach(g => duplicateSolIds.add(g.solicitacao)));

    // Set of solicitation IDs that share duplicated observations
    const duplicateObsSolIds = new Set<string>();
    duplicateObsGroups.forEach(arr => arr.forEach(g => duplicateObsSolIds.add(g.solicitacao)));

    return {
      groupedList: groupedList.sort((a, b) => b.solicitacao.localeCompare(a.solicitacao, undefined, { numeric: true })),
      duplicateGroups,
      duplicateObsGroups,
      duplicateSolIds,
      duplicateObsSolIds,
      isPreview,
      sourceName: isPreview ? parsedPreview.fileName : "Banco de Dados Ativo"
    };
  }, [parsedPreview, records]);

  // Apply filters and searches to the grouped cards list
  const filteredGroups = useMemo(() => {
    let list = analysisData.groupedList;

    if (filterType === "duplicates") {
      list = list.filter(g => analysisData.duplicateSolIds.has(g.solicitacao));
    } else if (filterType === "obs_duplicates") {
      list = list.filter(g => analysisData.duplicateObsSolIds.has(g.solicitacao));
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      list = list.filter(g => 
        g.solicitacao.toLowerCase().includes(query) ||
        g.codigoCliente.toLowerCase().includes(query) ||
        g.nomeCliente.toLowerCase().includes(query) ||
        g.mapa.toLowerCase().includes(query) ||
        g.observacao.toLowerCase().includes(query) ||
        g.records.some(r => r.descricaoProduto.toLowerCase().includes(query) || r.produto.includes(query))
      );
    }

    return list;
  }, [analysisData, searchTerm, filterType]);

  // General preview dry run calculations (reused for stats box)
  const previewSummary = useMemo(() => {
    if (!parsedPreview) return null;
    const recs = parsedPreview.records;
    const sectors = Array.from(new Set(recs.map(r => r.setorVenda))).filter(Boolean);
    
    let approved = 0;
    let pending = 0;
    recs.forEach(r => {
      const s = r.status.toLowerCase();
      if (s.includes("aprov")) approved++;
      else if (s.includes("pend")) pending++;
    });

    return {
      sectorCount: sectors.length,
      approvedCount: approved,
      pendingCount: pending,
      reprovedCount: recs.length - (approved + pending),
    };
  }, [parsedPreview]);

  return (
    <div className="space-y-6">
      
      {/* 1. Header Tab Navigation inside Import/Fechamento View */}
      <div className="bg-slate-900/90 p-2 rounded-2xl border border-slate-800 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab("upload")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === "upload"
              ? "bg-blue-600 text-white shadow-lg font-bold"
              : "hover:bg-slate-800 text-slate-300"
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Lotes & Upload</span>
        </button>

        <button
          onClick={() => setActiveTab("agrupado")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer relative ${
            activeTab === "agrupado"
              ? "bg-blue-600 text-white shadow-lg font-bold"
              : "hover:bg-slate-800 text-slate-300"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Solicitações Agrupadas ({analysisData.groupedList.length})</span>
          {parsedPreview && (
            <span className="bg-emerald-500 w-2 h-2 rounded-full absolute top-1 right-1 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("duplicata")}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer relative ${
            activeTab === "duplicata"
              ? "bg-red-950/80 text-red-300 border border-red-850 shadow-lg font-bold"
              : "hover:bg-slate-800 text-slate-300"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>Duplicata ({analysisData.duplicateGroups.length})</span>
          {analysisData.duplicateGroups.length > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
              {analysisData.duplicateGroups.length}
            </span>
          )}
        </button>
      </div>

      {/* Source Alert indicator */}
      {parsedPreview && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl text-xs text-emerald-300 flex justify-between items-center animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              Analisando arquivo carregado: <strong>{parsedPreview.fileName}</strong> ({parsedPreview.records.length} itens)
            </span>
          </div>
          <button 
            onClick={() => {
              setParsedPreview(null);
              setActiveTab("upload");
            }}
            className="text-[10px] bg-emerald-900/40 hover:bg-emerald-900/70 border border-emerald-800 px-2 py-1 rounded-md text-white font-mono cursor-pointer transition-colors"
          >
            Limpar Arquivo (Ver Banco Geral)
          </button>
        </div>
      )}

      {/* 2. TAB: UPLOAD ZONE & LOTS (ORIGINAL DESIGN) */}
      {activeTab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-slate-100 animate-fade-in">
          {/* LEFT COLUMN: Upload fields */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div>
                <h3 className="text-lg font-bold font-display text-white">Importar Dados de Fechamento</h3>
                <p className="text-xs text-slate-400">Arraste a planilha de trocas e reposições do dia de forma prática (Promax PW).</p>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center space-y-3 transition-colors ${
                  dragActive
                    ? "border-blue-500 bg-blue-950/35"
                    : "border-slate-850 hover:border-slate-700 bg-slate-950"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud className={`w-10 h-10 ${dragActive ? "text-blue-400" : "text-slate-500"}`} />
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-200">Selecione o arquivo ou arraste para aqui</p>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">Aceita planilhas (.csv, .txt) com divisores de ponto-e-vírgula (;)</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".csv,.txt"
                  className="hidden"
                />
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Ou Copie e Cole</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              {/* Paste textbox directly */}
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Cole as linhas com ponto-e-vírgula aqui diretamente do fechamento diário do Promax..."
                  className="w-full bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs font-mono text-slate-300 focus:ring-1 focus:ring-blue-500 focus:outline-hidden placeholder:font-sans placeholder:text-slate-600"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handlePasteSubmit}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold font-mono cursor-pointer transition-colors shadow-lg shadow-blue-900/30"
                  >
                    Analisar Texto Despejado
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="p-4 bg-rose-950/60 border border-rose-900/40 rounded-xl text-rose-300 text-xs flex items-start space-x-2 animate-shake shadow-md">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-450 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Live Parse Preview Summary (Dry Run Box) */}
            {parsedPreview && previewSummary && (
              <div className="bg-slate-900/95 p-6 rounded-2xl border-2 border-blue-500 shadow-2xl space-y-5 animate-fade-in">
                <div className="flex justify-between items-start pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-blue-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white font-display">Arquivo Processado com Sucesso</h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-[280px]">Ref: {parsedPreview.fileName}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setParsedPreview(null)}
                    className="p-1 bg-slate-950 rounded-full hover:bg-slate-850 text-slate-400 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-400 uppercase">Solicitações</span>
                    <span className="block font-bold text-sm text-white mt-0.5">{parsedPreview.records.length}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-400 uppercase">Soma Total</span>
                    <span className="block font-bold text-sm text-blue-400 mt-0.5">{formatCurrency(parsedPreview.totalValue)}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-400 uppercase">Setores</span>
                    <span className="block font-bold text-sm text-indigo-400 mt-0.5">{previewSummary.sectorCount}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                    <span className="text-[9px] text-slate-400 uppercase">Pendentes</span>
                    <span className="block font-bold text-sm text-amber-400 mt-0.5">{previewSummary.pendingCount}</span>
                  </div>
                </div>

                {/* Warning message reminding user they can check duplicates */}
                <div className="bg-blue-950/40 p-4 border border-blue-900/50 rounded-xl flex items-start space-x-3 text-xs text-blue-300">
                  <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Análise Inteligente Pronta!</p>
                    <p>Agrupamos os {parsedPreview.records.length} registros em {analysisData.groupedList.length} cartões e detectamos {analysisData.duplicateGroups.length} solicitações duplicadas na prévia.</p>
                    <p className="text-[10px] font-mono text-blue-400">Clique nas abas "Solicitações Agrupadas" ou "Duplicata" acima para auditar os cartões.</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Como deseja processar o lançamento?</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => executeImport("append")}
                      className="flex flex-col items-center justify-center p-4 bg-blue-950/40 hover:bg-blue-950/60 border border-blue-900/40 rounded-xl cursor-pointer text-center space-y-1 transition-all shadow-md group"
                    >
                      <Database className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-blue-100">Mesclar Histórico (Recomendado)</span>
                      <p className="text-[9px] text-slate-400 font-mono">Insere novos e preserva auditorias passadas</p>
                    </button>

                    <button
                      onClick={() => executeImport("overwrite")}
                      className="flex flex-col items-center justify-center p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer text-center space-y-1 transition-all shadow-md group"
                    >
                      <Trash2 className="w-5 h-5 text-rose-450 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-rose-300">Substituir Todo o Banco</span>
                      <p className="text-[9px] text-slate-400 font-mono">Apaga o cache local interno e carrega somente este arquivo</p>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: History of batches and active database */}
          <div className="lg:col-span-5 space-y-6">
            {/* Active Database Summary */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Banco de Dados Ativo</h4>
              <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-850 font-mono shadow-inner">
                <div className="flex items-center space-x-2">
                  <HardDrive className="w-5 h-5 text-blue-400 mr-1" />
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-sans">Lançamentos no Cache</span>
                    <span className="font-bold text-sm text-white">{totalRecordsCount} transações</span>
                  </div>
                </div>
                <button
                  onClick={onResetToDemo}
                  className="px-2.5 py-1.5 bg-blue-900/40 hover:bg-blue-900/70 border border-blue-800 text-white rounded-lg text-[10px] font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                  title="Resetar Banco"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Redefinir Demo</span>
                </button>
              </div>
            </div>

            {/* Upload History list */}
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Histórico de Lotes Carregados</h4>
                <p className="text-xs text-slate-400 mt-1">Lançamentos e planilhas inseridos nesta sessão</p>
              </div>

              <div className="space-y-2 pr-1 max-h-[300px] overflow-y-auto">
                {importHistory.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 font-mono text-[10px] bg-slate-950 rounded-xl border border-dashed border-slate-850">
                    Histórico limpo. Use os dados padrão para demonstração.
                  </div>
                ) : (
                  importHistory.map((batch) => (
                    <div key={batch.id} className="flex justify-between items-center p-3 bg-slate-950 hover:bg-slate-850 rounded-xl border border-slate-850 transition-colors">
                      <div className="max-w-[70%] space-y-0.5">
                        <p className="font-bold text-xs text-slate-200 truncate flex items-center">
                          <FileText className="w-3.5 h-3.5 mr-1 text-blue-400 shrink-0" />
                          {batch.fileName}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(batch.timestamp).toLocaleString("pt-BR")}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {batch.recordCount} registros | <span className="text-blue-400">{formatCurrency(batch.totalValue)}</span>
                        </p>
                      </div>
                      
                      <button
                        onClick={() => onDeleteBatch(batch.id)}
                        className="p-2 text-rose-450 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Excluir lote"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB: GROUPED SOLICITATION CARDS (SOLICITATIONS GROUPED IN CARDS) */}
      {activeTab === "agrupado" && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Filters & search headers */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white font-display uppercase tracking-wider">Solicitações Agrupadas por Número</h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualizando dados de: <strong className="text-blue-400 font-mono">{analysisData.sourceName}</strong>. 
                Os itens da mesma solicitação (Coluna E) são unificados em um único cartão para facilitar a auditoria.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Type Filter dropdown */}
              <div className="flex items-center bg-slate-950 border border-slate-850 rounded-xl px-3 py-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-400 mr-2" />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="bg-transparent text-xs text-slate-300 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">Todas as Solicitações</option>
                  <option value="duplicates">Alertas de Duplicata ({analysisData.duplicateSolIds.size})</option>
                  <option value="obs_duplicates">Obs. Duplicadas ({analysisData.duplicateObsSolIds.size})</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar nº, cliente, mapa, obs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-300 placeholder:text-slate-600 rounded-xl border border-slate-850 pl-9 pr-4 py-2 w-full md:w-64 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Cards list */}
          {filteredGroups.length === 0 ? (
            <div className="bg-slate-900/90 p-12 text-center rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-3">
              <Search className="w-8 h-8 text-slate-600" />
              <p className="text-xs text-slate-400 font-mono">Nenhuma solicitação encontrada correspondendo aos filtros aplicados.</p>
              {filterType !== "all" && (
                <button
                  onClick={() => setFilterType("all")}
                  className="px-3 py-1 bg-blue-900/40 text-blue-300 border border-blue-800 hover:bg-blue-800 rounded-lg text-xs font-mono transition-colors cursor-pointer"
                >
                  Ver Todas as Solicitações
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredGroups.map((g) => {
                const isIdenticalDup = analysisData.duplicateSolIds.has(g.solicitacao);
                const isObsDup = analysisData.duplicateObsSolIds.has(g.solicitacao);

                return (
                  <div 
                    key={g.solicitacao} 
                    className={`bg-slate-900/95 rounded-2xl border shadow-lg transition-all overflow-hidden flex flex-col justify-between ${
                      isIdenticalDup
                        ? "border-red-500 shadow-red-950/20 bg-gradient-to-b from-slate-900 to-red-950/15"
                        : isObsDup
                        ? "border-amber-600/60 shadow-amber-950/10"
                        : "border-slate-800"
                    }`}
                  >
                    {/* Card Header */}
                    <div className="p-4 bg-slate-950/80 border-b border-slate-850 flex justify-between items-start">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Solicitação Reposição (Col E)</span>
                        <h4 className="text-base font-bold text-white font-mono flex items-center">
                          <Layers className="w-4 h-4 text-blue-400 mr-2" />
                          {g.solicitacao}
                        </h4>
                      </div>
                      <div className="text-right space-y-0.5 font-mono text-[10px]">
                        <span className="text-slate-400 font-sans">Mapa: </span>
                        <strong className="text-white text-xs">{g.mapa || "N/A"}</strong>
                        <div className="text-slate-500 flex items-center justify-end">
                          <Calendar className="w-3 h-3 mr-1" />
                          {g.data}
                        </div>
                      </div>
                    </div>

                    {/* Card Body: Customer details & duplication alert triggers */}
                    <div className="p-4 space-y-3 flex-grow">
                      
                      {/* Customer block */}
                      <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850 text-xs">
                        <span className="text-[9px] text-slate-500 block uppercase font-mono">Cliente (NB)</span>
                        <span className="font-bold text-slate-200 block truncate font-sans">
                          {g.codigoCliente} - {g.nomeCliente}
                        </span>
                      </div>

                      {/* Alerta de duplicata de mesma solicitação */}
                      {isIdenticalDup && (
                        <div className="p-2.5 bg-red-950/60 border border-red-900/50 rounded-xl text-[10px] text-red-300 flex items-start space-x-2 animate-pulse">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold block text-red-200">REPETIÇÃO CRÍTICA DETECTADA!</strong>
                            <span>Existe outra solicitação no mesmo mapa, com o mesmo cliente e produtos de mesma quantidade! Verifique na aba "Duplicata".</span>
                          </div>
                        </div>
                      )}

                      {/* Item list */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Lista de Itens da Solicitação ({g.records.length})</span>
                        <div className="bg-slate-950 rounded-xl border border-slate-850 p-2 divide-y divide-slate-900 max-h-[160px] overflow-y-auto">
                          {g.records.map((r, idx) => (
                            <div key={idx} className="py-2 flex justify-between items-center text-[11px] font-mono">
                              <div className="truncate max-w-[70%]">
                                <span className="text-blue-400 font-bold">[{r.produto}]</span>{" "}
                                <span className="text-slate-300 font-sans">{r.descricaoProduto}</span>
                                <div className="text-[9px] text-slate-500 font-sans italic">
                                  Justificativa: {r.justificativa}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-200 font-bold">{r.quantidade} {r.um}</span>
                                <div className="text-[9px] text-blue-400">{formatCurrency(r.valorTotal)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Observations / Duplicidades nas observações */}
                      {g.observacao && (
                        <div className="bg-slate-950/40 p-2.5 rounded-xl border border-slate-850 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500 uppercase font-mono">Observação</span>
                            {isObsDup && (
                              <span className="bg-amber-950/80 text-amber-300 border border-amber-900/60 text-[8px] px-1.5 py-0.5 rounded-md font-mono animate-pulse">
                                Obs. Repetida
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-300 font-mono italic whitespace-pre-line leading-relaxed">
                            {g.observacao}
                          </p>
                          {isObsDup && (
                            <p className="text-[8px] text-amber-400 font-sans mt-1">
                              ⚠️ Texto idêntico de observação encontrado em outros cartões. Possível duplicidade de registro.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="p-4 bg-slate-950/80 border-t border-slate-850 flex justify-between items-center">
                      <div className="text-[10px] font-mono text-slate-400">
                        Total {g.records.length} {g.records.length === 1 ? "item" : "itens"}
                      </div>
                      <div className="font-mono text-xs text-right">
                        <span className="text-slate-400 text-[10px]">Soma: </span>
                        <strong className="text-emerald-400 font-bold text-sm">{formatCurrency(g.totalValue)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB: DETECTED DUPLICATES (DUPLICATA TAB - REQUESTED TAB NAME) */}
      {activeTab === "duplicata" && (
        <div className="space-y-6 animate-fade-in text-slate-100">
          
          {/* Header Description */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-display">Relatório de Duplicidade (Mapeamento Promax)</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Esta guia analisa as solicitações e emite alertas automáticos de duplicidade se detectar transações idênticas 
              (mesmo <strong>Mapa de Reposição</strong>, mesmo número base de cliente <strong>NB</strong> e os mesmos <strong>Produtos</strong> com as mesmas <strong>Quantidades</strong>).
              O número da solicitação exibido é exatamente igual ao documento original (Coluna E) para fácil identificação.
            </p>
          </div>

          {/* Duplicates Listing */}
          {analysisData.duplicateGroups.length === 0 ? (
            <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xl">
              <div className="bg-emerald-950/40 border border-emerald-900/40 p-4 rounded-full text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white">Nenhum Alerta Crítico Encontrado</h4>
              <p className="text-xs text-slate-400 font-mono max-w-md">
                Parabéns! Todas as solicitações em <strong className="text-blue-400">{analysisData.sourceName}</strong> possuem combinações de Mapa, NB ou produtos distintos. Nenhuma duplicidade absoluta de carga foi detectada.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Critical warning banner */}
              <div className="bg-red-950/60 border border-red-900/40 p-4 rounded-xl text-xs text-red-300 flex items-start space-x-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-red-200">ALERTA: {analysisData.duplicateGroups.length} Grupos de Duplicidade Absoluta Identificados!</p>
                  <p>
                    Foram encontradas solicitações redundantes no mesmo fechamento. Isso costuma acontecer por duplo envio ou falha de processamento de carga no Promax PW. Revise os números de solicitação abaixo para evitar liberação duplicada de vales ou produtos ao transportador.
                  </p>
                </div>
              </div>

              {/* Group comparison panels */}
              <div className="space-y-6">
                {analysisData.duplicateGroups.map((groupList, groupIdx) => {
                  const first = groupList[0];
                  
                  return (
                    <div key={groupIdx} className="bg-slate-900/90 rounded-2xl border-2 border-red-500/80 shadow-xl overflow-hidden animate-fade-in">
                      
                      {/* Duplicate Group Header info */}
                      <div className="bg-red-950/20 px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest font-bold">Grupo de Redundância #{groupIdx + 1}</span>
                          <h4 className="text-xs font-bold text-slate-200">
                            Cliente NB: <span className="font-mono text-white bg-slate-950 px-2 py-0.5 rounded-md text-xs">{first.codigoCliente}</span> - {first.nomeCliente}
                          </h4>
                        </div>
                        <div className="font-mono text-xs sm:text-right">
                          <span className="text-slate-400">Mapa de Reposição: </span>
                          <strong className="text-white text-sm bg-slate-950 px-2 py-1 rounded-md">{first.mapa}</strong>
                        </div>
                      </div>

                      {/* Content side-by-side: showing identical requests comparison */}
                      <div className="p-5 space-y-4">
                        
                        {/* Comparison cards */}
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-mono mb-2">Solicitações Redundantes Envolvidas (Coluna E do Documento):</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {groupList.map((g, idx) => (
                              <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-red-950/40 hover:border-red-900/40 transition-colors space-y-2">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                                  <span className="text-red-400 font-mono text-xs font-bold flex items-center">
                                    <Layers className="w-3.5 h-3.5 mr-1" />
                                    Nº Solicitação: {g.solicitacao}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono">{g.data}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono space-y-1">
                                  <p><span className="text-slate-500">Valor Total:</span> <span className="text-emerald-400 font-bold">{formatCurrency(g.totalValue)}</span></p>
                                  {g.observacao ? (
                                    <p className="truncate"><span className="text-slate-500">Observação:</span> <span className="italic text-slate-300">"{g.observacao}"</span></p>
                                  ) : (
                                    <p className="text-slate-600 font-sans">Sem observações.</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Duplicated items details list */}
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                          <span className="text-[10px] text-slate-400 font-mono uppercase block">Produtos Duplicados que possuem a mesma Quantidade:</span>
                          <div className="divide-y divide-slate-900">
                            {first.records.map((r, rIdx) => (
                              <div key={rIdx} className="py-2.5 flex justify-between items-center text-xs font-mono">
                                <div>
                                  <span className="bg-blue-900/60 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-md mr-2">{r.produto}</span>
                                  <span className="text-slate-200">{r.descricaoProduto}</span>
                                </div>
                                <div className="text-right font-bold text-red-400 flex items-center space-x-2">
                                  <span>{r.quantidade} {r.um}</span>
                                  <span className="text-[10px] bg-red-950/65 text-red-400 border border-red-900/30 px-1.5 py-0.5 rounded-md">Repetido</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recommendation advice */}
                        <div className="text-[11px] text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-850 flex items-start space-x-2">
                          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Ação sugerida:</strong> Recomenda-se rejeitar ou cancelar um dos números de solicitação (<strong className="text-red-400 font-mono">{groupList.map(g => g.solicitacao).join(", ")}</strong>) no Promax para evitar auditoria de vale duplicada.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. DYNAMIC OBSERVATION DUPLICITY VIEW (EXTENDED ALERTS) */}
          {analysisData.duplicateObsGroups.length > 0 && (
            <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-850 shadow-xl space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Duplicidade de Texto nas Observações</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Alertas adicionais baseados em textos idênticos digitados no campo observação de solicitações diferentes:
                </p>
              </div>

              <div className="space-y-4">
                {analysisData.duplicateObsGroups.map((groupList, idx) => {
                  const sampleText = groupList[0].observacao;
                  return (
                    <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3 font-mono">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] text-amber-400 bg-amber-950/50 border border-amber-900/50 px-2 py-0.5 rounded-md">
                          Texto Repetido #{idx + 1}
                        </span>
                        <span className="text-[10px] text-slate-400">{groupList.length} ocorrências</span>
                      </div>
                      
                      <div className="bg-slate-900 p-2.5 rounded-lg text-[10px] text-slate-300 italic border border-slate-850">
                        "{sampleText}"
                      </div>

                      <div className="text-[9px] text-slate-500 space-y-1">
                        <p className="font-bold">Ocorrências nas solicitações do documento:</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {groupList.map(g => (
                            <span key={g.solicitacao} className="bg-slate-900 border border-slate-800 text-slate-300 px-2 py-1 rounded-md">
                              Solicitação: <strong>{g.solicitacao}</strong> (NB: {g.codigoCliente})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
