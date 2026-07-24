import React, { useState, useMemo, useEffect } from "react";
import { ExchangeRecord, REPRESENTATIVOS_SETOR, PendingRequest, MOTORISTAS_ROTAS, getRepresentativosSetor, clearRepresentativosCache, getMotoristasRotas, clearMotoristasRotasCache, RouteDriverInfo } from "../types";
import { getApiUrl } from "../utils/apiUrl";
import { useSstrData } from "../context/SstrDataContext";
import { PRODUCT_DATABASE, ProductInfo, calculateHectolitros } from "../data/products";
import { getPdvDatabase } from "../data/pdvData";
import { 
  Search, 
  ChevronRight, 
  Hash, 
  DollarSign, 
  CheckCircle, 
  RefreshCw, 
  AlertTriangle, 
  ArrowLeft, 
  Info, 
  PlusCircle, 
  Clock, 
  Camera, 
  FileCheck, 
  AlertCircle, 
  List, 
  FileText, 
  UploadCloud,
  CheckCircle2,
  Trash2,
  Share2,
  Download,
  Printer,
  FileImage,
  User,
  Calendar,
  Copy,
  FolderOpen
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import PauBrasilLogo from "./PauBrasilLogo";
import { exportRegistrationPdf, generatePdfFilename, NETWORK_REGISTROS_PATH } from "../utils/pdfGenerator";

interface RepresentativePortalProps {
  records: ExchangeRecord[];
  onTransferApprovedRequest?: (newRecord: ExchangeRecord | ExchangeRecord[]) => void;
}

// Helper function to compress large camera raw images into ultra-lightweight JPEG Base64
const compressImage = (file: File, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Falha ao ler o arquivo PDF."));
        }
      };
      reader.onerror = () => reject(new Error("Erro de leitura do arquivo PDF."));
      reader.readAsDataURL(file);
      return;
    }

    // Optimized memory footprint using URL.createObjectURL instead of loading raw data in memory as a giant Base64 string first
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
    } catch (e) {
      // Fallback to FileReader if createObjectURL is not supported
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(event.target?.result as string);
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            canvas.width = 0;
            canvas.height = 0;
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => {
          reject(new Error("Mídia inválida ou arquivo corrompido. Selecione outra imagem."));
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        reject(new Error("Erro ao carregar os dados brutos da mídia."));
      };
      reader.readAsDataURL(file);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Constrain size to prevent memory crash on mobile devices
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          reject(new Error("Não foi possível processar a imagem (falha no canvas)."));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        
        // Clean up memory
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        
        // Free up memory references
        canvas.width = 0;
        canvas.height = 0;
        
        resolve(dataUrl);
      } catch (err) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Este formato de imagem não é suportado pelo celular, tente outra foto."));
    };
    img.src = objectUrl;
  });
};

