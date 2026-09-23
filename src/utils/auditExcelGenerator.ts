import * as XLSX from "xlsx";
import { ExchangeRecord, getRepresentativosSetor } from "../types";
import { getPdvDatabase } from "../data/pdvData";
import { getRecordHL } from "./hectoFactors";
import { AuditPdfOptions } from "./auditPdfGenerator";

/**
 * Normalizes date to DD/MM/YYYY for Excel
 */
function normalizeDateExcel(d?: string): string {
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
 * Exports all Audit & Tracking records to an Excel (.xlsx) file,
 * with all solicitations strictly grouped by RN / Sector and an executive Summary Sheet.
 */
export function exportAuditTrackingExcel(
  records: ExchangeRecord[],
  options: AuditPdfOptions = {}
): { filename: string } {
  if (!records || records.length === 0) {
    throw new Error("Nenhum registro encontrado para exportar o relatório de auditoria.");
  }

  const pdvDb = getPdvDatabase();
  const repsMap = getRepresentativosSetor();

  // 1. Group records by solicitation
  const solsMap: Record<string, ExchangeRecord[]> = {};
  records.forEach((rec) => {
    const sol = (rec.solicitacao || "").trim() || "SEM_NUMERO";
    if (!solsMap[sol]) {
      solsMap[sol] = [];
    }
    solsMap[sol].push(rec);
  });

  // Calculate totals per solicitation
  const solSummaries: Record<string, { totalVal: number; totalHL: number; sector: string }> = {};
  Object.entries(solsMap).forEach(([sol, recs]) => {
    const totalVal = recs.reduce((sum, r) => sum + (Number(r.valorTotal) || 0), 0);
    const totalHL = recs.reduce((sum, r) => sum + getRecordHL(r), 0);
    const first = recs[0];
    const validSector = recs.map(r => (r.setorVenda || "").trim()).find(s => s && s !== "-" && s !== "0") || (first.setorVenda || "Indefinido").trim();
    solSummaries[sol] = { totalVal, totalHL, sector: validSector };
  });

  // 2. Group solicitations by Sector / RN
  const sectorsMap: Record<string, string[]> = {}; // sectorKey -> array of solicitation IDs
  Object.entries(solSummaries).forEach(([solId, data]) => {
    const sec = data.sector || "OUTROS";
    if (!sectorsMap[sec]) {
      sectorsMap[sec] = [];
    }
    sectorsMap[sec].push(solId);
  });

  // Sort sectors naturally
  const sortedSectorKeys = Object.keys(sectorsMap).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true });
  });

  // 3. Build Sheet 1: "Resumo por RN & Setor"
  const summaryRows: any[] = [];
  let sumTotalSols = 0;
  let sumAprovQtd = 0;
  let sumAprovVal = 0;
  let sumAprovHL = 0;
  let sumPendQtd = 0;
  let sumPendVal = 0;
  let sumPendHL = 0;
  let sumReprovQtd = 0;
  let sumReprovVal = 0;
  let sumReprovHL = 0;
  let sumRecadQtd = 0;
  let sumGeralVal = 0;
  let sumGeralHL = 0;

  sortedSectorKeys.forEach((secKey) => {
    const repInfo = repsMap[secKey];
    const repNome = repInfo?.nome || "Representante Não Declarado";
    const repCpf = repInfo?.cpf || "-";
    const repGv = repInfo?.gv ? `GV ${repInfo.gv}` : "GV OPERACIONAL";
    const repBase = repInfo?.base || repInfo?.gv || "-";

    const solIds = sectorsMap[secKey];
    let aprovQtd = 0;
    let aprovVal = 0;
    let aprovHL = 0;
    let pendQtd = 0;
    let pendVal = 0;
    let pendHL = 0;
    let reprovQtd = 0;
    let reprovVal = 0;
    let reprovHL = 0;
    let recadQtd = 0;
    let secVal = 0;
    let secHL = 0;

    solIds.forEach((sId) => {
      const recs = solsMap[sId];
      const first = recs[0];
      const st = (first.status || "").toLowerCase();
      const sVal = solSummaries[sId].totalVal;
      const sHL = solSummaries[sId].totalHL;
      secVal += sVal;
      secHL += sHL;

      if (st.includes("aprov")) {
        aprovQtd++;
        aprovVal += sVal;
        aprovHL += sHL;
      } else if (st.includes("reprov")) {
        reprovQtd++;
        reprovVal += sVal;
        reprovHL += sHL;
      } else if (st.includes("recad")) {
        recadQtd++;
      } else {
        pendQtd++;
        pendVal += sVal;
        pendHL += sHL;
      }
    });

    sumTotalSols += solIds.length;
    sumAprovQtd += aprovQtd;
    sumAprovVal += aprovVal;
    sumAprovHL += aprovHL;
    sumPendQtd += pendQtd;
    sumPendVal += pendVal;
    sumPendHL += pendHL;
    sumReprovQtd += reprovQtd;
    sumReprovVal += reprovVal;
    sumReprovHL += reprovHL;
    sumRecadQtd += recadQtd;
    sumGeralVal += secVal;
    sumGeralHL += secHL;

    summaryRows.push({
      "Setor": `Setor ${secKey}`,
      "Representante de Negócios (RN)": repNome,
      "CPF do RN": repCpf,
      "Base / Gerência (GV)": `${repGv} (${repBase})`,
      "Total Solicitações": solIds.length,
      "Aprovadas (Qtd)": aprovQtd,
      "Aprovadas (R$)": Number(aprovVal.toFixed(2)),
      "Aprovadas (HL)": Number(aprovHL.toFixed(4)),
      "Pendentes (Qtd)": pendQtd,
      "Pendentes (R$)": Number(pendVal.toFixed(2)),
      "Pendentes (HL)": Number(pendHL.toFixed(4)),
      "Reprovadas (Qtd)": reprovQtd,
      "Reprovadas (R$)": Number(reprovVal.toFixed(2)),
      "Reprovadas (HL)": Number(reprovHL.toFixed(4)),
      "Recadastrar (Qtd)": recadQtd,
      "Valor Total Geral (R$)": Number(secVal.toFixed(2)),
      "Volume Total Geral (HL)": Number(secHL.toFixed(4))
    });
  });

  // Append Total Row
  summaryRows.push({
    "Setor": "TOTAL GERAL AUDITADO",
    "Representante de Negócios (RN)": "TODOS OS RNS",
    "CPF do RN": "-",
    "Base / Gerência (GV)": "-",
    "Total Solicitações": sumTotalSols,
    "Aprovadas (Qtd)": sumAprovQtd,
    "Aprovadas (R$)": Number(sumAprovVal.toFixed(2)),
    "Aprovadas (HL)": Number(sumAprovHL.toFixed(4)),
    "Pendentes (Qtd)": sumPendQtd,
    "Pendentes (R$)": Number(sumPendVal.toFixed(2)),
    "Pendentes (HL)": Number(sumPendHL.toFixed(4)),
    "Reprovadas (Qtd)": sumReprovQtd,
    "Reprovadas (R$)": Number(sumReprovVal.toFixed(2)),
    "Reprovadas (HL)": Number(sumReprovHL.toFixed(4)),
    "Recadastrar (Qtd)": sumRecadQtd,
    "Valor Total Geral (R$)": Number(sumGeralVal.toFixed(2)),
    "Volume Total Geral (HL)": Number(sumGeralHL.toFixed(4))
  });

  // 4. Build Sheet 2: "Solicitações Agrupadas por RN"
  const detailedRows: any[] = [];

  sortedSectorKeys.forEach((secKey) => {
    const repInfo = repsMap[secKey];
    const repNome = repInfo?.nome || "Representante Não Declarado";
    const repCpf = repInfo?.cpf || "-";
    const repGv = repInfo?.gv ? `GV ${repInfo.gv}` : "GV OPERACIONAL";
    const repBase = repInfo?.base || repInfo?.gv || "-";

    const solIds = sectorsMap[secKey];

    // Sort solicitations in this sector: reproved first, then pending, then approved
    const sortedSolIds = [...solIds].sort((aId, bId) => {
      const recA = solsMap[aId][0];
      const recB = solsMap[bId][0];
      const rank = (st: string) => {
        const s = (st || "").toLowerCase();
        if (s.includes("reprov")) return 1;
        if (s.includes("pend")) return 2;
        if (s.includes("recad")) return 3;
        return 4;
      };
      const diff = rank(recA?.status || "") - rank(recB?.status || "");
      if (diff !== 0) return diff;
      return bId.localeCompare(aId, undefined, { numeric: true });
    });

    sortedSolIds.forEach((sId) => {
      const recs = solsMap[sId];
      const first = recs[0];
      const solVal = solSummaries[sId].totalVal;
      const solHL = solSummaries[sId].totalHL;

      // PDV data
      const nbClean = (first.codigoCliente || "").trim();
      const pdvMatch = pdvDb[nbClean] || Object.values(pdvDb).find(p => p.codigo === nbClean);
      const clientName = (pdvMatch?.nomeFantasia || pdvMatch?.razaoSocial || first.nomeCliente || "Cliente Não Informado").toUpperCase();
      const clientMunUf = pdvMatch?.municipio ? `${pdvMatch.municipio} - ${pdvMatch.uf}` : "-";

      const isRep = (first.tipo || "").toLowerCase().includes("rep") || 
                    (first.justificativa || "").toLowerCase().includes("falta") ||
                    recs.some(r => (r.justificativa || "").toLowerCase().includes("falta"));
      const tipoLabel = isRep ? "Reposição (Falta)" : "Troca";

      const validMapas = recs
        .map(r => r.mapaOrigem || r.mapa)
        .map(m => (m || "").trim())
        .filter(m => m && m !== "0" && m.toLowerCase() !== "falta" && m !== "-");
      const uniqueMapas = Array.from(new Set(validMapas));
      const mapaClean = uniqueMapas.length > 0 ? uniqueMapas.join(", ") : (first.mapaOrigem || first.mapa || "-");
      const nfClean = recs.map(r => r.nf).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") || first.nf || "-";

      const mapaOrigemColX = recs.map(r => r.mapaOrigem).find(m => m && m !== "0") || first.mapaOrigem || "-";
      const mapaReposicao = recs.map(r => r.mapaReposicao).find(m => m && m !== "0") || first.mapaReposicao || "-";

      recs.forEach((it, itIdx) => {
        const itemHL = getRecordHL(it);
        const itVal = Number(it.valorTotal) || 0;
        const itUnitVal = Number(it.valorUnitario) || (it.quantidade ? itVal / it.quantidade : 0);

        detailedRows.push({
          "Setor": `Setor ${secKey}`,
          "Nome do Representante (RN)": repNome,
          "CPF do RN": repCpf,
          "GV / Base": `${repGv} (${repBase})`,
          "ID Solicitação": sId,
          "Item Nº": itIdx + 1,
          "Data Solicitação": normalizeDateExcel(first.dataSolicitacao),
          "Status": (first.status || "Pendente").trim().toUpperCase(),
          "Tipo de Processo": tipoLabel,
          "Código Cliente (NB)": nbClean || "-",
          "Nome do Cliente (PDV)": clientName,
          "Município - UF": clientMunUf,
          "Motivo / Causa": first.justificativa || "-",
          "Código Produto": (it.produto || "-").trim(),
          "Descrição do Produto": (it.descricaoProduto || "-").trim(),
          "Quantidade": it.quantidade || 0,
          "Unidade Medida (UM)": (it.um || "CX").toUpperCase(),
          "Valor Unitário (R$)": Number(itUnitVal.toFixed(2)),
          "Valor Total Item (R$)": Number(itVal.toFixed(2)),
          "Volume Item (HL)": Number(itemHL.toFixed(4)),
          "Valor Total da Solicitação (R$)": Number(solVal.toFixed(2)),
          "Volume Total da Solicitação (HL)": Number(solHL.toFixed(4)),
          "Nota Fiscal (NF)": nfClean,
          "Mapa": mapaClean,
          "Mapa Origem (Col X)": mapaOrigemColX,
          "Mapa Reposição": mapaReposicao,
          "Motorista": it.nomeMotorista || it.motorista || first.nomeMotorista || first.motorista || "-",
          "Veículo": it.veiculo || first.veiculo || "-",
          "Placa": it.placa || first.placa || "-",
          "Conferente": it.conferente || first.conferente || "-",
          "Observações / Auditoria": recs.map(r => r.observacao).filter(Boolean).join(" | ") || first.observacao || "-"
        });
      });
    });
  });

  const workbook = XLSX.utils.book_new();

  // Create Sheet 1
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 12 }, // Setor
    { wch: 38 }, // Representante
    { wch: 18 }, // CPF
    { wch: 22 }, // Base / GV
    { wch: 18 }, // Total Sols
    { wch: 16 }, // Aprov Qtd
    { wch: 18 }, // Aprov R$
    { wch: 16 }, // Aprov HL
    { wch: 16 }, // Pend Qtd
    { wch: 18 }, // Pend R$
    { wch: 16 }, // Pend HL
    { wch: 16 }, // Reprov Qtd
    { wch: 18 }, // Reprov R$
    { wch: 16 }, // Reprov HL
    { wch: 18 }, // Recad Qtd
    { wch: 22 }, // Valor Total
    { wch: 22 }  // Volume Total
  ];
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Resumo por RN & Setor");

  // Create Sheet 2
  const wsDetailed = XLSX.utils.json_to_sheet(detailedRows);
  wsDetailed["!cols"] = [
    { wch: 12 }, // Setor
    { wch: 38 }, // Nome RN
    { wch: 18 }, // CPF
    { wch: 22 }, // GV / Base
    { wch: 16 }, // ID Solicitação
    { wch: 8 },  // Item Nº
    { wch: 15 }, // Data
    { wch: 14 }, // Status
    { wch: 20 }, // Tipo Processo
    { wch: 18 }, // NB
    { wch: 36 }, // Nome Cliente
    { wch: 22 }, // Mun - UF
    { wch: 30 }, // Motivo
    { wch: 14 }, // Cód Produto
    { wch: 38 }, // Desc Produto
    { wch: 12 }, // Qtd
    { wch: 8 },  // UM
    { wch: 16 }, // Valor Unit
    { wch: 16 }, // Valor Total Item
    { wch: 16 }, // Volume Item HL
    { wch: 22 }, // Valor Total Sol
    { wch: 22 }, // Volume Total Sol HL
    { wch: 14 }, // NF
    { wch: 12 }, // Mapa
    { wch: 18 }, // Mapa Origem
    { wch: 18 }, // Mapa Reposição
    { wch: 26 }, // Motorista
    { wch: 14 }, // Veículo
    { wch: 12 }, // Placa
    { wch: 20 }, // Conferente
    { wch: 35 }  // Observações
  ];
  XLSX.utils.book_append_sheet(workbook, wsDetailed, "Solicitações por Setor e RN");

  const cleanDateStr = options.dateStr ? options.dateStr.replace(/[^0-9]/g, "_") : new Date().toISOString().slice(0, 10);
  const secSuffix = options.sectorFilter && options.sectorFilter !== "todos" ? `_setor_${options.sectorFilter}` : "";
  const filename = `${options.filenamePrefix || "auditoria_solicitacoes_por_rn"}_${cleanDateStr}${secSuffix}.xlsx`;

  XLSX.writeFile(workbook, filename);
  return { filename };
}
