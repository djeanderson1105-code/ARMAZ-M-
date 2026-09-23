import { jsPDF } from "jspdf";
import { ExchangeRecord, getRepresentativosSetor } from "../types";
import { getPdvDatabase } from "../data/pdvData";
import { getRecordHL } from "./hectoFactors";

export interface AuditPdfOptions {
  dateStr?: string;         // e.g. "2026-09-22" or "22/09/2026"
  startDate?: string;       // ISO or DD/MM/YYYY
  endDate?: string;         // ISO or DD/MM/YYYY
  sectorFilter?: string;    // "todos" or specific sector
  statusFilter?: string;    // "todos", "aprovada", "pendente", "reprovada", "recadastrar"
  processTypeFilter?: string;
  auditorName?: string;
  filenamePrefix?: string;
}

export interface GroupedSolicitationData {
  solicitacao: string;
  codigoCliente: string;
  nomeCliente: string;
  setorVenda: string;
  dataSolicitacao: string;
  status: string;
  mapa: string;
  nf: string;
  tipo: string;
  justificativa: string;
  motorista: string;
  conferente: string;
  observacao: string;
  records: ExchangeRecord[];
  totalValue: number;
  totalHL: number;
}

export interface RnSectorSummary {
  sectorKey: string;
  repName: string;
  repCpf: string;
  gvName: string;
  baseName: string;
  solsCount: number;
  aprovCount: number;
  aprovValor: number;
  aprovHL: number;
  pendCount: number;
  pendValor: number;
  pendHL: number;
  reprovCount: number;
  reprovValor: number;
  reprovHL: number;
  recadCount: number;
  totalValor: number;
  totalHL: number;
}

/**
 * Format BRL Currency
 */
