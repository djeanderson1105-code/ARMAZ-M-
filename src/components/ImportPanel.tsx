import React, { useState, useRef, useMemo } from "react";
import { ExchangeRecord } from "../types";
import { parseCSVToRecords } from "../utils/csvParser";
import * as XLSX from "xlsx";
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
  ChevronRight, 
  Filter,
  Check,
  ArrowRight
} from "lucide-react";

interface ImportPanelProps {
  records: ExchangeRecord[];
  onImportRecords: (newRecords: ExchangeRecord[], mergeMode: "append" | "overwrite", fileName: string) => void;
  onResetToDemo: () => void;
  importHistory?: { id: string; timestamp: number; fileName: string; recordCount: number; totalValue: number }[];
  onDeleteBatch?: (batchId: string) => void;
  totalRecordsCount: number;
  onNavigateToTracking?: () => void;
}

interface GroupedSolicitation {
  solicitacao: string;
  codigoCliente: string;
  nomeCliente: string;
  mapa: string;
  data: string;
  observacao: string;
  records: ExchangeRecord[];
  productsKey: string;
  totalValue: number;
}

export default function ImportPanel({ 
  records, 
  onImportRecords, 
  onResetToDemo, 
  totalRecordsCount,
  onNavigateToTracking
}: ImportPanelProps) {
  const [dragActive, setDragActive] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<{
    records: ExchangeRecord[];
    fileName: string;
    totalValue: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Panel Tabs: "upload" (03.18.05 import) | "agrupado" (grouped cards) | "duplicata" (duplicate check)
  const [activeTab, setActiveTab] = useState<"upload" | "agrupado" | "duplicata">("upload");

  // Search & Filter for Grouped View
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "duplicates" | "obs_duplicates">("all");

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
      setSuccessMessage("");
      const parsed = parseCSVToRecords(text, title);
      
      if (parsed.length === 0) {
        setErrorMessage("Nenhum registro de troca/reposição pôde ser decodificado do relatório 03.18.05. Verifique se o arquivo possui separadores por ponto-e-vírgula (;) e o formato padrão Promax PW.");
        setParsedPreview(null);
        return;
      }

      const totalValue = parsed.reduce((acc, r) => acc + r.valorTotal, 0);
      setParsedPreview({
        records: parsed,
        fileName: title,
        totalValue
      });
    } catch (err: any) {
      setErrorMessage("Erro ao ler relatório 03.18.05: " + err.message);
      setParsedPreview(null);
    }
  };

  const readFileAsTextWithEncoding = (file: File, callback: (text: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text && text.includes("\uFFFD")) {
        const isoReader = new FileReader();
        isoReader.onload = (isoEvent) => {
          callback(isoEvent.target?.result as string || "");
        };
        isoReader.readAsText(file, "ISO-8859-1");
      } else {
        callback(text || "");
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.type.includes("sheet") || file.type.includes("excel");

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet, { FS: ";" });
            processRawText(csvText, file.name);
          } catch (err: any) {
            setErrorMessage("Erro ao ler planilha Excel do relatório 03.18.05: " + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        readFileAsTextWithEncoding(file, (text) => {
          processRawText(text, file.name);
        });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.type.includes("sheet") || file.type.includes("excel");

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = new Uint8Array(event.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const csvText = XLSX.utils.sheet_to_csv(worksheet, { FS: ";" });
            processRawText(csvText, file.name);
          } catch (err: any) {
            setErrorMessage("Erro ao ler planilha Excel do relatório 03.18.05: " + err.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        readFileAsTextWithEncoding(file, (text) => {
          processRawText(text, file.name);
        });
      }
    }
  };

  const executeImport = (mode: "append" | "overwrite") => {
    if (!parsedPreview) return;
    const count = parsedPreview.records.length;
    const fName = parsedPreview.fileName;
    onImportRecords(parsedPreview.records, mode, fName);
    setParsedPreview(null);
    setSuccessMessage(`Relatório 03.18.05 (${fName}) importado com sucesso! ${count} lançamentos foram carregados no sistema. A guia de Auditoria & Rastreamento e toda a plataforma foram atualizadas.`);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Dynamic analysis & grouping engine
  const analysisData = useMemo(() => {
    const sourceRecords = parsedPreview ? parsedPreview.records : records;
    const isPreview = !!parsedPreview;

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

    const duplicateGroups = Object.values(duplicateKeyMap).filter(arr => arr.length > 1);

    const observationMap: Record<string, GroupedSolicitation[]> = {};
    groupedList.forEach(g => {
      const obsNormalized = g.observacao.trim().toLowerCase();
      if (obsNormalized && obsNormalized.length > 4 && !obsNormalized.includes("nota gerada") && !obsNormalized.includes("pedido criado")) {
        if (!observationMap[obsNormalized]) {
          observationMap[obsNormalized] = [];
        }
        observationMap[obsNormalized].push(g);
      }
    });

    const duplicateObsGroups = Object.values(observationMap).filter(arr => arr.length > 1);

    const duplicateSolIds = new Set<string>();
    duplicateGroups.forEach(arr => arr.forEach(g => duplicateSolIds.add(g.solicitacao)));

    const duplicateObsSolIds = new Set<string>();
    duplicateObsGroups.forEach(arr => arr.forEach(g => duplicateObsSolIds.add(g.solicitacao)));

    return {
      groupedList: groupedList.sort((a, b) => b.solicitacao.localeCompare(a.solicitacao, undefined, { numeric: true })),
      duplicateGroups,
      duplicateObsGroups,
      duplicateSolIds,
      duplicateObsSolIds,
      isPreview,
      sourceName: isPreview ? parsedPreview.fileName : "Base de Dados Ativa"
    };
  }, [parsedPreview, records]);

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
      
      {/* 1. Navigation Tabs */}
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
          <span>Importar Relatório 03.18.05</span>
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
          <span>Conferência de Duplicatas ({analysisData.duplicateGroups.length})</span>
          {analysisData.duplicateGroups.length > 0 && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
              {analysisData.duplicateGroups.length}
            </span>
          )}
        </button>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="bg-emerald-950/80 border-2 border-emerald-500/80 p-4 rounded-2xl text-xs text-emerald-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-fade-in shadow-xl">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold text-sm text-white">Sucesso na Atualização da Plataforma!</p>
              <p className="text-emerald-300 mt-0.5">{successMessage}</p>
            </div>
          </div>
          {onNavigateToTracking && (
            <button
              onClick={onNavigateToTracking}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-mono flex items-center space-x-2 transition-all shrink-0 shadow-lg cursor-pointer"
            >
              <span>Ver Auditoria & Rastreamento</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Preview Active file indicator */}
      {parsedPreview && (
        <div className="bg-emerald-950/40 border border-emerald-900/50 p-3 rounded-xl text-xs text-emerald-300 flex justify-between items-center animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              Relatório em prévia de análise: <strong>{parsedPreview.fileName}</strong> ({parsedPreview.records.length} lançamentos)
            </span>
          </div>
          <button 
            onClick={() => {
              setParsedPreview(null);
              setActiveTab("upload");
            }}
            className="text-[10px] bg-emerald-900/40 hover:bg-emerald-900/70 border border-emerald-800 px-2 py-1 rounded-md text-white font-mono cursor-pointer transition-colors"
          >
            Cancelar Prévia
          </button>
        </div>
      )}

      {/* 2. TAB: UPLOAD ZONE RELATÓRIO 03.18.05 */}
      {activeTab === "upload" && (
        <div className="space-y-6 text-slate-100 animate-fade-in">
          
          {/* Active Database Banner */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-950 p-3 rounded-xl border border-blue-900/50">
                <HardDrive className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-mono">Base Oficial 03.18.05 no Sistema</span>
                <span className="font-bold text-base text-white font-mono">{totalRecordsCount} lançamentos auditáveis</span>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
              {showDeleteConfirm ? (
                <div className="bg-rose-950/90 border-2 border-rose-600/80 p-2.5 rounded-xl flex items-center space-x-3 text-xs animate-fade-in shadow-xl">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-rose-100 font-medium text-[11px]">Apagar permanentemente toda a base 03.18.05?</span>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onImportRecords([], "overwrite", "");
                        setShowDeleteConfirm(false);
                        setSuccessMessage("Base 03.18.05 zerada e removida com sucesso de toda a plataforma.");
                      }}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-md"
                    >
                      Sim, Excluir
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                  title="Excluir Toda a Base 03.18.05"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Excluir Base 03.18.05</span>
                </button>
              )}
              <button
                onClick={() => {
                  onResetToDemo();
                  setSuccessMessage("Base redefinida para os dados demonstrativos padrão.");
                }}
                className="px-3 py-2 bg-blue-900/40 hover:bg-blue-900/70 border border-blue-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                title="Resetar Banco"
              >
                <RotateCcw className="w-4 h-4 text-blue-400" />
                <span>Redefinir Demo</span>
              </button>
            </div>
          </div>

          {/* Main Dropzone & Upload Card */}
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
            <div>
              <h3 className="text-lg font-bold font-display text-white flex items-center">
                <FileText className="w-5 h-5 text-blue-400 mr-2" />
                Importar Relatório 03.18.05 (Promax PW)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Selecione ou arraste a planilha oficial do fechamento diário do Promax PW (.csv, .xlsx, .xls, .txt). Ao importar, todos os módulos da plataforma (Auditoria & Rastreamento, Dashboards, Rankings) serão atualizados imediatamente.
              </p>
            </div>

            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center space-y-3 transition-colors ${
                dragActive
                  ? "border-blue-500 bg-blue-950/35"
                  : "border-slate-800 hover:border-blue-500/60 bg-slate-950"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="bg-blue-950/60 p-4 rounded-full border border-blue-900/40">
                <UploadCloud className={`w-10 h-10 ${dragActive ? "text-blue-400" : "text-blue-400"}`} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-slate-200">Clique para selecionar o arquivo 03.18.05 ou arraste aqui</p>
                <p className="text-xs text-slate-400 font-mono">Formato Promax PW • Divisores ponto-e-vírgula (;) • Extensões .csv, .xlsx, .xls, .txt</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
              />
            </div>

            {errorMessage && (
              <div className="p-4 bg-rose-950/60 border border-rose-900/40 rounded-xl text-rose-300 text-xs flex items-start space-x-2 animate-shake shadow-md">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-450 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Parsed Preview Card & Processing Actions */}
          {parsedPreview && previewSummary && (
            <div className="bg-slate-900/95 p-6 rounded-2xl border-2 border-blue-500 shadow-2xl space-y-6 animate-fade-in">
              <div className="flex justify-between items-start pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="bg-emerald-950 p-2.5 rounded-xl border border-emerald-800">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white font-display">Relatório 03.18.05 Decodificado com Sucesso</h4>
                    <p className="text-xs text-slate-400 font-mono truncate max-w-md">Arquivo: {parsedPreview.fileName}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setParsedPreview(null)}
                  className="p-1 bg-slate-950 rounded-full hover:bg-slate-850 text-slate-400 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-center">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-400 uppercase">Total Lançamentos</span>
                  <span className="block font-bold text-base text-white mt-1">{parsedPreview.records.length}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-400 uppercase">Valor Financeiro R$</span>
                  <span className="block font-bold text-base text-blue-400 mt-1">{formatCurrency(parsedPreview.totalValue)}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-400 uppercase">Setores de Venda</span>
                  <span className="block font-bold text-base text-indigo-400 mt-1">{previewSummary.sectorCount}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-400 uppercase">Solicitações Agrupadas</span>
                  <span className="block font-bold text-base text-emerald-400 mt-1">{analysisData.groupedList.length}</span>
                </div>
              </div>

              {analysisData.duplicateGroups.length > 0 && (
                <div className="bg-amber-950/40 p-4 border border-amber-900/50 rounded-xl flex items-start space-x-3 text-xs text-amber-300">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold block text-amber-200">Atenção: {analysisData.duplicateGroups.length} Alertas de Duplicidade Detectados!</strong>
                    <span>O relatório contém solicitações idênticas para o mesmo mapa e cliente. Você pode auditar estes alertas na aba "Conferência de Duplicatas" acima antes ou após salvar.</span>
                  </div>
                </div>
              )}

              {/* Action Buttons to Import & Update Entire Platform */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Confirme a Atualização do Sistema:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => executeImport("overwrite")}
                    className="flex items-center justify-center space-x-2 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer text-center font-bold text-xs transition-all shadow-lg shadow-blue-900/40 group"
                  >
                    <Database className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <span className="block font-bold">Substituir Base Oficial 03.18.05</span>
                      <span className="text-[10px] text-blue-100 font-normal font-mono">Atualiza toda a plataforma com este novo relatório</span>
                    </div>
                  </button>

                  <button
                    onClick={() => executeImport("append")}
                    className="flex items-center justify-center space-x-2 p-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl cursor-pointer text-center font-bold text-xs transition-all shadow-md group text-slate-200"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <span className="block font-bold text-emerald-300">Mesclar ao Histórico Existente</span>
                      <span className="text-[10px] text-slate-400 font-normal font-mono">Adiciona estes dados preservando lançamentos anteriores</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. TAB: GROUPED SOLICITATION CARDS */}
      {activeTab === "agrupado" && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white font-display uppercase tracking-wider">Solicitações Agrupadas por Número (Relatório 03.18.05)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Visualizando dados de: <strong className="text-blue-400 font-mono">{analysisData.sourceName}</strong>. 
                Itens da mesma solicitação (Coluna E) estão unificados em cada cartão.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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

                    <div className="p-4 space-y-3 flex-grow">
                      <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850 text-xs">
                        <span className="text-[9px] text-slate-500 block uppercase font-mono">Cliente (NB)</span>
                        <span className="font-bold text-slate-200 block truncate font-sans">
                          {g.codigoCliente} - {g.nomeCliente}
                        </span>
                      </div>

                      {isIdenticalDup && (
                        <div className="p-2.5 bg-red-950/60 border border-red-900/50 rounded-xl text-[10px] text-red-300 flex items-start space-x-2 animate-pulse">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold block text-red-200">REPETIÇÃO CRÍTICA DETECTADA!</strong>
                            <span>Existe outra solicitação no mesmo mapa, com o mesmo cliente e produtos de mesma quantidade. Verifique na aba "Conferência de Duplicatas".</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider font-mono">Lista de Itens ({g.records.length})</span>
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
                        </div>
                      )}
                    </div>

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

      {/* 4. TAB: CONFERÊNCIA DE DUPLICATAS */}
      {activeTab === "duplicata" && (
        <div className="space-y-6 animate-fade-in text-slate-100">
          
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider font-display">Relatório de Conferência de Duplicatas (03.18.05)</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Esta guia analisa as solicitações e emite alertas automáticos de duplicidade se detectar transações idênticas 
              (mesmo <strong>Mapa de Reposição</strong>, mesmo cliente <strong>NB</strong> e os mesmos <strong>Produtos</strong> em mesmas <strong>Quantidades</strong>).
            </p>
          </div>

          {analysisData.duplicateGroups.length === 0 ? (
            <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xl">
              <div className="bg-emerald-950/40 border border-emerald-900/40 p-4 rounded-full text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white">Nenhum Alerta de Duplicidade Encontrado</h4>
              <p className="text-xs text-slate-400 font-mono max-w-md">
                Todas as solicitações em <strong className="text-blue-400">{analysisData.sourceName}</strong> possuem combinações de Mapa, NB ou produtos distintos.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-red-950/60 border border-red-900/40 p-4 rounded-xl text-xs text-red-300 flex items-start space-x-3 shadow-lg">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-red-200">ALERTA: {analysisData.duplicateGroups.length} Grupos de Duplicidade Absoluta Identificados!</p>
                  <p>
                    Foram encontradas solicitações redundantes no mesmo fechamento. Revise os números de solicitação abaixo para evitar liberação duplicada.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {analysisData.duplicateGroups.map((groupList, groupIdx) => {
                  const first = groupList[0];
                  
                  return (
                    <div key={groupIdx} className="bg-slate-900/90 rounded-2xl border-2 border-red-500/80 shadow-xl overflow-hidden animate-fade-in">
                      <div className="bg-red-950/20 px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest font-bold">Grupo de Redundância #{groupIdx + 1}</span>
                          <h4 className="text-xs font-bold text-slate-200">
                            Cliente NB: <span className="font-mono text-white bg-slate-950 px-2 py-0.5 rounded-md text-xs">{first.codigoCliente}</span> - {first.nomeCliente}
                          </h4>
                        </div>
                        <div className="font-mono text-xs sm:text-right">
                          <span className="text-slate-400">Mapa: </span>
                          <strong className="text-white text-sm bg-slate-950 px-2 py-1 rounded-md">{first.mapa}</strong>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
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

                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2">
                          <span className="text-[10px] text-slate-400 font-mono uppercase block">Produtos Duplicados com mesma Quantidade:</span>
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
