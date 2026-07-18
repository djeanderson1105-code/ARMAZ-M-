import React, { useState, useEffect } from "react";
import { 
  UserPlus, 
  Shield, 
  Trash2, 
  Key, 
  Users, 
  AlertCircle, 
  CheckCircle,
  Search,
  UserCheck,
  PlusCircle,
  Briefcase,
  MapPin,
  X,
  Database,
  Download,
  Calendar,
  RefreshCw,
  Camera,
  FileText,
  Printer,
  Plus,
  Upload,
  Pencil
} from "lucide-react";
import { 
  getListaCrew, 
  getRepresentativosSetor, 
  CrewMember, 
  RepresentativeInfo,
  PendingRequest,
  RequestItem
} from "../types";
import { PRODUCT_DATABASE, ProductInfo, calculateHectolitros } from "../data/products";
import { getPdvDatabase, registerNewPdv, registerMultiplePdvs, clearPdvCache } from "../data/pdvData";

interface ManagerUser {
  username: string;
  password: string;
  name: string;
}

export default function ManagersTab() {
  const [activeSubTab, setActiveSubTab] = useState<"gestores" | "crew" | "rns" | "otimizacao" | "pdvs">("gestores");

  // PDV States
  const [pdvCode, setPdvCode] = useState("");
  const [pdvRazaoSocial, setPdvRazaoSocial] = useState("");
  const [pdvNomeFantasia, setPdvNomeFantasia] = useState("");
  const [pdvMunicipio, setPdvMunicipio] = useState("");
  const [searchPdv, setSearchPdv] = useState("");
  const [pdvDb, setPdvDb] = useState<Record<string, any>>({});
  const [customPdvKeys, setCustomPdvKeys] = useState<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);

  // Approved Replacements Mirror States
  const [searchEspelho, setSearchEspelho] = useState("");
  const [filterEspelhoDate, setFilterEspelhoDate] = useState(() => {
    return new Date().toLocaleDateString("pt-BR");
  });
  const [isPrintingEspelho, setIsPrintingEspelho] = useState(false);

  // Storage Stats (calculated on tab focus)
  const [storageReport, setStorageReport] = useState({
    limitPercent: 0,
    usedKb: 0,
    requestsCount: 0,
    requestsWithImagesCount: 0,
    valesCount: 0,
    recordsCount: 0,
    batchesCount: 0,
  });

  // Annual Export and Purge Workflow States
  const [backupDone, setBackupDone] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [confirmInputText, setConfirmInputText] = useState("");

  // Request creation states
  const [reqSetor, setReqSetor] = useState("");
  const [reqMotorista, setReqMotorista] = useState("");
  const [reqAjudante1, setReqAjudante1] = useState("");
  const [reqAjudante2, setReqAjudante2] = useState("");
  const [reqNf, setReqNf] = useState("");
  const [reqNb, setReqNb] = useState("");
  const [reqMapa, setReqMapa] = useState("");
  const [reqMotiveType, setReqMotiveType] = useState<string>("Produto Avariado");
  const [reqMotiveText, setReqMotiveText] = useState("");
  const [reqFotoUrl, setReqFotoUrl] = useState("");
  const [reqObservacao, setReqObservacao] = useState("");
  
  // Single item entry states
  const [reqItem, setReqItem] = useState("");
  const [reqQuantidade, setReqQuantidade] = useState("");
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);

  // Inversion fields
  const [reqInversaoIr, setReqInversaoIr] = useState("");
  const [reqInversaoRecolher, setReqInversaoRecolher] = useState("");
  const [reqInversaoIrQtd, setReqInversaoIrQtd] = useState("");
  const [reqInversaoRecolherQtd, setReqInversaoRecolherQtd] = useState("");
  const [showIrSuggestions, setShowIrSuggestions] = useState(false);
  const [showRecolherSuggestions, setShowRecolherSuggestions] = useState(false);

  // Draft items list
  const [reqDraftItems, setReqDraftItems] = useState<any[]>([]);

  // Filtered lists for suggestions inside Manager Request form
  const itemSuggestions = React.useMemo(() => {
    const q = reqItem.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqItem]);

  const irSuggestions = React.useMemo(() => {
    const q = reqInversaoIr.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqInversaoIr]);

  const recolherSuggestions = React.useMemo(() => {
    const q = reqInversaoRecolher.trim().toLowerCase();
    if (!q) {
      return PRODUCT_DATABASE.slice(0, 10);
    }
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [reqInversaoRecolher]);

  const handleAddReqDraftItem = () => {
    setError(null);
    if (reqMotiveType === "Inversão") {
      if (!reqInversaoIr.trim() || !reqInversaoRecolher.trim()) {
        setError("Especifique o Produto que deve ir e o Produto que deve ser recolhido para Inversão.");
        return;
      }
      const qty = parseInt(reqQuantidade) || 1;
      const irQtd = parseInt(reqInversaoIrQtd) || qty;
      const recolherQtd = parseInt(reqInversaoRecolherQtd) || qty;

      // try to locate code
      const prodCode = reqItem.trim() || "INVERSÃO";
      const productDef = PRODUCT_DATABASE.find(p => p.codigo === prodCode);
      const factor = productDef?.fatorHecto || 0;
      const calculatedHl = Number((qty * factor).toFixed(4));

      const newItem = {
        id: `req_draft_${Date.now()}_${Math.random()}`,
        itemCode: prodCode,
        itemDesc: productDef ? productDef.descricao : `Inversão: ${reqInversaoIr.trim()} 🔄 ${reqInversaoRecolher.trim()}`,
        quantidade: qty,
        motivo: "Inversão",
        fatorHecto: factor,
        hectolitros: calculatedHl,
        produtoAhEnviar: `${reqInversaoIr.trim()} (Qtd: ${irQtd} un)`,
        produtoARecolher: `${reqInversaoRecolher.trim()} (Qtd: ${recolherQtd} un)`
      };

      setReqDraftItems([...reqDraftItems, newItem]);
      
      // Clear item fields
      setReqInversaoIr("");
      setReqInversaoRecolher("");
      setReqInversaoIrQtd("");
      setReqInversaoRecolherQtd("");
      setReqItem("");
      setReqQuantidade("");
    } else {
      if (!reqItem.trim()) {
        setError("Por favor, digite ou selecione um código SKU de produto.");
        return;
      }
      const qty = parseInt(reqQuantidade);
      if (isNaN(qty) || qty <= 0) {
        setError("A quantidade deve ser maior do que zero.");
        return;
      }

      const productDef = PRODUCT_DATABASE.find(p => p.codigo === reqItem.trim());
      if (!productDef) {
        setError(`Produto com código "${reqItem.trim()}" não encontrado.`);
        return;
      }

      const factor = productDef.fatorHecto || 0.0800;
      const calculatedHl = Number((qty * factor).toFixed(4));

      let finalMotive = reqMotiveType;
      if (reqMotiveType === "Falta de SKU Completo") {
        finalMotive = reqMotiveText.trim() ? `Falta de SKU Completo - ${reqMotiveText.trim()}` : "Falta de SKU Completo";
      } else if (reqMotiveType === "Falta no SKU") {
        finalMotive = reqMotiveText.trim() ? `Falta no SKU - ${reqMotiveText.trim()}` : "Falta no SKU";
      } else if (reqMotiveType === "Outros") {
        finalMotive = reqMotiveText.trim() || "Outros";
      } else {
        finalMotive = reqMotiveText.trim() ? `${reqMotiveType} - ${reqMotiveText.trim()}` : reqMotiveType;
      }

      const newItem = {
        id: `req_draft_${Date.now()}_${Math.random()}`,
        itemCode: productDef.codigo,
        itemDesc: productDef.descricao,
        quantidade: qty,
        motivo: finalMotive,
        fatorHecto: factor,
        hectolitros: calculatedHl
      };

      setReqDraftItems([...reqDraftItems, newItem]);
      
      // Clear fields
      setReqItem("");
      setReqQuantidade("");
    }
  };

  const handleRemoveReqDraftItem = (id: string) => {
    setReqDraftItems(reqDraftItems.filter(item => item.id !== id));
  };

  const handleCreateRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!reqSetor) {
      setError("Selecione o Setor / RN para o qual deseja criar a solicitação.");
      return;
    }

    if (!reqNf.trim()) {
      setError("A Nota Fiscal (NF) é obrigatória.");
      return;
    }

    const isFaltaSkuCompleto = reqMotiveType === "Falta de SKU Completo";
    if (!reqFotoUrl && !isFaltaSkuCompleto) {
      setError("É obrigatório tirar foto ou anexar comprovante, exceto para solicitações de Falta de SKU Completo.");
      return;
    }

    // Check if Map or NB are empty when Lack/Inversion
    const isLackOrInversion = reqMotiveType === "Inversão" || reqMotiveType.includes("Falta");
    if (isLackOrInversion) {
      if (!reqMapa.trim()) {
        setError("O número do Mapa de Carga é obrigatório para falta ou inversão.");
        return;
      }
      if (!reqNb.trim()) {
        setError("O código do cliente (NB) é obrigatório para falta ou inversão.");
        return;
      }
    }

    let finalDrafts = [...reqDraftItems];
    // Auto-add current input if list is empty and user has filled out fields
    if (finalDrafts.length === 0) {
      if (reqMotiveType === "Inversão") {
        if (!reqInversaoIr.trim() || !reqInversaoRecolher.trim()) {
          setError("Sua lista de itens está vazia. Adicione o item à lista ou complete os campos de Inversão.");
          return;
        }
        const qty = parseInt(reqQuantidade) || 1;
        const irQtd = parseInt(reqInversaoIrQtd) || qty;
        const recolherQtd = parseInt(reqInversaoRecolherQtd) || qty;
        const prodCode = reqItem.trim() || "INVERSÃO";
        const productDef = PRODUCT_DATABASE.find(p => p.codigo === prodCode);
        const factor = productDef?.fatorHecto || 0;
        const calculatedHl = Number((qty * factor).toFixed(4));

        finalDrafts.push({
          id: `req_draft_${Date.now()}`,
          itemCode: prodCode,
          itemDesc: productDef ? productDef.descricao : `Inversão: ${reqInversaoIr.trim()} 🔄 ${reqInversaoRecolher.trim()}`,
          quantidade: qty,
          motivo: "Inversão",
          fatorHecto: factor,
          hectolitros: calculatedHl,
          produtoAhEnviar: `${reqInversaoIr.trim()} (Qtd: ${irQtd} un)`,
          produtoARecolher: `${reqInversaoRecolher.trim()} (Qtd: ${recolherQtd} un)`
        });
      } else {
        if (!reqItem.trim() || !reqQuantidade.trim()) {
          setError("Adicione pelo menos um SKU à lista de produtos.");
          return;
        }
        const qty = parseInt(reqQuantidade);
        const productDef = PRODUCT_DATABASE.find(p => p.codigo === reqItem.trim());
        if (!productDef || isNaN(qty) || qty <= 0) {
          setError("O SKU ou quantidade digitados são inválidos. Adicione o item de forma válida.");
          return;
        }
        const factor = productDef.fatorHecto || 0.0800;
        const calculatedHl = Number((qty * factor).toFixed(4));
        let finalMotive = reqMotiveType;
        if (reqMotiveType === "Falta de SKU Completo") {
          finalMotive = reqMotiveText.trim() ? `Falta de SKU Completo - ${reqMotiveText.trim()}` : "Falta de SKU Completo";
        } else if (reqMotiveType === "Falta no SKU") {
          finalMotive = reqMotiveText.trim() ? `Falta no SKU - ${reqMotiveText.trim()}` : "Falta no SKU";
        } else if (reqMotiveType === "Outros") {
          finalMotive = reqMotiveText.trim() || "Outros";
        } else {
          finalMotive = reqMotiveText.trim() ? `${reqMotiveType} - ${reqMotiveText.trim()}` : reqMotiveType;
        }

        finalDrafts.push({
          id: `req_draft_${Date.now()}`,
          itemCode: productDef.codigo,
          itemDesc: productDef.descricao,
          quantidade: qty,
          motivo: finalMotive,
          fatorHecto: factor,
          hectolitros: calculatedHl
        });
      }
    }

    try {
      const now = new Date();
      const dataFormatada = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

      const firstItem = finalDrafts[0];
      const totalAccumulatedHl = Number(finalDrafts.reduce((acc, curr) => acc + curr.hectolitros, 0).toFixed(4));

      // Retrieve driver detail
      let driverCpf = "";
      if (reqMotorista) {
        const found = crewList.find(c => c.nome === reqMotorista);
        if (found) driverCpf = found.cpf;
      }

      const newRequest: PendingRequest = {
        id: `pending_req_${Date.now()}`,
        timestamp: Date.now(),
        data: dataFormatada,
        setor: reqSetor,
        mapa: reqMapa.trim(),
        nb: reqNb.trim() || "000000",
        nf: reqNf.trim(),
        fotoUrl: reqFotoUrl || "",
        observacao: reqObservacao.trim(),
        statusPromax: "pendente",
        notified: false,
        cadastroUser: "Gestor (Dashboard)",
        cadastroDate: dataFormatada,
        
        // Shortage fields
        faltaMotorista: reqMotorista || undefined,
        faltaMotoristaCpf: driverCpf || undefined,
        faltaAjudantes: [reqAjudante1, reqAjudante2].filter(Boolean).join(", ") || undefined,
        faltaAjudante1: reqAjudante1 || undefined,
        faltaAjudante2: reqAjudante2 || undefined,
        faltaTipoErro: "entrega",

        // Compat fallbacks
        item: firstItem.itemCode,
        quantidade: finalDrafts.reduce((sum, current) => sum + current.quantidade, 0),
        fatorHecto: firstItem.fatorHecto,
        hectolitros: totalAccumulatedHl,
        motivo: firstItem.motivo,
        
        items: finalDrafts.map(d => ({
          id: d.id,
          item: d.itemCode,
          descricao: d.itemDesc,
          quantidade: d.quantidade,
          motivo: d.motivo,
          fatorHecto: d.fatorHecto,
          hectolitros: d.hectolitros,
          produtoAhEnviar: d.produtoAhEnviar,
          produtoARecolher: d.produtoARecolher
        }))
      };

      const existingReqs = JSON.parse(localStorage.getItem("sstr_representative_pending_requests") || "[]");
      const updatedReqs = [newRequest, ...existingReqs];
      localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updatedReqs));

      // Fire event to notify other tabs/views live
      window.dispatchEvent(new Event("storage"));

      // Clear all form states
      setReqNf("");
      setReqNb("");
      setReqMapa("");
      setReqObservacao("");
      setReqFotoUrl("");
      setReqDraftItems([]);
      setReqItem("");
      setReqQuantidade("");
      setReqInversaoIr("");
      setReqInversaoRecolher("");
      
      setSuccess(`SUCESSO! Solicitação criada com sucesso para o Setor ${reqSetor} (NF: ${newRequest.nf}). Ela já está disponível no controle para aprovação.`);
      
      // Scroll to top to see feedback
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError("Erro ao salvar nova solicitação: " + e.message);
    }
  };

  const handleImageCaptureInForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2.5 * 1024 * 1024) {
      setError("A imagem é muito grande. Escolha uma foto menor (máximo de 2.5MB) para evitar falta de memória.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReqFotoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const loadStorageReport = () => {
    try {
      const dbStr = JSON.stringify(localStorage);
      const usedKb = Math.round(dbStr.length / 1024);
      const limitPercent = Math.min(100, Math.round((dbStr.length / (5 * 1024 * 1024)) * 100));

      const reqsJson = localStorage.getItem("sstr_representative_pending_requests") || "[]";
      const rList = JSON.parse(reqsJson);
      const requestsCount = rList.length;
      const requestsWithImagesCount = rList.filter((r: any) => r.fotoUrl && r.fotoUrl.startsWith("data:image")).length;

      const valesJson = localStorage.getItem("sstr_vales_historico_reg") || "[]";
      const valesCount = JSON.parse(valesJson).length;

      const recordsJson = localStorage.getItem("sstr_cached_records_v1") || "[]";
      const recordsCount = JSON.parse(recordsJson).length;

      const batchesJson = localStorage.getItem("sstr_cached_batches_v1") || "[]";
      const batchesCount = JSON.parse(batchesJson).length;

      setStorageReport({
        limitPercent,
        usedKb,
        requestsCount,
        requestsWithImagesCount,
        valesCount,
        recordsCount,
        batchesCount
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleOptimizeStorage = () => {
    setError(null);
    setSuccess(null);
    
    // Optimize Pending Requests
    const reqsJson = localStorage.getItem("sstr_representative_pending_requests");
    let optimizedReqsCount = 0;
    if (reqsJson) {
      try {
        const list = JSON.parse(reqsJson);
        const updated = list.map((r: any) => {
          const isProcessed = r.statusPromax === "cadastrado" || r.statusPromax === "reprovado" || r.statusPromax === "concluido";
          if (isProcessed && r.fotoUrl && r.fotoUrl.startsWith("data:image")) {
            optimizedReqsCount++;
            return { ...r, fotoUrl: "imagem_purgada" };
          }
          return r;
        });
        localStorage.setItem("sstr_representative_pending_requests", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }

    // Optimize Vales requests too
    const valesJson = localStorage.getItem("sstr_vales_historico_reg");
    let optimizedValesCount = 0;
    if (valesJson) {
      try {
        const list = JSON.parse(valesJson);
        const updated = list.map((v: any) => {
          if (v.originalRequest && v.originalRequest.fotoUrl && v.originalRequest.fotoUrl.startsWith("data:image")) {
            optimizedValesCount++;
            v.originalRequest.fotoUrl = "imagem_no_vale_detalhes";
          }
          return v;
        });
        localStorage.setItem("sstr_vales_historico_reg", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }

    // Trigger storage event to synchronize tabs
    window.dispatchEvent(new Event("storage"));
    loadStorageReport();

    if (optimizedReqsCount > 0 || optimizedValesCount > 0) {
      setSuccess(`Otimização Executada! Limpamos ${optimizedReqsCount} fotos de solicitações finalizadas e ${optimizedValesCount} vínculos pesados no histórico de vales. Memória liberada!`);
    } else {
      setSuccess("O banco de dados já está totalmente otimizado! Não há fotos armazenadas desnecessariamente.");
    }
  };

  const handleExportAnnualReport = () => {
    try {
      setError(null);
      setSuccess(null);
      const year = new Date().getFullYear();
      const filename = `SSTR_RELATORIO_ANUAL_${year}.json`;

      const reqs = JSON.parse(localStorage.getItem("sstr_representative_pending_requests") || "[]");
      const vales = JSON.parse(localStorage.getItem("sstr_vales_historico_reg") || "[]");
      const records = JSON.parse(localStorage.getItem("sstr_cached_records_v1") || "[]");
      const batches = JSON.parse(localStorage.getItem("sstr_cached_batches_v1") || "[]");

      const exportData = {
        nome_relatorio: "SSTR - Relatório Anual de Movimentações",
        data_geracao: new Date().toISOString(),
        ano_exercicio: year,
        usuario_responsavel: "Gestor do Armazém",
        estatisticas: {
          total_solicitacoes_representantes: reqs.length,
          total_vales_faturamento: vales.length,
          total_registros_troca_devolucao: records.length,
          total_lotes_fechados: batches.length
        },
        dados: {
          solicitacoes_representantes: reqs,
          vales_faturamento: vales,
          registros_trocas_devolucoes: records,
          lotes_fechados: batches
        }
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setBackupDone(true);
      setSuccess(`Sucesso! Relatório Anual baixado como "${filename}". Prossiga para o Passo 2.`);
    } catch (e: any) {
      setError("Falha ao gerar e baixar o relatório anual: " + e.message);
    }
  };

  const handleResetAnnualCycle = () => {
    setError(null);
    setSuccess(null);

    if (!backupDone) {
      setError("Bloqueado: você deve clicar no Passo 1 para gerar e baixar o Relatório Anual antes de efetuar a limpeza.");
      return;
    }
    if (!confirmCheckbox) {
      setError("Bloqueado: marque a caixa de confirmação no Passo 2 declarando que o arquivo está salvo com segurança.");
      return;
    }
    if (confirmInputText.trim().toUpperCase() !== "ZERAR-SSTR") {
      setError("Código de segurança incorreto. Digite exatamente ZERAR-SSTR.");
      return;
    }

    try {
      // Clear data arrays
      localStorage.setItem("sstr_representative_pending_requests", "[]");
      localStorage.setItem("sstr_vales_historico_reg", "[]");
      localStorage.setItem("sstr_cached_records_v1", "[]");
      localStorage.setItem("sstr_cached_batches_v1", "[]");

      // Dispatch to synchronize
      window.dispatchEvent(new Event("storage"));
      
      setSuccess("🚨 BANCO DE DADOS ZERADO! Histórico anual arquivado e reiniciado. A plataforma está pronta para o próximo ano faturando 100% limpa e ágil.");
      setBackupDone(false);
      setConfirmCheckbox(false);
      setConfirmInputText("");
      loadStorageReport();
    } catch (e: any) {
      setError("Erro ao zerar dados locais: " + e.message);
    }
  };

  useEffect(() => {
    if (activeSubTab === "otimizacao") {
      loadStorageReport();
    }
  }, [activeSubTab]);

  // Manager accounts state
  const [managers, setManagers] = useState<ManagerUser[]>([]);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Crew (Drivers/Helpers) state
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [searchCrew, setSearchCrew] = useState("");
  const [newCrewNome, setNewCrewNome] = useState("");
  const [newCrewCargo, setNewCrewCargo] = useState("MOTORISTA DE DISTRIBUICAO");
  const [newCrewCpf, setNewCrewCpf] = useState("");

  // Representative (RN) states
  const [repsList, setRepsList] = useState<Record<string, RepresentativeInfo>>({});
  const [searchRep, setSearchRep] = useState("");
  const [newRepSetor, setNewRepSetor] = useState("");
  const [newRepNome, setNewRepNome] = useState("");
  const [newRepGv, setNewRepGv] = useState("DIEGO");

  // Editing state trackers
  const [editingRepId, setEditingRepId] = useState<string | null>(null);
  const [editingCrewCpf, setEditingCrewCpf] = useState<string | null>(null);
  const [editingManagerUsername, setEditingManagerUsername] = useState<string | null>(null);
  const [editingPdvCode, setEditingPdvCode] = useState<string | null>(null);

  // Custom inline confirms (iframe safe, no window.confirm!)
  const [confirmDeleteManager, setConfirmDeleteManager] = useState<string | null>(null);
  const [confirmDeleteCrew, setConfirmDeleteCrew] = useState<string | null>(null); // holds CPF
  const [confirmDeleteRep, setConfirmDeleteRep] = useState<string | null>(null); // holds Setor

  // General feedback messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Function to load PDVs
  const loadPdvDatabase = () => {
    const db = getPdvDatabase();
    setPdvDb(db);

    const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
    if (customPdvsRaw) {
      try {
        const parsed: any[] = JSON.parse(customPdvsRaw);
        const keys = new Set<string>(parsed.map((p: any) => p.codigo));
        setCustomPdvKeys(keys);
      } catch (e) {
        console.error(e);
      }
    } else {
      setCustomPdvKeys(new Set());
    }
  };

  useEffect(() => {
    loadPdvDatabase();
  }, [activeSubTab]);

  // Load everything on mount and register storage listener for real-time updates
  useEffect(() => {
    const handleLoadData = () => {
      // Managers
      const listJson = localStorage.getItem("sstr_registered_managers");
      const defaults = [
        { username: "gestor", password: "paubrasil2026", name: "Gestor Principal" },
        { username: "admin", password: "admin", name: "Administrador" }
      ];
      if (listJson) {
        try {
          const parsed = JSON.parse(listJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setManagers(parsed);
          } else {
            setManagers(defaults);
            localStorage.setItem("sstr_registered_managers", JSON.stringify(defaults));
          }
        } catch (e) {
          console.error(e);
          setManagers(defaults);
          localStorage.setItem("sstr_registered_managers", JSON.stringify(defaults));
        }
      } else {
        setManagers(defaults);
        localStorage.setItem("sstr_registered_managers", JSON.stringify(defaults));
      }

      // Dyn lists
      setCrewList(getListaCrew());
      setRepsList(getRepresentativosSetor());
      
      // Load PDV database
      loadPdvDatabase();
    };

    handleLoadData();

    window.addEventListener("storage", handleLoadData);
    return () => {
      window.removeEventListener("storage", handleLoadData);
    };
  }, []);

  // Manager Handlers
  const handleAddManager = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Strip any leading "@" characters (e.g. @admin -> admin, @1234 -> 1234)
    const normUser = newUsername.trim().replace(/^@+/, "");
    const normName = newName.trim();
    const normPass = newPassword.trim();

    if (!normUser || !normName || !normPass) {
      setError("Favor preencher todos os campos.");
      return;
    }

    if (normUser.length < 3) {
      setError("O nome de usuário deve conter pelo menos 3 caracteres.");
      return;
    }

    if (editingManagerUsername) {
      if (normUser.toLowerCase() !== editingManagerUsername.toLowerCase() && managers.some(m => m.username.toLowerCase() === normUser.toLowerCase())) {
        setError("Este nome de usuário já está cadastrado.");
        return;
      }

      const updated = managers.map(m =>
        m.username.toLowerCase() === editingManagerUsername.toLowerCase()
          ? { username: normUser, password: normPass, name: normName }
          : m
      );

      setManagers(updated);
      localStorage.setItem("sstr_registered_managers", JSON.stringify(updated));

      setNewName("");
      setNewUsername("");
      setNewPassword("");
      setEditingManagerUsername(null);
      setSuccess(`Gestor "${normName}" atualizado com sucesso!`);
    } else {
      const exists = managers.some(m => m.username.toLowerCase() === normUser.toLowerCase());
      if (exists) {
        setError("Este nome de usuário já está cadastrado.");
        return;
      }

      const updated = [
        ...managers,
        { username: normUser, password: normPass, name: normName }
      ];

      setManagers(updated);
      localStorage.setItem("sstr_registered_managers", JSON.stringify(updated));

      setNewName("");
      setNewUsername("");
      setNewPassword("");
      setSuccess(`Gestor "${normName}" cadastrado com sucesso!`);
    }

    setTimeout(() => setSuccess(null), 4000);
  };

  const executeDeleteManager = (usernameToDelete: string) => {
    setError(null);
    setSuccess(null);
    const normUser = usernameToDelete.toLowerCase();
    
    if (managers.length <= 1) {
      setError("Não é permitido excluir o único gestor existente.");
      setConfirmDeleteManager(null);
      return;
    }

    const updated = managers.filter(m => m.username.toLowerCase() !== normUser);
    setManagers(updated);
    localStorage.setItem("sstr_registered_managers", JSON.stringify(updated));
    setSuccess("Acesso de gestor excluído com sucesso.");
    setConfirmDeleteManager(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Crew Member Handlers
  const handleAddCrew = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const nome = newCrewNome.trim().toUpperCase();
    const cargo = newCrewCargo.trim().toUpperCase();
    const cpf = newCrewCpf.trim();

    if (!nome || !cargo || !cpf) {
      setError("Favor preencher todos os campos do colaborador.");
      return;
    }

    // Basic CPF validation format check
    if (!/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf) && !/^\d{11}$/.test(cpf)) {
      setError("Formato de CPF inválido. Use 123.456.789-00 ou apenas números.");
      return;
    }

    // Format CPF if typed raw
    let formattedCpf = cpf;
    if (/^\d{11}$/.test(cpf)) {
      formattedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-${cpf.substring(9, 11)}`;
    }

    if (editingCrewCpf) {
      if (formattedCpf !== editingCrewCpf && crewList.some(c => c.cpf === formattedCpf)) {
        setError("Este CPF já está cadastrado para outro colaborador.");
        return;
      }

      const updated = crewList.map(c =>
        c.cpf === editingCrewCpf
          ? { nome, cargo, cpf: formattedCpf }
          : c
      );
      setCrewList(updated);
      localStorage.setItem("sstr_lista_crew", JSON.stringify(updated));

      setNewCrewNome("");
      setNewCrewCpf("");
      setEditingCrewCpf(null);
      setSuccess(`Colaborador "${nome}" atualizado com sucesso!`);
    } else {
      if (crewList.some(c => c.cpf === formattedCpf)) {
        setError("Este CPF já está cadastrado para outro colaborador.");
        return;
      }

      const updated = [...crewList, { nome, cargo, cpf: formattedCpf }];
      setCrewList(updated);
      localStorage.setItem("sstr_lista_crew", JSON.stringify(updated));

      setNewCrewNome("");
      setNewCrewCpf("");
      setSuccess(`Colaborador "${nome}" cadastrado com sucesso!`);
    }

    setTimeout(() => setSuccess(null), 3000);
  };

  const executeDeleteCrew = (cpfToDelete: string) => {
    setError(null);
    setSuccess(null);
    const target = crewList.find(c => c.cpf === cpfToDelete);
    if (!target) return;

    const updated = crewList.filter(c => c.cpf !== cpfToDelete);
    setCrewList(updated);
    localStorage.setItem("sstr_lista_crew", JSON.stringify(updated));
    setSuccess(`Colaborador "${target.nome}" excluído do sistema.`);
    setConfirmDeleteCrew(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Sector Representative (RN) Handlers
  const handleAddRep = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const setor = newRepSetor.trim();
    const nome = newRepNome.trim().toUpperCase();
    const gv = newRepGv.trim().toUpperCase();

    if (!setor || !nome || !gv) {
      setError("Favor preencher todos os campos do Setor / RN.");
      return;
    }

    if (!/^\d+$/.test(setor)) {
      setError("O código de setor deve conter apenas números.");
      return;
    }

    if (editingRepId) {
      if (setor !== editingRepId && repsList[setor]) {
        setError(`O setor "${setor}" já está cadastrado para o representante "${repsList[setor].nome}".`);
        return;
      }

      const updated = { ...repsList };
      if (setor !== editingRepId) {
        delete updated[editingRepId];
      }
      updated[setor] = { setor, nome, gv };

      setRepsList(updated);
      localStorage.setItem("sstr_reps_setor", JSON.stringify(updated));

      setNewRepSetor("");
      setNewRepNome("");
      setEditingRepId(null);
      setSuccess(`Setor ${setor} (RN: ${nome}) atualizado com sucesso!`);
    } else {
      if (repsList[setor]) {
        setError(`O setor "${setor}" já está cadastrado para o representante "${repsList[setor].nome}".`);
        return;
      }

      const updated = {
        ...repsList,
        [setor]: { setor, nome, gv }
      };
      setRepsList(updated);
      localStorage.setItem("sstr_reps_setor", JSON.stringify(updated));

      setNewRepSetor("");
      setNewRepNome("");
      setSuccess(`Setor ${setor} (RN: ${nome}) cadastrado com sucesso!`);
    }

    setTimeout(() => setSuccess(null), 3000);
  };

  const executeDeleteRep = (setorToDelete: string) => {
    setError(null);
    setSuccess(null);
    const target = repsList[setorToDelete];
    if (!target) return;

    const updated = { ...repsList };
    delete updated[setorToDelete];
    setRepsList(updated);
    localStorage.setItem("sstr_reps_setor", JSON.stringify(updated));
    setSuccess(`Setor ${setorToDelete} (RN: ${target.nome}) removido do sistema.`);
    setConfirmDeleteRep(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Filtering lists
  const filteredCrew = crewList.filter(c => {
    if (!searchCrew) return true;
    const q = searchCrew.toLowerCase();
    return c.nome.toLowerCase().includes(q) || c.cpf.includes(q) || c.cargo.toLowerCase().includes(q);
  });

  const repsArray = Object.values(repsList) as RepresentativeInfo[];
  const filteredReps = repsArray.filter(r => {
    if (!searchRep) return true;
    const q = searchRep.toLowerCase();
    return r.nome.toLowerCase().includes(q) || r.setor.includes(q) || r.gv.toLowerCase().includes(q);
  });

  // PDV filtered list Memo
  const filteredPdvs = React.useMemo(() => {
    const arr = Object.values(pdvDb);
    if (!searchPdv) return arr;
    const q = searchPdv.toLowerCase();
    return arr.filter((p: any) => 
      (p.codigo || "").toLowerCase().includes(q) ||
      (p.razaoSocial || "").toLowerCase().includes(q) ||
      (p.nomeFantasia || "").toLowerCase().includes(q) ||
      (p.municipio || "").toLowerCase().includes(q)
    );
  }, [pdvDb, searchPdv]);

  // Approved replacements list Memo (flattened and filtered by date)
  const approvedReplacements = React.useMemo(() => {
    const raw = localStorage.getItem("sstr_representative_pending_requests") || "[]";
    let requestsList: any[] = [];
    try {
      requestsList = JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }

    const approved = requestsList.filter(r => r.statusPromax === "cadastrado");
    const flattened: any[] = [];
    const db = getPdvDatabase();

    for (const req of approved) {
      const pdv = db[req.nb?.trim()] || {
        codigo: req.nb,
        razaoSocial: req.nomeCliente || "CLIENTE NÃO ENCONTRADO",
        nomeFantasia: "N/A",
        municipio: ""
      };

      let displayMunicipio = req.municipioRecibo || pdv.municipio || "";
      if (!displayMunicipio || displayMunicipio === "NÃO CADASTRADO") {
        displayMunicipio = "Guarabira";
      }

      const dateOnly = req.cadastroDate ? req.cadastroDate.split(" ")[0] : "";

      if (req.items && req.items.length > 0) {
        for (const item of req.items) {
          flattened.push({
            requestId: req.id,
            cadastroDate: req.cadastroDate || "",
            dateOnly,
            nb: req.nb,
            razaoSocial: pdv.razaoSocial,
            nomeFantasia: pdv.nomeFantasia,
            municipio: displayMunicipio,
            productCode: item.item || item.itemCode,
            productDesc: item.descricao || item.itemDesc || "Produto sem descrição",
            quantidade: item.quantidade,
            solicitante: req.setor,
            nf: req.nf,
            mapa: req.mapa
          });
        }
      } else if (req.item) {
        flattened.push({
          requestId: req.id,
          cadastroDate: req.cadastroDate || "",
          dateOnly,
          nb: req.nb,
          razaoSocial: pdv.razaoSocial,
          nomeFantasia: pdv.nomeFantasia,
          municipio: displayMunicipio,
          productCode: req.item,
          productDesc: req.descricaoProduto || "Produto sem descrição",
          quantidade: req.quantidade || 0,
          solicitante: req.setor,
          nf: req.nf,
          mapa: req.mapa
        });
      }
    }

    return flattened;
  }, [activeSubTab]);

  // Filtered Approved Replacements Memo (based on selected date and search text)
  const espelhoFiltrado = React.useMemo(() => {
    return approvedReplacements.filter((item: any) => {
      // Date filter
      const matchesDate = item.dateOnly === filterEspelhoDate;
      if (!matchesDate) return false;

      // Search filter
      if (!searchEspelho) return true;
      const q = searchEspelho.toLowerCase();
      return (
        (item.nb || "").toLowerCase().includes(q) ||
        (item.razaoSocial || "").toLowerCase().includes(q) ||
        (item.nomeFantasia || "").toLowerCase().includes(q) ||
        (item.productCode || "").toLowerCase().includes(q) ||
        (item.productDesc || "").toLowerCase().includes(q) ||
        (item.municipio || "").toLowerCase().includes(q)
      );
    });
  }, [approvedReplacements, filterEspelhoDate, searchEspelho]);

  const handleRegisterPdv = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const normCode = pdvCode.trim();
    if (!normCode || !pdvRazaoSocial.trim() || !pdvNomeFantasia.trim() || !pdvMunicipio.trim()) {
      setError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    const pdv = {
      codigo: normCode,
      razaoSocial: pdvRazaoSocial.trim().toUpperCase(),
      nomeFantasia: pdvNomeFantasia.trim(),
      municipio: pdvMunicipio.trim().toUpperCase()
    };

    if (editingPdvCode) {
      const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
      let customList: any[] = [];
      if (customPdvsRaw) {
        try { customList = JSON.parse(customPdvsRaw); } catch(err) {}
      }

      if (normCode !== editingPdvCode) {
        if (customList.some(p => p.codigo === normCode)) {
          setError(`O código de PDV #${normCode} já está cadastrado.`);
          return;
        }

        const filtered = customList.filter(p => p.codigo !== editingPdvCode);
        localStorage.setItem("sstr_custom_pdvs_v1", JSON.stringify(filtered));
      }

      const res = registerNewPdv(pdv);
      if (res.success) {
        setSuccess(`PDV #${pdv.codigo} atualizado com sucesso!`);
        setPdvCode("");
        setPdvRazaoSocial("");
        setPdvNomeFantasia("");
        setPdvMunicipio("");
        setEditingPdvCode(null);
        loadPdvDatabase();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res.error || "Erro ao atualizar o PDV.");
      }
    } else {
      const res = registerNewPdv(pdv);
      if (res.success) {
        setSuccess(`PDV #${pdv.codigo} cadastrado com sucesso!`);
        setPdvCode("");
        setPdvRazaoSocial("");
        setPdvNomeFantasia("");
        setPdvMunicipio("");
        loadPdvDatabase();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res.error || "Erro ao registrar o PDV.");
      }
    }
  };

  const handleDeleteCustomPdv = (codigo: string) => {
    setError(null);
    setSuccess(null);
    const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
    if (customPdvsRaw) {
      try {
        const list: any[] = JSON.parse(customPdvsRaw);
        const filtered = list.filter(p => p.codigo !== codigo);
        localStorage.setItem("sstr_custom_pdvs_v1", JSON.stringify(filtered));
        clearPdvCache();
        loadPdvDatabase();
        setSuccess(`PDV #${codigo} excluído com sucesso!`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (e: any) {
        setError("Erro ao excluir PDV: " + e.message);
      }
    }
  };

  const handlePdvImportFile = (file: File) => {
    setError(null);
    setSuccess(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      
      try {
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) {
          setError("O arquivo está vazio ou não possui registros suficientes.");
          return;
        }
        
        // Find separator (semicolon or comma or tab)
        const firstLine = lines[0];
        let separator = ";";
        if (firstLine.includes(";")) {
          separator = ";";
        } else if (firstLine.includes(",")) {
          separator = ",";
        } else if (firstLine.includes("\t")) {
          separator = "\t";
        }
        
        const headers = firstLine.split(separator).map(h => h.trim().toLowerCase());
        
        const getColIndex = (names: string[]) => {
          return headers.findIndex(h => names.some(n => {
            const cleanH = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const cleanN = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return cleanH === cleanN || cleanH.includes(cleanN);
          }));
        };
        
        const idxCdPdv = getColIndex(["cdpdv", "codigo", "id", "nb"]);
        const idxDocumento = getColIndex(["documento", "cpf", "cnpj"]);
        const idxNomeFantasia = getColIndex(["nomefantasia", "fantasia", "nome_fantasia"]);
        const idxRazoSocial = getColIndex(["razosocial", "razaosocial", "razao_social", "cliente", "razao"]);
        const idxEndereco = getColIndex(["endereco", "rua", "logradouro"]);
        const idxComplemento = getColIndex(["complemento"]);
        const idxBairro = getColIndex(["bairro"]);
        const idxCidade = getColIndex(["cidade", "municipio"]);
        const idxUf = getColIndex(["uf", "estado"]);
        const idxCep = getColIndex(["cep"]);
        
        if (idxCdPdv === -1) {
          setError("Coluna de identificação do PDV (ex: CdPDV ou Código) não foi localizada no cabeçalho.");
          return;
        }
        
        const importedPdvs: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(separator).map(p => p.trim().replace(/^["']|["']$/g, ""));
          if (parts.length > idxCdPdv) {
            const codigo = parts[idxCdPdv];
            if (!codigo) continue;
            
            const getField = (idx: number) => {
              if (idx !== -1 && idx < parts.length) {
                return parts[idx];
              }
              return "";
            };
            
            const razaoSocial = getField(idxRazoSocial) || `PDV #${codigo}`;
            const nomeFantasia = getField(idxNomeFantasia) || razaoSocial;
            const municipio = getField(idxCidade) || "GUARABIRA";
            const documento = getField(idxDocumento);
            const endereco = getField(idxEndereco);
            const complemento = getField(idxComplemento);
            const bairro = getField(idxBairro);
            const uf = getField(idxUf) || "PB";
            const cep = getField(idxCep);
            
            importedPdvs.push({
              codigo,
              razaoSocial,
              nomeFantasia,
              municipio,
              documento,
              endereco,
              complemento,
              bairro,
              uf,
              cep
            });
          }
        }
        
        if (importedPdvs.length === 0) {
          setError("Nenhum PDV válido foi extraído do arquivo.");
          return;
        }
        
        const res = registerMultiplePdvs(importedPdvs);
        if (res.success) {
          setSuccess(`${res.count} PDVs cadastrados/atualizados com sucesso a partir do arquivo!`);
          clearPdvCache();
          loadPdvDatabase();
          setTimeout(() => setSuccess(null), 5000);
        } else {
          setError(res.error || "Ocorreu um erro ao importar os PDVs.");
        }
      } catch (err: any) {
        setError("Falha ao analisar o arquivo: " + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handlePrintEspelho = () => {
    let printedWithNewTab = false;
    const printElement = document.getElementById("espelho-printable-content");
    if (printElement) {
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(el => el.outerHTML)
            .join('\n');
          
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>SSTR - Imprimir Espelho de Reposições</title>
                ${styles}
                <style>
                  body {
                    background-color: white !important;
                    color: black !important;
                    padding: 24px 32px !important;
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  #espelho-printable-content {
                    display: block !important;
                    color: black !important;
                  }
                  table {
                    border-collapse: collapse !important;
                    width: 100% !important;
                    margin-top: 16px !important;
                    margin-bottom: 16px !important;
                  }
                  th, td {
                    border: 1px solid #94a3b8 !important;
                    padding: 8px !important;
                    color: black !important;
                  }
                  th {
                    background-color: #f1f5f9 !important;
                    font-weight: bold !important;
                  }
                </style>
              </head>
              <body class="bg-white text-black">
                <div id="espelho-printable-content" class="space-y-6">
                  ${printElement.innerHTML}
                </div>
                <script>
                  window.onload = function() {
                    window.focus();
                    setTimeout(function() {
                      window.print();
                    }, 450);
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
          printedWithNewTab = true;
        }
      } catch (e) {
        console.warn("Could not print in a new tab, falling back to window.print()", e);
      }
    }

    if (!printedWithNewTab) {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn("Iframe blocked print dialog:", e);
      }
    }
  };

  if (isPrintingEspelho) {
    return (
      <div className="fixed inset-0 bg-white text-black z-[9999] overflow-y-auto p-8 font-sans" id="espelho-impressao-overlay">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Print controls */}
          <div className="flex justify-between items-center border-b pb-4 mb-4 no-print">
            <span className="text-sm font-bold text-slate-800">Visualização de Impressão do Espelho</span>
            <div className="flex gap-2">
              <button
                onClick={handlePrintEspelho}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono rounded flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-white" /> Confirmar Impressão
              </button>
              <button
                onClick={() => setIsPrintingEspelho(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-mono rounded cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>

          <div id="espelho-printable-content" className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
              <div className="space-y-1">
                <h1 className="text-xl font-black uppercase tracking-tight">ESPELHO DE REPOSIÇÕES E TROCAS DO DIA</h1>
                <p className="text-xs text-slate-600 uppercase font-mono">SSTR Ambev - Relatório Operacional de Conformidade</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold font-mono">DATA DE REFERÊNCIA: {filterEspelhoDate}</p>
                <p className="text-[10px] text-slate-500">Emitido em: {new Date().toLocaleString("pt-BR")}</p>
              </div>
            </div>

            {/* Table */}
            <table className="w-full text-xs border-collapse border border-slate-400">
              <thead>
                <tr className="bg-slate-100 border-b-2 border-slate-400 text-[10px] font-bold uppercase">
                  <th className="p-2 border border-slate-300 text-left">NB</th>
                  <th className="p-2 border border-slate-300 text-left">Razão Social / Cliente</th>
                  <th className="p-2 border border-slate-300 text-left">Produto (SKU - Descrição)</th>
                  <th className="p-2 border border-slate-300 text-center">Qtd</th>
                  <th className="p-2 border border-slate-300 text-left">Cidade</th>
                  <th className="p-2 border border-slate-300 text-left">N.F. / Mapa</th>
                  <th className="p-2 border border-slate-300 text-left">Setor</th>
                </tr>
              </thead>
              <tbody>
                {espelhoFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 italic">
                      Nenhuma reposição cadastrada/aprovada na data {filterEspelhoDate}.
                    </td>
                  </tr>
                ) : (
                  espelhoFiltrado.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-300 hover:bg-slate-50">
                      <td className="p-2 border border-slate-300 font-mono font-bold text-slate-900">{item.nb}</td>
                      <td className="p-2 border border-slate-300 uppercase">
                        <p className="font-bold">{item.razaoSocial}</p>
                        <p className="text-[9px] text-slate-500 font-mono">{item.nomeFantasia}</p>
                      </td>
                      <td className="p-2 border border-slate-300">
                        <strong className="font-mono text-slate-900">#{item.productCode}</strong> - <span className="uppercase text-slate-750">{item.productDesc}</span>
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-extrabold text-slate-900">{item.quantidade}</td>
                      <td className="p-2 border border-slate-300 uppercase font-mono">{item.municipio}</td>
                      <td className="p-2 border border-slate-300 font-mono">
                        <p>NF: {item.nf || "N/A"}</p>
                        <p className="text-[9px] text-slate-500">Mapa: {item.mapa || "N/A"}</p>
                      </td>
                      <td className="p-2 border border-slate-300 font-mono text-slate-600">{item.solicitante}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Footer signature lines */}
            <div className="grid grid-cols-2 gap-8 pt-12 text-center text-[10px] uppercase font-mono">
              <div className="space-y-1">
                <div className="border-t border-slate-400 w-48 mx-auto mt-6"></div>
                <p className="font-bold">CONFERENTE OPERACIONAL</p>
                <p className="text-[9px] text-slate-500">SSTR LOGÍSTICA</p>
              </div>
              <div className="space-y-1">
                <div className="border-t border-slate-400 w-48 mx-auto mt-6"></div>
                <p className="font-bold">SUPERVISÃO / GESTÃO</p>
                <p className="text-[9px] text-slate-500">CONTROLE SSTR</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-100 animate-fade-in" id="gestor-cadastros-container">
      
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-left">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-display text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            Central de Cadastros e Equipes
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl font-sans">
            Gerencie credenciais de acesso supervisor, lista de motoristas / ajudantes das rotas operacionais, ou adicione e remova setores do campo (RN's) conforme as contratações e demissões corporativas.
          </p>
        </div>
      </div>

      {/* 2. Horizontal Sub-Tabs bar */}
      <div className="flex border-b border-slate-800 gap-1.5 scrollbar-none overflow-x-auto pb-0.5">
        <button
          onClick={() => { setActiveSubTab("gestores"); setError(null); }}
          className={`px-4 py-2 border-b-2 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === "gestores"
              ? "border-indigo-500 text-white bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Acessos Supervisor ({managers.length})</span>
        </button>

        <button
          onClick={() => { setActiveSubTab("crew"); setError(null); }}
          className={`px-4 py-2 border-b-2 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === "crew"
              ? "border-indigo-500 text-white bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Motoristas & Ajudantes ({crewList.length})</span>
        </button>

        <button
          onClick={() => { setActiveSubTab("rns"); setError(null); }}
          className={`px-4 py-2 border-b-2 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === "rns"
              ? "border-indigo-500 text-white bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Setores & RN's do Campo ({repsArray.length})</span>
        </button>

        <button
          onClick={() => { setActiveSubTab("otimizacao"); setError(null); }}
          className={`px-4 py-2 border-b-2 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === "otimizacao"
              ? "border-indigo-500 text-white bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>Otimização e Espaço ⚙️</span>
        </button>

        <button
          onClick={() => { setActiveSubTab("pdvs"); setError(null); }}
          className={`px-4 py-2 border-b-2 font-bold text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === "pdvs"
              ? "border-indigo-500 text-white bg-slate-900/40 rounded-t-lg"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>Cadastrar PDVs (NB) 🏪</span>
        </button>
      </div>

      {/* Feedback Notifications */}
      {error && (
        <div className="p-3.5 bg-red-950/40 border border-red-900/40 rounded-xl flex items-start space-x-2 text-red-350 text-[11px] font-mono shadow-md text-left">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span><strong>ERRO:</strong> {error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-900/40 rounded-xl flex items-start space-x-2 text-emerald-350 text-[11px] font-mono shadow-md text-left">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span><strong>SUCESSO:</strong> {success}</span>
        </div>
      )}

      {/* 3. Dynamic Views based on active subtab */}
      {activeSubTab === "gestores" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
          
          {/* Add supervisor credential */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 text-white border-b border-slate-800 pb-3">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-xs font-mono uppercase tracking-wider">
                {editingManagerUsername ? "Editar Acesso Supervisor" : "Novo Acesso supervisor"}
              </h3>
            </div>

            <form onSubmit={handleAddManager} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos André (Supervisão)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Usuário de Login</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: carlos.supervisao"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Senha de Acesso</label>
                <input
                  type="text"
                  required
                  placeholder="Defina a senha no PW"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              {editingManagerUsername ? (
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-indigo-950/40"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewName("");
                      setNewUsername("");
                      setNewPassword("");
                      setEditingManagerUsername(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white font-sans font-semibold text-xs rounded-lg transition-colors cursor-pointer text-center block"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-indigo-950/40"
                >
                  Salvar Novo Gestor
                </button>
              )}
            </form>
          </div>

          {/* Supervisor lists */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="font-bold text-xs text-white font-mono uppercase border-b border-slate-800 pb-3 flex justify-between items-center">
              <span>Supervisores Cadastrados</span>
              <span className="text-[10px] px-2 py-0.5 bg-slate-950 rounded text-slate-400">Total: {managers.length}</span>
            </h3>

            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-450 font-mono text-[9px] uppercase font-bold">
                    <th className="p-3 text-left">Nome Gestor</th>
                    <th className="p-3 text-left">Login</th>
                    <th className="p-3 text-left">Senha</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {managers.map(m => (
                    <tr key={m.username} className="hover:bg-slate-950/20">
                      <td className="p-3 font-semibold text-slate-200">{m.name}</td>
                      <td className="p-3 font-mono text-indigo-400">{m.username}</td>
                      <td className="p-3 font-mono text-slate-500">{m.password}</td>
                      <td className="p-3 text-center relative">
                        {confirmDeleteManager === m.username ? (
                          <div className="inline-flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-red-900/60 z-10 animate-fade-in whitespace-nowrap">
                            <span className="text-[9px] text-red-400 font-mono font-bold uppercase pl-1">Excluir?</span>
                            <button
                              onClick={() => executeDeleteManager(m.username)}
                              className="px-2 py-0.5 bg-rose-600 text-white font-sans font-bold rounded text-[9.5px] cursor-pointer"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setConfirmDeleteManager(null)}
                              className="px-2 py-0.5 bg-slate-800 text-slate-300 font-sans rounded text-[9.5px] cursor-pointer"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 justify-center">
                            <button
                              onClick={() => {
                                setEditingManagerUsername(m.username);
                                setNewName(m.name);
                                setNewUsername(m.username);
                                setNewPassword(m.password || "");
                                document.getElementById("gestor-rns-container")?.scrollIntoView({ behavior: "smooth" });
                              }}
                              className="p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-indigo-400 cursor-pointer transition-colors"
                              title="Editar supervisor"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteManager(m.username)}
                              disabled={managers.length <= 1}
                              className={`p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border text-slate-400 transition-colors ${
                                managers.length <= 1
                                  ? "border-slate-850 text-slate-700 cursor-not-allowed"
                                  : "border-slate-800 bg-slate-950 hover:bg-slate-850 hover:text-red-400 cursor-pointer"
                              }`}
                              title="Remover acesso gestor"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "crew" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left bg-slate-950/10" id="gestor-equipe-sub-con">
          
          {/* Add a driver or helper */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 text-white border-b border-slate-800 pb-3">
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-xs font-mono uppercase tracking-wider">
                {editingCrewCpf ? "Editar Colaborador (Rota SSTR)" : "Novo Colaborador (Rota SSTR)"}
              </h3>
            </div>

            <form onSubmit={handleAddCrew} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Nome sem abreviações"
                  value={newCrewNome}
                  onChange={(e) => setNewCrewNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-sans uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Cargo / Atividade</label>
                <select
                  value={newCrewCargo}
                  onChange={(e) => setNewCrewCargo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                >
                  <option value="MOTORISTA DE DISTRIBUICAO">MOTORISTA DE DISTRIBUIÇÃO</option>
                  <option value="AJUDANTE DE DISTRIBUICAO">AJUDANTE DE DISTRIBUIÇÃO</option>
                  <option value="COBRADOR DE DISTRIBUICAO">COBRADOR / OUTRO</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Nº de CPF</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 000.000.000-00"
                  value={newCrewCpf}
                  onChange={(e) => setNewCrewCpf(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                />
                <span className="text-[8px] text-slate-500 leading-tight block">Obrigatório para emissão timbrada Ambev nos vales de faturamento.</span>
              </div>

              {editingCrewCpf ? (
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-emerald-950/40"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewCrewNome("");
                      setNewCrewCpf("");
                      setEditingCrewCpf(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white font-sans font-semibold text-xs rounded-lg transition-colors cursor-pointer text-center block"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-emerald-950/40"
                >
                  Contratar / Adicionar Integrante
                </button>
              )}
            </form>
          </div>

          {/* Collapsible Crew List table & search */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
              <h3 className="font-bold text-xs text-white font-mono uppercase flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                <span>Base de Colaboradores Importados</span>
              </h3>
              
              <div className="relative shrink-0">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar condutor..."
                  value={searchCrew}
                  onChange={(e) => setSearchCrew(e.target.value)}
                  className="w-full sm:w-[150px] bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>
            </div>

            <div className="overflow-y-auto rounded-xl max-h-[360px] border border-slate-850/40">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-950/80 sticky top-0 text-slate-450 font-mono text-[9px] uppercase font-bold border-b border-slate-800">
                    <th className="p-3">Nome do Condutor</th>
                    <th className="p-3">Cargo</th>
                    <th className="p-3">CPF</th>
                    <th className="p-3 text-center">Desligar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredCrew.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 font-mono">Nenhum condutor encontrado.</td>
                    </tr>
                  ) : (
                    filteredCrew.map(c => (
                      <tr key={c.cpf} className="hover:bg-slate-950/20">
                        <td className="p-3 font-semibold text-slate-200 uppercase text-[11px]">{c.nome}</td>
                        <td className="p-3 font-mono text-[10px]">
                          <span className={`px-2 py-0.5 rounded font-sans font-bold text-[8.5px] ${
                            c.cargo.includes("MOTORISTA")
                              ? "bg-blue-950 text-blue-400 border border-blue-900/30"
                              : "bg-indigo-950 text-indigo-400 border border-indigo-900/30"
                          }`}>
                            {c.cargo.replace(" DE DISTRIBUICAO", "")}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400 text-[10.5px]">{c.cpf}</td>
                        <td className="p-3 text-center">
                          {confirmDeleteCrew === c.cpf ? (
                            <div className="inline-flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-red-900/60 animate-fade-in whitespace-nowrap">
                              <span className="text-[9px] text-red-400 font-mono font-bold uppercase pl-1">Excluir?</span>
                              <button
                                onClick={() => executeDeleteCrew(c.cpf)}
                                className="px-2 py-0.5 bg-rose-600 text-white font-sans font-bold rounded text-[9.5px] cursor-pointer"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setConfirmDeleteCrew(null)}
                                className="px-2 py-0.5 bg-slate-800 text-slate-300 font-sans rounded text-[9.5px] cursor-pointer"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 justify-center">
                              <button
                                onClick={() => {
                                  setEditingCrewCpf(c.cpf);
                                  setNewCrewNome(c.nome);
                                  setNewCrewCargo(c.cargo);
                                  setNewCrewCpf(c.cpf);
                                  document.getElementById("gestor-rns-container")?.scrollIntoView({ behavior: "smooth" });
                                }}
                                className="p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-emerald-400 cursor-pointer transition-colors"
                                title="Editar colaborador"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteCrew(c.cpf)}
                                className="p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                                title="Desligar e excluir do banco de dados"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "rns" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left bg-slate-950/10" id="gestor-rns-container">
          
          {/* Add a field representative */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 text-white border-b border-slate-800 pb-3">
              <PlusCircle className="w-4 h-4 text-blue-400" />
              <h3 className="font-bold text-xs font-mono uppercase tracking-wider">
                {editingRepId ? "Editar Setor / Representante" : "Novo Setor / Representante"}
              </h3>
            </div>

            <form onSubmit={handleAddRep} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Código do Setor</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 609"
                  maxLength={4}
                  value={newRepSetor}
                  onChange={(e) => setNewRepSetor(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                />
                <span className="text-[8px] text-slate-550 leading-none block">Código numérico correspondente à divisão do Promax PW.</span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Nome do Representante (RN)</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do representante de vendas"
                  value={newRepNome}
                  onChange={(e) => setNewRepNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-sans uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Gerente de Vendas (GV)</label>
                <select
                  value={newRepGv}
                  onChange={(e) => setNewRepGv(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                >
                  <option value="DIEGO">DIEGO (GUERRA)</option>
                  <option value="ERIVAN">ERIVAN (ERIVAN)</option>
                  <option value="OUTRO">OUTRO / GERAL</option>
                </select>
              </div>

              {editingRepId ? (
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-indigo-950/40"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewRepSetor("");
                      setNewRepNome("");
                      setEditingRepId(null);
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white font-sans font-semibold text-xs rounded-lg transition-colors cursor-pointer text-center block"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 font-sans font-bold text-xs text-white rounded-lg transition-colors cursor-pointer text-center block shadow-lg shadow-indigo-950/40"
                >
                  Cadastrar Novo Setor
                </button>
              )}
            </form>
          </div>

          {/* List layout of representatives */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
              <h3 className="font-bold text-xs text-white font-mono uppercase flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span>Relação de Representantes de Negócios (RN)</span>
              </h3>
              
              <div className="relative shrink-0">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar setor..."
                  value={searchRep}
                  onChange={(e) => setSearchRep(e.target.value)}
                  className="w-full sm:w-[150px] bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 font-sans"
                />
              </div>
            </div>

            <div className="overflow-y-auto rounded-xl max-h-[360px] border border-slate-850/40 animate-fade-in">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-950/80 sticky top-0 text-slate-450 font-mono text-[9px] uppercase font-bold border-b border-slate-800">
                    <th className="p-3">Setor</th>
                    <th className="p-3">Representante (RN)</th>
                    <th className="p-3">Gerente (GV)</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredReps.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 font-mono">Nenhum setor encontrado.</td>
                    </tr>
                  ) : (
                    filteredReps.sort((a,b) => a.setor.localeCompare(b.setor)).map(r => (
                      <tr key={r.setor} className="hover:bg-slate-950/20">
                        <td className="p-3 font-mono text-indigo-400 font-bold">Setor {r.setor}</td>
                        <td className="p-3 font-semibold text-slate-200 uppercase text-[11px]">{r.nome}</td>
                        <td className="p-3 font-mono text-slate-400">GV {r.gv}</td>
                        <td className="p-3 text-center">
                          {confirmDeleteRep === r.setor ? (
                            <div className="inline-flex items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-red-900/60 animate-fade-in whitespace-nowrap">
                              <span className="text-[9px] text-red-400 font-mono font-bold uppercase pl-1">Excluir?</span>
                              <button
                                onClick={() => executeDeleteRep(r.setor)}
                                className="px-2 py-0.5 bg-rose-600 text-white font-sans font-bold rounded text-[9.5px] cursor-pointer"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setConfirmDeleteRep(null)}
                                className="px-2 py-0.5 bg-slate-800 text-slate-300 font-sans rounded text-[9.5px] cursor-pointer"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 justify-center">
                              <button
                                onClick={() => {
                                  setEditingRepId(r.setor);
                                  setNewRepSetor(r.setor);
                                  setNewRepNome(r.nome);
                                  setNewRepGv(r.gv || "DIEGO");
                                  document.getElementById("gestor-rns-container")?.scrollIntoView({ behavior: "smooth" });
                                }}
                                className="p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-indigo-400 cursor-pointer transition-colors"
                                title="Editar setor / representante"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteRep(r.setor)}
                                className="p-1 w-7 h-7 inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 text-slate-400 hover:text-red-400 cursor-pointer transition-colors"
                                title="Remover setor do banco de dados"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "otimizacao" && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-8 text-left">
          
          {/* Section 1: Memory optimization details */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-white border-b border-slate-800 pb-3">
              <Database className="w-5 h-5 text-indigo-400 animate-pulse" />
              <h3 className="font-bold text-sm font-mono uppercase tracking-wider">Otimização de Memória e Monitoramento</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Os navegadores de celulares utilizam uma memória de armazenamento local restrita chamada <strong>LocalStorage (com limite rígido de 5.0MB)</strong>. Como o aplicativo armazena fotos de avarias e canhotos em formato compactado de texto (Base64), o fluxo constante de dezenas de solicitações pode, em algumas semanas, preencher essa cota e travar o envio de novas fotos.
            </p>

            {/* Diagnostic Widget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">MEMÓRIA UTILIZADA</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-indigo-400">{storageReport.usedKb} KB</span>
                  <span className="text-[9px] text-slate-500">de 5.120 KB</span>
                </div>
                <div className="w-full bg-slate-850 h-1.5 rounded-full overflow-hidden mt-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      storageReport.limitPercent > 80 ? "bg-red-500" : storageReport.limitPercent > 50 ? "bg-yellow-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${storageReport.limitPercent}%` }}
                  ></div>
                </div>
                <span className="text-[9px] text-slate-500 block text-right font-bold mt-1">{storageReport.limitPercent}% do limite</span>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">SOLICITAÇÕES ACTIVAS</span>
                <div className="text-lg font-bold text-slate-200">{storageReport.requestsCount} regs</div>
                <span className="text-[9px] text-slate-500 block mt-1">
                  {storageReport.requestsWithImagesCount} contêm foto ativa (Base64)
                </span>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">VALES DE FATURAMENTO</span>
                <div className="text-lg font-bold text-slate-200">{storageReport.valesCount} gerados</div>
                <span className="text-[9px] text-slate-500 block mt-1">Otimizados na nuvem</span>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[10px] text-slate-400 uppercase">REPOSIÇÕES / DEVOLUÇÕES</span>
                <div className="text-lg font-bold text-slate-200">
                  {storageReport.recordsCount} trocas <span className="text-[9px] text-slate-500 font-normal">({storageReport.batchesCount} lotes)</span>
                </div>
                <span className="text-[9px] text-slate-500 block mt-1">Histórico fiscal sincronizado</span>
              </div>
            </div>

            {/* Action Optimization Box */}
            <div className="p-4 bg-indigo-950/25 border border-indigo-900/35 rounded-xl space-y-4">
              <div className="space-y-1.5 text-left">
                <span className="text-indigo-400 font-bold text-[11px] font-mono uppercase block flex items-center gap-1.5">
                  💡 SOLUÇÃO LOCAL: Varredura Completa e Encolhimento de Imagens
                </span>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed font-sans">
                  Para permitir o uso contínuo da plataforma <strong>infinitamente e sem travar</strong>, implementamos um motor que limpa as fotos (dados pesados de imagem) de solicitações antigas já processadas (em status <strong>"Cadastrado"</strong> ou <strong>"Reprovado"</strong>). Isto preserva 100% das informações essenciais (valores, motoristas, motivos, CPFs, e comprovantes digitais de assinatura) e reduz o tamanho físico de cada registro de 100KB para 0.05KB (99.9% de economia!).
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center pt-1">
                <button
                  type="button"
                  onClick={handleOptimizeStorage}
                  className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-extrabold rounded-xl shadow-lg hover:shadow-indigo-900/40 cursor-pointer active:scale-95 transition-all uppercase tracking-wide flex items-center justify-center gap-2 shrink-0 animate-pulse hover:animate-none"
                >
                  <Database className="w-4 h-4" />
                  <span>Executar Varredura e Otimizar Memória Agora</span>
                </button>
                <div className="text-[9.5px] text-slate-450 font-sans leading-snug text-left sm:pl-2">
                  ✓ <strong>Totalmente Seguro:</strong> Mantém todas as assinaturas digitais, dados fiscais de notas e relatórios. Apenas imagens de solicitações já resolvidas são removidas do navegador.
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Annual Report & Cycle Closure (Purge) */}
          <div className="space-y-5 border-t border-slate-800 pt-6">
            <div className="flex items-center space-x-2 text-white">
              <Calendar className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-sm font-mono uppercase tracking-wider text-amber-500">Fechamento de Faturamento e Relatório Anual (Reset de Banco)</h3>
            </div>

            <div className="bg-amber-950/15 border border-amber-900/30 p-4 rounded-xl text-left space-y-2">
              <p className="text-[11.5px] text-amber-200 leading-relaxed font-sans">
                Anualmente, para garantir que o sistema não perca velocidade e se mantenha rápido, o gestor do armazém deve realizar o <strong>Fechamento de Ciclo</strong>. Esse procedimento gera um relatório completo consolidado (JSON) contendo todas as transações, vales e registros de trocas/reposições do ano para auditoria externa ou importação de planilhas. Em seguida, o sistema realiza um <strong>Reset Completo e Seguro</strong> das atividades do período.
              </p>
              <div className="text-[10px] text-amber-300/80 font-mono flex items-center gap-1.5 uppercase tracking-wide font-bold">
                ⚠️ CUIDADO: O RESET IRÁ APAGAR TODOS OS REGISTROS DE TROCAS, VALES E SOLICITAÇÕES DO SISTEMA (LOCAL E NUVEM).
              </div>
            </div>

            {/* Interactive Step-by-Step Closure Wizard */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
              
              {/* Step 1 */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                backupDone ? "bg-emerald-950/20 border-emerald-900/40" : "bg-slate-950 border-slate-850"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-widest">PASSO 1</span>
                    <span className={`text-[8.5px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      backupDone ? "bg-emerald-900 text-emerald-350" : "bg-amber-900 text-amber-300"
                    }`}>
                      {backupDone ? "COMPLETO" : "PENDENTE"}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-indigo-400" /> Baixar Compilado Anual
                  </h4>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Exporta e faz backup de absolutamente todas as solicitações de representantes, vales faturados, registros de trocas e devoluções em um único arquivo unificado (.json).
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleExportAnnualReport}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-mono text-[10px] font-bold rounded-lg cursor-pointer transition-all uppercase tracking-wide flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Gerar e Baixar Backup</span>
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                confirmCheckbox ? "bg-emerald-950/20 border-emerald-900/40" : "bg-slate-950 border-slate-850"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-widest">PASSO 2</span>
                    <span className={`text-[8.5px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                      confirmCheckbox ? "bg-emerald-900 text-emerald-350" : "bg-slate-800 text-slate-500"
                    }`}>
                      {confirmCheckbox ? "CONFIRMADO" : "AGUARDANDO"}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" /> Declaração de Guarda
                  </h4>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Confirme que o arquivo baixado no Passo 1 foi salvo e está em local seguro (servidor do armazém, e-mail, HD ou drive em nuvem).
                  </p>
                </div>

                <div className="pt-2">
                  <label className="flex items-start gap-2.5 p-2 bg-slate-900/60 rounded-lg border border-slate-800 cursor-pointer text-[10px] text-slate-350 hover:text-white transition-all select-none">
                    <input
                      type="checkbox"
                      disabled={!backupDone}
                      checked={confirmCheckbox}
                      onChange={(e) => setConfirmCheckbox(e.target.checked)}
                      className="mt-0.5 rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 cursor-pointer disabled:opacity-50"
                    />
                    <span>Confirmo que baixei e salvei o Backup de forma segura e permanente.</span>
                  </label>
                </div>
              </div>

              {/* Step 3 */}
              <div className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-colors ${
                backupDone && confirmCheckbox ? "bg-amber-950/10 border-amber-900/40" : "bg-slate-950/40 border-slate-850 opacity-60"
              }`}>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-widest">PASSO 3</span>
                    <span className="text-[8.5px] font-mono px-2 py-0.5 bg-rose-950 text-rose-400 rounded font-bold uppercase">
                      CRÍTICO
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" /> Reset e Reinício de Ciclo
                  </h4>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed">
                    Zera todas as transações, vales e devoluções de uma só vez do local e da nuvem. O quadro de Gestores, Motoristas e Setores ativos NÃO será apagado.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="space-y-1">
                    <span className="text-[9px] text-slate-400 font-mono block">DIGITE COM CONFIRMAÇÃO PARA LIBERAR:</span>
                    <input
                      type="text"
                      disabled={!backupDone || !confirmCheckbox}
                      value={confirmInputText}
                      onChange={(e) => setConfirmInputText(e.target.value)}
                      placeholder="ZERAR-SSTR"
                      className="w-full text-center px-2 py-1 bg-slate-950 border border-slate-800 focus:border-rose-900 text-[10.5px] text-slate-200 font-mono rounded focus:outline-none uppercase placeholder:text-slate-705"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleResetAnnualCycle}
                    disabled={!backupDone || !confirmCheckbox || confirmInputText.trim().toUpperCase() !== "ZERAR-SSTR"}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-850 text-white disabled:text-slate-500 font-mono text-[10px] font-extrabold rounded-lg cursor-pointer disabled:cursor-not-allowed transition-all uppercase tracking-wide flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Zerar Ciclos do SSTR</span>
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {false && activeSubTab === "criar_solicitacao" && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6 text-left animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-2">
            <div>
              <h3 className="font-bold text-sm font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                Gerar Nova Solicitação (Supervisor)
              </h3>
              <p className="text-[11px] text-slate-400 font-sans mt-1">
                Utilize este painel para registrar manualmente trocas, devoluções, inversões e faltas diretamente no sistema, simulando a visão de campo.
              </p>
            </div>
            <div className="text-[10px] bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-slate-400 font-mono flex items-center gap-1.5 self-start">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              MODO SUPERVISOR ATIVO
            </div>
          </div>

          <form onSubmit={handleCreateRequestSubmit} className="space-y-6">
            
            {/* Bloco 1: Setor, NF e Dados Operacionais */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-mono font-extrabold text-slate-350 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                1. Identificação e Informações Fiscais
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Setor Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Setor / RN Representante <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={reqSetor}
                    onChange={(e) => setReqSetor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    required
                  >
                    <option value="">-- Selecione o Setor --</option>
                    {repsArray.map((rep) => (
                      <option key={rep.setor} value={rep.setor}>
                        Setor {rep.setor} - {rep.nome} ({rep.gv})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nota Fiscal */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Número da Nota Fiscal (NF) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 85215"
                    value={reqNf}
                    onChange={(e) => setReqNf(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Mapa de Carga */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Número do Mapa de Carga {(reqMotiveType === "Inversão" || reqMotiveType.includes("Falta")) ? <span className="text-amber-500">*</span> : "(Opcional)"}
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 50412"
                    value={reqMapa}
                    onChange={(e) => setReqMapa(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Código NB */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Código NB (Cliente) {(reqMotiveType === "Inversão" || reqMotiveType.includes("Falta")) ? <span className="text-amber-500">*</span> : "(Opcional)"}
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 485120"
                    value={reqNb}
                    onChange={(e) => setReqNb(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Motorista */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Motorista de Distribuição
                  </label>
                  <select
                    value={reqMotorista}
                    onChange={(e) => setReqMotorista(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Selecione o Motorista --</option>
                    {crewList.filter(c => c.cargo.includes("MOTORISTA")).map((crew) => (
                      <option key={crew.cpf} value={crew.nome}>
                        {crew.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ajudante 1 */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Ajudante 1
                  </label>
                  <select
                    value={reqAjudante1}
                    onChange={(e) => setReqAjudante1(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Selecione Ajudante 1 --</option>
                    {crewList.filter(c => c.cargo.includes("AJUDANTE")).map((crew) => (
                      <option key={crew.cpf} value={crew.nome}>
                        {crew.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ajudante 2 */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-450 uppercase font-mono block">
                    Ajudante 2
                  </label>
                  <select
                    value={reqAjudante2}
                    onChange={(e) => setReqAjudante2(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Selecione Ajudante 2 --</option>
                    {crewList.filter(c => c.cargo.includes("AJUDANTE")).map((crew) => (
                      <option key={crew.cpf} value={crew.nome}>
                        {crew.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Bloco 2: Tipo de Ocorrência / Motivo */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-mono font-extrabold text-slate-350 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                2. Motivo / Natureza da Ocorrência
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { value: "Produto Avariado", label: "🛠️ Avariado" },
                  { value: "Falta no SKU", label: "📦 Falta no SKU" },
                  { value: "Falta de SKU Completo", label: "🚨 Falta SKU Compl." },
                  { value: "Inversão", label: "🔄 Inversão" },
                  { value: "Outros", label: "📝 Outros" }
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setReqMotiveType(item.value);
                      setError(null);
                    }}
                    className={`py-2 px-2 border text-[10.5px] font-mono rounded-xl transition-all cursor-pointer font-bold ${
                      reqMotiveType === item.value
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-950/40"
                        : "bg-slate-950 border-slate-850 text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {reqMotiveType === "Outros" && (
                <div className="space-y-1 animate-fade-in">
                  <label className="text-[9px] text-slate-500 font-mono block">
                    Digite o motivo personalizado (Obrigatório):
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Atraso de entrega, erro de setor..."
                    value={reqMotiveText}
                    onChange={(e) => setReqMotiveText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              )}

              {reqMotiveType === "Inversão" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950 border border-slate-850 rounded-xl animate-fade-in">
                  {/* Produto que deve ir */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-extrabold text-amber-500 uppercase font-mono block">
                      👉 Produto que deve Ir (Entregar) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 4125 ou Skol"
                      value={reqInversaoIr}
                      onChange={(e) => {
                        setReqInversaoIr(e.target.value);
                        setShowIrSuggestions(true);
                      }}
                      onFocus={() => setShowIrSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowIrSuggestions(false), 200)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none"
                    />
                    {showIrSuggestions && irSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-amber-500/50 rounded-xl shadow-2xl max-h-[160px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-850">
                        {irSuggestions.map((prod) => (
                          <button
                            key={prod.codigo}
                            type="button"
                            onClick={() => {
                              setReqInversaoIr(`#${prod.codigo} - ${prod.descricao}`);
                              setShowIrSuggestions(false);
                            }}
                            className="w-full text-left p-2 hover:bg-amber-950/30 text-slate-200 flex flex-col cursor-pointer transition-colors"
                          >
                            <span className="font-bold text-amber-400">#{prod.codigo}</span>
                            <span className="text-slate-350 text-[8.5px]">{prod.descricao}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Produto que deve ser recolhido */}
                  <div className="space-y-1 relative">
                    <label className="text-[9px] font-extrabold text-indigo-400 uppercase font-mono block">
                      👈 Produto que deve ser recolhido (Recolher) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 4126 ou Stella"
                      value={reqInversaoRecolher}
                      onChange={(e) => {
                        setReqInversaoRecolher(e.target.value);
                        setShowRecolherSuggestions(true);
                      }}
                      onFocus={() => setShowRecolherSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowRecolherSuggestions(false), 200)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
                    />
                    {showRecolherSuggestions && recolherSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-indigo-500/50 rounded-xl shadow-2xl max-h-[160px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-850">
                        {recolherSuggestions.map((prod) => (
                          <button
                            key={prod.codigo}
                            type="button"
                            onClick={() => {
                              setReqInversaoRecolher(`#${prod.codigo} - ${prod.descricao}`);
                              setShowRecolherSuggestions(false);
                            }}
                            className="w-full text-left p-2 hover:bg-indigo-950/30 text-slate-200 flex flex-col cursor-pointer transition-colors"
                          >
                            <span className="font-bold text-indigo-400">#{prod.codigo}</span>
                            <span className="text-slate-350 text-[8.5px]">{prod.descricao}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 3: Adição de Itens / SKUs */}
            <div className="space-y-3 bg-slate-950/30 p-4 border border-slate-850 rounded-2xl">
              <h4 className="text-[11px] font-mono font-extrabold text-slate-350 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                3. Adicionar SKU de Produto à Lista
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* SKU Code */}
                <div className="md:col-span-8 space-y-1 relative">
                  <label className="text-[9px] text-slate-450 font-mono block">
                    Código SKU ou Nome do Produto
                  </label>
                  <input
                    type="text"
                    placeholder="Digite código (Ex: 4125) ou termo de busca"
                    value={reqItem}
                    onChange={(e) => {
                      setReqItem(e.target.value);
                      setShowItemSuggestions(true);
                    }}
                    onFocus={() => setShowItemSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  {showItemSuggestions && itemSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-emerald-500/50 rounded-xl shadow-2xl max-h-[150px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-850">
                      {itemSuggestions.map((prod) => (
                        <button
                          key={prod.codigo}
                          type="button"
                          onClick={() => {
                            setReqItem(prod.codigo);
                            setShowItemSuggestions(false);
                          }}
                          className="w-full text-left p-2 hover:bg-emerald-950/30 text-slate-200 flex flex-col cursor-pointer transition-colors"
                        >
                          <span className="font-bold text-emerald-400">#{prod.codigo} - {prod.descricao}</span>
                          <span className="text-slate-500 text-[8px]">Fator: {prod.fatorHecto} HL</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quantidade */}
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[9px] text-slate-450 font-mono block">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    value={reqQuantidade}
                    onChange={(e) => setReqQuantidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Button to Add */}
                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddReqDraftItem}
                    className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-850 border border-slate-850 hover:border-slate-750 text-slate-200 font-mono text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer font-bold transition-all"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Items Table inside creation form */}
              {reqDraftItems.length > 0 && (
                <div className="mt-4 border border-slate-850 rounded-xl overflow-hidden bg-slate-950 font-mono">
                  <div className="p-2.5 bg-slate-900 text-slate-400 text-[9px] font-bold uppercase tracking-wider border-b border-slate-850">
                    SKUs Adicionados para Envio ({reqDraftItems.length})
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-slate-950 text-slate-550 border-b border-slate-900 uppercase text-[8.5px]">
                          <th className="p-2.5">CÓDIGO SKU</th>
                          <th className="p-2.5">PRODUTO DESCRITIVO</th>
                          <th className="p-2.5">QTD (CXS)</th>
                          <th className="p-2.5">HL TOTAL</th>
                          <th className="p-2.5">MOTIVO</th>
                          <th className="p-2.5 text-center">AÇÕES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {reqDraftItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-900/40 text-slate-300">
                            <td className="p-2.5 font-bold text-emerald-450">#{item.itemCode}</td>
                            <td className="p-2.5 max-w-xs truncate">{item.itemDesc}</td>
                            <td className="p-2.5 font-extrabold">{item.quantidade}</td>
                            <td className="p-2.5 text-amber-400 font-bold">{item.hectolitros.toFixed(4)} HL</td>
                            <td className="p-2.5 text-[9px] text-slate-400 truncate">{item.motivo}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveReqDraftItem(item.id)}
                                className="p-1 hover:bg-red-950/40 text-red-405 rounded-md transition-colors cursor-pointer"
                                title="Remover item da lista"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Footer */}
                  <div className="p-3 bg-slate-900/60 border-t border-slate-850 flex flex-col sm:flex-row justify-between items-center text-[10.5px] text-slate-400 gap-2 font-bold leading-relaxed">
                    <div>
                      Hectolitros Acumulados: <span className="text-amber-500 text-xs font-extrabold">{reqDraftItems.reduce((acc, curr) => acc + curr.hectolitros, 0).toFixed(4)} HL</span>
                    </div>
                    <div>
                      Valor Estimado: <span className="text-emerald-450 text-xs font-extrabold">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          reqDraftItems.reduce((sum, item) => sum + (98.50 * item.quantidade), 0)
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 4: Foto e Comprovantes */}
            <div className="space-y-3">
              <h4 className="text-[11px] font-mono font-extrabold text-slate-350 uppercase tracking-widest border-l-2 border-emerald-500 pl-2">
                4. Foto / Comprovante Digital
              </h4>

              {reqMotiveType === "Falta de SKU Completo" ? (
                <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-emerald-200 text-xs leading-relaxed space-y-1">
                  <p className="font-extrabold">💡 SEM OBRIGATORIEDADE DE FOTO PARA FALTA DE SKU COMPLETO</p>
                  <p className="text-[10.5px] text-emerald-350">
                    Como o item não existe fisicamente na carga para ser fotografado, não é necessário anexar foto ou comprovante para registrar este tipo de falta. O campo foi liberado.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 border border-slate-850 p-4 bg-slate-950/40 rounded-xl text-left">
                  <label className="text-[10px] font-bold text-slate-400 block font-mono">
                    Foto da Avaria ou Imagem de Canhoto / Documento <span className="text-red-500">*</span>
                  </label>
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    {reqFotoUrl ? (
                      <div className="flex flex-col items-center gap-2 bg-slate-950 border border-slate-850 p-3 rounded-lg max-w-xs w-full font-mono">
                        <img
                          src={reqFotoUrl}
                          alt="Prévia selecionada"
                          className="h-24 object-contain rounded border border-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => setReqFotoUrl("")}
                          className="px-2 py-1 bg-red-950 text-red-400 text-[9px] font-bold rounded hover:bg-red-900 transition-colors cursor-pointer"
                        >
                          Remover Foto
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col justify-center border-2 border-dashed border-slate-850 hover:border-slate-700 bg-slate-950 p-6 rounded-xl text-center">
                        <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <span className="text-xs font-bold text-slate-300">Escolha uma Imagem do Computador</span>
                        <span className="text-[9px] text-slate-500 font-mono mt-1">Formatos suportados: PNG, JPG (Max 2MB)</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageCaptureInForm}
                          className="hidden"
                          id="manager-photo-upload"
                        />
                        <label
                          htmlFor="manager-photo-upload"
                          className="mt-3 px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 text-[10px] font-bold font-mono rounded-lg cursor-pointer max-w-xs mx-auto active:scale-95 transition-all text-center"
                        >
                          Selecionar Arquivo
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bloco 5: Observações */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase font-mono block">
                Observações Complementares (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Nota fiscal veio com sobra física de outro produto, motorista relata que..."
                value={reqObservacao}
                onChange={(e) => setReqObservacao(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Botão Submeter */}
            <div className="pt-3 border-t border-slate-850 flex justify-end">
              <button
                type="submit"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-mono text-xs font-extrabold rounded-xl shadow-xl shadow-emerald-950/20 flex items-center gap-2 cursor-pointer transition-all uppercase tracking-wider"
              >
                <PlusCircle className="w-4 h-4 text-emerald-100" />
                <span>Gerar e Transmitir Solicitação</span>
              </button>
            </div>
            
          </form>
        </div>
      )}

      {activeSubTab === "pdvs" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
          {/* Form on left (lg:col-span-5) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
            <h3 className="text-sm font-bold font-mono text-white border-b border-slate-800 pb-2 uppercase tracking-wide flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" />
              {editingPdvCode ? `Editar PDV #${editingPdvCode}` : "Cadastrar Novo PDV (NB)"}
            </h3>
            
            <form onSubmit={handleRegisterPdv} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Código SSTR (NB) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 5000"
                  value={pdvCode}
                  onChange={(e) => setPdvCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Razão Social <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ex: DAVI DOMINGOS DA SILVA"
                  value={pdvRazaoSocial}
                  onChange={(e) => setPdvRazaoSocial(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Nome Fantasia <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Conv Gratidao"
                  value={pdvNomeFantasia}
                  onChange={(e) => setPdvNomeFantasia(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono block">Município <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Ex: GUARABIRA"
                  value={pdvMunicipio}
                  onChange={(e) => setPdvMunicipio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {editingPdvCode ? (
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg shadow-indigo-950/20 cursor-pointer transition-all uppercase tracking-wider"
                  >
                    Salvar Alterações
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPdvCode("");
                      setPdvRazaoSocial("");
                      setPdvNomeFantasia("");
                      setPdvMunicipio("");
                      setEditingPdvCode(null);
                    }}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white font-sans font-semibold text-xs rounded-xl transition-colors cursor-pointer text-center block"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold rounded-xl shadow-lg shadow-indigo-950/20 cursor-pointer transition-all uppercase tracking-wider"
                >
                  Cadastrar / Atualizar PDV
                </button>
              )}
            </form>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-3 text-slate-500 font-mono text-[9px] uppercase tracking-wider">Ou Importar por Arquivo</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handlePdvImportFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200 cursor-pointer ${
                dragActive 
                  ? "border-indigo-500 bg-indigo-950/20" 
                  : "border-slate-800 bg-slate-950/30 hover:bg-slate-950/60 hover:border-slate-700"
              }`}
              onClick={() => {
                const fileInput = document.getElementById("pdv-csv-file-input");
                if (fileInput) fileInput.click();
              }}
            >
              <input
                id="pdv-csv-file-input"
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handlePdvImportFile(e.target.files[0]);
                  }
                }}
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="p-2 bg-slate-950 border border-slate-850 rounded-lg text-slate-400">
                  <Upload className="w-5 h-5 text-indigo-400 animate-pulse" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-200">
                    Arrastar e Soltar Arquivo (CSV/TXT)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    ou clique aqui para selecionar o documento
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-850/50 w-full text-[8px] text-slate-500 font-mono leading-tight">
                  Formato: CdPDV;Documento;NomeFantasia;RazoSocial;Endereo;Complemento;Bairro;Cidade;UF;CEP
                </div>
              </div>
            </div>
          </div>

          {/* List on right (lg:col-span-7) */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wide flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" /> PDVs Cadastrados no Sistema
              </h3>
              <div className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-850 px-2 py-1 rounded">
                Total: {Object.keys(pdvDb).length}
              </div>
            </div>

            {/* Search filter bar */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por NB, Razão Social, Fantasia ou Cidade..."
                value={searchPdv}
                onChange={(e) => setSearchPdv(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto border border-slate-850 rounded-xl font-sans text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase border-b border-slate-850">
                    <th className="p-3">NB</th>
                    <th className="p-3">RAZÃO SOCIAL / FANTASIA</th>
                    <th className="p-3">MUNICÍPIO</th>
                    <th className="p-3 text-center">AÇÃO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredPdvs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500 font-mono text-xs">
                        Nenhum PDV correspondente encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredPdvs.slice(0, 100).map((pdv: any) => {
                      const isCustom = customPdvKeys.has(pdv.codigo);
                      return (
                        <tr key={pdv.codigo} className="hover:bg-slate-850/30 text-slate-350">
                          <td className="p-3 font-mono font-bold text-white text-xs">{pdv.codigo}</td>
                          <td className="p-3 space-y-0.5">
                            <p className="font-bold text-slate-200 uppercase text-xs">{pdv.razaoSocial}</p>
                            <p className="text-[10px] text-slate-400 font-mono uppercase">{pdv.nomeFantasia}</p>
                          </td>
                          <td className="p-3 text-slate-300 font-mono uppercase text-[11px]">{pdv.municipio}</td>
                           <td className="p-3 text-center">
                            <div className="inline-flex items-center gap-1.5 justify-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPdvCode(pdv.codigo);
                                  setPdvCode(pdv.codigo);
                                  setPdvRazaoSocial(pdv.razaoSocial);
                                  setPdvNomeFantasia(pdv.nomeFantasia);
                                  setPdvMunicipio(pdv.municipio);
                                }}
                                className="p-1.5 bg-slate-950 text-slate-400 hover:text-indigo-400 border border-slate-850 hover:border-slate-800 rounded-lg transition-colors cursor-pointer"
                                title="Editar dados do PDV"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {isCustom ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomPdv(pdv.codigo)}
                                  className="p-1.5 bg-rose-950/20 text-rose-400 border border-rose-900/30 hover:bg-rose-900 hover:text-white rounded-lg transition-colors cursor-pointer"
                                  title="Excluir PDV Cadastrado"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span className="text-[9px] font-mono text-slate-500 bg-slate-950 px-1.5 py-1 rounded border border-slate-850/60 select-none">
                                  Padrão
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {filteredPdvs.length > 100 && (
              <p className="text-[10px] text-slate-500 italic text-center">Mostrando apenas os primeiros 100 resultados de {filteredPdvs.length}. Utilize a busca para refinar.</p>
            )}
          </div>
        </div>
      )}

      {false && activeSubTab === "espelho" && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4 text-left">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div className="space-y-1">
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" /> Espelho de Reposições e Trocas Aprovadas
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Consulte e imprima a lista consolidada de todas as anomalias e devoluções homologadas e liquidadas ("cadastradas") na data de referência.
              </p>
            </div>
            <button
              onClick={() => setIsPrintingEspelho(true)}
              disabled={espelhoFiltrado.length === 0}
              className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all flex items-center gap-2 uppercase tracking-wider shadow-md ${
                espelhoFiltrado.length === 0
                  ? "bg-slate-800 text-slate-600 border border-slate-850 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/25 cursor-pointer hover:scale-[1.02] active:scale-95"
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Espelho</span>
            </button>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/40 p-4 border border-slate-850 rounded-xl items-end">
            <div className="md:col-span-4 space-y-1">
              <label className="text-[10px] text-slate-400 font-mono block">Data de Referência (Aprovação/Cadastro)</label>
              <input
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                onChange={(e) => {
                  if (e.target.value) {
                    const [year, month, day] = e.target.value.split("-");
                    setFilterEspelhoDate(`${day}/${month}/${year}`);
                  } else {
                    setFilterEspelhoDate(new Date().toLocaleDateString("pt-BR"));
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-8 space-y-1">
              <label className="text-[10px] text-slate-400 font-mono block">Filtrar por palavras-chave</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar por NB, Cliente, Produto, Cidade..."
                  value={searchEspelho}
                  onChange={(e) => setSearchEspelho(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 font-sans focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-950 font-sans text-xs">
            <div className="p-3 bg-slate-900/60 border-b border-slate-850 flex justify-between items-center text-[10.5px] font-mono text-slate-400">
              <span>Registros encontrados na data <strong className="text-white font-bold">{filterEspelhoDate}</strong>:</span>
              <span className="font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-900/40 px-2 py-0.5 rounded">{espelhoFiltrado.length} Reposições</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 text-[10px] font-bold uppercase border-b border-slate-850">
                    <th className="p-3">NB</th>
                    <th className="p-3">CLIENTE / CIDADE</th>
                    <th className="p-3">PRODUTO (SKU)</th>
                    <th className="p-3 text-center">QUANTIDADE</th>
                    <th className="p-3">MAPA / NF</th>
                    <th className="p-3">CANAL</th>
                    <th className="p-3">HORÁRIO APROV.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {espelhoFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500 font-mono text-xs italic">
                        Nenhuma reposição/troca foi localizada com o status "Aprovada/Cadastrada" para a data {filterEspelhoDate}.
                      </td>
                    </tr>
                  ) : (
                    espelhoFiltrado.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-850/20 text-slate-350">
                        <td className="p-3 font-mono font-bold text-white text-xs">{item.nb}</td>
                        <td className="p-3 space-y-0.5 uppercase">
                          <p className="font-bold text-slate-200 text-xs">{item.razaoSocial}</p>
                          <div className="flex gap-2 items-center text-[10px]">
                            <span className="text-slate-400 font-mono">{item.nomeFantasia}</span>
                            <span className="text-slate-500">•</span>
                            <span className="text-emerald-450 font-semibold">{item.municipio}</span>
                          </div>
                        </td>
                        <td className="p-3 uppercase">
                          <p className="font-bold text-slate-300">{item.productDesc}</p>
                          <p className="text-[10px] text-slate-500 font-mono">SKU: #{item.productCode}</p>
                        </td>
                        <td className="p-3 text-center font-extrabold text-white text-sm font-mono">{item.quantidade}</td>
                        <td className="p-3 font-mono text-[10.5px]">
                          <p className="text-slate-300">NF: {item.nf || "N/A"}</p>
                          <p className="text-slate-500 text-[9px]">MAPA: {item.mapa || "N/A"}</p>
                        </td>
                        <td className="p-3 font-mono text-[10.5px] text-indigo-400 font-semibold uppercase">{item.solicitante}</td>
                        <td className="p-3 text-slate-400 font-mono text-[10.5px]">
                          {item.cadastroDate ? item.cadastroDate.split(" ")[1] || "---" : "---"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Safety operations help cards */}
      <div className="bg-slate-900/45 p-4 rounded-xl border border-slate-850 text-slate-400 font-mono text-[10px] space-y-1.5 leading-relaxed text-left">
        <span className="font-bold text-slate-200 block uppercase font-sans text-[9px] tracking-wide mb-1 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400" /> Notas de Sincronização Local:
        </span>
        <p>1. Todas as alterações efetuadas em motoristas, ajudantes e representantes são salvas em tempo-real no navegador, e atualizam campos retroativos imediatamente.</p>
        <p>2. Os CPFs cadastrados para os motoristas e ajudantes serão sugeridos automaticamente durante o preenchimento de vales físicos de faturamento.</p>
        <p>3. A exclusão de um setor remove as restrições e visualizações referentes a esse canal no Portal do Representante.</p>
      </div>
    </div>
  );
}