export default function RepresentativePortal({ records, onTransferApprovedRequest }: RepresentativePortalProps) {
  const { pendingRequests, savePendingRequest, deletePendingRequest, repsList, motoristasList } = useSstrData();
  // Helper to get solicitation number of any pending request
  const getSolicitacaoNum = (req: PendingRequest): string => {
    return (req as any).solicitacao || req.id.replace(/\D/g, "").slice(-8) || String(req.timestamp || Date.now()).slice(-8);
  };

  // Helper to group pending requests by solicitation number
  const groupPendingRequests = (reqList: PendingRequest[]) => {
    const groups: { [solicitacao: string]: PendingRequest[] } = {};
    reqList.forEach(req => {
      const key = getSolicitacaoNum(req);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(req);
    });
    return Object.values(groups);
  };

  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [roleContext, setRoleContext] = useState<"rn" | "rota">("rn");
  
  // Tabs within a selected sector: "historico" | "novo" | "pendentes" | "aprovadas"
  const [sectorTab, setSectorTab] = useState<"historico" | "novo" | "pendentes" | "aprovadas">("historico");
  
  // Search / Details inside historical records
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [selectedRecord, setSelectedRecord] = useState<ExchangeRecord | null>(null);
  const [selectedApprovedDetail, setSelectedApprovedDetail] = useState<PendingRequest | null>(null);

  // Receipt State
  const [receiptRequest, setReceiptRequest] = useState<PendingRequest | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState<boolean>(false);

  const shareToWhatsApp = (req: PendingRequest) => {
    // Determine client name
    const clientDb = getPdvDatabase();
    const clientInfo = clientDb[req.nb.trim()];
    const clientName = clientInfo ? clientInfo.nomeFantasia : `Parceiro NB: ${req.nb}`;
    
    // Format items
    let itemsText = "";
    if (req.items && req.items.length > 0) {
      itemsText = req.items.map(subItem => {
        const desc = subItem.descricao || PRODUCT_DATABASE.find(p => p.codigo === subItem.item)?.descricao || "Produto";
        return `• ${subItem.quantidade} cx - ${subItem.item} - ${desc} (Motivo: ${subItem.motivo || req.motivo})`;
      }).join("\n");
    } else {
      const desc = PRODUCT_DATABASE.find(p => p.codigo === req.item)?.descricao || "Produto";
      itemsText = `• ${req.quantidade} cx - ${req.item} - ${desc} (Motivo: ${req.motivo || "Avaria"})`;
    }

    const text = `*SSTR - RECIBO DE SOLICITAÇÃO* 📄\n` +
      `*Pau Brasil Guarabira*\n\n` +
      `*Protocolo:* #${req.id.replace("pending_req_", "")}\n` +
      `*Data:* ${req.data}\n` +
      `*NF-e:* ${req.nf || "NÃO CONSTA"}\n` +
      `*Setor/Rota:* ${req.setor}\n\n` +
      `*PDV (Cliente):* ${clientName}\n` +
      `*NB:* ${req.nb}\n` +
      `*Endereço:* ${clientInfo ? `${clientInfo.endereco}, ${clientInfo.bairro}, ${clientInfo.municipio}` : "Não Consta"}\n\n` +
      `*Itens Solicitados:*\n${itemsText}\n\n` +
      `*SSTR Soluções de Trocas e Reposições*`;

    const encodedText = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encodedText}`;
    window.open(url, "_blank");
  };

  const downloadReceiptPdf = async (req: PendingRequest) => {
    const element = document.getElementById(`receipt-thermal-content-${req.id}`);
    if (!element) return;
    setGeneratingReceipt(true);
    try {
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      const filename = `recibo_sstr_nf_${req.nf !== "NÃO CONSTA" ? req.nf : req.id}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Ocorreu um erro ao gerar o PDF do recibo.");
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const downloadReceiptJpg = async (req: PendingRequest) => {
    const element = document.getElementById(`receipt-thermal-content-${req.id}`);
    if (!element) return;
    setGeneratingReceipt(true);
    try {
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `recibo_sstr_nf_${req.nf !== "NÃO CONSTA" ? req.nf : req.id}.jpg`;
      link.click();
    } catch (err) {
      console.error("Erro ao gerar JPG:", err);
      alert("Ocorreu um erro ao gerar o JPG do recibo.");
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const shareReceipt = async (req: PendingRequest) => {
    const element = document.getElementById(`receipt-thermal-content-${req.id}`);
    if (!element) return;
    setGeneratingReceipt(true);
    try {
      const canvas = await html2canvas(element, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setGeneratingReceipt(false);
          return;
        }
        const file = new File([blob], `recibo_sstr_nf_${req.nf !== "NÃO CONSTA" ? req.nf : req.id}.jpg`, { type: "image/jpeg" });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `Recibo SSTR - NF ${req.nf !== "NÃO CONSTA" ? req.nf : req.id}`,
              text: `Olá! Segue o recibo de finalização da solicitação SSTR correspondente à NF-e: ${req.nf}.`
            });
          } catch (shareErr) {
            console.error("Erro de compartilhamento:", shareErr);
          }
        } else {
          // Fallback download if cannot share
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `recibo_sstr_nf_${req.nf !== "NÃO CONSTA" ? req.nf : req.id}.jpg`;
          link.click();
          alert("Compartilhamento nativo não suportado. O recibo foi baixado como imagem para que você possa enviar manualmente.");
        }
        setGeneratingReceipt(false);
      }, "image/jpeg", 0.95);
    } catch (err) {
      console.error("Erro ao preparar compartilhamento:", err);
      alert("Erro ao preparar o recibo para compartilhamento.");
      setGeneratingReceipt(false);
    }
  };

  // Grouped selected record for historical detail
  const selectedRecordGroup = useMemo(() => {
    if (!selectedRecord) return [];
    return records.filter(r => r.solicitacao === selectedRecord.solicitacao && r.setorVenda === selectedRecord.setorVenda);
  }, [selectedRecord, records]);

  // Transfers an approved pending request into a complete, audit-ready consolidated ExchangeRecord and moves it to the main database
  const handleTransferToConsolidatedBase = (req: PendingRequest) => {
    if (!onTransferApprovedRequest) return;

    // Retrieve historical references of client code or product for maximum data realism
    const matchingClientRecord = records.find(r => (r.codigoCliente || "").trim() === (req.nb || "").trim());
    const clientNameVal = matchingClientRecord ? matchingClientRecord.nomeCliente : `Parceiro Comercial (NB: ${req.nb})`;
    const unbVal = matchingClientRecord ? matchingClientRecord.unb : "03";
    const unbDescVal = matchingClientRecord ? matchingClientRecord.descricaoUnb : "PAU BRASIL GUARABIRA";

    const isRouteValue = req.setor.toUpperCase().startsWith("R");
    const representativeInfo = repsList[req.setor];
    const driverTuple = motoristasList[req.setor as keyof typeof motoristasList];
    const driveName = isRouteValue && driverTuple ? driverTuple.nome : (representativeInfo ? representativeInfo.nome : "Motorista de Rota SSTR");

    let finalRecordsToSubmit: ExchangeRecord[] = [];

    if (!req.items || req.items.length === 0) {
      // Legacy / Fallback version with single item
      const productMatch = PRODUCT_DATABASE.find(p => p.codigo === req.item);
      const matchedProdDesc = productMatch ? productMatch.descricao : "Produto SSTR Reposição";
      
      const matchingProductRecord = records.find(r => r.produto === req.item);
      const unitPrice = productMatch && productMatch.valor !== undefined && productMatch.valor > 0
        ? productMatch.valor
        : (matchingProductRecord && matchingProductRecord.valorUnitario > 0 ? matchingProductRecord.valorUnitario : 98.50);
      const totalPrice = Number((unitPrice * (req.quantidade || 1)).toFixed(2));

      const newExchange: ExchangeRecord = {
        id: `approved_transferred_${req.id}_${Date.now()}`,
        unb: unbVal,
        descricaoUnb: unbDescVal,
        codigoCliente: req.nb,
        nomeCliente: clientNameVal,
        solicitacao: req.id.replace(/\D/g, "").slice(-8) || String(Date.now()).slice(-8),
        tipo: "TROCA FISICA CR",
        dataSolicitacao: req.data.split(" às ")[0],
        hora: req.data.split(" às ")[1] || "08:15",
        status: "Aproveitável / Lançada",
        dataAcao: req.cadastroDate ? req.cadastroDate.split(" ")[0] : new Date().toLocaleDateString("pt-BR"),
        usuarioAcao: req.cadastroUser || "Controle Promax",
        mapa: req.mapa || "SSTR-M",
        nf: req.nf,
        statusNf: "CADASTRADA NO PROMAX",
        produto: req.item || "",
        descricaoProduto: matchedProdDesc,
        quantidade: req.quantidade || 1,
        um: "CX",
        valorUnitario: unitPrice,
        valorTotal: totalPrice,
        justificativa: req.motivo || "Produto Avariado",
        fatorHecto: req.fatorHecto || 0,
        hectolitros: req.hectolitros || 0,
        
        veiculo: isRouteValue ? "CAMINHÃO M-DISTRIBUIÇÃO" : "VETOR DE ROTA",
        placa: isRouteValue ? "KFT-0100" : "SSTR-0200",
        transportadora: "05",
        nomeTransportadora: "PAU BRASIL DISTRIBUIDORA",
        motorista: req.setor,
        nomeMotorista: driveName,
        conferente: "SSTR-CONFERE",
        conferenteCarregamento: "SSTR-CONFERE",
        nrPedidoReposicao: "100" + (req.nf || "000"),
        statusCheck: "Liberado",
        sistemaOrigem: "Portal de Campo SSTR",
        observacao: req.observacao || "Troca de Rota Processada",
        setorVenda: req.setor,
        importTimestamp: Date.now(),
        importBatchName: "Lançamento Portal de Campo"
      };

      finalRecordsToSubmit.push(newExchange);
    } else {
      // Create separate ExchangeRecords for each item in the multi-item list
      req.items.forEach((subItem, idx) => {
        const productMatch = PRODUCT_DATABASE.find(p => p.codigo === subItem.item);
        const matchedProdDesc = productMatch ? productMatch.descricao : (subItem.descricao || "Produto SSTR Reposição");
        
        const matchingProductRecord = records.find(r => r.produto === subItem.item);
        const unitPrice = productMatch && productMatch.valor !== undefined && productMatch.valor > 0
          ? productMatch.valor
          : (matchingProductRecord && matchingProductRecord.valorUnitario > 0 ? matchingProductRecord.valorUnitario : 98.50);
        const totalPrice = Number((unitPrice * subItem.quantidade).toFixed(2));

        let finalJust = subItem.motivo || "Produto Avariado";
        if (subItem.produtoAhEnviar) {
          finalJust += ` (Ir: ${subItem.produtoAhEnviar} / Recolher: ${subItem.produtoARecolher})`;
        }

        const newExchange: ExchangeRecord = {
          id: `approved_transferred_${req.id}_${subItem.item}_${idx}_${Date.now()}`,
          unb: unbVal,
          descricaoUnb: unbDescVal,
          codigoCliente: req.nb,
          nomeCliente: clientNameVal,
          solicitacao: req.id.replace(/\D/g, "").slice(-8) || String(Date.now()).slice(-8),
          tipo: "TROCA FISICA CR",
          dataSolicitacao: req.data.split(" às ")[0],
          hora: req.data.split(" às ")[1] || "08:15",
          status: "Aproveitável / Lançada",
          dataAcao: req.cadastroDate ? req.cadastroDate.split(" ")[0] : new Date().toLocaleDateString("pt-BR"),
          usuarioAcao: req.cadastroUser || "Controle Promax",
          mapa: req.mapa || "SSTR-M",
          nf: req.nf,
          statusNf: "CADASTRADA NO PROMAX",
          produto: subItem.item,
          descricaoProduto: matchedProdDesc,
          quantidade: subItem.quantidade,
          um: "CX",
          valorUnitario: unitPrice,
          valorTotal: totalPrice,
          justificativa: finalJust,
          fatorHecto: subItem.fatorHecto || 0,
          hectolitros: subItem.hectolitros || 0,
          
          veiculo: isRouteValue ? "CAMINHÃO M-DISTRIBUIÇÃO" : "VETOR DE ROTA",
          placa: isRouteValue ? "KFT-0100" : "SSTR-0200",
          transportadora: "05",
          nomeTransportadora: "PAU BRASIL DISTRIBUIDORA",
          motorista: req.setor,
          nomeMotorista: driveName,
          conferente: "SSTR-CONFERE",
          conferenteCarregamento: "SSTR-CONFERE",
          nrPedidoReposicao: "100" + (req.nf || "000"),
          statusCheck: "Liberado",
          sistemaOrigem: "Portal de Campo SSTR",
          observacao: req.observacao || "Troca de Rota Processada",
          setorVenda: req.setor,
          importTimestamp: Date.now(),
          importBatchName: "Lançamento Portal de Campo"
        };

        finalRecordsToSubmit.push(newExchange);
      });
    }

    // 1. Send all final exchange records (as an array)
    onTransferApprovedRequest(finalRecordsToSubmit);

    // 2. Remove the request from pending requests via SstrDataContext
    deletePendingRequest(req.id);

    // 3. Clear local overlay detail state
    setSelectedApprovedDetail(null);
    
    // 4. Alert user with accumulated stats
    const totalVolume = finalRecordsToSubmit.reduce((acc, curr) => acc + curr.hectolitros, 0);
    const totalFinanceValue = finalRecordsToSubmit.reduce((acc, curr) => acc + curr.valorTotal, 0);
    
    alert(`✨ Lançamento Concluído!\n\nA NF-e ${req.nf} com ${finalRecordsToSubmit.length} SKU(s) foi lançada com sucesso no banco consolidado geral.\n\nMétricas totais de faturamento e volume:\n- Valor Total: ${formatCurrency(totalFinanceValue)}\n- Volume Líquido: ${totalVolume.toFixed(4)} HL\n\nA visualização ativa deste setor continua limpa!`);
  };

  // New Request Form states
  const [formMapa, setFormMapa] = useState("");
  const [formNb, setFormNb] = useState("");
  const [formNf, setFormNf] = useState("");
  const [formItem, setFormItem] = useState("");
  const [formQuantidade, setFormQuantidade] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // States for inversion ("Inversão")
  const [formInversaoIr, setFormInversaoIr] = useState("");
  const [formInversaoRecolher, setFormInversaoRecolher] = useState("");
  const [formInversaoIrQtd, setFormInversaoIrQtd] = useState("");
  const [formInversaoRecolherQtd, setFormInversaoRecolherQtd] = useState("");
  const [showIrSuggestions, setShowIrSuggestions] = useState(false);
  const [showRecolherSuggestions, setShowRecolherSuggestions] = useState(false);

  // Multiple item draft queue for a single request
  const [draftItems, setDraftItems] = useState<any[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);

  // User-isolated drafts & smart recovery prompt states
  const [pendingDraftToRecover, setPendingDraftToRecover] = useState<any | null>(null);
  const [showDraftRecoveryModal, setShowDraftRecoveryModal] = useState<boolean>(false);
  const [createdPdfModalInfo, setCreatedPdfModalInfo] = useState<{ filename: string; fullPath: string } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Pre-calculate product demand ranking from consolidated records (User request)
  const productPopularity = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach(r => {
      const code = r.produto?.trim();
      if (code) {
        counts[code] = (counts[code] || 0) + 1;
      }
    });
    return counts;
  }, [records]);

  // Filter products by typed code or name with smart sorting: popularity when empty, alphabetical when typing
  const productSuggestions = useMemo(() => {
    const query = formItem.trim().toLowerCase();
    
    if (!query) {
      // Empty input: Return top 15 most popular products sorted by past demand descending
      return [...PRODUCT_DATABASE].sort((a, b) => {
        const popA = productPopularity[a.codigo] || 0;
        const popB = productPopularity[b.codigo] || 0;
        return popB - popA;
      }).slice(0, 15);
    }
    
    // Typing: Filter match and sort alphabetically by description
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(query) || p.descricao.toLowerCase().includes(query)
    ).sort((a, b) => {
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    }).slice(0, 15);
  }, [formItem, productPopularity]);

  // Try to find exact product details of what is currently written
  const matchedProduct = useMemo(() => {
    const query = formItem.trim().toLowerCase();
    if (!query) return null;
    return PRODUCT_DATABASE.find(p => p.codigo === query) || null;
  }, [formItem]);

  // Suggestions for Inversion
  const irProductSuggestions = useMemo(() => {
    const query = formInversaoIr.trim().toLowerCase();
    
    if (!query) {
      return [...PRODUCT_DATABASE].sort((a, b) => {
        const popA = productPopularity[a.codigo] || 0;
        const popB = productPopularity[b.codigo] || 0;
        return popB - popA;
      }).slice(0, 15);
    }
    
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(query) || p.descricao.toLowerCase().includes(query)
    ).sort((a, b) => {
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    }).slice(0, 15);
  }, [formInversaoIr, productPopularity]);

  const recolherProductSuggestions = useMemo(() => {
    const query = formInversaoRecolher.trim().toLowerCase();
    
    if (!query) {
      return [...PRODUCT_DATABASE].sort((a, b) => {
        const popA = productPopularity[a.codigo] || 0;
        const popB = productPopularity[b.codigo] || 0;
        return popB - popA;
      }).slice(0, 15);
    }
    
    return PRODUCT_DATABASE.filter(
      p => p.codigo.toLowerCase().includes(query) || p.descricao.toLowerCase().includes(query)
    ).sort((a, b) => {
      return a.descricao.localeCompare(b.descricao, "pt-BR");
    }).slice(0, 15);
  }, [formInversaoRecolher, productPopularity]);

  const [formFotoUrl, setFormFotoUrl] = useState("");
  const [formObservacao, setFormObservacao] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [formMotiveType, setFormMotiveType] = useState<string>("Produto Avariado");
  const [formMotiveText, setFormMotiveText] = useState("Produto Avariado");

  // WEBCAM INTERNA INTEGRADA (Corrige erro de RAM insuficiente nos celulares de motoristas/RNs)
  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [webcamFacingMode, setWebcamFacingMode] = useState<"user" | "environment">("environment");
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [isWebcamLoading, setIsWebcamLoading] = useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const startWebcam = async (mode: "user" | "environment" = "environment") => {
    setWebcamError(null);
    setIsWebcamLoading(true);
    // Para streams ativos anteriores
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Wait up to 1 second for videoRef.current to be mounted by React
      for (let i = 0; i < 10; i++) {
        if (videoRef.current) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      } else {
        throw new Error("Elemento de vídeo não foi montado a tempo.");
      }
      setWebcamFacingMode(mode);
    } catch (err: any) {
      console.warn("Retrying webcam with simple parameters due to facingMode error:", err);
      try {
        // Fallback simples sem constranger direcionalmente
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        streamRef.current = stream;

        for (let i = 0; i < 10; i++) {
          if (videoRef.current) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.setAttribute("playsinline", "true");
          await videoRef.current.play();
        } else {
          throw new Error("Elemento de vídeo não foi montado a tempo.");
        }
      } catch (fallbackErr: any) {
        console.error("Camera access failed entirely:", fallbackErr);
        setWebcamError("Não foi possível acessar a câmera do celular de forma integrada. Conceda as permissões de câmera ao navegador nas configurações ou use a galeria.");
      }
    } finally {
      setIsWebcamLoading(false);
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsWebcamOpen(false);
  };

  const captureWebcamSnapshot = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      // Captura tamanho do feed em execução para fidelidade
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      
      // Restrição ideal Super-Leve de SSTR para otimizar transferência móvel e evitar travas
      const maxDim = 640;
      let finalW = width;
      let finalH = height;
      if (width > height) {
        if (width > maxDim) {
          finalH = Math.round((height * maxDim) / width);
          finalW = maxDim;
        }
      } else {
        if (height > maxDim) {
          finalW = Math.round((width * maxDim) / height);
          finalH = maxDim;
        }
      }
      
      canvas.width = finalW;
      canvas.height = finalH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setWebcamError("Falha na renderização do canvas de captura.");
        return;
      }
      
      ctx.drawImage(video, 0, 0, finalW, finalH);
      const base64 = canvas.toDataURL("image/jpeg", 0.60); // 60% qualidade garante tamanho micro (40-60kb)
      
      setFormFotoUrl(base64);
      setFormError(null);
      stopWebcam();
    } catch (err: any) {
      console.error("Capture snapshot failed:", err);
      setWebcamError("Erro interno ao congelar imagem: " + err.message);
    }
  };

  // Switch camera hook (front/rear)
  const handleToggleCameraDirection = () => {
    const nextMode = webcamFacingMode === "environment" ? "user" : "environment";
    startWebcam(nextMode);
  };

  useEffect(() => {
    if (isWebcamOpen) {
      startWebcam(webcamFacingMode);
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isWebcamOpen]);
  
  // State to hold any duplicate request/record details when user tries to submit
  const [duplicateFound, setDuplicateFound] = useState<{
    type: "base" | "pendente";
    record: any;
  } | null>(null);

  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

  // Connection tracking states & background synchronization queue
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [offlineQueue, setOfflineQueue] = useState<PendingRequest[]>([]);

  // Load offline queue
  const loadOfflineQueue = () => {
    const queueJson = localStorage.getItem("sstr_offline_requests_queue");
    if (queueJson) {
      try {
        setOfflineQueue(JSON.parse(queueJson));
      } catch (e) {
        console.error("Erro ao carregar fila offline:", e);
      }
    } else {
      setOfflineQueue([]);
    }
  };

  // Synchronize offline operations to the local storage master pending queue
  const handleSyncOfflineQueue = () => {
    const queueJson = localStorage.getItem("sstr_offline_requests_queue");
    if (!queueJson) return;
    let offlineItems: PendingRequest[] = [];
    try {
      offlineItems = JSON.parse(queueJson);
    } catch (e) {
      return;
    }

    if (offlineItems.length === 0) return;

    // Save offline items via context to push to Firestore
    offlineItems.forEach(item => {
      savePendingRequest({ ...item, isOffline: undefined });
    });

    localStorage.setItem("sstr_offline_requests_queue", "[]");
    setOfflineQueue([]);

    alert(`🚀 Sincronização automática concluída com sucesso! ${offlineItems.length} solicitações cadastradas em modo offline foram descarregadas e enviadas para o controle.`);
  };

  // Unique sorted list of sectors from imported records or registered representative sectors
  const sectors = useMemo(() => {
    const fromRecords = records.map(r => r.setorVenda?.toString() || "");
    const fromReps = Object.keys(repsList);
    
    const list = Array.from(new Set([...fromRecords, ...fromReps]))
      .filter(Boolean)
      .filter(sec => {
        const s = sec.trim();
        if (s === "000" || s === "0" || s === "SETOR 000" || s === "00" || s === "") return false;
        if (s === "991" && !repsList[s]) return false;
        return true;
      });
    return list.sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
  }, [records, repsList]);

  useEffect(() => {
    loadOfflineQueue();

    const handleStorageChange = () => {
      loadOfflineQueue();
      clearRepresentativosCache();
      clearMotoristasRotasCache();
    };

    const handleOnline = () => {
      setIsOnline(true);
      handleSyncOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // If online on mount, attempt sync any pending items
    if (navigator.onLine) {
      handleSyncOfflineQueue();
    }

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Draft storage key generator strictly isolated by user role and sector
  const getIsolatedDraftKey = (role: string, sector: string | null) => {
    return `sstr_draft_${role}_${sector || "geral"}`;
  };

  // 1. Intelligent Draft Recovery Check when entering a sector
  useEffect(() => {
    if (!selectedSector) return;

    const draftKey = getIsolatedDraftKey(roleContext, selectedSector);
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.formMapa || parsed.formNb || parsed.formNf || (parsed.draftItems && parsed.draftItems.length > 0)) {
          setPendingDraftToRecover(parsed);
          setShowDraftRecoveryModal(true);
        }
      } catch (e) {
        console.error("Failed to parse isolated draft from localStorage:", e);
      }
    }
  }, [selectedSector, roleContext]);

  // 2. Continually persist active form inputs into isolated storage in real-time
  useEffect(() => {
    if (!selectedSector) return;

    const draftKey = getIsolatedDraftKey(roleContext, selectedSector);
    if (formMapa || formNb || formNf || formObservacao || draftItems.length > 0) {
      const stateObj = {
        selectedSector,
        formMapa,
        formNb,
        formNf,
        formObservacao,
        formMotiveType,
        formMotiveText,
        draftItems,
        roleContext,
        savedAt: new Date().toLocaleTimeString("pt-BR")
      };
      localStorage.setItem(draftKey, JSON.stringify(stateObj));
    }
  }, [selectedSector, formMapa, formNb, formNf, formObservacao, formMotiveType, formMotiveText, draftItems, roleContext]);

  // Filter records matching selected sector
  const sectorRecords = useMemo(() => {
    if (!selectedSector) return [];
    return records.filter(r => (r.setorVenda || "").trim() === selectedSector.trim());
  }, [records, selectedSector]);

  // Calculate stats on matching records
  const sectorStats = useMemo(() => {
    if (sectorRecords.length === 0) return null;
    
    const totalSpent = sectorRecords.reduce((acc, r) => acc + (r.valorTotal || 0), 0);
    const approvedCount = sectorRecords.filter(r => (r.status || "").toLowerCase().includes("aprov")).length;
    const pendingCount = sectorRecords.filter(r => (r.status || "").toLowerCase().includes("pend")).length;
    const reprovedCount = sectorRecords.filter(r => (r.status || "").toLowerCase().includes("reprov")).length;

    return {
      totalSpent,
      totalCount: sectorRecords.length,
      approvedCount,
      pendingCount,
      reprovedCount
    };
  }, [sectorRecords]);

  // Handle Search & Filter over Sector Historical Records
  const filteredRequests = useMemo(() => {
    return sectorRecords.filter(r => {
      const nSearch = searchTerm.toLowerCase();
      const matchSearch = !searchTerm ||
        r.nomeCliente.toLowerCase().includes(nSearch) ||
        r.codigoCliente.includes(nSearch) ||
        r.solicitacao.includes(nSearch) ||
        r.descricaoProduto.toLowerCase().includes(nSearch) ||
        r.produto.includes(nSearch);

      const sClean = r.status.toLowerCase();
      let matchStatus = true;
      if (statusFilter !== "todos") {
        if (statusFilter === "aprovada") matchStatus = sClean.includes("aprov");
        else if (statusFilter === "pendente") matchStatus = sClean.includes("pend");
        else if (statusFilter === "reprovada") matchStatus = sClean.includes("reprov");
      }

      return matchSearch && matchStatus;
    });
  }, [sectorRecords, searchTerm, statusFilter]);

  // Group historical filtered requests by solicitation number
  const groupedFilteredRequests = useMemo(() => {
    const groups: { [solicitacao: string]: ExchangeRecord[] } = {};
    filteredRequests.forEach(item => {
      const key = item.solicitacao || `temp_${item.id}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });
    return Object.values(groups);
  }, [filteredRequests]);

  // Pending requests for the current selected sector (redefined to merge local offline queue and server-synced items)
  const currentSectorPendingRequests = useMemo(() => {
    if (!selectedSector) return [];
    const offlineSector = offlineQueue
      .filter(req => req.setor.trim() === selectedSector.trim())
      .map(req => ({ ...req, isOffline: true }));
    const pendingSector = pendingRequests.filter(req => req.setor.trim() === selectedSector.trim());
    return [...offlineSector, ...pendingSector];
  }, [pendingRequests, offlineQueue, selectedSector]);

  // Find newly approved requests for this sector that haven't been acknowledged/notified
  const unnotifiedApprovals = useMemo(() => {
    if (!selectedSector) return [];
    return pendingRequests.filter(
      req => req.setor.trim() === selectedSector.trim() && 
             req.statusPromax === "cadastrado" && 
             req.notified === false
    );
  }, [pendingRequests, selectedSector]);

  // Dismiss notification of newly approved/registered requests
  const handleDismissApprovals = () => {
    pendingRequests.forEach(req => {
      if (req.setor.trim() === selectedSector?.trim() && req.statusPromax === "cadastrado" && req.notified === false) {
        savePendingRequest({
          ...req,
          notified: true
        });
      }
    });
  };

  // Find newly rejected requests for this sector/route that haven't been acknowledged
  const unnotifiedRejections = useMemo(() => {
    if (!selectedSector) return [];
    return pendingRequests.filter(
      req => req.setor.trim() === selectedSector.trim() && 
             (req.statusPromax === "reprovado" || req.statusPromax === "corrigir") && 
             req.notified === false
    );
  }, [pendingRequests, selectedSector]);

  // Dismiss notification of newly rejected/returned requests
  const handleDismissRejections = () => {
    pendingRequests.forEach(req => {
      if (req.setor.trim() === selectedSector?.trim() && (req.statusPromax === "reprovado" || req.statusPromax === "corrigir") && req.notified === false) {
        savePendingRequest({
          ...req,
          notified: true
        });
      }
    });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Current month's consolidated company-wide stats regardless of selected sector
  const overallStats = useMemo(() => {
    // 1. Determine active evaluation month/year (dynamic, based on latest record if possible)
    const dObj = new Date();
    let evalMonth = dObj.getMonth() + 1; // 1-indexed (1-12)
    let evalYear = dObj.getFullYear();

    if (records.length > 0) {
      let maxTime = 0;
      records.forEach(r => {
        if (r.dataSolicitacao) {
          const parts = r.dataSolicitacao.split("/");
          if (parts.length === 3) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            const y = parseInt(parts[2], 10);
            const t = new Date(y, m - 1, d).getTime();
            if (t > maxTime) {
              maxTime = t;
              evalMonth = m;
              evalYear = y;
            }
          }
        }
      });
    }

    // Approved official records of ALL sectors for this month
    const companyApprovedInMonth = records.filter(r => {
      const isApproved = (r.status || "").toLowerCase().includes("aprov") || (r.status || "").toLowerCase().includes("cadastrado");
      if (!isApproved) return false;

      if (r.dataSolicitacao) {
        const parts = r.dataSolicitacao.split("/");
        if (parts.length === 3) {
          const m = parseInt(parts[1], 10);
          const y = parseInt(parts[2], 10);
          return m === evalMonth && y === evalYear;
        }
      }
      return false;
    });

    const companyApprovedSum = companyApprovedInMonth.reduce((sum, r) => sum + r.valorTotal, 0);

    // Helper to calculate a single request value
    const getReqValue = (r: PendingRequest) => {
      // Inversion types if not delivery error are not counted
      const isSwap = (r as any).tipoAvaria === "falta" || (r as any).tipoAvaria === "inversao" || (r as any).tipoSolicitacao === "falta_inversao";
      if (isSwap) {
        const errType = (r as any).faltaTipoErro || "";
        if (errType !== "entrega") {
          return 0; 
        }
      }

      let val = 0;
      if (r.items && r.items.length > 0) {
        val = r.items.reduce((itemSum, current) => {
          const itemUnitPrice = records.find(p => p.produto === current.item)?.valorUnitario || 98.50;
          return itemSum + (itemUnitPrice * current.quantidade);
        }, 0);
      } else if (r.item) {
        const itemUnitPrice = records.find(p => p.produto === r.item)?.valorUnitario || 98.50;
        val = itemUnitPrice * (r.quantidade || 1);
      }
      return val;
    };

    // Pending requests of ALL sectors
    const companyPendingInMonth = pendingRequests.filter(r => {
      const isPending = (r.statusPromax || "").toLowerCase().trim() === "pendente";
      return isPending;
    });

    const companyPendingSum = companyPendingInMonth.reduce((sum, r) => sum + getReqValue(r), 0);
    const companyTotalSpent = companyApprovedSum + companyPendingSum;
    const limit = 12000; // R$ 12.000,00 limit
    const companyRemaining = limit - companyTotalSpent;
    const companyPercent = (companyTotalSpent / limit) * 100;

    // Define visual themes based on budget consumption thresholds (Guia de Cores)
    let statusTheme = {
      accentColor: "text-emerald-400",
      borderColor: "border-emerald-900/40",
      bgColor: "bg-emerald-950/20",
      progressGradient: "from-emerald-500 to-teal-400",
      textLabel: "Saudável (Sob Controle)",
      dotColor: "bg-emerald-400",
      badgeStyle: "bg-emerald-950/50 text-emerald-400 border-emerald-900/40",
      icon: "🟢"
    };

    if (companyPercent > 100) {
      statusTheme = {
        accentColor: "text-rose-400",
        borderColor: "border-rose-900/40",
        bgColor: "bg-rose-950/20",
        progressGradient: "from-rose-600 to-pink-500",
        textLabel: "Crítico (Limite Estourado)",
        dotColor: "bg-rose-500",
        badgeStyle: "bg-rose-950/50 text-rose-400 border-rose-900/40",
        icon: "🔴"
      };
    } else if (companyPercent >= 90) {
      statusTheme = {
        accentColor: "text-orange-400",
        borderColor: "border-orange-900/40",
        bgColor: "bg-orange-950/20",
        progressGradient: "from-orange-500 to-amber-500",
        textLabel: "Alerta (Próximo ao Limite)",
        dotColor: "bg-orange-500",
        badgeStyle: "bg-orange-950/50 text-orange-400 border-orange-900/40",
        icon: "🟠"
      };
    } else if (companyPercent >= 70) {
      statusTheme = {
        accentColor: "text-amber-400",
        borderColor: "border-amber-900/40",
        bgColor: "bg-amber-950/20",
        progressGradient: "from-amber-500 to-yellow-500",
        textLabel: "Atenção (Consumo Elevado)",
        dotColor: "bg-amber-500",
        badgeStyle: "bg-amber-950/50 text-amber-400 border-amber-900/40",
        icon: "🟡"
      };
    }

    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];

    const monthLabel = `${monthNames[evalMonth - 1]}/${evalYear}`;

    return {
      evalMonth,
      evalYear,
      monthLabel,
      companyApprovedSum,
      companyPendingSum,
      companyTotalSpent,
      limit,
      companyRemaining,
      companyPercent,
      isCompanyOverLimit: companyTotalSpent > limit,
      statusTheme,
      companyApprovedInMonth,
      companyPendingInMonth,
      getReqValue
    };
  }, [records, pendingRequests]);

  // Current month's goal/budget consumption for all sectors and selected sector's representativeness
  const currentMonthSectorStats = useMemo(() => {
    if (!selectedSector || !overallStats) return null;

    const targetSectorClean = selectedSector.trim();

    // -- B. Sector-specific Calculations --
    
    // Approved official records for selected sector
    const sectorApprovedInMonth = overallStats.companyApprovedInMonth.filter(r => {
      return (r.setorVenda || "").toString().trim() === targetSectorClean;
    });
    const sectorApprovedSum = sectorApprovedInMonth.reduce((sum, r) => sum + r.valorTotal, 0);

    // Pending requests for selected sector
    const sectorPendingInMonth = overallStats.companyPendingInMonth.filter(r => {
      return (r.setor || "").toString().trim() === targetSectorClean;
    });
    const sectorPendingSum = sectorPendingInMonth.reduce((sum, r) => sum + overallStats.getReqValue(r), 0);

    const sectorTotalSpent = sectorApprovedSum + sectorPendingSum;

    // Representativeness of selected sector in company-wide total spent
    const sectorSharePercent = overallStats.companyTotalSpent > 0 ? (sectorTotalSpent / overallStats.companyTotalSpent) * 100 : 0;

    return {
      monthLabel: overallStats.monthLabel,
      
      // Company overall stats
      companyApprovedSum: overallStats.companyApprovedSum,
      companyPendingSum: overallStats.companyPendingSum,
      companyTotalSpent: overallStats.companyTotalSpent,
      limit: overallStats.limit,
      companyRemaining: overallStats.companyRemaining,
      companyPercent: overallStats.companyPercent,
      isCompanyOverLimit: overallStats.isCompanyOverLimit,

      // Sector specific stats
      sectorApprovedSum,
      sectorPendingSum,
      sectorTotalSpent,
      sectorSharePercent,

      // Theme
      statusTheme: overallStats.statusTheme
    };
  }, [records, pendingRequests, selectedSector, overallStats]);

  const getStatusBadge = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s.includes("aprov") || s === "cadastrado") {
      return (
        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-900/60 text-[10px] font-semibold rounded-full flex items-center space-x-1 font-mono">
          <CheckCircle className="w-3 h-3" />
          <span>{s === "cadastrado" ? "Cadastrado" : "Aprovada"}</span>
        </span>
      );
    } else if (s.includes("reprov")) {
      return (
        <span className="px-2 py-0.5 bg-red-950 text-red-400 border border-red-900/60 text-[10px] font-semibold rounded-full flex items-center space-x-1 font-mono">
          <AlertTriangle className="w-3 h-3" />
          <span>Reprovada</span>
        </span>
      );
    } else {
      return (
        <span className="px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-900/60 text-[10px] font-semibold rounded-full flex items-center space-x-1 font-mono">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Pendente</span>
        </span>
      );
    }
  };

  // Convert and compress uploaded image/file with ultra-lightweight canvas method (solves memory crash)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormError("Otimizando e processando arquivo no celular com segurança... Aguarde.");

    try {
      const compressedBase64 = await compressImage(file, 640, 640, 0.65);
      setFormFotoUrl(compressedBase64);
      setFormError(null);
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || "Falha ao processar arquivo de imagem.");
    }
  };

  // Add draft item to draft list before submitting final single request
  const handleAddItem = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const isInversion = formMotiveType === "Inversão";

    if (!isInversion) {
      if (!formItem.trim()) {
        setFormError("Informe o Código ou Descrição do Item SKU antes de adicionar.");
        return;
      }

      const qty = parseInt(formQuantidade);
      if (isNaN(qty) || qty <= 0) {
        setFormError("Informe uma quantidade válida superior a zero.");
        return;
      }
    }

    // Inversão check
    if (isInversion) {
      if (!formInversaoIr.trim()) {
        setFormError("Informe o Produto que deve ser entregue ('Produto que deve Ir') para inversões.");
        return;
      }
      if (!formInversaoRecolher.trim()) {
        setFormError("Informe o Produto que deve ser recolhido para inversões.");
        return;
      }
    }

    // Find custom product match (optional for Inversion)
    let productDef = null;
    if (formItem.trim()) {
      productDef = PRODUCT_DATABASE.find(p => p.codigo === formItem.trim());
      if (!productDef) {
        setFormError(`Produto com código "${formItem.trim()}" não foi encontrado na base de dados SSTR.`);
        return;
      }
    }

    const qty = parseInt(formQuantidade) || 1;
    const calculatedHl = productDef ? Number((qty * productDef.fatorHecto).toFixed(4)) : 0;
    
    // Choose specific motive display string
    let finalMotive = formMotiveType;
    if (formMotiveType === "Inversão") {
      finalMotive = formMotiveText.trim() ? `Inversão - ${formMotiveText.trim()}` : "Inversão";
    } else if (formMotiveType === "Falta de SKU Completo") {
      finalMotive = formMotiveText.trim() ? `Falta de SKU Completo - ${formMotiveText.trim()}` : "Falta de SKU Completo";
    } else if (formMotiveType === "Falta no SKU") {
      finalMotive = formMotiveText.trim() ? `Falta no SKU - ${formMotiveText.trim()}` : "Falta no SKU";
    } else if (formMotiveType === "Outros") {
      finalMotive = formMotiveText.trim() || "Outros";
    } else {
      finalMotive = formMotiveText.trim() ? `${formMotiveType} - ${formMotiveText.trim()}` : formMotiveType;
    }

    const newItem = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      itemCode: productDef ? productDef.codigo : "INVERSÃO",
      itemDesc: productDef ? productDef.descricao : `Inversão: ${formInversaoIr.trim()} 🔄 ${formInversaoRecolher.trim()}`,
      quantidade: qty,
      motivo: finalMotive,
      fatorHecto: productDef ? productDef.fatorHecto : 0,
      hectolitros: calculatedHl,
      produtoAhEnviar: formMotiveType === "Inversão" ? `${formInversaoIr.trim()} (Qtd: ${formInversaoIrQtd.trim() || qty} un)` : undefined,
      produtoARecolher: formMotiveType === "Inversão" ? `${formInversaoRecolher.trim()} (Qtd: ${formInversaoRecolherQtd.trim() || qty} un)` : undefined,
    };

    setDraftItems(prev => [...prev, newItem]);

    // Reset entry fields for next SKU
    setFormItem("");
    setFormQuantidade("");
    setFormInversaoIr("");
    setFormInversaoRecolher("");
    setFormInversaoIrQtd("");
    setFormInversaoRecolherQtd("");
    setFormError(null);
  };

  // Submit New Request form containing multiple draft items
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDuplicateFound(null);

    // Validation 7: Mandatory fields Mapa, NB, NF are required for all registrations
    const cleanMapa = formMapa.trim();
    const cleanNb = formNb.trim();
    const cleanNf = formNf.trim();

    if (!cleanMapa || !cleanNb || !cleanNf) {
      const missingFields: string[] = [];
      if (!cleanMapa) missingFields.push("Número do Mapa");
      if (!cleanNb) missingFields.push("Número da NB");
      if (!cleanNf) missingFields.push("Número da NF");

      setFormError(
        `⚠️ Preenchimento obrigatório pendente: Por favor, informe o ${missingFields.join(", ")} para finalizar o registro da troca.`
      );
      return;
    }

    const finalNf = cleanNf;

    const isFaltaSkuCompleto = formMotiveType === "Falta de SKU Completo";
    if (!formFotoUrl && !isFaltaSkuCompleto) {
      setFormError("A Foto/Doc comprobatório de avaria ou pendência é obrigatória para o Controle.");
      return;
    }

    // If user has defined fields inside the item entry fields but didn't click "Add",
    // let's try to add them automatically if draftItems is currently empty, to be helpful.
    let currentDrafts = [...draftItems];
    if (currentDrafts.length === 0) {
      if (formMotiveType === "Inversão") {
        if (!formInversaoIr.trim() || !formInversaoRecolher.trim()) {
          setFormError("Informe o Produto que deve ser entregue ('Produto que deve Ir') e o Produto que deve ser recolhido para inversões.");
          return;
        }

        let productDef = null;
        if (formItem.trim()) {
          productDef = PRODUCT_DATABASE.find(p => p.codigo === formItem.trim());
        }

        const qty = parseInt(formQuantidade) || 1;
        const irQtd = parseInt(formInversaoIrQtd) || qty;
        const recolherQtd = parseInt(formInversaoRecolherQtd) || qty;
        const calculatedHl = productDef ? Number((qty * productDef.fatorHecto).toFixed(4)) : 0;

        const autoItem = {
          id: `draft_auto_${Date.now()}`,
          itemCode: productDef ? productDef.codigo : "INVERSÃO",
          itemDesc: productDef ? productDef.descricao : `Inversão: ${formInversaoIr.trim()} 🔄 ${formInversaoRecolher.trim()}`,
          quantidade: qty,
          motivo: "Inversão",
          fatorHecto: productDef ? productDef.fatorHecto : 0,
          hectolitros: calculatedHl,
          produtoAhEnviar: `${formInversaoIr.trim()} (Qtd: ${irQtd} un)`,
          produtoARecolher: `${formInversaoRecolher.trim()} (Qtd: ${recolherQtd} un)`,
        };
        currentDrafts.push(autoItem);
      } else if (formItem.trim() && formQuantidade.trim()) {
        const qty = parseInt(formQuantidade);
        const productDef = PRODUCT_DATABASE.find(p => p.codigo === formItem.trim());
        if (productDef && !isNaN(qty) && qty > 0) {
          const calculatedHl = Number((qty * productDef.fatorHecto).toFixed(4));
          let finalMotive = formMotiveType;
          if (formMotiveType === "Inversão") {
            finalMotive = formMotiveText.trim() ? `Inversão - ${formMotiveText.trim()}` : "Inversão";
          } else if (formMotiveType === "Falta de SKU Completo") {
            finalMotive = formMotiveText.trim() ? `Falta de SKU Completo - ${formMotiveText.trim()}` : "Falta de SKU Completo";
          } else if (formMotiveType === "Falta no SKU") {
            finalMotive = formMotiveText.trim() ? `Falta no SKU - ${formMotiveText.trim()}` : "Falta no SKU";
          } else if (formMotiveType === "Outros") {
            finalMotive = formMotiveText.trim() || "Outros";
          } else {
            finalMotive = formMotiveText.trim() ? `${formMotiveType} - ${formMotiveText.trim()}` : formMotiveType;
          }

          const autoItem = {
            id: `draft_auto_${Date.now()}`,
            itemCode: productDef.codigo,
            itemDesc: productDef.descricao,
            quantidade: qty,
            motivo: finalMotive,
            fatorHecto: productDef.fatorHecto,
            hectolitros: calculatedHl,
          };
          currentDrafts.push(autoItem);
        } else {
          setFormError("O Código SKU ou quantidade digitados são inválidos. Por favor verifique ou exclua os preenchimentos.");
          return;
        }
      } else {
        setFormError("Adicione pelo menos um item/SKU de produto à lista de solicitação.");
        return;
      }
    }

    const inputNf = finalNf.toLowerCase();

    // Check duplicate check for each item in currentDrafts list
    for (const dItem of currentDrafts) {
      const inputItem = dItem.itemCode.toLowerCase();
      const inputQty = dItem.quantidade;

      // 1. Check duplicate inside faturado/database records
      const duplicateInDb = records.find(r => {
        const dbNf = (r.nf || "").trim().toLowerCase();
        const dbProdCode = (r.produto || "").trim().toLowerCase();
        const dbProdDesc = (r.descricaoProduto || "").trim().toLowerCase();
        
        const nfMatch = dbNf === inputNf;
        const itemMatch = dbProdCode === inputItem || dbProdDesc === inputItem || dbProdDesc.includes(inputItem) || inputItem.includes(dbProdCode);
        const qtyMatch = r.quantidade === inputQty;

        return nfMatch && itemMatch && qtyMatch;
      });

      if (duplicateInDb) {
        setDuplicateFound({
          type: "base",
          record: {
            id: duplicateInDb.id,
            nf: duplicateInDb.nf,
            cliente: duplicateInDb.nomeCliente,
            codigoCliente: duplicateInDb.codigoCliente,
            produto: duplicateInDb.descricaoProduto,
            quantidade: duplicateInDb.quantidade,
            data: duplicateInDb.dataSolicitacao,
            status: duplicateInDb.status
          }
        });
        return;
      }

      // 2. Check duplicate inside pending requests
      const duplicateInPending = pendingRequests.find(req => {
        const pendingNf = (req.nf || "").trim().toLowerCase();
        const nfMatch = pendingNf === inputNf;
        if (!nfMatch) return false;

        // Check if item is matching in the items list of pending request
        const hasMatchingItemObj = req.items 
          ? req.items.some(i => i.item.toLowerCase() === inputItem && i.quantidade === inputQty)
          : ((req.item || "").trim().toLowerCase() === inputItem && (req.quantidade || 0) === inputQty);

        return hasMatchingItemObj;
      });

      if (duplicateInPending) {
        setDuplicateFound({
          type: "pendente",
          record: {
            id: duplicateInPending.id,
            nf: duplicateInPending.nf,
            cliente: `Canal de Campo • Setor/Rota ${duplicateInPending.setor}`,
            codigoCliente: duplicateInPending.nb,
            produto: dItem.itemDesc,
            quantidade: inputQty,
            data: duplicateInPending.data,
            status: "pendente_controle"
          }
        });
        return;
      }
    }

    // Format current date and time beautifully
    const now = new Date();
    const dataFormatada = `${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

    const firstItem = currentDrafts[0];
    const totalAccumulatedHl = Number(currentDrafts.reduce((acc, curr) => acc + curr.hectolitros, 0).toFixed(4));

    // Upload photo evidence if it is raw base64
    let uploadedFotoUrl = formFotoUrl;
    if (formFotoUrl && formFotoUrl.startsWith("data:image/")) {
      setFormError("Enviando foto da avaria para a nuvem de forma segura... Aguarde.");
      try {
        const upRes = await fetch(getApiUrl("/api/upload"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: formFotoUrl })
        });
        if (upRes.ok) {
          const upData = await upRes.json();
          if (upData.url) {
            uploadedFotoUrl = upData.url;
          }
        }
      } catch (err: any) {
        console.error("Error uploading representative portal photo:", err);
      }
    }

    const expectedFilename = generatePdfFilename(cleanMapa, cleanNb, cleanNf, dataFormatada);
    const expectedFullPath = `${NETWORK_REGISTROS_PATH}\\${expectedFilename}`;

    // Calculate contingency status and total value
    const isFaltaSkuCompletoOrInversao = 
      formMotiveType.toLowerCase().includes("falta de sku completo") || 
      formMotiveType.toLowerCase().includes("falta de sku fechado") || 
      formMotiveType.toLowerCase().includes("invers");
    const isContingencia = !isFaltaSkuCompletoOrInversao;

    const calcTotalVal = currentDrafts.reduce((acc, curr) => {
      if (curr.precoCalculated !== undefined && curr.precoCalculated > 0) return acc + curr.precoCalculated;
      if (curr.precoSugerido !== undefined && curr.precoSugerido > 0) {
        const isUnd = curr.unidadeMedida === 'und';
        const unitVal = isUnd ? (curr.precoSugerido / (curr.fatorEmbalagem || 12)) : curr.precoSugerido;
        return acc + (unitVal * curr.quantidade);
      }
      return acc;
    }, 0);

    // Create Request with complete item array and multi-sku attributes
    const newRequest: PendingRequest = {
      id: `pending_req_${Date.now()}`,
      timestamp: Date.now(),
      data: dataFormatada,
      setor: selectedSector || "600",
      mapa: cleanMapa,
      nb: cleanNb,
      nf: finalNf,
      fotoUrl: uploadedFotoUrl,
      observacao: formObservacao.trim(),
      statusPromax: "pendente",
      notified: false,
      pdfFilename: expectedFilename,
      pdfFilePath: expectedFullPath,
      cadastroUser: roleContext === "rn" ? `Representante Setor ${selectedSector}` : `Motorista / Rota ${selectedSector}`,
      emContingencia: isContingencia,
      contingenciaBaixada: false,
      valorTotal: calcTotalVal > 0 ? calcTotalVal : undefined,
      
      // Fallbacks on top-level properties for compatibility with older display cards
      item: firstItem.itemCode,
      quantidade: currentDrafts.reduce((sum, current) => sum + current.quantidade, 0),
      fatorHecto: firstItem.fatorHecto,
      hectolitros: totalAccumulatedHl,
      motivo: firstItem.motivo,
      
      items: currentDrafts.map(d => ({
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

    // Note: PDF is not auto-downloaded on request creation by RN/Route collaborator.
    // It is generated on demand or when control operator confirms/completes the registration.

    // Save in storage (offline vs online branch support or edit mode)
    if (editingRequestId) {
      const targetReq = pendingRequests.find(req => req.id === editingRequestId);
      if (targetReq) {
        const updatedReq: PendingRequest = {
          ...targetReq,
          mapa: cleanMapa,
          nb: cleanNb,
          nf: finalNf,
          fotoUrl: uploadedFotoUrl,
          observacao: formObservacao.trim(),
          statusPromax: "pendente" as const,
          notified: false,
          rejeitadoObs: undefined,
          pdfFilename: expectedFilename,
          pdfFilePath: expectedFullPath,
          item: firstItem.itemCode,
          quantidade: currentDrafts.reduce((sum, current) => sum + current.quantidade, 0),
          fatorHecto: firstItem.fatorHecto,
          hectolitros: totalAccumulatedHl,
          motivo: firstItem.motivo,
          items: currentDrafts.map(d => ({
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
        await savePendingRequest(updatedReq);
      }
      setEditingRequestId(null); // Reset edit state
    } else if (!isOnline) {
      const offlineRequest: PendingRequest = {
         ...newRequest,
         id: `offline_req_${Date.now()}`
      };
      const oQueue = [offlineRequest, ...offlineQueue];
      localStorage.setItem("sstr_offline_requests_queue", JSON.stringify(oQueue));
      setOfflineQueue(oQueue);
      
      // Notify friendly offline alert
      alert("💾 REGISTRO OFFLINE SALVO!\n\nVocê está sem conexão com a internet (Rota em Campo).\n\nSua troca foi gravada com segurança no seu dispositivo e será enviada automaticamente para o controle assim que o sinal web for restabelecido.");
    } else {
      await savePendingRequest(newRequest);
    }

    // Requirement 8: Clear user-isolated draft upon completion
    if (selectedSector) {
      const draftKey = getIsolatedDraftKey(roleContext, selectedSector);
      localStorage.removeItem(draftKey);
    }
    localStorage.removeItem("sstr_active_creation_draft");

    // Reset Form completely
    setFormMapa("");
    setFormNb("");
    setFormNf("");
    setFormItem("");
    setFormQuantidade("");
    setFormFotoUrl("");
    setFormObservacao("");
    setFormInversaoIr("");
    setFormInversaoRecolher("");
    setFormInversaoIrQtd("");
    setFormInversaoRecolherQtd("");
    setFormMotiveType("Produto Avariado");
    setFormMotiveText("Produto Avariado");
    setDraftItems([]);
    setFormSuccess(true);
    setReceiptRequest(newRequest);

    // Requirement 3: Trigger PDF Created confirmation modal
    setCreatedPdfModalInfo({
      filename: expectedFilename,
      fullPath: expectedFullPath
    });
  };

  const handleDeleteSectorPendingRequest = (id: string) => {
    if (window.confirm("Deseja realmente cancelar esta solicitação pendente?")) {
      deletePendingRequest(id);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-slate-900 min-h-[780px] shadow-2xl rounded-3xl border border-slate-800 overflow-hidden flex flex-col justify-between text-slate-100 relative">
      
      {/* 1. SECTOR LANDING VIEW (LINKTREE STYLE) */}
      {!selectedSector ? (
        <div className="p-6 flex flex-col justify-between h-full flex-grow space-y-5">
          <div className="text-center space-y-2 mt-2 bg-gradient-to-b from-blue-950/10 to-transparent p-4 rounded-3xl border border-slate-800/10">
            <div className="flex justify-center transition-transform hover:scale-105 duration-300">
              <PauBrasilLogo size="lg" variant="vertical" textColor="white" />
            </div>
            <h2 className="text-base font-bold font-display text-white leading-tight pt-1">
              {roleContext === "rn" ? "Portal do Representante (RN)" : "Portal do Motorista / Ajudante"}
            </h2>
            <p className="text-[9.5px] text-slate-400 max-w-[280px] mx-auto leading-relaxed">
              Consulte faturamentos, crie novas solicitações de trocas com comprovantes de NF e comprovantes de avaria em tempo real.
            </p>
          </div>

          {/* Toggle de Perfil / Contexto */}
          <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl border border-slate-855 text-[10px] font-semibold gap-1 select-none">
            <button
              type="button"
              onClick={() => setRoleContext("rn")}
              className={`py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                roleContext === "rn"
                  ? "bg-blue-600 text-white font-bold shadow-md"
                  : "text-slate-450 hover:text-slate-200"
              }`}
            >
              💼 Vendedor / RN
            </button>
            <button
              type="button"
              onClick={() => setRoleContext("rota")}
              className={`py-2 rounded-lg text-center transition-all cursor-pointer flex items-center justify-center gap-1 ${
                roleContext === "rota"
                  ? "bg-amber-600 text-white font-bold shadow-md"
                  : "text-slate-450 hover:text-slate-205"
              }`}
            >
              🚚 Rota (Motorista)
            </button>
          </div>

          <div className="space-y-2.5 flex-grow my-2 max-h-[340px] overflow-y-auto pr-1">
            {roleContext === "rn" ? (
              <>
                <p className="text-[8.5px] font-bold text-slate-500 uppercase tracking-widest font-mono text-center mb-1">Selecione seu Nome / Setor</p>
                {sectors.map(sec => {
                  const repInfo = repsList[sec.trim()];
                  return (
                    <button
                      key={sec}
                      onClick={() => {
                        setSelectedSector(sec);
                        setSectorTab("historico");
                        setSelectedRecord(null);
                      }}
                      className="w-full p-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 rounded-2xl flex justify-between items-center transition-all cursor-pointer shadow-md group border-l-4 border-l-blue-600 hover:border-l-blue-400"
                    >
                      <div className="flex items-center space-x-3 text-slate-200">
                        <div className="w-7 h-7 bg-blue-950 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs font-mono border border-blue-900/30 shrink-0">
                          {sec}
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-white block group-hover:text-blue-300 transition-colors">
                            {repInfo ? repInfo.nome : `Setor Residencial ${sec}`}
                          </span>
                          <span className="text-[9px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                            <span>Setor {sec}</span>
                            {repInfo && (
                              <>
                                <span className="text-slate-650">•</span>
                                <span className="bg-slate-900 text-blue-400 px-1 py-0.2 rounded text-[7.5px] font-semibold">GV: {repInfo.gv}</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                <p className="text-[8.5px] font-bold text-slate-500 uppercase tracking-widest font-mono text-center mb-1">Selecione sua Rota de Entrega</p>
                {(Object.values(motoristasList) as RouteDriverInfo[]).map(rot => {
                  return (
                    <button
                      key={rot.rota}
                      type="button"
                      onClick={() => {
                        setSelectedSector(rot.rota);
                        setSectorTab("historico");
                        setSelectedRecord(null);
                      }}
                      className="w-full p-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 rounded-2xl flex justify-between items-center transition-all cursor-pointer shadow-md group border-l-4 border-l-amber-600 hover:border-l-amber-400"
                    >
                      <div className="flex items-center space-x-3 text-slate-200">
                        <div className="w-7 h-7 bg-amber-950 text-amber-400 rounded-xl flex items-center justify-center font-bold text-xs font-mono border border-amber-900/30 shrink-0">
                          {rot.rota}
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-white block group-hover:text-amber-300 transition-colors truncate max-w-[200px]">
                            {rot.nome}
                          </span>
                          <span className="text-[8.5px] text-slate-450 font-mono flex items-center gap-1 mt-0.5">
                            <span className="bg-slate-900 text-amber-500 px-1 py-0.2 rounded text-[7px] font-semibold">Caminhão: {rot.veiculo}</span>
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-850 flex items-start space-x-2 text-slate-405">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span className="text-[9.5px] leading-normal">
              Acompanhe o andamento de reposições e devoluções. Use a câmera para tirar fotos de danos em latas, garrafas ou fardos na rota.
            </span>
          </div>
        </div>
      ) : (
        /* 2. REAL-TIME SECTOR USER PANEL */
        <div className="flex flex-col flex-grow h-full justify-between">
          
          {/* Header */}
          <div className="p-3 bg-slate-950 text-white flex flex-col space-y-2.5 border-b border-slate-850">
            {/* Top row: Back button & Network status */}
            <div className="flex justify-between items-center w-full">
              <button
                onClick={() => {
                  setSelectedSector(null);
                  setSelectedRecord(null);
                }}
                className="py-1 px-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-[10px] font-bold font-mono transition-colors flex items-center cursor-pointer text-slate-300 border border-slate-800 shrink-0"
              >
                <ArrowLeft className="w-3 h-3 mr-1 text-blue-400" />
                Voltar
              </button>

              {/* Status & Sync Badge */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {offlineQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncOfflineQueue}
                    className="text-[8px] font-bold bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded-lg border border-blue-500 font-mono animate-pulse cursor-pointer"
                    title="Clique para forçar sincronização manual"
                  >
                    📥 SYNC ({offlineQueue.length})
                  </button>
                )}
                <span className={`text-[8px] px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1 border ${
                  isOnline 
                    ? "text-emerald-400 bg-emerald-950/60 border-emerald-900/50" 
                    : "text-amber-400 bg-amber-950/60 border-amber-900/50"
                }`}>
                  <span className={`w-1 h-1 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
                  {isOnline ? "CONECTADO" : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* Bottom row: Sector / Driver details & Mini limit status */}
            <div className="grid grid-cols-12 items-center w-full pt-1.5 border-t border-slate-900/60 mt-1 gap-1">
              <div className="col-span-8 font-sans min-w-0 pr-1 text-left">
                {selectedSector && selectedSector.startsWith("R") ? (
                  <>
                    <span className="text-[7.5px] uppercase text-amber-500 block tracking-wider font-mono font-bold">
                      Rota {selectedSector} • Motorista
                    </span>
                    <strong className="text-[11px] text-white block leading-tight truncate">
                      {motoristasList[selectedSector]?.nome || `Rota ${selectedSector}`}
                    </strong>
                  </>
                ) : (
                  <>
                    <span className="text-[7.5px] uppercase text-blue-400 block tracking-wider font-mono font-bold">
                      Setor {selectedSector} {selectedSector && repsList[selectedSector.trim()] ? `• GV ${repsList[selectedSector.trim()].gv}` : ""}
                    </span>
                    <strong className="text-[11px] text-white block leading-tight truncate">
                      {selectedSector && repsList[selectedSector.trim()] ? repsList[selectedSector.trim()].nome : `Setor ${selectedSector}`}
                    </strong>
                  </>
                )}
              </div>

              <div className="col-span-4 flex justify-end">
                {currentMonthSectorStats && (
                  <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-850 shrink-0 shadow-inner">
                    <div className="flex flex-col text-right leading-none">
                      <span className="text-[6px] text-slate-500 font-mono uppercase tracking-wider font-bold">Meta Geral</span>
                      <span className={`text-[9px] font-black font-mono mt-0.5 whitespace-nowrap ${currentMonthSectorStats.statusTheme.accentColor}`}>
                        {currentMonthSectorStats.companyPercent.toFixed(1)}%
                      </span>
                    </div>
                    {/* Progress cylinder (circular column): ensure shrink-0 prevents status text / balloon from crushing it */}
                    <div className="w-2.5 h-6 bg-slate-900 rounded-full overflow-hidden relative flex items-end border border-slate-800 shrink-0">
                      <div 
                        className={`w-full rounded-full transition-all duration-300 ${currentMonthSectorStats.statusTheme.dotColor}`}
                        style={{ height: `${Math.min(currentMonthSectorStats.companyPercent, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Sector Monthly Target Tracker */}
          {currentMonthSectorStats && (
            <div className="bg-slate-900/90 border-b border-slate-850 p-3.5 flex flex-col space-y-3 animate-fade-in select-none">
              
              {/* Grid with Meta and Current total spent to avoid text-wrapping issues */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-850/60 flex flex-col">
                  <span className="text-[7px] text-slate-500 font-bold uppercase tracking-wider font-mono">Meta Mensal Geral</span>
                  <span className="text-xs font-black text-slate-300 font-mono mt-1">
                    {formatCurrency(currentMonthSectorStats.limit)}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-850/60 flex flex-col">
                  <span className="text-[7px] text-slate-500 font-bold uppercase tracking-wider font-mono">Total Atingido Geral</span>
                  <span className={`text-xs font-black font-mono mt-1 ${currentMonthSectorStats.statusTheme.accentColor}`}>
                    {formatCurrency(currentMonthSectorStats.companyTotalSpent)}
                  </span>
                </div>
              </div>

              {/* Progress bar and State badge */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[8.5px] font-mono leading-none">
                  <span className="text-slate-450 font-bold uppercase tracking-wider">Progresso Geral</span>
                  <span className={`px-2 py-0.5 rounded-md font-extrabold text-[7.5px] border ${currentMonthSectorStats.statusTheme.badgeStyle}`}>
                    {currentMonthSectorStats.statusTheme.icon} {currentMonthSectorStats.statusTheme.textLabel}
                  </span>
                </div>

                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden relative border border-slate-850">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r ${currentMonthSectorStats.statusTheme.progressGradient}`}
                    style={{ width: `${Math.min(currentMonthSectorStats.companyPercent, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              {/* Remaining indicator & Sector representativeness */}
              <div className="flex flex-col space-y-2">
                <div className="flex justify-between items-center text-[8.5px] font-mono leading-tight">
                  <span className="text-slate-400 font-semibold uppercase tracking-wider">Atingimento: {currentMonthSectorStats.companyPercent.toFixed(1)}%</span>
                  {currentMonthSectorStats.isCompanyOverLimit ? (
                    <span className="text-rose-400 font-extrabold flex items-center gap-1">
                      ⚠️ Estourado: +{formatCurrency(Math.abs(currentMonthSectorStats.companyRemaining))}
                    </span>
                  ) : (
                    <span className="text-emerald-450 font-extrabold flex items-center gap-1 bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-900/20">
                      🟢 Restam {formatCurrency(currentMonthSectorStats.companyRemaining)}
                    </span>
                  )}
                </div>

                {/* Selected Sector Representativeness / Share */}
                <div className="flex justify-between items-center text-[9px] font-mono leading-tight bg-slate-950/65 p-2 rounded-xl border border-slate-850/50">
                  <span className="text-slate-400 flex items-center gap-1 font-semibold">
                    📊 Sua Representatividade ({selectedSector}):
                  </span>
                  <span className="text-blue-400 font-extrabold">
                    {currentMonthSectorStats.sectorSharePercent.toFixed(1)}% <span className="text-slate-500 font-normal">({formatCurrency(currentMonthSectorStats.sectorTotalSpent)})</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB SYSTEM INDEX FOR INTERNAL PORTAL */}
          {!selectedRecord && (
            <div className="grid grid-cols-4 border-b border-slate-850 bg-slate-950/70 p-1 select-none text-[8.5px] font-bold text-slate-400 gap-0.5">
              <button
                onClick={() => {
                  setSectorTab("historico");
                }}
                className={`py-2 text-center rounded-lg flex flex-col items-center justify-center gap-1 transition-all leading-none ${
                  sectorTab === "historico" 
                    ? "bg-blue-600 text-white font-bold shadow" 
                    : "hover:text-slate-200"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Base Lançada</span>
              </button>

              <button
                onClick={() => {
                  setSectorTab("novo");
                }}
                className={`py-2 text-center rounded-lg flex flex-col items-center justify-center gap-1 transition-all leading-none ${
                    sectorTab === "novo" 
                      ? "bg-blue-600 text-white font-bold shadow" 
                      : "hover:text-slate-200"
                  }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Nova Troca</span>
              </button>

              <button
                onClick={() => {
                  setSectorTab("pendentes");
                }}
                className={`py-2 text-center rounded-lg flex flex-col items-center justify-center gap-1 transition-all relative leading-none ${
                  sectorTab === "pendentes" 
                    ? "bg-blue-600 text-white font-bold shadow" 
                    : "hover:text-slate-200"
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Pendentes ({currentSectorPendingRequests.filter(q => q.statusPromax === "pendente" || q.statusPromax === "corrigir" || q.isOffline || q.statusPromax === "reprovado").length})</span>
                {currentSectorPendingRequests.some(c => c.statusPromax === "pendente" || c.statusPromax === "corrigir" || c.isOffline || c.statusPromax === "reprovado") && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                )}
              </button>

              <button
                onClick={() => {
                  setSectorTab("aprovadas");
                }}
                className={`py-2 text-center rounded-lg flex flex-col items-center justify-center gap-1 relative leading-none ${
                  sectorTab === "aprovadas" 
                    ? "bg-emerald-700 text-white font-bold shadow" 
                    : "hover:text-slate-200"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-450" />
                <span>Aprovados ({currentSectorPendingRequests.filter(q => q.statusPromax === "cadastrado").length})</span>
                {currentSectorPendingRequests.some(c => c.statusPromax === "cadastrado") && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-450 animate-ping"></span>
                )}
              </button>
            </div>
          )}

          {/* CONTENT ACCORDING TO SECTOR TAB */}

          {/* TAB 1: HISTÓRICO (LANÇADAS NO PROMAX COMPILADO) */}
          {sectorTab === "historico" && (
            <div className="flex-grow flex flex-col justify-between h-full max-h-[510px] overflow-hidden">
              
              {/* Stats overview */}
              {sectorStats && !selectedRecord && (
                <div className="px-4 py-3 bg-slate-950/40 grid grid-cols-2 gap-2 border-b border-slate-850 animate-fade-in">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850 flex items-center space-x-2">
                    <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                    <div>
                      <span className="text-[7.5px] text-slate-400 uppercase font-mono block">Acumulado</span>
                      <span className="text-xs font-bold text-white font-mono">{formatCurrency(sectorStats.totalSpent)}</span>
                    </div>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850 flex items-center space-x-2">
                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                    <div>
                      <span className="text-[7.5px] text-slate-400 uppercase font-mono block">Cadastros</span>
                      <span className="text-xs font-bold text-white font-mono">{sectorStats.totalCount} itens</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedRecord ? (() => {
                const group = selectedRecordGroup.length > 0 ? selectedRecordGroup : [selectedRecord];
                const totalVal = group.reduce((sum, r) => sum + r.valorTotal, 0);
                const firstRec = group[0];
                return (
                  /* Detalhe da troca na histórica */
                  <div className="p-4 flex-grow space-y-3.5 max-h-[460px] overflow-y-auto animate-fade-in text-slate-200">
                    <div className="flex justify-between items-start pb-2 border-b border-slate-800">
                      <div>
                        <span className="text-[9px] font-mono text-blue-400 uppercase">SOLICITAÇÃO: {firstRec.solicitacao}</span>
                        <h3 className="font-bold font-display text-white text-xs mt-0.5">{firstRec.nomeCliente}</h3>
                        <p className="text-[9px] text-slate-400 font-mono">Código NB: {firstRec.codigoCliente}</p>
                      </div>
                      <button
                        onClick={() => setSelectedRecord(null)}
                        className="px-2 py-0.5 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded text-[9px] font-bold uppercase transition-colors cursor-pointer border border-slate-800"
                      >
                        Fechar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                      <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                        <span className="text-slate-400 text-[8px] uppercase font-mono block">Estado Promax</span>
                        {getStatusBadge(firstRec.status)}
                      </div>
                      <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                        <span className="text-slate-400 text-[8px] uppercase font-mono block">Valor Total</span>
                        <span className="font-bold text-white font-mono">{formatCurrency(totalVal)}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-left">
                      <p className="text-[8px] font-bold text-slate-400 font-mono uppercase tracking-wider">Produtos Lançados ({group.length})</p>
                      <div className="space-y-2">
                        {group.map((rec, idx) => (
                          <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-850/80 space-y-1">
                            <h4 className="font-semibold text-xs text-white leading-tight">{rec.descricaoProduto}</h4>
                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                              <span>Qtd: <strong className="text-blue-400">{rec.quantidade} {rec.um}</strong> • Código {rec.produto}</span>
                              <span className="text-emerald-400 font-bold">{formatCurrency(rec.valorTotal)}</span>
                            </div>
                            <div className="text-[8.5px] text-slate-500 font-mono">
                              Motivo: <strong className="text-blue-400">{rec.justificativa}</strong>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {firstRec.observacao && (
                      <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-lg space-y-0.5">
                        <p className="text-[8px] font-bold text-blue-400 font-mono">OBSERVAÇÕES DO FLUXO</p>
                        <p className="text-[10px] text-slate-350 leading-relaxed font-mono">{firstRec.observacao}</p>
                      </div>
                    )}

                    <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg space-y-2 font-mono text-[9px]">
                      <span className="text-slate-200 block text-[9.5px] font-bold font-sans">DETALHADAMENTE: LOGÍSTICA & RETORNO</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-450 block text-[7.5px] leading-tight">CONFERENTE CARGA:</span>
                          <span className="font-bold text-white">{firstRec.conferenteCarregamento || "Não Declarado"}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block text-[7.5px] leading-tight">NF DE RETORNO:</span>
                          <span className="font-bold text-emerald-400">{firstRec.nf || "Não Emitida"}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block text-[7.5px] leading-tight">PRESTADOR / PLACA:</span>
                          <span className="font-bold text-white">{firstRec.placa || "Não Informado"}</span>
                        </div>
                        <div>
                          <span className="text-slate-450 block text-[7.5px] leading-tight">MOTORISTA:</span>
                          <span className="font-bold text-white truncate block">{firstRec.nomeMotorista || "Não Declarado"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
                /* Listagem da histórica */
                <div className="flex-grow flex flex-col justify-between h-full overflow-hidden">
                  <div className="p-2.5 border-b border-slate-850 space-y-1.5 bg-slate-950 shrink-0">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                      <input
                        type="text"
                        placeholder="Buscar cliente, NF ou produto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8.5 pr-2.5 py-1 text-[11px] text-slate-200 font-mono placeholder:font-sans focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    
                    <div className="flex gap-1.5 overflow-x-auto py-0.5">
                      {[
                        { id: "todos", label: "Todas na Base" },
                        { id: "aprovada", label: "Aprovadas" },
                        { id: "pendente", label: "Pendentes" }
                      ].map(pil => (
                        <button
                          key={pil.id}
                          onClick={() => setStatusFilter(pil.id)}
                          className={`px-2.5 py-1 rounded text-[9.5px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            statusFilter === pil.id
                              ? "bg-blue-600 text-white font-bold"
                              : "bg-slate-900 hover:bg-slate-850 text-slate-450 border border-slate-850"
                          }`}
                        >
                          {pil.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-grow overflow-y-auto pl-3 pr-4 py-3 space-y-2.5 bg-slate-950/20">
                    {filteredRequests.length === 0 ? (
                      <div className="text-center py-12 text-slate-500 font-mono text-[9px] space-y-1">
                        <p>Nenhuma reposição na base faturada.</p>
                        <p className="text-slate-600 text-[8px]">Certifique-se de que o gestor updated os lançamentos.</p>
                      </div>
                    ) : (
                      groupedFilteredRequests.map((group) => {
                        const firstItem = group[0];
                        const totalValue = group.reduce((sum, item) => sum + item.valorTotal, 0);
                        
                        return (
                          <div
                            key={firstItem.solicitacao || firstItem.id}
                            onClick={() => setSelectedRecord(firstItem)}
                            className="p-3 bg-slate-900 border border-slate-850 hover:border-blue-900/60 rounded-xl cursor-pointer flex flex-col space-y-2 transition-all hover:bg-slate-850/60 shadow-xs overflow-hidden"
                          >
                            <div className="flex justify-between items-center gap-2 min-w-0 w-full text-left">
                              <div className="flex-1 min-w-0">
                                <span className="text-[8.5px] font-mono text-blue-400 font-bold uppercase tracking-wider block">
                                  SOLICITAÇÃO #{firstItem.solicitacao}
                                </span>
                                <p className="font-bold text-xs text-white truncate mt-0.5">{firstItem.nomeCliente}</p>
                                <p className="text-[9px] text-slate-450 font-mono mt-0.5">
                                  NB: {firstItem.codigoCliente} • Mapa: {firstItem.mapa || "Sem Mapa"}
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-1">
                                {getStatusBadge(firstItem.status)}
                                <span className="text-[8px] font-mono text-slate-500">{firstItem.dataSolicitacao}</span>
                              </div>
                            </div>

                            <div className="border-t border-slate-850/40 pt-1.5 flex flex-col gap-1 text-[9.5px] font-mono text-left">
                              <span className="text-[8px] uppercase font-bold text-slate-500 font-sans tracking-wide">
                                Itens da Solicitação ({group.length}):
                              </span>
                              <div className="space-y-1 max-h-[70px] overflow-y-auto pr-1">
                                {group.map((item, idx) => (
                                  <div key={idx} className="flex justify-between text-slate-350 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-850/20">
                                    <span className="truncate max-w-[70%] text-slate-400">#{item.produto} - {item.descricaoProduto}</span>
                                    <span className="shrink-0 font-bold text-blue-400">
                                      {item.quantidade} {item.um}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between font-bold border-t border-slate-850/20 pt-1 text-slate-200 mt-0.5">
                                <span>VALOR TOTAL:</span>
                                <span className="text-emerald-400">{formatCurrency(totalValue)}</span>
                              </div>
                              <div className="flex justify-between text-[8px] text-slate-500 mt-1">
                                <span>Aprovado em: {firstItem.dataAcao || firstItem.dataSolicitacao}</span>
                                <span>Ação: {firstItem.usuarioAcao || "Controle"}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: NOVA SOLICITAÇÃO DE TROCA COM NF/FOTO OBRIGATÓRIAS */}
          {sectorTab === "novo" && (
            <div className="flex-grow p-4 overflow-y-auto max-h-[510px] space-y-4">
              
              {formSuccess ? (
                <div className="py-16 text-center space-y-4 animate-scale-up">
                  <div className="w-14 h-14 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-xl">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white font-display">Solicitação Registrada!</h3>
                    <p className="text-[10px] text-slate-400 max-w-[240px] mx-auto font-mono">
                      A troca foi anexada com comprovante e enviada para o controle cadastrar no Promax.
                    </p>
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono animate-pulse">Redirecionando...</div>
                </div>
              ) : (
                <form onSubmit={handleFormSubmit} className="space-y-3.5">
                  {editingRequestId && (
                    <div className="bg-amber-950/90 border border-amber-600/30 p-3 rounded-xl text-amber-400 text-[10.5px] leading-relaxed space-y-1 animate-fade-in flex flex-col text-left">
                      <strong className="uppercase font-sans text-[8.5px] text-amber-300 tracking-wider block font-bold">⚠️ Editando e Ajustando Solicitação</strong>
                      <p>Você está editando a solicitação de troca correspondente à <strong className="text-white font-bold">NF-e: {formNf}</strong> devido a um apontamento feito pelo controle.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRequestId(null);
                          setFormMapa("");
                          setFormNb("");
                          setFormNf("");
                          setFormItem("");
                          setFormQuantidade("");
                          setFormFotoUrl("");
                          setFormObservacao("");
                          setFormInversaoIr("");
                          setFormInversaoRecolher("");
                          setFormInversaoIrQtd("");
                          setFormInversaoRecolherQtd("");
                          setDraftItems([]);
                          setSectorTab("pendentes");
                        }}
                        className="mt-1 pb-0.5 px-2.5 py-1 bg-amber-900 hover:bg-amber-800 text-amber-100 font-bold font-sans rounded-lg text-[9px] cursor-pointer self-start transition-colors"
                      >
                        Cancelar Ajuste e Voltar
                      </button>
                    </div>
                  )}

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-slate-450 leading-relaxed text-[9.5px] space-y-1">
                    <span className="font-extrabold text-blue-400 block uppercase tracking-wider text-[8px] font-sans">Mandatórios da Segurança:</span>
                    <p>• A foto da avaria física e o número da NF-e são <strong className="text-white">obrigatórios</strong>.</p>
                    <p>• Solicitações sem foto e nota fiscal não poderão seguir.</p>
                  </div>

                  {/* Form fields */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Mapa */}
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                        Número do Mapa <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 50412"
                        value={formMapa}
                        onChange={(e) => setFormMapa(e.target.value)}
                        className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-hidden ${
                          !formMapa.trim()
                            ? "border-red-900/50 placeholder-red-900/60"
                            : "border-slate-800"
                        }`}
                      />
                    </div>

                    {/* NB / Código do Cliente */}
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                        NB / Cód. Cliente <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 120448"
                        value={formNb}
                        onChange={(e) => setFormNb(e.target.value)}
                        className={`w-full bg-slate-950 border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-hidden ${
                          !formNb.trim()
                            ? "border-red-900/50 placeholder-red-900/60"
                            : "border-slate-800"
                        }`}
                      />
                      {(() => {
                        const db = getPdvDatabase();
                        const client = db[formNb.trim()];
                        if (client) {
                          return (
                            <span className="text-[10px] text-emerald-400 block mt-1 font-sans leading-tight">
                              ✅ {client.nomeFantasia} — {client.endereco}, {client.bairro}, {client.municipio}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Nota Fiscal (NF) */}
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest font-mono block flex items-center justify-between">
                      <span>Nota Fiscal (NF-e) <span className="text-red-500">*</span></span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Número da NF de faturamento ou devolução"
                      value={formNf}
                      onChange={(e) => setFormNf(e.target.value)}
                      className={`w-full bg-slate-950 border focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-hidden ${
                        !formNf.trim()
                          ? "border-red-900/50 placeholder-red-900/60"
                          : "border-slate-800"
                      }`}
                    />
                  </div>

                  {/* Item SKU & Quantidade row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in border border-slate-800/40 p-4 bg-slate-950/30 rounded-2xl text-left">
                    {/* Item / SKU with Autocomplete suggestions */}
                    <div className="space-y-1 relative">
                      <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-mono block flex items-center justify-between">
                        <span>Código / Item SKU {formMotiveType !== "Inversão" && <span className="text-red-500 font-sans">*</span>}</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 4125 ou Skol"
                        value={formItem}
                        onChange={(e) => {
                          setFormItem(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => {
                          // Allow click to register before hiding
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-hidden"
                      />

                      {/* Dropdown Suggestions */}
                      {showSuggestions && productSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-blue-500/50 rounded-xl shadow-2xl max-h-[160px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-800">
                          {productSuggestions.map((prod) => (
                            <button
                              key={prod.codigo}
                              type="button"
                              onClick={() => {
                                setFormItem(prod.codigo);
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left p-2 hover:bg-blue-900/40 focus:bg-blue-900/45 text-slate-200 flex flex-col transition-colors cursor-pointer"
                            >
                              <div className="font-bold text-blue-400">
                                #{prod.codigo}
                              </div>
                              <div className="text-slate-350 select-none text-[8.5px] whitespace-normal break-words leading-tight">
                                {prod.descricao}
                              </div>
                              <div className="text-[7.5px] text-slate-500 mt-0.5">
                                Fator Hl: {prod.fatorHecto}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* feedback info display - showing full name without cut-off truncate properties */}
                      {matchedProduct && (
                        <div className="mt-1 text-[8.5px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/40 rounded px-1.5 py-1 leading-tight flex flex-col animate-fade-in font-mono">
                          <span className="font-sans font-bold uppercase text-[9px] whitespace-normal break-words leading-normal">{matchedProduct.descricao}</span>
                          <span className="text-[7.5px] text-slate-400 mt-0.5">Cod: {matchedProduct.codigo} • Fator: {matchedProduct.fatorHecto} Hl</span>
                        </div>
                      )}
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                        Quantidade {formMotiveType !== "Inversão" && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Ex: 5"
                        value={formQuantidade}
                        onChange={(e) => setFormQuantidade(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-hidden"
                      />
                      {matchedProduct && formQuantidade && parseInt(formQuantidade) > 0 && (
                        <div className="mt-1 text-[8.5px] text-amber-400 font-mono leading-tight bg-amber-950/20 px-1.5 py-1 rounded border border-amber-900/30">
                          Total Hl: {calculateHectolitros(matchedProduct.codigo, parseInt(formQuantidade))}
                        </div>
                      )}
                    </div>

                    {/* Motivo Principal Selection */}
                    <div className="space-y-1.5 animate-fade-in md:col-span-2 mt-1">
                      <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest font-mono block">
                        Motivo do Item <span className="text-red-500">*</span>
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {([
                          "Produto Avariado", 
                          "Falta no SKU", 
                          ...(roleContext === "rota" ? ["Falta de SKU Completo"] : []),
                          "Inversão", 
                          "Outros"
                        ] as const).map(mot => (
                          <button
                            key={mot}
                            type="button"
                            onClick={() => {
                              setFormMotiveType(mot);
                              if (mot === "Outros") {
                                setFormMotiveText("");
                              } else {
                                setFormMotiveText(mot);
                              }
                            }}
                            className={`py-2 px-1 text-[10px] font-bold border rounded-xl text-center cursor-pointer transition-all ${
                              formMotiveType === mot 
                                ? "bg-blue-600 border-blue-500 text-white shadow font-extrabold" 
                                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {mot === "Produto Avariado" 
                              ? "🛠️ Avariado" 
                              : mot === "Falta no SKU" 
                                ? "📦 Falta no SKU" 
                                : mot === "Falta de SKU Completo"
                                  ? "🚨 Falta SKU Compl."
                                  : mot === "Inversão"
                                    ? "🔄 Inversão"
                                    : "📝 Outros"}
                          </button>
                        ))}
                      </div>

                      {/* Custom motif text field helper */}
                      {formMotiveType === "Outros" && (
                        <div className="space-y-1 mt-2">
                          <label className="text-[8px] text-slate-500 font-mono block">
                            Digite o motivo personalizado (Obrigatório):
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Atraso na entrega, erro de rota..."
                            value={formMotiveText}
                            onChange={(e) => setFormMotiveText(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-hidden"
                          />
                        </div>
                      )}
                      {formMotiveType === "Inversão" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-950 border border-slate-850/80 rounded-xl mt-2.5 animate-fade-in text-left">
                          
                          {/* Produto que deve ir */}
                          <div className="space-y-1.5 relative">
                            <label className="text-[9px] font-extrabold text-amber-500 uppercase tracking-wider font-mono block">
                              👉 Produto que deve Ir (Entregar) <span className="text-amber-400">*</span>
                            </label>
                            <div className="space-y-1.5 w-full">
                              <input
                                type="text"
                                placeholder="Selecione o Código SKU ou Nome"
                                value={formInversaoIr}
                                onChange={(e) => {
                                  setFormInversaoIr(e.target.value);
                                  setShowIrSuggestions(true);
                                }}
                                onFocus={() => setShowIrSuggestions(true)}
                                onBlur={() => {
                                  setTimeout(() => setShowIrSuggestions(false), 200);
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-amber-500 focus:outline-none text-left"
                              />
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-[9px] text-slate-450 font-mono font-bold uppercase">Qtd Promax:</span>
                                <input
                                  type="number"
                                  placeholder="Ex: 1"
                                  min="1"
                                  value={formInversaoIrQtd}
                                  onChange={(e) => setFormInversaoIrQtd(e.target.value)}
                                  className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-205 font-mono focus:border-amber-500 focus:outline-none text-center"
                                  title="Quantidade do produto que deve ir"
                                />
                              </div>
                            </div>
                            {showIrSuggestions && irProductSuggestions.length > 0 && (
                              <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-blue-500/50 rounded-xl shadow-2xl max-h-[140px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-800">
                                {irProductSuggestions.map((prod) => (
                                  <button
                                    key={prod.codigo}
                                    type="button"
                                    onClick={() => {
                                      setFormInversaoIr(`#${prod.codigo} - ${prod.descricao}`);
                                      setShowIrSuggestions(false);
                                    }}
                                    className="w-full text-left p-2 hover:bg-amber-950/40 text-slate-200 flex flex-col cursor-pointer"
                                  >
                                    <span className="font-bold text-amber-500">#{prod.codigo}</span>
                                    <span className="text-slate-350 text-[8px] whitespace-normal break-words leading-tight">{prod.descricao}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Produto que deve ser recolhido */}
                          <div className="space-y-1.5 relative">
                            <label className="text-[9px] font-extrabold text-blue-400 uppercase tracking-wider font-mono block">
                              👈 Produto que deve ser Recolhido (Voltar) <span className="text-blue-450">*</span>
                            </label>
                            <div className="space-y-1.5 w-full">
                              <input
                                type="text"
                                placeholder="Selecione o Código SKU ou Nome"
                                value={formInversaoRecolher}
                                onChange={(e) => {
                                  setFormInversaoRecolher(e.target.value);
                                  setShowRecolherSuggestions(true);
                                }}
                                onFocus={() => setShowRecolherSuggestions(true)}
                                onBlur={() => {
                                  setTimeout(() => setShowRecolherSuggestions(false), 200);
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:border-blue-500 focus:outline-none text-left"
                              />
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <span className="text-[9px] text-slate-450 font-mono font-bold uppercase">Qtd Recolher:</span>
                                <input
                                  type="number"
                                  placeholder="Ex: 1"
                                  min="1"
                                  value={formInversaoRecolherQtd}
                                  onChange={(e) => setFormInversaoRecolherQtd(e.target.value)}
                                  className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-205 font-mono focus:border-blue-500 focus:outline-none text-center"
                                  title="Quantidade do produto que deve retornar"
                                />
                              </div>
                            </div>
                            {showRecolherSuggestions && recolherProductSuggestions.length > 0 && (
                              <div className="absolute left-0 right-0 top-[105%] z-50 bg-slate-900 border border-blue-500/50 rounded-xl shadow-2xl max-h-[140px] overflow-y-auto font-mono text-[9px] divide-y divide-slate-800">
                                {recolherProductSuggestions.map((prod) => (
                                  <button
                                    key={prod.codigo}
                                    type="button"
                                    onClick={() => {
                                      setFormInversaoRecolher(`#${prod.codigo} - ${prod.descricao}`);
                                      setShowRecolherSuggestions(false);
                                    }}
                                    className="w-full text-left p-2 hover:bg-blue-950/40 text-slate-200 flex flex-col cursor-pointer"
                                  >
                                    <span className="font-bold text-blue-400">#{prod.codigo}</span>
                                    <span className="text-slate-350 text-[8px] whitespace-normal break-words leading-tight">{prod.descricao}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          
                        </div>
                      )}
                    </div>

                    {/* ADICIONAR ITEM BUTTON */}
                    <div className="md:col-span-2 flex justify-center pt-2">
                      <button
                        type="button"
                        onClick={() => handleAddItem()}
                        className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 border border-blue-500/40 hover:border-blue-500 text-blue-400 hover:text-white font-bold font-mono rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md shadow-slate-950/50 hover:scale-[1.02]"
                      >
                        ➕ Adicionar Produto à Lista
                      </button>
                    </div>

                  </div>

                  {/* MULTIPLE ITEMS DRAFT QUEUE LIST */}
                  {draftItems.length > 0 && (
                    <div className="bg-slate-950/80 p-4 border border-blue-900/30 rounded-2xl space-y-3 text-left animate-fade-in">
                      <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                        <span className="text-[9px] font-bold font-mono text-blue-400 uppercase tracking-widest">
                          🛍️ Lista de itens para lançar no mesmo comprovante ({draftItems.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setDraftItems([])}
                          className="text-[8.5px] text-red-400 hover:text-red-300 font-mono font-bold hover:underline"
                        >
                          Esvaziar tudo
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {draftItems.map((dItem) => {
                          const matchingRecord = records.find(r => r.produto === dItem.itemCode);
                          const unitPrice = matchingRecord?.valorUnitario || 98.50;
                          const totalPriceValue = unitPrice * dItem.quantidade;

                          return (
                            <div
                              key={dItem.id}
                              className="bg-slate-900 border border-slate-850 p-3 rounded-xl flex items-center justify-between text-[10.5px] font-sans gap-2"
                            >
                              <div className="flex-grow min-w-0 font-mono">
                                <span className="text-white font-bold block text-xs whitespace-normal break-words leading-tight">
                                  #{dItem.itemCode} - <span className="font-sans text-slate-300 font-medium">{dItem.itemDesc}</span>
                                </span>
                                <div className="text-[9.5px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-1 leading-snug">
                                  <span>Qtd: <strong>{dItem.quantidade} {dItem.motivo && dItem.motivo.toLowerCase().includes("falta de sku completo") ? "cx" : "un"}</strong></span>
                                  <span>•</span>
                                  <span className="text-amber-500 font-bold font-sans">Hl: {dItem.hectolitros.toFixed(4)}</span>
                                  <span>•</span>
                                  <span className="text-emerald-400 font-bold font-sans">Val: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalPriceValue)}</span>
                                  <span>•</span>
                                  <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-bold text-[8.5px] text-blue-400">
                                    {dItem.motivo}
                                  </span>
                                </div>
                                {dItem.produtoAhEnviar && (
                                  <div className="mt-1.5 p-1.5 bg-slate-950 rounded border border-amber-900/10 text-[9px] font-sans text-amber-500 leading-normal font-sans">
                                    🔄 Inversão registrada: <span className="text-white block font-mono">Ir: {dItem.produtoAhEnviar}</span> <span className="text-slate-400 block font-mono">Recolher: {dItem.produtoARecolher}</span>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => setDraftItems(prev => prev.filter(p => p.id !== dItem.id))}
                                className="p-1 px-2 border border-slate-800 hover:border-red-900 text-slate-500 hover:text-red-400 bg-slate-950 hover:bg-slate-950/80 rounded-lg cursor-pointer transition-colors"
                                title="Remover este SKU da listagem"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Draft Summary */}
                      <div className="pt-2 border-t border-slate-900 grid grid-cols-2 gap-2 text-[10px] font-mono font-bold text-slate-400 bg-slate-950 p-2.5 rounded-lg leading-relaxed">
                        <div className="flex justify-between border-r border-slate-900 pr-2.5">
                          <span>Vol. HL Total:</span>
                          <span className="text-amber-500 font-extrabold text-[11px]">
                            {draftItems.reduce((sum, item) => sum + item.hectolitros, 0).toFixed(4)} HL
                          </span>
                        </div>
                        <div className="flex justify-between pl-1">
                          <span>Valor Total:</span>
                          <span className="text-emerald-450 font-extrabold text-[11px]">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                              draftItems.reduce((sum, item) => {
                                const matchingRec = records.find(r => r.produto === item.itemCode);
                                const uPr = matchingRec?.valorUnitario || 98.50;
                                return sum + (uPr * item.quantidade);
                              }, 0)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Foto da Avaria / Captura - STRICTLY MANDATORY */}
                  <div className="space-y-1.5 border border-slate-800/40 p-4 bg-slate-950/40 rounded-2xl">
                    <label className="text-[9px] font-bold text-slate-300 uppercase tracking-widest font-mono flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-blue-405">
                        📸 Foto da Avaria ou Documento {formMotiveType === "Falta de SKU Completo" ? "" : <span className="text-red-500 font-sans">*</span>}
                      </span>
                      {formMotiveType === "Falta de SKU Completo" ? (
                        <span className="text-[7.5px] bg-emerald-950/50 border border-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded-full font-mono font-bold">
                          NÃO OBRIGATÓRIO (FALTA DE SKU)
                        </span>
                      ) : (
                        <span className="text-[7.5px] bg-red-950/50 border border-red-900/30 text-red-400 px-2 py-0.5 rounded-full font-mono font-bold">
                          OBRIGATÓRIO
                        </span>
                      )}
                    </label>

                    {/* Zone to select custom image / camera */}
                    <div className="relative border-2 border-dashed border-slate-800 rounded-xl bg-slate-950 p-4 transition-all hover:border-slate-700 flex flex-col items-center justify-center text-center">
                      {formFotoUrl ? (
                        <div className="space-y-3 w-full flex flex-col items-center justify-center">
                          {formFotoUrl.startsWith("data:application/pdf") ? (
                            <div className="flex flex-col items-center justify-center p-4 bg-slate-900 border border-slate-800 rounded-xl max-w-xs w-full animate-fade-in">
                              <FileText className="w-10 h-10 text-blue-500 animate-pulse" />
                              <span className="text-[10px] text-slate-200 font-mono font-bold mt-2">Documento PDF Carregado</span>
                              <span className="text-[8px] text-slate-500 font-mono mt-0.5">Clique em remover para alterar</span>
                            </div>
                          ) : (
                            <img
                              src={formFotoUrl}
                              alt="Log de Avaria / Documento"
                              className="h-28 object-contain rounded-xl border border-slate-800 shadow-2xl animate-fade-in"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => setFormFotoUrl("")}
                            className="px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-900/40 text-red-400 hover:text-white text-[9px] font-mono rounded-lg transition-all font-bold cursor-pointer"
                          >
                            ✖ Remover arquivo selecionado
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-4 w-full">
                          <div className="p-2.5 bg-yellow-950/40 border border-yellow-900/35 rounded-xl text-[9px] font-mono leading-relaxed text-yellow-500 text-left">
                            💡 <strong>DICA DE VELOCIDADE:</strong> Se o seu celular vive travando, use a <strong>Câmera Integrada (Recomendado)</strong>. Ela consome pouquíssima memória e não fecha a página.
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1">
                            {/* Option 1: INTERACTIVE REAL-TIME WEBCAM */}
                            <button
                              type="button"
                              onClick={() => {
                                setWebcamFacingMode("environment");
                                setIsWebcamOpen(true);
                              }}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all"
                            >
                              <Camera className="w-3.5 h-3.5 text-emerald-100 shrink-0" />
                              <span className="truncate">Câmera Integrada</span>
                            </button>

                            {/* Option 2: Direct Native Phone Camera */}
                            <label className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-extrabold rounded-xl cursor-pointer shadow-lg active:scale-95 transition-all">
                              <Camera className="w-3.5 h-3.5 text-blue-100 shrink-0" />
                              <span className="truncate">Câmera do Celular</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>

                            {/* Option 3: Document / File Import */}
                            <label className="flex items-center justify-center gap-1.5 py-2.5 px-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-250 text-[10px] font-bold rounded-xl cursor-pointer active:scale-95 transition-all">
                              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">Galeria / PDF</span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                            </label>
                          </div>
                          
                          <p className="text-[7.5px] text-slate-500 font-mono">
                            A tecnologia de câmera integrada captura a foto diretamente na página sem reabrir aplicativos, ideal para áreas de sinal celular fraco.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* WEBCAM CAPTURE OVERLAY MODAL */}
                    {isWebcamOpen && (
                      <div className="fixed inset-0 z-[110] bg-black/95 flex flex-col items-center justify-center p-4">
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-4 space-y-4 text-center shadow-2xl animate-fade-in">
                          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <span className="text-[10px] font-mono font-extrabold text-slate-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              📸 CÂMERA INTEGRADA (PREVINE TRAVAMENTOS)
                            </span>
                            <button 
                              type="button" 
                              onClick={stopWebcam}
                              className="text-slate-450 hover:text-white font-mono text-[10px] px-2 py-1 bg-slate-850 hover:bg-slate-800 rounded-lg cursor-pointer"
                            >
                              Fechar [X]
                            </button>
                          </div>

                          <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video">
                            {isWebcamLoading && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-blue-400 font-mono text-[10px] space-y-2">
                                <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                                <span>Acessando sensor da câmera, aguarde...</span>
                              </div>
                            )}
                            {webcamError && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 text-red-400 font-mono text-[9px] p-4 space-y-2 z-10">
                                <AlertTriangle className="w-6 h-6 text-red-500 animate-pulse" />
                                <span className="text-center font-sans font-medium text-slate-200 max-w-xs">{webcamError}</span>
                                <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full max-w-xs">
                                  <label className="bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white px-3 py-2 rounded-xl border border-emerald-500 cursor-pointer font-sans font-bold flex items-center justify-center gap-1.5 shadow-md transition-all">
                                    <Camera className="w-4 h-4" />
                                    <span>📸 Tirar Foto (Câmera Nativa)</span>
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      capture="environment" 
                                      onChange={(e) => { handleImageUpload(e); stopWebcam(); }} 
                                      className="hidden" 
                                    />
                                  </label>
                                  <div className="flex gap-2">
                                    <button 
                                      type="button" 
                                      onClick={() => startWebcam(webcamFacingMode)}
                                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-[9px] text-white px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer font-sans font-bold"
                                    >
                                      🔄 Tentar Novamente
                                    </button>
                                    <button 
                                      type="button" 
                                      onClick={stopWebcam}
                                      className="bg-rose-950 hover:bg-rose-900 text-[9px] text-rose-300 px-3 py-1.5 rounded-lg border border-rose-900/50 cursor-pointer font-sans font-bold"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover bg-black"
                            />
                          </div>

                          <p className="text-[9.5px] text-slate-400 leading-normal font-sans">
                            Aponte a câmera para a <strong>avaria do produto, lote ou documento</strong> e clique no botão verde de captura abaixo.
                          </p>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={handleToggleCameraDirection}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-mono rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1 shrink-0"
                              title="Alternar Câmera"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>🔄 Virar Câmera</span>
                            </button>

                            <button
                              type="button"
                              disabled={isWebcamLoading || !!webcamError}
                              onClick={captureWebcamSnapshot}
                              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[11px] font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Capturar Foto</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[8px] text-slate-500 font-mono mt-1 leading-normal text-slate-400">
                      Formatos suportados: Imagens (JPG, PNG) de câmera integrada/galeria ou PDF de NF de até 2MB.
                    </p>
                  </div>

                  {/* Observação */}
                  <div className="space-y-1">
                    <label className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
                      Observação / Detalhe do Produto
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Descreva o produto, quantidade, justificativa ou observações gerais..."
                      value={formObservacao}
                      onChange={(e) => setFormObservacao(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>

                  {/* Error display */}
                  {formError && (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-900/50 rounded-lg flex items-start space-x-2 text-rose-300 text-[9.5px] leading-relaxed font-mono">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-450 shrink-0 mt-0.5" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-sans flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-lg shadow-blue-900/20"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>{editingRequestId ? "Salvar Ajustes e Reenviar" : "Registrar e Enviar ao Controle"}</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: MINHAS SOLICITAÇÕES PENDENTES (Aguardando análise ou Retido Offline/Recusado) */}
          {sectorTab === "pendentes" && (() => {
            const onlyPendings = currentSectorPendingRequests.filter(req => req.statusPromax === "pendente" || req.statusPromax === "corrigir" || req.isOffline || req.statusPromax === "reprovado");
            const groupedPendings = groupPendingRequests(onlyPendings);
            return (
              <div className="flex-grow pl-4 pr-5 py-4 overflow-y-auto max-h-[510px] space-y-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850/80">
                  <h4 className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5 uppercase font-mono mb-1 text-left">
                    <Clock className="w-3.5 h-3.5 text-amber-550" /> Painel de Retorno Promax
                  </h4>
                  <p className="text-[9.5px] text-slate-400 font-sans leading-relaxed text-left">
                    Veja suas solicitações aguardando validação ou retidas offline por ausência momentânea de conexão.
                  </p>
                </div>

                {groupedPendings.length === 0 ? (
                  <div className="text-center py-20 text-slate-550 space-y-2">
                    <Clock className="w-8 h-8 mx-auto stroke-1 text-slate-650" />
                    <p className="font-mono text-[9.5px]">Nenhuma solicitação pendente no setor {selectedSector}.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedPendings.map((group) => {
                      const firstReq = group[0];
                      const isReprovado = group.some(req => req.statusPromax === "reprovado");
                      const isCorrigir = group.some(req => req.statusPromax === "corrigir");
                      const isOffline = group.some(req => req.isOffline);
                      
                      return (
                        <div
                          key={getSolicitacaoNum(firstReq)}
                          className={`p-3 bg-slate-950 rounded-xl border space-y-2.5 transition-all text-left overflow-hidden ${
                            isReprovado 
                              ? "border-rose-950 hover:border-rose-900 bg-rose-955/5" 
                              : isCorrigir
                                ? "border-amber-950/40 hover:border-amber-900/60 bg-amber-955/5"
                                : isOffline 
                                  ? "border-amber-955 hover:border-amber-900 bg-amber-955/5" 
                                  : "border-slate-850/60 hover:border-slate-800"
                          }`}
                        >
                          <div className="flex justify-between items-center gap-2 min-w-0 w-full text-left">
                            <div className="flex-1 min-w-0">
                              <span className="text-[8.5px] font-mono text-blue-400 font-bold uppercase tracking-wider block">
                                SOLICITAÇÃO #{getSolicitacaoNum(firstReq)}
                              </span>
                              <h5 className="font-bold text-xs text-white truncate mt-0.5">NF-e: {firstReq.nf}</h5>
                              <span className="text-[9px] font-mono text-slate-450 block mt-0.5 truncate">
                                Mapa: {firstReq.mapa || "Não informado"} • NB: {firstReq.nb}
                              </span>
                              <div className="flex flex-col text-[8px] text-slate-500 mt-1 space-y-0.5">
                                <span>Solicitado em: {firstReq.data}</span>
                                {(isReprovado || isCorrigir) && firstReq.reprovadoDate && (
                                  <span className="text-rose-455 font-semibold">Ação do Controle em: {firstReq.reprovadoDate}</span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end space-y-1.5">
                              {isOffline ? (
                                <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-500 border border-amber-900 font-mono font-bold flex items-center gap-1">
                                  🛫 Retido Offline
                                </span>
                              ) : isReprovado ? (
                                <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-rose-955/80 text-rose-450 border border-rose-900 font-mono font-bold flex items-center gap-1">
                                  ❌ Recusada
                                </span>
                              ) : isCorrigir ? (
                                <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-amber-955/80 text-amber-450 border border-amber-900/55 font-mono font-bold flex items-center gap-1 animate-pulse">
                                  ⚠️ Ajustar pelo RN
                                </span>
                              ) : (
                                <span className="text-[8.5px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-900/50 font-mono font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                                  No Controle
                                </span>
                              )}

                              {/* Allow deletion if pending */}
                              {(firstReq.statusPromax === "pendente" || firstReq.statusPromax === "corrigir" || firstReq.isOffline) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSectorPendingRequest(firstReq.id)}
                                  className="p-1 text-slate-500 hover:text-red-400 bg-slate-900/80 rounded-md hover:bg-red-955 border border-slate-800 hover:border-red-900 transition-all cursor-pointer"
                                  title="Cancelar solicitação"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}

                              {/* Emit client receipt */}
                              <button
                                type="button"
                                onClick={() => setReceiptRequest(firstReq)}
                                className="px-2 py-0.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-blue-450 hover:text-blue-300 font-bold rounded-md text-[8.5px] font-mono flex items-center gap-1 transition-all cursor-pointer"
                                title="Emitir Recibo do Cliente"
                              >
                                <FileText className="w-2.5 h-2.5" />
                                <span>Recibo</span>
                              </button>
                            </div>
                          </div>

                          {/* Group items display inside Pending card */}
                          <div className="border-t border-slate-850/40 pt-2 space-y-1.5 text-[9.5px] font-mono text-left">
                            <span className="text-[8px] uppercase font-bold text-slate-500 font-sans tracking-wide">
                              Itens lançados nesta solicitação:
                            </span>
                            {group.map((req) => {
                              const reqItems = req.items && req.items.length > 0 ? req.items : [{
                                item: req.item,
                                descricao: req.item ? PRODUCT_DATABASE.find(p => p.codigo === req.item)?.descricao : undefined,
                                quantidade: req.quantidade,
                                motivo: req.motivo,
                                hectolitros: req.hectolitros
                              }];

                              return reqItems.map((subItem, sIdx) => (
                                <div key={`${req.id}_${sIdx}`} className="bg-slate-950/60 p-2 rounded-lg border border-slate-850/30 text-[9.5px] space-y-0.5">
                                  <div className="flex justify-between font-bold text-slate-200">
                                    <span className="truncate max-w-[70%]">#{subItem.item} - {subItem.descricao || "Produto"}</span>
                                    <span className="text-amber-500 font-bold">{subItem.quantidade} cx</span>
                                  </div>
                                  <div className="flex justify-between text-[8px] text-slate-500 mt-0.5 font-mono">
                                    <span>Motivo: <strong className="text-slate-400 font-medium">{subItem.motivo}</strong></span>
                                    {subItem.hectolitros ? <span>Volume: {subItem.hectolitros.toFixed(4)} HL</span> : null}
                                  </div>
                                </div>
                              ));
                            })}
                          </div>

                          {/* Rejection comment */}
                          {isReprovado && firstReq.rejeitadoObs && (
                            <div className="p-2.5 bg-rose-955/10 border border-rose-950/40 rounded-lg text-[9px] text-rose-300 font-sans leading-relaxed text-left">
                              <span className="font-bold uppercase tracking-wider text-[8px] font-mono text-rose-400 block mb-0.5">Motivo do Cancelamento / Pendência:</span>
                              "{firstReq.rejeitadoObs}"
                              <div className="text-[8px] text-slate-500 mt-1 font-mono">
                                Cancelador: {firstReq.reprovadoUser || "Gestor"} em {firstReq.reprovadoDate}
                              </div>
                            </div>
                          )}

                          {/* Correction comment & action */}
                          {isCorrigir && firstReq.rejeitadoObs && (
                            <div className="p-2.5 bg-amber-955/15 border border-amber-900/40 rounded-lg text-[9px] text-amber-300 font-sans leading-relaxed text-left space-y-1.5 animate-fade-in">
                              <div>
                                <span className="font-bold uppercase tracking-wider text-[8px] font-mono text-amber-400 block mb-0.5">⚠️ Correção Solicitada pelo Controle:</span>
                                <p className="italic">"{firstReq.rejeitadoObs}"</p>
                                <div className="text-[8px] text-slate-500 mt-1 font-mono">
                                  Solicitado por: {firstReq.reprovadoUser || "Gestor"} em {firstReq.reprovadoDate}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  // Load this request's full data into the form structure so they can correct it!
                                  setEditingRequestId(firstReq.id);
                                  setFormMapa(firstReq.mapa || "");
                                  setFormNb(firstReq.nb || "");
                                  setFormNf(firstReq.nf || "");
                                  setFormFotoUrl(firstReq.fotoUrl || "");
                                  setFormObservacao(firstReq.observacao || "");
                                  
                                  if (firstReq.items && firstReq.items.length > 0) {
                                    setDraftItems(firstReq.items.map(item => ({
                                      id: item.id || `draft_item_${Date.now()}_${Math.random()}`,
                                      itemCode: item.item,
                                      itemDesc: item.descricao,
                                      quantidade: item.quantidade,
                                      motivo: item.motivo,
                                      fatorHecto: item.fatorHecto,
                                      hectolitros: item.hectolitros,
                                      produtoAhEnviar: item.produtoAhEnviar,
                                      produtoARecolher: item.produtoARecolher
                                    })));
                                  } else {
                                    const productDef = PRODUCT_DATABASE.find(p => p.codigo === firstReq.item);
                                    setDraftItems([{
                                      id: `draft_item_${Date.now()}`,
                                      itemCode: firstReq.item,
                                      itemDesc: productDef ? productDef.descricao : "Produto",
                                      quantidade: firstReq.quantidade || 1,
                                      motivo: firstReq.motivo || "Produto Avariado",
                                      fatorHecto: firstReq.fatorHecto,
                                      hectolitros: firstReq.hectolitros
                                    }]);
                                  }
                                  setSectorTab("novo");
                                }}
                                className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 hover:text-white text-white font-bold font-sans rounded-lg text-[9.5px] cursor-pointer text-center block transition-all shadow-md active:scale-95"
                              >
                                Corrigir e Reenviar ao Controle
                              </button>
                            </div>
                          )}

                          {/* Photo preview */}
                          {firstReq.fotoUrl && (
                            <div className="flex gap-2.5 items-center bg-slate-900/80 p-2 rounded-lg border border-slate-850/80">
                              <img
                                src={firstReq.fotoUrl}
                                alt="Evidência avaria"
                                className="w-11 h-11 object-cover rounded-md border border-slate-800 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="text-[9px] font-mono text-slate-400 leading-tight">
                                <span className="font-sans font-bold text-slate-350 block truncate">Evidência Anexa</span>
                                <span className="block truncate max-w-[170px] italic text-[8.5px]">"{firstReq.observacao || "Sem observações"}"</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 4: SOLICITAÇÕES APROVADAS (Aba própria para visualização limpa e descarga na Base Geral) */}
          {sectorTab === "aprovadas" && (() => {
            const approvedList = currentSectorPendingRequests.filter(req => req.statusPromax === "cadastrado");
            const groupedApprovedList = groupPendingRequests(approvedList);
            return (
              <div className="flex-grow pl-4 pr-5 py-4 overflow-y-auto max-h-[510px] space-y-3">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850/80">
                  <h4 className="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5 uppercase font-mono mb-1 text-left">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-450" /> Retorno Promax Disponível
                  </h4>
                  <p className="text-[9.5px] text-slate-400 font-sans leading-relaxed text-left font-medium">
                    Abra os comprovantes de liberação do controle para analisar os detalhes e transferir para a base consolidada geral de lançamentos.
                  </p>
                </div>

                {groupedApprovedList.length === 0 ? (
                  <div className="text-center py-20 text-slate-550 space-y-3">
                    <div className="w-10 h-10 bg-slate-950/60 rounded-full border border-slate-850 flex items-center justify-center mx-auto text-slate-650">
                      <CheckCircle2 className="w-5 h-5 stroke-1" />
                    </div>
                    <p className="font-mono text-[9px] max-w-[210px] mx-auto leading-relaxed">
                      Todas as trocas aprovadas deste setor já foram visualizadas e transferidas! Visualização 100% limpa. ✨
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {groupedApprovedList.map((group) => {
                      const firstReq = group[0];
                      
                      // Calculate total items
                      let totalItemsCount = 0;
                      group.forEach(req => {
                        if (req.items && req.items.length > 0) {
                          totalItemsCount += req.items.length;
                        } else {
                          totalItemsCount += 1;
                        }
                      });

                      return (
                        <button
                          key={getSolicitacaoNum(firstReq)}
                          type="button"
                          onClick={() => setSelectedApprovedDetail(firstReq)}
                          className="w-full text-left p-3.5 bg-gradient-to-br from-slate-950 to-slate-900 rounded-xl border border-emerald-900/30 space-y-2.5 hover:border-emerald-500/40 relative group cursor-pointer transition-all hover:scale-[1.01] overflow-hidden animate-fade-in"
                        >
                          <div className="flex justify-between items-center gap-2 min-w-0 w-full text-left">
                            <div className="flex-1 min-w-0">
                              <span className="text-[8.5px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
                                SOLICITAÇÃO #{getSolicitacaoNum(firstReq)}
                              </span>
                              <h5 className="font-bold text-xs text-white group-hover:text-emerald-400 transition-colors truncate mt-0.5 font-sans">NF-e: {firstReq.nf}</h5>
                              <span className="text-[9px] font-mono text-slate-450 block mt-0.5">
                                Mapa: {firstReq.mapa || "Sem Mapa"} • NB: {firstReq.nb}
                              </span>
                              <div className="flex flex-col text-[8px] text-slate-500 mt-1 space-y-0.5">
                                <span>Solicitado em: {firstReq.data}</span>
                                <span>Aprovado em: {firstReq.cadastroDate || firstReq.data}</span>
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1.5">
                              <span className="text-[8.5px] px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-950/50 font-mono font-bold flex items-center gap-1 shadow-sm shadow-emerald-950/25">
                                Promax OK
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-slate-850/40 pt-2 flex flex-col gap-1 text-[9.5px] font-mono text-slate-300">
                            <span className="text-[8px] uppercase font-bold text-slate-500 font-sans tracking-wide">
                              Itens Aprovados nesta solicitação:
                            </span>
                            <div className="space-y-1">
                              {group.map((req) => {
                                const reqItems = req.items && req.items.length > 0 ? req.items : [{
                                  item: req.item,
                                  descricao: req.item ? PRODUCT_DATABASE.find(p => p.codigo === req.item)?.descricao : undefined,
                                  quantidade: req.quantidade,
                                  motivo: req.motivo,
                                  hectolitros: req.hectolitros
                                }];

                                return reqItems.map((subItem, sIdx) => (
                                  <div key={`${req.id}_${sIdx}`} className="flex justify-between text-slate-350 bg-slate-950/60 p-1.5 rounded border border-slate-850/30">
                                    <span className="truncate max-w-[70%] text-slate-400">#{subItem.item} - {subItem.descricao || "Produto"}</span>
                                    <span className="shrink-0 font-bold text-emerald-400">{subItem.quantidade} cx</span>
                                  </div>
                                ));
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[9px] font-mono text-emerald-450 pt-1.5 border-t border-slate-850/40">
                            <span>Total de SKUs: {totalItemsCount}</span>
                            <span className="bg-emerald-950/60 px-2 py-0.5 rounded font-bold border border-emerald-900/20 group-hover:bg-emerald-900/30 hover:text-white transition-colors duration-200">
                              Visualizar e Salvar &rarr;
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}

      {/* FLOATING SUCCESS NOTIFICATION POPUP FOR NEWLY REGISTERED REQUESTS */}
      {selectedSector && unnotifiedApprovals.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-950/60 border border-emerald-500/40 text-emerald-450 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white font-display">🎉 Nova Aprovação Disponível!</h3>
              <p className="text-xs text-slate-300 font-sans leading-relaxed">
                As seguintes solicitações foram revisadas e já estão cadastradas com sucesso no Promax pelo controle:
              </p>
              
              <div className="max-h-[140px] overflow-y-auto space-y-1.5 p-2.5 bg-slate-950 rounded-xl border border-slate-850/60 font-mono text-left">
                {unnotifiedApprovals.map(appr => (
                  <div key={appr.id} className="text-[10px] border-b border-slate-905 last:border-0 pb-1.5 last:pb-0 flex flex-col">
                    <span className="font-bold text-emerald-450">NF-e: {appr.nf}</span>
                    <span className="text-[9px] text-slate-400">Mapa: {appr.mapa || "N/A"} • NB: {appr.nb}</span>
                    <span className="text-[8.5px] italic text-slate-500">Motivo: {appr.motivo || "Avaria"}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleDismissApprovals}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              OK, Entendido!
            </button>
          </div>
        </div>
      )}

      {/* FLOATING REJECTION/RETURN NOTIFICATION POPUP */}
      {selectedSector && unnotifiedRejections.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-fade-in animate-duration-200">
          <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-red-955/60 border border-red-500/40 text-red-450 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-red-400 font-sans tracking-wide">⚠️ Solicitação Recusada pelo Controle</h3>
              <p className="text-[10px] text-slate-350 font-sans leading-relaxed">
                As seguintes notas fiscais foram devolvidas pelo controle para correção:
              </p>
              
              <div className="max-h-[160px] overflow-y-auto space-y-2 p-2.5 bg-slate-950 rounded-xl border border-slate-850/60 font-mono text-left">
                {unnotifiedRejections.map(rej => (
                  <div key={rej.id} className="text-[9.5px] border-b border-slate-900 last:border-0 pb-2 last:pb-0 flex flex-col space-y-1">
                    <span className="font-bold text-red-400">NF-e: {rej.nf}</span>
                    <p className="p-1.5 bg-red-950/40 border border-red-900/30 text-red-350 rounded font-sans italic text-[8.5px]">
                      Motivo: "{rej.rejeitadoObs || "Sem observações informadas"}"
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleDismissRejections}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg active:scale-95"
            >
              Ciente, vou corrigir!
            </button>
          </div>
        </div>
      )}

      {/* FLOATING DUPLICATION DETECTED ALERT MODAL */}
      {duplicateFound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-fade-in animate-duration-205">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-950/80 border border-amber-500/40 text-amber-400 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-md font-extrabold text-amber-400 font-sans tracking-wide uppercase">🚫 Troca Já Cadastrada!</h3>
              <p className="text-[10.5px] text-slate-300 font-sans leading-normal">
                Não é permitido cadastrar duplicidades. Encontramos uma solicitação idêntica com a mesma NF-e, SKU e Quantidade:
              </p>
            </div>

            {/* Existing Item Card */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 space-y-2.5 font-mono text-[9px] text-slate-350 leading-relaxed max-h-[220px] overflow-y-auto">
              <div className="flex justify-between items-center bg-slate-900/60 p-1.5 px-2.5 rounded-lg border border-slate-850">
                <span className="text-amber-500 font-bold uppercase tracking-wider text-[8px] font-sans">
                  {duplicateFound.type === "base" ? "💾 Na Base Cadastrada" : "⏳ Pendente no Controle"}
                </span>
                <span className="text-slate-450 text-[8.5px]">NF-e: <strong className="text-white font-bold">{duplicateFound.record.nf}</strong></span>
              </div>

              <div className="space-y-1 bg-slate-900 pb-1 rounded-xl p-2 border border-slate-850/40">
                <div className="flex flex-col">
                  <span className="text-[7.5px] text-slate-500">CLIENTE / CANAL:</span>
                  <span className="font-bold text-white text-[10px] truncate max-w-[270px]">{duplicateFound.record.cliente}</span>
                </div>
                {duplicateFound.record.codigoCliente && (
                  <div className="text-[8px] text-slate-400">
                    Código NB: <span className="font-bold text-slate-200">{duplicateFound.record.codigoCliente}</span>
                  </div>
                )}
              </div>

              <div className="p-2 bg-slate-900 rounded-xl border border-slate-850/40 space-y-1">
                <div className="flex flex-col">
                  <span className="text-[7.5px] text-slate-500">PRODUTO LANÇADO:</span>
                  <span className="font-semibold text-slate-100 text-[10px] leading-tight truncate max-w-[270px]">{duplicateFound.record.produto || "Código de Item digitado"}</span>
                </div>
                <div className="flex justify-between text-[8px] text-slate-400 pt-0.5">
                  <span>Qtd Comprovada:</span>
                  <strong className="text-amber-400 font-extrabold text-[9px]">{duplicateFound.record.quantidade} Unidades</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 bg-slate-900 p-2 rounded-xl border border-slate-850/40 text-[8px] text-slate-400">
                <div>
                  <span className="block text-[7px] text-slate-500">DATA REGISTRO:</span>
                  <span className="text-slate-200 font-bold">{duplicateFound.record.data}</span>
                </div>
                <div>
                  <span className="block text-[7px] text-slate-500">SITUAÇÃO ATUAL:</span>
                  <span className="text-blue-450 font-extrabold uppercase text-[7.5px]">{duplicateFound.record.status}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDuplicateFound(null)}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-lg active:scale-95"
            >
              Fazer outra solicitação
            </button>
          </div>
        </div>
      )}

      {/* DETAILED APPROVED MODAL OVERLAY (Visualizar e Lançar para a base geral) */}
      {selectedApprovedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xs animate-fade-in text-slate-150">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 max-w-sm w-full shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="text-left">
                <span className="text-[8px] font-mono text-slate-450 uppercase">DOCUMENTO APROVADO PELO CONTROLE</span>
                <h3 className="text-sm font-bold text-white font-display">Detalhamento NF-e: {selectedApprovedDetail.nf}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApprovedDetail(null)}
                className="p-1 px-2.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-lg cursor-pointer font-mono text-xs font-bold"
              >
                X
              </button>
            </div>

            {/* Core Body */}
            <div className="space-y-3.5 text-left text-xs font-sans">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850/60 font-mono text-[9.5px]">
                <div>
                  <span className="text-[8px] text-slate-500 block leading-tight">MAPA DE RETORNO</span>
                  <span className="font-bold text-white">{selectedApprovedDetail.mapa || "Sem Mapa"}</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block leading-tight">NB CLIENTE</span>
                  <span className="font-bold text-white">{selectedApprovedDetail.nb}</span>
                </div>
              </div>

              {/* Items List inside verified approval request */}
              {selectedApprovedDetail.items && selectedApprovedDetail.items.length > 0 ? (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850/60 font-mono text-[9px] space-y-2.5">
                  <span className="text-[8px] text-blue-400 block leading-tight uppercase font-bold">ITENS / PRODUTOS SOLICITADOS ({selectedApprovedDetail.items.length})</span>
                  
                  <div className="space-y-2 divide-y divide-slate-900">
                    {selectedApprovedDetail.items.map((subItem, sIdx) => {
                      const prodInfo = PRODUCT_DATABASE.find(p => p.codigo === subItem.item);
                      const fullDescr = prodInfo ? prodInfo.descricao : (subItem.descricao || "Item SSTR Reposição");
                      const itemUnitPrice = records.find(r => r.produto === subItem.item)?.valorUnitario || 98.50;
                      const itemTotalPrice = itemUnitPrice * subItem.quantidade;

                      return (
                        <div key={subItem.id || sIdx} className="pt-2 first:pt-0 space-y-1">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-white font-bold leading-normal break-words whitespace-normal block flex-grow">
                              #{subItem.item} - <span className="font-sans font-medium text-slate-350">{fullDescr}</span>
                            </span>
                            <span className="text-emerald-450 font-bold whitespace-nowrap">
                              {subItem.quantidade} {subItem.motivo && subItem.motivo.toLowerCase().includes("falta de sku completo") ? "cx" : "un"}
                            </span>
                          </div>
                          
                          <div className="flex justify-between text-[8px] text-slate-450 items-center">
                            <span>Hl: <strong className="text-amber-500 font-mono">{subItem.hectolitros?.toFixed(4) || "0.0000"}</strong></span>
                            <span>Motivo: <strong className="text-blue-400">{subItem.motivo || selectedApprovedDetail.motivo}</strong></span>
                            <span>Val: <strong className="text-green-400">R$ {itemTotalPrice.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</strong></span>
                          </div>

                          {subItem.produtoAhEnviar && (
                            <div className="mt-1 p-1 bg-slate-900 border border-slate-850 rounded text-[8px] font-sans text-amber-500 leading-normal">
                              🔄 Inversão: <span>Deve ir: {subItem.produtoAhEnviar}</span> | <span>Deve recolher: {subItem.produtoARecolher}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-900 pt-2 flex justify-between font-bold text-[9.5px]">
                    <div>
                      <span className="text-[7.5px] text-slate-500 block leading-tight uppercase">VOL. TOTAL ACUMULADO</span>
                      <span className="text-amber-500 font-mono">{selectedApprovedDetail.hectolitros?.toFixed(4) || "0.0000"} HL</span>
                    </div>
                    <div>
                      <span className="text-[7.5px] text-slate-500 block leading-tight uppercase">VALOR TOTAL PREVISTO</span>
                      <span className="text-blue-400">
                        R$ {selectedApprovedDetail.items.reduce((sum, current) => {
                          const itemUnitPrice = records.find(r => r.produto === current.item)?.valorUnitario || 98.50;
                          return sum + (itemUnitPrice * current.quantidade);
                        }, 0).toLocaleString("pt-BR", {minimumFractionDigits: 2})}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Legacy format block (single SKU) */
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850/60 font-mono text-[9.5px]">
                  <div>
                    <span className="text-[8px] text-slate-500 block leading-tight font-bold">CÓDIGO SKU ITEM</span>
                    <span className="font-bold text-white">{selectedApprovedDetail.item}</span>
                  </div>
                  <div>
                    <span className="text-[8px] text-slate-500 block leading-tight font-bold">QUANTIDADE CAIXAS</span>
                    <span className="font-bold text-emerald-450">
                      {selectedApprovedDetail.quantidade} {selectedApprovedDetail.motivo && selectedApprovedDetail.motivo.toLowerCase().includes("falta de sku completo") ? "cx" : "un"}
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-slate-900 pt-2 flex justify-between">
                    <div>
                      <span className="text-[8px] text-slate-500 block leading-tight">VOLUME FISCAL</span>
                      <span className="font-bold text-amber-500">{selectedApprovedDetail.hectolitros?.toFixed(4) || "0.0000"} Hectolitros</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-slate-500 block leading-tight">VALOR PREVISTO</span>
                      <span className="font-bold text-blue-400">R$ {((records.find(r => r.produto === selectedApprovedDetail.item)?.valorUnitario || 98.50) * (selectedApprovedDetail.quantidade || 1)).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Observation & Motivo */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-850/60 space-y-1.5">
                <span className="text-[8px] font-mono text-slate-500 uppercase block">Motivo & Observação de Campo</span>
                <p className="text-[10px] text-slate-300 leading-relaxed italic">
                  "{selectedApprovedDetail.observacao || "Sem observações detalhadas escritas pelo emissor."}"
                </p>
                <span className="bg-slate-900 border border-slate-800 text-[8px] font-mono text-slate-400 px-2 py-0.5 rounded-md inline-block">
                  Motivo Selecionado: {selectedApprovedDetail.motivo || "Avaria"}
                </span>
              </div>

              {/* Control signature chancel */}
              <div className="p-2.5 bg-emerald-950/15 border border-emerald-900/30 rounded-xl space-y-1.5">
                <span className="text-[8.5px] font-mono text-emerald-400 uppercase tracking-wider block font-bold">CHANCELA DE REGISTRO - CONTROLE DE RETORNO</span>
                <div className="text-[9.5px] font-mono text-emerald-300 space-y-0.5">
                  <p>Operador: <span className="text-white font-bold">{selectedApprovedDetail.cadastroUser}</span></p>
                  <p>Data e Hora: <span className="text-white font-bold">{selectedApprovedDetail.cadastroDate}</span></p>
                </div>
              </div>

              {/* Evidence image photo link */}
              {selectedApprovedDetail.fotoUrl && (
                <div className="space-y-1">
                  <span className="text-[8.5px] font-mono text-slate-500 uppercase block">FOTO COMPROBATÓRIA DE AVARIA</span>
                  <div className="relative rounded-xl overflow-hidden border border-slate-800 max-h-[160px]">
                    <img
                      src={selectedApprovedDetail.fotoUrl}
                      alt="Comprovante de avaria"
                      className="w-full h-full object-contain bg-slate-950"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions button footer */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceiptRequest(selectedApprovedDetail)}
                className="col-span-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center space-x-1.5 shadow-md"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Emitir Recibo do Cliente</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedApprovedDetail(null)}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => handleTransferToConsolidatedBase(selectedApprovedDetail)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Lançar na Base</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RENDER BEAUTIFUL INTERACTIVE CLIENT RECEIPT MODAL */}
      {receiptRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xs overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 max-h-[95vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 font-mono flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-500" /> Recibo Digital SSTR
              </span>
              <button
                type="button"
                onClick={() => {
                  setReceiptRequest(null);
                  if (formSuccess) {
                    setFormSuccess(false);
                    setSectorTab("pendentes");
                  }
                }}
                className="p-1 px-2.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-white rounded-lg cursor-pointer font-mono text-xs font-bold"
              >
                X
              </button>
            </div>

            {/* Scrollable Receipt Container */}
            <div className="overflow-x-auto py-2">
              {/* Receipt Ticket Content */}
              <div 
                id={`receipt-thermal-content-${receiptRequest.id}`}
                className="bg-white p-5 rounded-lg shadow-inner text-slate-850 font-mono text-[10px] leading-relaxed relative border-2 border-dashed border-slate-300"
                style={{ backgroundColor: "#ffffff", color: "#1e293b", fontFamily: "monospace" }}
              >
                {/* Brand / Logo */}
                <div className="text-center space-y-1 pb-3">
                  <h4 className="font-bold text-xs tracking-wider uppercase text-slate-900">SSTR - PAU BRASIL</h4>
                  <p className="text-[8px] text-slate-500 uppercase font-bold">Distribuidora Guarabira</p>
                  <p className="text-[8px] text-slate-500 font-bold">CNPJ: 03.120.448/0001-90</p>
                  <p className="text-[9px] font-bold uppercase mt-1.5 border border-slate-900 py-0.5 px-2 bg-slate-100 rounded">
                    Recibo de Solicitação
                  </p>
                </div>

                {/* Tear-off Line */}
                <div className="border-t border-dashed border-slate-400 my-2.5"></div>

                {/* Request Details */}
                <div className="space-y-1">
                  <p className="flex justify-between">
                    <span className="text-slate-500">PROTOCOLO:</span>
                    <span className="font-bold text-slate-900">#{receiptRequest.id.replace("pending_req_", "")}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">DATA:</span>
                    <span className="font-bold text-slate-900">{receiptRequest.data}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">NF-E:</span>
                    <span className="font-bold text-slate-900">{receiptRequest.nf || "NÃO CONSTA"}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">SETOR/ROTA:</span>
                    <span className="font-bold text-slate-900">{receiptRequest.setor}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">EMISSOR:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[170px]">
                      {receiptRequest.cadastroUser || (roleContext === "rn" ? "Representante de Vendas (RN)" : "Motorista / Rota")}
                    </span>
                  </p>
                </div>

                {/* Dashed line */}
                <div className="border-t border-dashed border-slate-400 my-2.5"></div>

                {/* Client Info */}
                <div className="space-y-1">
                  <p className="text-[8px] text-slate-500 font-bold uppercase">Cliente / Destinatário:</p>
                  <p className="font-bold text-slate-900 uppercase text-[10px] break-words">
                    {(() => {
                      const clientDb = getPdvDatabase();
                      const clientInfo = clientDb[receiptRequest.nb.trim()];
                      return clientInfo ? clientInfo.nomeFantasia : `Parceiro Comercial (NB: ${receiptRequest.nb})`;
                    })()}
                  </p>
                  <p className="text-slate-500">
                    NB: <span className="font-bold text-slate-900">{receiptRequest.nb}</span>
                  </p>
                  <p className="text-[8px] text-slate-500 break-words font-sans">
                    {(() => {
                      const clientDb = getPdvDatabase();
                      const clientInfo = clientDb[receiptRequest.nb.trim()];
                      return clientInfo ? `${clientInfo.endereco}, ${clientInfo.bairro}, ${clientInfo.municipio}` : "Endereço Geral do Setor";
                    })()}
                  </p>
                </div>

                {/* Dashed line */}
                <div className="border-t border-dashed border-slate-400 my-2.5"></div>

                {/* Products Table */}
                <div className="space-y-1.5">
                  <p className="text-[8px] text-slate-500 font-bold uppercase">Descrição dos Itens:</p>
                  <div className="space-y-2">
                    {receiptRequest.items && receiptRequest.items.length > 0 ? (
                      receiptRequest.items.map((subItem, idx) => {
                        const isFaltaSku = (subItem.motivo || receiptRequest.motivo || "").toLowerCase().includes("completo") || (subItem.motivo || receiptRequest.motivo || "").toLowerCase().includes("fechado");
                        const rawUm = String(subItem.unidadeMedida || "").toLowerCase();
                        const unitStr = (rawUm === "sku" || isFaltaSku) ? "sku" : "und";

                        return (
                          <div key={idx} className="border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                            <div className="flex justify-between items-start gap-1 font-bold text-slate-900">
                              <span className="break-words max-w-[75%] text-[9px]">
                                {subItem.item} - {subItem.descricao || PRODUCT_DATABASE.find(p => p.codigo === subItem.item)?.descricao || "Produto"}
                              </span>
                              <span className="shrink-0 text-right">{subItem.quantidade} {unitStr}</span>
                            </div>
                            <div className="flex justify-between text-[8px] text-slate-500 font-sans mt-0.5">
                              <span>Motivo: {subItem.motivo || receiptRequest.motivo}</span>
                              {subItem.hectolitros ? <span>Volume: {subItem.hectolitros.toFixed(4)} HL</span> : null}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      /* Legacy compatibility single SKU item */
                      (() => {
                        const isFaltaSku = (receiptRequest.motivo || "").toLowerCase().includes("completo") || (receiptRequest.motivo || "").toLowerCase().includes("fechado");
                        const rawUm = String(receiptRequest.unidadeMedida || "").toLowerCase();
                        const unitStr = (rawUm === "sku" || isFaltaSku) ? "sku" : "und";

                        return (
                          <div className="pb-1">
                            <div className="flex justify-between font-bold text-slate-900">
                              <span className="break-words max-w-[75%] text-[9px]">
                                {receiptRequest.item} - {PRODUCT_DATABASE.find(p => p.codigo === receiptRequest.item)?.descricao || "Produto"}
                              </span>
                              <span>{receiptRequest.quantidade} {unitStr}</span>
                            </div>
                            <p className="text-[8px] text-slate-500 font-sans mt-0.5">
                              Motivo: {receiptRequest.motivo || "Avaria"}
                            </p>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* Dashed line */}
                <div className="border-t border-dashed border-slate-400 my-2.5"></div>

                {/* Totals */}
                <div className="space-y-1 text-[10px]">
                  <p className="flex justify-between">
                    <span className="font-bold text-slate-900">TOTAL PRODUTOS:</span>
                    <span className="font-bold text-slate-900">
                      {(() => {
                        const totalQty = receiptRequest.items && receiptRequest.items.length > 0 
                          ? receiptRequest.items.reduce((sum, curr) => sum + curr.quantidade, 0)
                          : receiptRequest.quantidade;
                        const hasSku = receiptRequest.items?.some(it => (it.motivo || receiptRequest.motivo || "").toLowerCase().includes("completo") || (it.motivo || receiptRequest.motivo || "").toLowerCase().includes("fechado") || String(it.unidadeMedida || "").toLowerCase() === "sku")
                          || (receiptRequest.motivo || "").toLowerCase().includes("completo") || (receiptRequest.motivo || "").toLowerCase().includes("fechado") || String(receiptRequest.unidadeMedida || "").toLowerCase() === "sku";
                        return `${totalQty} ${hasSku ? "sku(s)" : "und"}`;
                      })()}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-500">VOLUME TOTAL:</span>
                    <span className="font-bold text-slate-900">{receiptRequest.hectolitros?.toFixed(4) || "0.0000"} HL</span>
                  </p>
                </div>

                {/* Dashed line */}
                <div className="border-t border-dashed border-slate-400 my-2.5"></div>

                {/* Footer Message */}
                <div className="text-center space-y-1 pt-1.5">
                  <p className="text-[8px] text-slate-500 leading-normal">
                    Este documento é uma via auxiliar de conferência gerada pelo portal de campo do colaborador SSTR.
                  </p>
                  <div className="border border-slate-300 rounded p-1 bg-slate-50 text-[7px] text-slate-450 leading-tight">
                    SISTEMA DE SOLUÇÕES DE TROCAS E REPOSIÇÕES
                    <br />
                    PAU BRASIL GUARABIRA • CONEXÃO EM TEMPO REAL
                  </div>
                </div>
              </div>
            </div>

            {/* Receipt Modal Buttons */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={generatingReceipt}
                  onClick={() => downloadReceiptPdf(receiptRequest)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-800 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-rose-950/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF Recibo</span>
                </button>
                <button
                  type="button"
                  disabled={generatingReceipt}
                  onClick={() => downloadReceiptJpg(receiptRequest)}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-850 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-blue-950/20"
                >
                  <FileImage className="w-3.5 h-3.5" />
                  <span>Imagem JPG</span>
                </button>
              </div>

              <button
                type="button"
                disabled={generatingReceipt}
                onClick={() => shareReceipt(receiptRequest)}
                className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-850 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/30 font-sans"
              >
                <Share2 className="w-4 h-4" />
                <span>Encaminhar Imagem / PDF</span>
              </button>

              <button
                type="button"
                disabled={generatingReceipt}
                onClick={() => shareToWhatsApp(receiptRequest)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/20 font-sans"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.003 5.281 5.286.002 11.791.002c3.149.001 6.111 1.227 8.343 3.457 2.233 2.23 3.456 5.19 3.455 8.34-.003 6.51-5.289 11.787-11.794 11.787-1.996-.001-3.957-.507-5.691-1.468L0 24zm6.59-4.846c1.6.95 3.16 1.449 4.633 1.451 5.378 0 9.755-4.379 9.758-9.76.002-2.605-1.01-5.057-2.85-6.898-1.841-1.84-4.291-2.854-6.897-2.855-5.385 0-9.763 4.38-9.766 9.762-.001 1.737.479 3.364 1.391 4.72l-.955 3.488 3.568-.936c.001 0 .001 0 0 0zm11.367-7.635c-.322-.16-.1.9-.387.97-.282.073-1.037.361-1.556-.234-.52-.596-.751-1.289-.933-1.637-.182-.349-.1-.58-.1-.58s.222-.26.333-.39c.112-.13.149-.222.222-.37.074-.149.037-.282-.019-.39-.055-.111-.5-.1.687-1.205-.484-.465-.915-.39-1.246-.39-.33 0-.869.12-1.31.6-.442.48-1.687 1.65-1.687 4.02s1.725 4.66 1.96 4.99c.234.33 3.394 5.185 8.221 7.27 1.15.495 2.04.79 2.74.95 1.153.37 2.21.32 3.04.19 1.1-.17 2.4-.95 2.73-1.87.33-.92.33-1.71.23-1.87-.1-.16-.36-.26-.68-.42z"/>
                </svg>
                <span>Enviar para WhatsApp (Texto PDV)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceiptRequest(null);
                  if (formSuccess) {
                    setFormSuccess(false);
                    setSectorTab("novo");
                  }
                }}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-all cursor-pointer text-center block"
              >
                {formSuccess ? "Registrar Outra Solicitação" : "Fechar Visualização"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Requirement 9: Smart Isolated Draft Recovery Modal */}
      {showDraftRecoveryModal && pendingDraftToRecover && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-blue-500/40 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-fade-in text-left">
            <div className="flex items-center gap-2.5 text-blue-400 border-b border-slate-800 pb-3">
              <Clock className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-white font-display">
                  Rascunho de Preenchimento Localizado
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  Você possui um rascunho em andamento salvo neste perfil
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Perfil e Setor:</span>
                <strong className="text-white">{roleContext === 'rn' ? 'Representante RN' : 'Motorista / Rota'} (Setor {selectedSector})</strong>
              </div>
              {pendingDraftToRecover.formMapa && (
                <div className="flex justify-between text-slate-400">
                  <span>Mapa:</span>
                  <strong className="text-amber-400">{pendingDraftToRecover.formMapa}</strong>
                </div>
              )}
              {pendingDraftToRecover.formNb && (
                <div className="flex justify-between text-slate-400">
                  <span>NB / Cliente:</span>
                  <strong className="text-emerald-400">{pendingDraftToRecover.formNb}</strong>
                </div>
              )}
              {pendingDraftToRecover.formNf && (
                <div className="flex justify-between text-slate-400">
                  <span>NF-e:</span>
                  <strong className="text-blue-400">{pendingDraftToRecover.formNf}</strong>
                </div>
              )}
              {pendingDraftToRecover.draftItems && pendingDraftToRecover.draftItems.length > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Itens no Rascunho:</span>
                  <strong className="text-purple-400">{pendingDraftToRecover.draftItems.length} SKU(s)</strong>
                </div>
              )}
              {pendingDraftToRecover.savedAt && (
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Salvo às:</span>
                  <span>{pendingDraftToRecover.savedAt}</span>
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
              Deseja continuar preenchendo este rascunho salvo ou prefere descartá-lo para iniciar do zero?
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (pendingDraftToRecover.formMapa) setFormMapa(pendingDraftToRecover.formMapa);
                  if (pendingDraftToRecover.formNb) setFormNb(pendingDraftToRecover.formNb);
                  if (pendingDraftToRecover.formNf) setFormNf(pendingDraftToRecover.formNf);
                  if (pendingDraftToRecover.formObservacao) setFormObservacao(pendingDraftToRecover.formObservacao);
                  if (pendingDraftToRecover.formMotiveType) setFormMotiveType(pendingDraftToRecover.formMotiveType);
                  if (pendingDraftToRecover.formMotiveText) setFormMotiveText(pendingDraftToRecover.formMotiveText);
                  if (pendingDraftToRecover.draftItems) setDraftItems(pendingDraftToRecover.draftItems);
                  setShowDraftRecoveryModal(false);
                  setPendingDraftToRecover(null);
                }}
                className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 text-center font-sans"
              >
                ▶️ Continuar Rascunho
              </button>

              <button
                type="button"
                onClick={() => {
                  if (selectedSector) {
                    const key = `sstr_draft_${roleContext}_${selectedSector}`;
                    localStorage.removeItem(key);
                  }
                  setFormMapa("");
                  setFormNb("");
                  setFormNf("");
                  setFormObservacao("");
                  setDraftItems([]);
                  setShowDraftRecoveryModal(false);
                  setPendingDraftToRecover(null);
                }}
                className="py-2.5 px-4 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-800 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95 text-center font-sans"
              >
                🗑️ Descartar Rascunho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 1, 2, 3: PDF Exported Confirmation Modal */}
      {createdPdfModalInfo && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-fade-in text-left">
            <div className="flex items-center gap-2.5 text-emerald-400 border-b border-slate-800 pb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm text-white font-display">
                  Registro Finalizado & PDF Exportado!
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  Comprovante gerado com sucesso e direcionado para armazenamento oficial
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold block">
                  📄 Nome do Arquivo PDF Gerado:
                </span>
                <code className="text-emerald-400 font-bold text-[11px] block bg-emerald-950/40 p-2 rounded border border-emerald-900/40 break-all select-all">
                  {createdPdfModalInfo.filename}
                </code>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setCreatedPdfModalInfo(null);
                }}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-lg text-center"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer credits display */}
      <div className="p-4 border-t border-slate-850 text-center text-slate-550 text-[10px] bg-slate-950 shrink-0 font-mono">
        © SSTR Pau Brasil Guarabira • Portal do Representante
      </div>
    </div>
  );
}
