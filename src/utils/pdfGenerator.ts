import { jsPDF } from "jspdf";
import { PendingRequest } from "../types";
import { PRODUCT_DATABASE } from "../data/products";

export const NETWORK_REGISTROS_PATH = "P:\\Guarabira\\2026\\04.LOGISTICA\\ARMAZÉM\\3.0 ACURACIDADE\\3.1 PACOTE PREJUIZO\\REGISTROS";

/**
 * Converts image URL (http, blob, relative) or base64 into a valid data URI for jsPDF
 */
async function getImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image")) return url;
  if (typeof window === "undefined") return null;

  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width || 300;
          canvas.height = img.height || 200;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/jpeg", 0.9));
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

/**
 * Format PDF Filename using standard: MAPA-NB-NF-DATA_DO_CADASTRO.pdf
 * Example: 14521-03-987654-10-03-2026.pdf
 */
export function generatePdfFilename(mapa: string, nb: string, nf: string, dateStr?: string): string {
  const cleanMapa = (mapa || "0000").trim().replace(/[^a-zA-Z0-9]/g, "");
  const cleanNb = (nb || "00").trim().replace(/[^a-zA-Z0-9-]/g, "");
  const cleanNf = (nf || "000000").trim().replace(/[^a-zA-Z0-9]/g, "");
  
  let formattedDate = "";
  if (dateStr) {
    // Extract DD/MM/YYYY or DD-MM-YYYY
    const match = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (match) {
      formattedDate = `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  if (!formattedDate) {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    formattedDate = `${day}-${month}-${year}`;
  }

  return `${cleanMapa}-${cleanNb}-${cleanNf}-${formattedDate}.pdf`;
}

/**
 * Export Registration PDF automatically
 */
export async function exportRegistrationPdf(
  req: PendingRequest,
  options: { autoDownload?: boolean; isBaixa?: boolean } = { autoDownload: true }
): Promise<{ filename: string; fullPath: string; pdfDataUri: string }> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const mapa = req.mapa || "SSTR-M";
  const nb = req.nb || "000000";
  const nf = req.nf || "000000";
  const dateStr = req.data || req.cadastroDate || new Date().toLocaleDateString("pt-BR");

  const filename = generatePdfFilename(mapa, nb, nf, dateStr);
  const fullPath = `${NETWORK_REGISTROS_PATH}\\${filename}`;

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header Colors & Title
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 24, "F");

  doc.setFillColor(37, 99, 235); // royal blue accent
  doc.rect(0, 24, pageWidth, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("PAU BRASIL GUARABIRA - LOGÍSTICA & ACURACIDADE", 14, 12);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("COMPROVANTE OFICIAL DE REGISTRO E PAC DE OCORRÊNCIA", 14, 18);

  y = 34;

  // Status Badge
  const statusLabel = options.isBaixa 
    ? "BAIXADO / FINALIZADO" 
    : (req.statusPromax || "PENDENTE").toUpperCase();

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, y, pageWidth - 24, 48, 3, 3, "FD");

  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("INFORMAÇÕES ESSENCIAIS DO REGISTRO", 18, y + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Número do Mapa:`, 18, y + 16);
  doc.text(`Número da NB:`, 18, y + 23);
  doc.text(`Número da NF:`, 18, y + 30);
  doc.text(`Data e Hora do Cadastro:`, 18, y + 37);
  doc.text(`Situação do Registro:`, 18, y + 44);

  doc.setFont("helvetica", "normal");
  doc.text(`${mapa}`, 65, y + 16);
  doc.text(`${nb}`, 65, y + 23);
  doc.text(`${nf}`, 65, y + 30);
  doc.text(`${dateStr}`, 65, y + 37);
  
  if (options.isBaixa || req.statusPromax === "cadastrado") {
    doc.setTextColor(16, 185, 129); // emerald
  } else if (req.statusPromax === "reprovado") {
    doc.setTextColor(225, 29, 72); // rose
  } else {
    doc.setTextColor(217, 119, 6); // amber
  }
  doc.setFont("helvetica", "bold");
  doc.text(`${statusLabel}`, 65, y + 44);

  doc.setTextColor(30, 41, 59);
  
  // Right Column Metadata
  doc.setFont("helvetica", "bold");
  doc.text(`Usuário Responsável:`, 110, y + 16);
  doc.text(`Setor e Função:`, 110, y + 23);
  doc.text(`Solicitante / Perfil:`, 110, y + 30);

  doc.setFont("helvetica", "normal");
  doc.text(`${req.cadastroUser || "Colaborador de Campo"}`, 155, y + 16);
  doc.text(`Setor ${req.setor} - Operacional`, 155, y + 23);
  doc.text(`${req.faltaMotorista ? "Motorista Rota" : "Representante RN"}`, 155, y + 30);

  const baixadaDateStr = req.baixadaDate || (req as any).dataBaixa;
  const baixadaUserStr = req.baixadaUser || (req as any).usuarioAcao;

  if (options.isBaixa || req.baixadaDate || baixadaDateStr) {
    doc.setFont("helvetica", "bold");
    doc.text(`Data/Hora da Baixa:`, 110, y + 37);
    doc.text(`Responsável Baixa:`, 110, y + 44);

    doc.setFont("helvetica", "normal");
    doc.text(`${baixadaDateStr || "Concluída"}`, 155, y + 37);
    doc.text(`${baixadaUserStr || "Gestor Logística"}`, 155, y + 44);
  }

  y += 54;

  // Description & Motive Box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, y, pageWidth - 24, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("DESCRIÇÃO DA PENDÊNCIA / MOTIVO:", 18, y + 7);

  doc.setFont("helvetica", "normal");
  const motiveText = req.motivo || req.observacao || "Não informado";
  const splitMotive = doc.splitTextToSize(motiveText, pageWidth - 42);
  doc.text(splitMotive, 18, y + 13);

  y += 28;

  // Items Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ITENS REGISTRADOS NO CARD", 14, y);

  y += 4;

  // Table Header
  doc.setFillColor(30, 41, 59);
  doc.rect(12, y, pageWidth - 24, 7, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text("SKU", 16, y + 5);
  doc.text("DESCRIÇÃO DO PRODUTO", 42, y + 5);
  doc.text("QTD", 125, y + 5);
  doc.text("UNIDADE", 145, y + 5);
  doc.text("MOTIVO / INVERSÃO", 168, y + 5);

  y += 7;

  const itemsList = req.items && req.items.length > 0 ? req.items : [
    {
      item: req.item || "SKU",
      descricao: PRODUCT_DATABASE.find(p => p.codigo === req.item)?.descricao || "Produto Reposição",
      quantidade: req.quantidade || 1,
      unidadeMedida: req.unidadeMedida || "CX",
      motivo: req.motivo || "Avaria"
    }
  ];

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  itemsList.forEach((it: any, index: number) => {
    const bg = index % 2 === 0 ? 255 : 248;
    doc.setFillColor(bg, bg, bg);
    doc.rect(12, y, pageWidth - 24, 7, "F");

    const code = it.item || it.itemCode || "SKU";
    const desc = it.descricao || PRODUCT_DATABASE.find(p => p.codigo === code)?.descricao || "Produto";
    const qty = String(it.quantidade || 1);
    
    const isFaltaSkuCompleto = (it.motivo || req.motivo || "").toLowerCase().includes("completo") || (it.motivo || req.motivo || "").toLowerCase().includes("fechado");
    const defaultUm = isFaltaSkuCompleto ? "SKU" : "UND";
    const rawUm = String(it.unidadeMedida || "").toUpperCase();
    const um = rawUm && rawUm !== "CX" ? rawUm : defaultUm;
    const motive = it.produtoAhEnviar ? `Enviar: ${it.produtoAhEnviar}` : (it.motivo || req.motivo || "-");

    doc.text(code, 16, y + 5);
    doc.text(desc.slice(0, 42), 42, y + 5);
    doc.text(qty, 125, y + 5);
    doc.text(um, 145, y + 5);
    doc.text(motive.slice(0, 22), 168, y + 5);

    y += 7;
  });

  y += 6;

  // Attached Photo / Evidence Section
  const isPdfPath = req.fotoUrl && req.fotoUrl.toLowerCase().endsWith(".pdf");
  if (req.fotoUrl && !isPdfPath) {
    let imgDataUrl: string | null = null;
    if (req.fotoUrl.startsWith("data:image")) {
      imgDataUrl = req.fotoUrl;
    } else if (req.fotoUrl.startsWith("http") || req.fotoUrl.startsWith("blob:") || req.fotoUrl.startsWith("/")) {
      imgDataUrl = await getImageDataUrl(req.fotoUrl);
    }

    if (imgDataUrl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("FOTOGRAFIA / EVIDÊNCIA ANEXADA:", 14, y);

      y += 4;

      try {
        // Draw image into PDF
        const imgWidth = 80;
        const imgHeight = 60;
        
        // Check if y + imgHeight exceeds page height
        if (y + imgHeight > 270) {
          doc.addPage();
          y = 20;
        }

        let imgFormat = "JPEG";
        if (imgDataUrl.includes("image/png")) imgFormat = "PNG";
        else if (imgDataUrl.includes("image/webp")) imgFormat = "WEBP";

        doc.addImage(imgDataUrl, imgFormat, 14, y, imgWidth, imgHeight);
        doc.setDrawColor(203, 213, 225);
        doc.rect(14, y, imgWidth, imgHeight, "S");

        y += imgHeight + 8;
      } catch (e) {
        console.warn("Could not embed image into PDF:", e);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.text("(Fotografia anexada presente no registro)", 14, y + 4);
        y += 10;
      }
    } else if (req.fotoUrl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Referência de Anexo / Caminho: ${req.fotoUrl.slice(0, 80)}`, 14, y);
      y += 8;
    }
  }

  // Complete Change History Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("HISTÓRICO COMPLETO DAS ALTERAÇÕES E TRILHA DE AUDITORIA:", 14, y);

  y += 4;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, y, pageWidth - 24, 20, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);

  const historyLines = [
    `• ${dateStr}: Criado e cadastrado por ${req.cadastroUser || "Usuário de Campo"} no Setor ${req.setor}.`,
    `• Mapa: ${mapa} | NB: ${nb} | NF: ${nf} | Protocolo: #${req.id}`,
    req.statusPromax === "cadastrado" ? `• Aprovado e registrado no Promax ERP em ${req.cadastroDate || dateStr}.` : `• Status Atual: ${statusLabel}.`,
    options.isBaixa ? `• Baixa efetivada em ${req.baixadaDate || new Date().toLocaleString("pt-BR")} por ${req.baixadaUser || "Gestor"}.` : null
  ].filter(Boolean) as string[];

  historyLines.forEach((line, i) => {
    doc.text(line, 16, y + 5 + (i * 4.5));
  });

  y += 24;

  // Footer File Path reference
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 280, pageWidth, 17, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(`LOCAL DO ARQUIVO NA REDE COMPARTILHADA:`, 12, 285);

  doc.setFont("helvetica", "normal");
  doc.text(`${fullPath}`, 12, 289);

  if (options.autoDownload) {
    doc.save(filename);
  }

  const pdfDataUri = doc.output("datauristring");

  return {
    filename,
    fullPath,
    pdfDataUri
  };
}