function formatCurrency(val: number): string {
  return (val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Normalizes date to DD/MM/YYYY
 */
function normalizeDateDisplay(d?: string): string {
  if (!d) return "-";
  const clean = String(d).trim();
  const isoMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const day = isoMatch[3].padStart(2, "0");
    return `${day}/${m}/${y}`;
  }
  return clean;
}

/**
 * Generates an executive, highly detailed Audit & Tracking PDF report
 * with ALL solicitations of all RNs strictly grouped by Sector and RN.
 * Includes an executive consolidated summary table of all RNs and detailed RN blocks.
 */
export async function exportAuditTrackingPdf(
  records: ExchangeRecord[],
  options: AuditPdfOptions = {}
): Promise<{ filename: string; pdfDataUri: string }> {
  if (!records || records.length === 0) {
    throw new Error("Nenhum registro encontrado para exportar o relatório de auditoria.");
  }

  const pdvDb = getPdvDatabase();
  const repsMap = getRepresentativosSetor();

  // 1. Group records by solicitation ID
  const solsMap: Record<string, ExchangeRecord[]> = {};
  records.forEach((rec) => {
    const sol = (rec.solicitacao || "").trim() || "SEM_NUMERO";
    if (!solsMap[sol]) {
      solsMap[sol] = [];
    }
    solsMap[sol].push(rec);
  });

  const groupedList: GroupedSolicitationData[] = Object.entries(solsMap).map(([sol, recs]) => {
    const first = recs[0];
    const totalVal = recs.reduce((sum, r) => sum + (Number(r.valorTotal) || 0), 0);
    const totalHect = recs.reduce((sum, r) => sum + getRecordHL(r), 0);
    const nfClean = recs.map(r => r.nf).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || first.nf || "-";
    
    // Resolve Mapa from Column X (mapaOrigem) or mapa
    const validMapas = recs
      .map(r => r.mapaOrigem || r.mapa)
      .map(m => (m || "").trim())
      .filter(m => m && m !== "0" && m.toLowerCase() !== "falta" && m !== "-");
    const uniqueMapas = Array.from(new Set(validMapas));
    const mapaClean = uniqueMapas.length > 0 ? uniqueMapas.join(", ") : (first.mapaOrigem || first.mapa || "-");

    // Search for first valid sector in records
    const validSector = recs
      .map(r => (r.setorVenda || "").trim())
      .find(s => s && s !== "-" && s !== "0") || (first.setorVenda || "Indefinido").trim();

    return {
      solicitacao: sol,
      codigoCliente: first.codigoCliente || "-",
      nomeCliente: first.nomeCliente || "Cliente Não Informado",
      setorVenda: validSector,
      dataSolicitacao: first.dataSolicitacao || "-",
      status: (first.status || "Pendente").trim(),
      mapa: mapaClean,
      nf: nfClean,
      tipo: first.tipo || "Solicitação",
      justificativa: first.justificativa || "Não informada",
      motorista: first.nomeMotorista || first.motorista || "",
      conferente: first.conferente || first.conferenteCarregamento || "",
      observacao: recs.map(r => r.observacao).filter(Boolean).join(" | ") || first.observacao || "",
      records: recs,
      totalValue: totalVal,
      totalHL: totalHect
    };
  });

  // 2. Group solicitations by Sector / RN
  const sectorsMap: Record<string, GroupedSolicitationData[]> = {};
  groupedList.forEach((sol) => {
    const sec = sol.setorVenda || "OUTROS";
    if (!sectorsMap[sec]) {
      sectorsMap[sec] = [];
    }
    sectorsMap[sec].push(sol);
  });

  // Sort sectors naturally (e.g. 600..608, 700..707, others)
  const sortedSectorKeys = Object.keys(sectorsMap).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true });
  });

  // 3. Compute Global KPIs
  const totalSolsCount = groupedList.length;
  const totalItemsCount = records.length;
  const totalGeralValor = groupedList.reduce((s, sol) => s + sol.totalValue, 0);
  const totalGeralHL = groupedList.reduce((s, sol) => s + sol.totalHL, 0);

  let totalAprovadasCount = 0;
  let totalAprovadasValor = 0;
  let totalAprovadasHL = 0;

  let totalPendentesCount = 0;
  let totalPendentesValor = 0;
  let totalPendentesHL = 0;

  let totalReprovadasCount = 0;
  let totalReprovadasValor = 0;
  let totalReprovadasHL = 0;

  let totalRecadastrarCount = 0;
  let totalRecadastrarValor = 0;
  let totalRecadastrarHL = 0;

  groupedList.forEach((sol) => {
    const st = sol.status.toLowerCase();
    if (st.includes("aprov")) {
      totalAprovadasCount++;
      totalAprovadasValor += sol.totalValue;
      totalAprovadasHL += sol.totalHL;
    } else if (st.includes("reprov")) {
      totalReprovadasCount++;
      totalReprovadasValor += sol.totalValue;
      totalReprovadasHL += sol.totalHL;
    } else if (st.includes("recad")) {
      totalRecadastrarCount++;
      totalRecadastrarValor += sol.totalValue;
      totalRecadastrarHL += sol.totalHL;
    } else {
      totalPendentesCount++;
      totalPendentesValor += sol.totalValue;
      totalPendentesHL += sol.totalHL;
    }
  });

  // Build RN Summaries for Consolidated Table
  const rnSummaries: RnSectorSummary[] = sortedSectorKeys.map((secKey) => {
    const sectorSols = sectorsMap[secKey];
    const repInfo = repsMap[secKey];
    const repName = repInfo?.nome || "Representante Não Declarado";
    const repCpf = repInfo?.cpf || "-";
    const gvName = repInfo?.gv ? `GV ${repInfo.gv}` : "GV OPERACIONAL";
    const baseName = repInfo?.base || repInfo?.gv || "-";

    const secTotalValor = sectorSols.reduce((s, x) => s + x.totalValue, 0);
    const secTotalHL = sectorSols.reduce((s, x) => s + x.totalHL, 0);

    const secAprov = sectorSols.filter(x => x.status.toLowerCase().includes("aprov"));
    const secPend = sectorSols.filter(x => x.status.toLowerCase().includes("pend") && !x.status.toLowerCase().includes("recad"));
    const secReprov = sectorSols.filter(x => x.status.toLowerCase().includes("reprov"));
    const secRecad = sectorSols.filter(x => x.status.toLowerCase().includes("recad"));

    return {
      sectorKey: secKey,
      repName,
      repCpf,
      gvName,
      baseName,
      solsCount: sectorSols.length,
      aprovCount: secAprov.length,
      aprovValor: secAprov.reduce((s, x) => s + x.totalValue, 0),
      aprovHL: secAprov.reduce((s, x) => s + x.totalHL, 0),
      pendCount: secPend.length,
      pendValor: secPend.reduce((s, x) => s + x.totalValue, 0),
      pendHL: secPend.reduce((s, x) => s + x.totalHL, 0),
      reprovCount: secReprov.length,
      reprovValor: secReprov.reduce((s, x) => s + x.totalValue, 0),
      reprovHL: secReprov.reduce((s, x) => s + x.totalHL, 0),
      recadCount: secRecad.length,
      totalValor: secTotalValor,
      totalHL: secTotalHL
    };
  });

  // 4. Initialize jsPDF (A4 portrait)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;         // 186 mm
  const bottomLimit = pageHeight - 16;                  // 16 mm footer reserve

  let currentY = 12;

  // Header helper for period label
  let periodLabel = "Todas as Datas";
  if (options.dateStr) {
    periodLabel = normalizeDateDisplay(options.dateStr);
  } else if (options.startDate && options.endDate) {
    if (options.startDate === options.endDate) {
      periodLabel = normalizeDateDisplay(options.startDate);
    } else {
      periodLabel = `${normalizeDateDisplay(options.startDate)} até ${normalizeDateDisplay(options.endDate)}`;
    }
  } else if (options.startDate) {
    periodLabel = `A partir de ${normalizeDateDisplay(options.startDate)}`;
  } else if (options.endDate) {
    periodLabel = `Até ${normalizeDateDisplay(options.endDate)}`;
  }

  // Draw Primary Header on Page 1
  const drawMainHeader = () => {
    // Top banner dark
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 26, "F");

    // Accent line royal blue
    doc.setFillColor(37, 99, 235); // blue-600
    doc.rect(0, 26, pageWidth, 2, "F");

    // Title text
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PAU BRASIL GUARABIRA - AUDITORIA & RASTREAMENTO OPERACIONAL", marginX, 10);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text("RELATÓRIO EXECUTIVO: TODAS AS SOLICITAÇÕES AGRUPADAS POR REPRESENTANTE (RN) & SETOR", marginX, 16);

    // Right header info
    const nowStr = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    doc.setFontSize(7.5);
    doc.text(`Emissão: ${nowStr}`, pageWidth - marginX, 10, { align: "right" });
    doc.text(`Auditor: ${options.auditorName || "Auditoria Operacional SSTR"}`, pageWidth - marginX, 15, { align: "right" });
    doc.text(`Ref. Período: ${periodLabel}`, pageWidth - marginX, 20, { align: "right" });

    currentY = 32;

    // Parameters Context Box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginX, currentY, contentWidth, 14, 2, 2, "FD");

    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "bold");
    doc.text("PARÂMETROS DA AUDITORIA:", marginX + 4, currentY + 5);

    doc.setFont("helvetica", "normal");
    doc.text(`Período Auditado: `, marginX + 4, currentY + 10);
    doc.setFont("helvetica", "bold");
    doc.text(`${periodLabel}`, marginX + 28, currentY + 10);

    doc.setFont("helvetica", "normal");
    doc.text(`Setores / RNs: `, marginX + 68, currentY + 10);
    doc.setFont("helvetica", "bold");
    doc.text(options.sectorFilter && options.sectorFilter !== "todos" ? `Setor ${options.sectorFilter}` : `Todos (${sortedSectorKeys.length} setores ativos)`, marginX + 90, currentY + 10);

    doc.setFont("helvetica", "normal");
    doc.text(`Filtro Status: `, marginX + 132, currentY + 10);
    doc.setFont("helvetica", "bold");
    const stLabel = !options.statusFilter || options.statusFilter === "todos" ? "Todos (Aprovadas, Pendentes, Reprovadas)" : options.statusFilter.toUpperCase();
    doc.text(`${stLabel}`, marginX + 152, currentY + 10);

    currentY += 18;

    // Executive Global KPIs Summary Box
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(marginX, currentY, contentWidth, 24, 2, 2, "FD");

    const colW = contentWidth / 4;

    // Col 1: Total Geral
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text("TOTAL AUDITADO (TODOS RNS)", marginX + 4, currentY + 5);
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${totalSolsCount} Solicitações`, marginX + 4, currentY + 11);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text(`${formatCurrency(totalGeralValor)}`, marginX + 4, currentY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${totalGeralHL.toFixed(2)} HL • ${totalItemsCount} itens`, marginX + 4, currentY + 20);

    // Divider line 1
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX + colW, currentY + 2, marginX + colW, currentY + 22);

    // Col 2: Aprovadas
    const pctAprov = totalSolsCount > 0 ? ((totalAprovadasCount / totalSolsCount) * 100).toFixed(1) : "0.0";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(5, 150, 105);
    doc.text(`APROVADAS (${pctAprov}%)`, marginX + colW + 4, currentY + 5);
    doc.setFontSize(10);
    doc.setTextColor(6, 95, 70);
    doc.text(`${totalAprovadasCount} Sols`, marginX + colW + 4, currentY + 11);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(5, 150, 105);
    doc.text(`${formatCurrency(totalAprovadasValor)}`, marginX + colW + 4, currentY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${totalAprovadasHL.toFixed(2)} HL`, marginX + colW + 4, currentY + 20);

    // Divider line 2
    doc.line(marginX + colW * 2, currentY + 2, marginX + colW * 2, currentY + 22);

    // Col 3: Pendentes
    const pctPend = totalSolsCount > 0 ? ((totalPendentesCount / totalSolsCount) * 100).toFixed(1) : "0.0";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(217, 119, 6);
    doc.text(`PENDENTES (${pctPend}%)`, marginX + colW * 2 + 4, currentY + 5);
    doc.setFontSize(10);
    doc.setTextColor(146, 64, 14);
    doc.text(`${totalPendentesCount} Sols`, marginX + colW * 2 + 4, currentY + 11);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(217, 119, 6);
    doc.text(`${formatCurrency(totalPendentesValor)}`, marginX + colW * 2 + 4, currentY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${totalPendentesHL.toFixed(2)} HL`, marginX + colW * 2 + 4, currentY + 20);

    // Divider line 3
    doc.line(marginX + colW * 3, currentY + 2, marginX + colW * 3, currentY + 22);

    // Col 4: Reprovadas
    const pctReprov = totalSolsCount > 0 ? ((totalReprovadasCount / totalSolsCount) * 100).toFixed(1) : "0.0";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(225, 29, 72);
    doc.text(`REPROVADAS (${pctReprov}%)`, marginX + colW * 3 + 4, currentY + 5);
    doc.setFontSize(10);
    doc.setTextColor(159, 18, 57);
    doc.text(`${totalReprovadasCount} Sols`, marginX + colW * 3 + 4, currentY + 11);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.text(`${formatCurrency(totalReprovadasValor)}`, marginX + colW * 3 + 4, currentY + 16);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`${totalReprovadasHL.toFixed(2)} HL`, marginX + colW * 3 + 4, currentY + 20);

    currentY += 28;
  };

  // Continuation Header for page 2+
  const drawContinuationHeader = (headerSubtitle?: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 13, "F");

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 13, pageWidth, 1, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("PAU BRASIL GUARABIRA - AUDITORIA & RASTREAMENTO OPERACIONAL (SSTR)", marginX, 8.5);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    const sub = headerSubtitle ? `${headerSubtitle} • Ref: ${periodLabel}` : `Ref: ${periodLabel}`;
    doc.text(sub, pageWidth - marginX, 8.5, { align: "right" });

    currentY = 18;
  };

  // Page break verification helper
  const ensureSpace = (neededHeight: number, headerSubtitle?: string) => {
    if (currentY + neededHeight > bottomLimit) {
      doc.addPage();
      drawContinuationHeader(headerSubtitle);
      return true;
    }
    return false;
  };

  // Draw main header on page 1
  drawMainHeader();

  // --------------------------------------------------------------------------
  // SECTION 1: QUADRO CONSOLIDADO: TODOS OS REPRESENTANTES DE NEGÓCIOS (RN)
  // --------------------------------------------------------------------------
  const drawConsolidatedRnTable = () => {
    // Title of Section 1
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, currentY, contentWidth, 7, "F");
    doc.setFillColor(37, 99, 235);
    doc.rect(marginX, currentY, 3, 7, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text("1. QUADRO CONSOLIDADO: TODOS OS REPRESENTANTES DE NEGÓCIOS (RN) & SETORES", marginX + 6, currentY + 4.8);

    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`${rnSummaries.length} Setores Auditados`, pageWidth - marginX - 3, currentY + 4.8, { align: "right" });

    currentY += 8;

    // Table Column Widths (Sum = 186 mm = contentWidth)
    const colSetorW = 14;
    const colNomeW = 50;
    const colCpfW = 26;
    const colGvW = 16;
    const colSolsW = 11;
    const colAprovW = 11;
    const colPendW = 11;
    const colReprovW = 11;
    const colValW = 21;
    const colHLW = 15;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, currentY, contentWidth, 6, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);

    let xPos = marginX;
    doc.text("SETOR", xPos + 2, currentY + 4.2);
    xPos += colSetorW;
    doc.text("REPRESENTANTE (RN)", xPos + 2, currentY + 4.2);
    xPos += colNomeW;
    doc.text("CPF", xPos + 2, currentY + 4.2);
    xPos += colCpfW;
    doc.text("BASE / GV", xPos + 2, currentY + 4.2);
    xPos += colGvW;
    doc.text("SOLS", xPos + colSolsW / 2, currentY + 4.2, { align: "center" });
    xPos += colSolsW;
    doc.setTextColor(5, 150, 105);
    doc.text("APROV", xPos + colAprovW / 2, currentY + 4.2, { align: "center" });
    xPos += colAprovW;
    doc.setTextColor(217, 119, 6);
    doc.text("PEND", xPos + colPendW / 2, currentY + 4.2, { align: "center" });
    xPos += colPendW;
    doc.setTextColor(225, 29, 72);
    doc.text("REPR", xPos + colReprovW / 2, currentY + 4.2, { align: "center" });
    xPos += colReprovW;
    doc.setTextColor(71, 85, 105);
    doc.text("TOTAL R$", xPos + colValW - 2, currentY + 4.2, { align: "right" });
    xPos += colValW;
    doc.text("TOTAL HL", xPos + colHLW - 2, currentY + 4.2, { align: "right" });

    currentY += 6;

    // Rows
    rnSummaries.forEach((rn, idx) => {
      ensureSpace(5.5, "Quadro Consolidado de RNs");

      const isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, currentY, contentWidth, 5.2, "FD");

      let rowX = marginX;

      // Setor
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(37, 99, 235);
      doc.text(rn.sectorKey, rowX + 2, currentY + 3.7);
      rowX += colSetorW;

      // Nome RN (truncate if necessary)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      const shortName = doc.splitTextToSize(rn.repName, colNomeW - 3)[0] || rn.repName;
      doc.text(shortName, rowX + 2, currentY + 3.7);
      rowX += colNomeW;

      // CPF
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.4);
      doc.setTextColor(100, 116, 139);
      doc.text(rn.repCpf, rowX + 2, currentY + 3.7);
      rowX += colCpfW;

      // GV / Base
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      doc.setTextColor(rn.baseName.includes("DIEGO") ? 37 : 5, rn.baseName.includes("DIEGO") ? 99 : 150, rn.baseName.includes("DIEGO") ? 235 : 105);
      doc.text(rn.gvName, rowX + 2, currentY + 3.7);
      rowX += colGvW;

      // Sols
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      doc.text(String(rn.solsCount), rowX + colSolsW / 2, currentY + 3.7, { align: "center" });
      rowX += colSolsW;

      // Aprov
      doc.setTextColor(5, 150, 105);
      doc.text(String(rn.aprovCount), rowX + colAprovW / 2, currentY + 3.7, { align: "center" });
      rowX += colAprovW;

      // Pend
      doc.setTextColor(217, 119, 6);
      doc.text(String(rn.pendCount), rowX + colPendW / 2, currentY + 3.7, { align: "center" });
      rowX += colPendW;

      // Repr
      doc.setTextColor(225, 29, 72);
      doc.text(String(rn.reprovCount), rowX + colReprovW / 2, currentY + 3.7, { align: "center" });
      rowX += colReprovW;

      // Total R$
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(formatCurrency(rn.totalValor), rowX + colValW - 2, currentY + 3.7, { align: "right" });
      rowX += colValW;

      // Total HL
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(rn.totalHL.toFixed(2), rowX + colHLW - 2, currentY + 3.7, { align: "right" });

      currentY += 5.2;
    });

    // Summary Total Row of Consolidated Table
    ensureSpace(6, "Quadro Consolidado de RNs");
    doc.setFillColor(226, 232, 240); // slate-200
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, currentY, contentWidth, 5.8, "FD");

    let totX = marginX;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAIS CONSOLIDADOS (TODOS OS SETORES):", totX + 2, currentY + 4);

    totX += colSetorW + colNomeW + colCpfW + colGvW;
    doc.text(String(totalSolsCount), totX + colSolsW / 2, currentY + 4, { align: "center" });
    totX += colSolsW;
    doc.setTextColor(5, 150, 105);
    doc.text(String(totalAprovadasCount), totX + colAprovW / 2, currentY + 4, { align: "center" });
    totX += colAprovW;
    doc.setTextColor(217, 119, 6);
    doc.text(String(totalPendentesCount), totX + colPendW / 2, currentY + 4, { align: "center" });
    totX += colPendW;
    doc.setTextColor(225, 29, 72);
    doc.text(String(totalReprovadasCount), totX + colReprovW / 2, currentY + 4, { align: "center" });
    totX += colReprovW;
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(totalGeralValor), totX + colValW - 2, currentY + 4, { align: "right" });
    totX += colValW;
    doc.text(totalGeralHL.toFixed(2), totX + colHLW - 2, currentY + 4, { align: "right" });

    currentY += 9;
  };

  // Render Section 1 Consolidated Table
  drawConsolidatedRnTable();

  // --------------------------------------------------------------------------
  // SECTION 2: DETALHAMENTO COMPLETO AGRUPADO POR REPRESENTANTE (RN) & SETOR
  // --------------------------------------------------------------------------
  // Start Section 2 on a clean new page for maximum clarity & executive elegance
  doc.addPage();
  drawContinuationHeader("Detalhamento por RN & Setor");

  // Section 2 Headline Banner
  doc.setFillColor(30, 41, 59);
  doc.rect(marginX, currentY, contentWidth, 7, "F");
  doc.setFillColor(37, 99, 235);
  doc.rect(marginX, currentY, 3, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("2. DETALHAMENTO DE TODAS AS SOLICITAÇÕES AGRUPADAS POR REPRESENTANTE (RN) & SETOR", marginX + 6, currentY + 4.8);

  currentY += 10;

  // 5. Iterate each Sector/RN and render their dedicated solicitation block
  sortedSectorKeys.forEach((sectorKey) => {
    const sectorSols = sectorsMap[sectorKey];
    const repInfo = repsMap[sectorKey];
    const repName = repInfo?.nome ? repInfo.nome : "Vendedor Não Declarado";
    const repCpf = repInfo?.cpf || "CPF Não Cadastrado";
    const gvName = repInfo?.gv ? `GV ${repInfo.gv}` : "GV OPERACIONAL";
    const baseName = repInfo?.base || repInfo?.gv || "-";

    // Sector statistics
    const secTotalValor = sectorSols.reduce((s, x) => s + x.totalValue, 0);
    const secTotalHL = sectorSols.reduce((s, x) => s + x.totalHL, 0);

    const secAprov = sectorSols.filter(x => x.status.toLowerCase().includes("aprov"));
    const secPend = sectorSols.filter(x => x.status.toLowerCase().includes("pend") && !x.status.toLowerCase().includes("recad"));
    const secReprov = sectorSols.filter(x => x.status.toLowerCase().includes("reprov"));
    const secRecad = sectorSols.filter(x => x.status.toLowerCase().includes("recad"));

    // Check space for sector banner + KPI strip (needs at least 32mm)
    ensureSpace(32, `SETOR ${sectorKey} - ${repName}`);

    // Section Header Banner: Dark Slate with Royal Blue accent strip
    doc.setFillColor(15, 23, 42); // slate-900
    doc.setDrawColor(15, 23, 42);
    doc.rect(marginX, currentY, contentWidth, 12, "F");

    doc.setFillColor(37, 99, 235); // blue accent strip on the left
    doc.rect(marginX, currentY, 3.5, 12, "F");

    // Line 1: Sector and RN Name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`SETOR ${sectorKey}  •  ${repName}`, marginX + 7, currentY + 5.5);

    // Line 1 right: Totals
    doc.setFontSize(8.5);
    doc.setTextColor(226, 232, 240);
    doc.text(
      `${sectorSols.length} Solicitações  |  ${formatCurrency(secTotalValor)}  |  ${secTotalHL.toFixed(2)} HL`,
      pageWidth - marginX - 4,
      currentY + 5.5,
      { align: "right" }
    );

    // Line 2: CPF and Base / GV
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`CPF: `, marginX + 7, currentY + 10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(226, 232, 240);
    doc.text(`${repCpf}`, marginX + 15, currentY + 10);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`   |   BASE / GERÊNCIA: `, marginX + 48, currentY + 10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(147, 197, 253); // blue-300
    doc.text(`${gvName} (${baseName})`, marginX + 80, currentY + 10);

    currentY += 12;

    // Sector Sub-bar KPIs
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, currentY, contentWidth, 7, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");

    // Aprovadas indicator
    doc.setTextColor(5, 150, 105);
    doc.text(`Aprovadas: ${secAprov.length} (${formatCurrency(secAprov.reduce((s, x) => s + x.totalValue, 0))})`, marginX + 4, currentY + 5);

    // Pendentes indicator
    doc.setTextColor(217, 119, 6);
    doc.text(`Pendentes: ${secPend.length} (${formatCurrency(secPend.reduce((s, x) => s + x.totalValue, 0))})`, marginX + 54, currentY + 5);

    // Reprovadas indicator
    doc.setTextColor(225, 29, 72);
    doc.text(`Reprovadas: ${secReprov.length} (${formatCurrency(secReprov.reduce((s, x) => s + x.totalValue, 0))})`, marginX + 104, currentY + 5);

    if (secRecad.length > 0) {
      doc.setTextColor(147, 51, 234);
      doc.text(`Recadastrar: ${secRecad.length}`, marginX + 154, currentY + 5);
    }

    currentY += 9.5;

    // Sort solicitations in this sector: Reprovadas -> Pendentes -> Aprovadas, then sol number
    const sortedSols = [...sectorSols].sort((a, b) => {
      const rank = (st: string) => {
        const s = st.toLowerCase();
        if (s.includes("reprov")) return 1;
        if (s.includes("pend")) return 2;
        if (s.includes("recad")) return 3;
        return 4;
      };
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return b.solicitacao.localeCompare(a.solicitacao, undefined, { numeric: true });
    });

    // 6. Draw each Solicitation Card inside this RN's Sector
    sortedSols.forEach((sol) => {
      const stLower = sol.status.toLowerCase();
      let statusLabel = "PENDENTE";
      let statusBg: [number, number, number] = [245, 158, 11]; // amber-500
      let statusTextColor: [number, number, number] = [255, 255, 255];
      let cardBorderColor: [number, number, number] = [203, 213, 225];

      if (stLower.includes("aprov")) {
        statusLabel = "APROVADA";
        statusBg = [16, 185, 129]; // emerald-500
        cardBorderColor = [167, 243, 208]; // emerald-200
      } else if (stLower.includes("reprov")) {
        statusLabel = "REPROVADA";
        statusBg = [225, 29, 72]; // rose-600
        cardBorderColor = [254, 205, 211]; // rose-200
      } else if (stLower.includes("recad")) {
        statusLabel = "RECADAS";
        statusBg = [147, 51, 234]; // purple-600
        cardBorderColor = [233, 213, 255]; // purple-200
      } else {
        cardBorderColor = [253, 230, 138]; // amber-200
      }

      // Resolve PDV / Client info
      const nbClean = sol.codigoCliente.trim();
      const pdvMatch = pdvDb[nbClean] || Object.values(pdvDb).find(p => p.codigo === nbClean);
      const clientName = (pdvMatch?.nomeFantasia || pdvMatch?.razaoSocial || sol.nomeCliente).toUpperCase();
      const municipioUf = pdvMatch?.municipio ? `${pdvMatch.municipio} - ${pdvMatch.uf}` : "";

      // Process Type Label
      const isRep = (sol.tipo || "").toLowerCase().includes("rep") || 
                    (sol.justificativa || "").toLowerCase().includes("falta") ||
                    sol.records.some(r => (r.justificativa || "").toLowerCase().includes("falta"));
      const tipoLabel = isRep ? "Reposição (Falta)" : "Troca";

      // Items lines (cap at 6 items for clean spacing)
      const itemsList = sol.records;
      const itemsCount = itemsList.length;
      const MAX_DISPLAY_ITEMS = 6;
      const displayedItems = itemsList.slice(0, MAX_DISPLAY_ITEMS);
      const remainingItemsCount = itemsList.length - MAX_DISPLAY_ITEMS;

      let cardHeight = 27 + (displayedItems.length * 4.5) + (remainingItemsCount > 0 ? 4 : 0);
      if (sol.observacao && sol.observacao.trim().length > 0) {
        cardHeight += 7;
      }
      if (sol.motorista || sol.conferente) {
        cardHeight += 4.5;
      }

      // Ensure space on page
      ensureSpace(cardHeight + 4, `SETOR ${sectorKey} - ${repName}`);

      // Card Container
      doc.setDrawColor(...cardBorderColor);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(marginX, currentY, contentWidth, cardHeight, 1.5, 1.5, "FD");

      // Sub-bar header inside the card
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX + 0.5, currentY + 0.5, contentWidth - 1, 7.5, "F");

      // Status Badge pill
      doc.setFillColor(...statusBg);
      doc.roundedRect(marginX + 3, currentY + 1.5, 22, 4.5, 1, 1, "F");
      doc.setTextColor(...statusTextColor);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(statusLabel, marginX + 14, currentY + 4.6, { align: "center" });

      // Solicitation Number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Solicitação: #${sol.solicitacao}`, marginX + 28, currentY + 5);

      // Process Type pill / label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(isRep ? 67 : 13, isRep ? 56 : 148, isRep ? 202 : 136);
      doc.text(`[ ${tipoLabel} ]`, marginX + 70, currentY + 5);

      // Right header items: Date, NF, Mapa
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const rightMeta = `Data: ${normalizeDateDisplay(sol.dataSolicitacao)}   |   NF: ${sol.nf}   |   Mapa: ${sol.mapa}`;
      doc.text(rightMeta, pageWidth - marginX - 4, currentY + 5, { align: "right" });

      let cardY = currentY + 11.5;

      // Row 1: Client Information
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Cliente / PDV:", marginX + 4, cardY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text(`[NB: ${nbClean}]`, marginX + 23, cardY);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      const clientFull = municipioUf ? `${clientName} (${municipioUf})` : clientName;
      const maxClientW = contentWidth - 36;
      const truncatedClient = doc.splitTextToSize(clientFull, maxClientW)[0] || clientFull;
      doc.text(truncatedClient, marginX + 40, cardY);

      cardY += 4.5;

      // Row 2: Motivo / Causa Declarada
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Motivo / Causa:", marginX + 4, cardY);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      const motiveTxt = doc.splitTextToSize(sol.justificativa, contentWidth - 35)[0] || sol.justificativa;
      doc.text(motiveTxt, marginX + 25, cardY);

      cardY += 4.5;

      // Row 3: Items List
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Itens Solicitados:", marginX + 4, cardY);
      cardY += 3.5;

      displayedItems.forEach((it) => {
        const itCode = (it.produto || "").trim();
        const itDesc = (it.descricaoProduto || "").trim() || "Item sem descrição";
        const itQty = it.quantidade || 1;
        const itUm = (it.um || "CX").toUpperCase();
        const itVal = Number(it.valorTotal) || 0;
        const itHL = getRecordHL(it);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(30, 41, 59);

        // Bullet point
        doc.text("•", marginX + 6, cardY);

        // Code
        doc.setFont("helvetica", "bold");
        doc.text(`[Cód ${itCode}]`, marginX + 9, cardY);

        // Description
        doc.setFont("helvetica", "normal");
        const maxDescW = 95;
        const shortDesc = doc.splitTextToSize(itDesc, maxDescW)[0] || itDesc;
        doc.text(shortDesc, marginX + 26, cardY);

        // Qty & Unit
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`Qtd: ${itQty} ${itUm}`, marginX + 124, cardY);

        // Item Value & HL
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        doc.text(`${formatCurrency(itVal)}  (${itHL.toFixed(4)} HL)`, pageWidth - marginX - 4, cardY, { align: "right" });

        cardY += 4.5;
      });

      if (remainingItemsCount > 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(`+ ${remainingItemsCount} outro(s) item(ns) nesta solicitação (valores e volumes somados no total do card)`, marginX + 9, cardY);
        cardY += 4;
      }

      // Logistics Info (Motorista / Veículo / Placa / Mapa / Conferente)
      const firstRec = sol.records[0];
      const veicParts = [firstRec?.veiculo ? `Veíc: ${firstRec.veiculo}` : "", firstRec?.placa ? `(${firstRec.placa})` : ""].filter(Boolean).join(" ");
      const mapaOrigem = sol.records.map(r => r.mapaOrigem).find(m => m && m !== "0") || firstRec?.mapaOrigem || "";
      const mapaRepo = sol.records.map(r => r.mapaReposicao).find(m => m && m !== "0") || firstRec?.mapaReposicao || "";

      let logItems: string[] = [];
      if (sol.motorista) logItems.push(`Motorista: ${sol.motorista}`);
      if (veicParts) logItems.push(veicParts);
      if (mapaOrigem && mapaOrigem !== sol.mapa) logItems.push(`Mapa Origem (Col X): ${mapaOrigem}`);
      if (mapaRepo) logItems.push(`Mapa Reposição: ${mapaRepo}`);
      if (sol.conferente) logItems.push(`Conferente: ${sol.conferente}`);

      if (logItems.length > 0) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        const logTxt = logItems.join("   |   ");
        const truncatedLog = doc.splitTextToSize(logTxt, contentWidth - 8)[0] || logTxt;
        doc.text(truncatedLog, marginX + 4, cardY);
        cardY += 4.5;
      }

      // Observation Box if present
      if (sol.observacao && sol.observacao.trim().length > 0) {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(marginX + 4, cardY - 2.5, contentWidth - 8, 6, 1, 1, "FD");

        doc.setFont("helvetica", "italic");
        doc.setFontSize(6.8);
        doc.setTextColor(71, 85, 105);
        const obsTrim = `Obs / Auditoria: ${sol.observacao.trim()}`;
        const shortObs = doc.splitTextToSize(obsTrim, contentWidth - 12)[0] || obsTrim;
        doc.text(shortObs, marginX + 6, cardY + 1.5);
        cardY += 6.5;
      }

      // Bottom Totals Row inside the Card
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX + 2, currentY + cardHeight - 6, marginX + contentWidth - 2, currentY + cardHeight - 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`Total de Itens: ${itemsCount}`, marginX + 4, currentY + cardHeight - 2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const totalsSummary = `Valor Total: ${formatCurrency(sol.totalValue)}   |   Volume Físico: ${sol.totalHL.toFixed(4)} HL`;
      doc.text(totalsSummary, pageWidth - marginX - 4, currentY + cardHeight - 2, { align: "right" });

      // Move Y below card
      currentY += cardHeight + 3.5;
    });

    // Clean Closure Strip for this RN/Sector
    ensureSpace(7, `SETOR ${sectorKey} - ${repName}`);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(marginX, currentY, contentWidth, 5.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(`RESUMO SETOR ${sectorKey} (${repName}):`, marginX + 3, currentY + 3.8);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const secSumLine = `${sectorSols.length} solicitações (${secAprov.length} aprovadas, ${secPend.length} pendentes, ${secReprov.length} reprovadas)  •  Total: ${formatCurrency(secTotalValor)}  •  ${secTotalHL.toFixed(4)} HL`;
    doc.text(secSumLine, pageWidth - marginX - 3, currentY + 3.8, { align: "right" });

    currentY += 8.5;
  });

  // 7. Footer on Every Page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Subtle divider
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    // Footer Text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);

    const leftFoot = "SSTR Pau Brasil Guarabira • Relatório Oficial de Auditoria & Rastreamento Operacional • Confidencial";
    doc.text(leftFoot, marginX, pageHeight - 7);

    const rightFoot = `Página ${p} de ${totalPages}`;
    doc.text(rightFoot, pageWidth - marginX, pageHeight - 7, { align: "right" });
  }

  // 8. Generate clean filename
  const cleanDateStr = options.dateStr ? options.dateStr.replace(/[^0-9]/g, "_") : new Date().toISOString().slice(0, 10);
  const secSuffix = options.sectorFilter && options.sectorFilter !== "todos" ? `_setor_${options.sectorFilter}` : "";
  const filename = `${options.filenamePrefix || "relatorio_auditoria_por_rn"}_${cleanDateStr}${secSuffix}.pdf`;

  // Auto-download in browser
  doc.save(filename);

  const pdfDataUri = doc.output("datauristring");
  return { filename, pdfDataUri };
}
