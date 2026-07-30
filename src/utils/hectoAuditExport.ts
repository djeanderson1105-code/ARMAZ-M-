import * as XLSX from "xlsx";
import { ExchangeRecord } from "../types";
import { getRecordHL, getHectoFactor, calculateHL } from "./hectoFactors";
import { PRODUCT_DATABASE } from "../data/products";

export interface HectoAuditRow {
  "ID / Solicitacao": string;
  "NF-e": string;
  "Data": string;
  "Mês/Ano": string;
  "Origem": string;
  "Setor / Rota": string;
  "Código NB": string;
  "Nome do Cliente": string;
  "Cidade": string;
  "Código SKU": string;
  "Descrição do Produto": string;
  "Quantidade": number;
  "Unidade de Medida": string;
  "Fator Embalagem (Unid/CX)": number;
  "Fator Hecto (HL/CX)": number;
  "HL Unitário": number;
  "HL Total Contabilizado": number;
  "Valor Unitário (R$)": number;
  "Valor Total (R$)": number;
  "Status": string;
  "Justificativa": string;
}

export function exportHectoliterAuditReport(records: ExchangeRecord[], filenamePrefix: string = "relatorio_auditoria_hectolitros") {
  if (!records || records.length === 0) {
    alert("Nenhum registro encontrado para exportar o relatório de hectolitros.");
    return;
  }

  const rows: HectoAuditRow[] = [];
  const monthlySummary: { [monthYear: string]: { month: string; totalQty: number; totalSpent: number; totalHL: number; count: number } } = {};

  let totalHLSum = 0;
  let totalSpentSum = 0;
  let totalQtySum = 0;

  records.forEach((r, idx) => {
    const code = String(r.produto || "").trim();
    const cleanCode = code.replace(/^0+/, "");
    const productDef = PRODUCT_DATABASE.find(p => p.codigo === code || p.codigo === cleanCode);

    const quantidade = r.quantidade || 0;
    const umRaw = (r.um || (r as any).unidadeMedida || "cx").trim();
    const umClean = umRaw.toLowerCase();
    const isUnd = umClean === "und" || umClean === "un" || umClean === "unidade" || umClean.startsWith("un");

    const embalagem = (productDef && productDef.fator && productDef.fator > 0) ? productDef.fator : ((r as any).fatorEmbalagem || 12);
    const fatorHecto = productDef ? productDef.fatorHecto : getHectoFactor(code);

    const hlUnitario = isUnd ? (fatorHecto / embalagem) : fatorHecto;
    const hlTotalCalculated = getRecordHL(r);

    totalHLSum += hlTotalCalculated;
    totalSpentSum += r.valorTotal || 0;
    totalQtySum += quantidade;

    // Extract Month/Year
    let monthYearStr = "N/A";
    if (r.dataSolicitacao) {
      const parts = r.dataSolicitacao.split("/");
      if (parts.length === 3) {
        monthYearStr = `${parts[1]}/${parts[2]}`;
      }
    }

    if (!monthlySummary[monthYearStr]) {
      monthlySummary[monthYearStr] = { month: monthYearStr, totalQty: 0, totalSpent: 0, totalHL: 0, count: 0 };
    }
    monthlySummary[monthYearStr].totalQty += quantidade;
    monthlySummary[monthYearStr].totalSpent += r.valorTotal || 0;
    monthlySummary[monthYearStr].totalHL += hlTotalCalculated;
    monthlySummary[monthYearStr].count += 1;

    rows.push({
      "ID / Solicitacao": r.solicitacao || String(r.id || idx + 1),
      "NF-e": r.nf || "-",
      "Data": r.dataSolicitacao || "-",
      "Mês/Ano": monthYearStr,
      "Origem": r.sistemaOrigem || "Promax",
      "Setor / Rota": r.setorVenda || "-",
      "Código NB": r.codigoCliente || "-",
      "Nome do Cliente": r.nomeCliente || "-",
      "Cidade": (r as any).cidadeCliente || "-",
      "Código SKU": code,
      "Descrição do Produto": r.descricaoProduto || "-",
      "Quantidade": quantidade,
      "Unidade de Medida": isUnd ? "UND (Unidade)" : "CX (Caixa)",
      "Fator Embalagem (Unid/CX)": embalagem,
      "Fator Hecto (HL/CX)": Number(fatorHecto.toFixed(5)),
      "HL Unitário": Number(hlUnitario.toFixed(5)),
      "HL Total Contabilizado": Number(hlTotalCalculated.toFixed(4)),
      "Valor Unitário (R$)": Number((r.valorUnitario || 0).toFixed(2)),
      "Valor Total (R$)": Number((r.valorTotal || 0).toFixed(2)),
      "Status": r.status || "-",
      "Justificativa": r.justificativa || r.observacao || "-"
    });
  });

  // Create Workbook with 2 sheets:
  // Sheet 1: Audit Detail (Itens & Quantidades Detalhadas)
  // Sheet 2: Resumo Mensal por Hectolitragem
  const wb = XLSX.utils.book_new();

  const wsDetails = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  wsDetails["!cols"] = [
    { wch: 18 }, // ID
    { wch: 12 }, // NF
    { wch: 12 }, // Data
    { wch: 10 }, // Mes/Ano
    { wch: 18 }, // Origem
    { wch: 14 }, // Setor
    { wch: 12 }, // NB
    { wch: 32 }, // Cliente
    { wch: 16 }, // Cidade
    { wch: 12 }, // SKU
    { wch: 38 }, // Produto
    { wch: 12 }, // Qtd
    { wch: 16 }, // UM
    { wch: 18 }, // Fator Emb
    { wch: 18 }, // Fator Hecto
    { wch: 14 }, // HL Unit
    { wch: 22 }, // HL Total
    { wch: 16 }, // Valor Unit
    { wch: 16 }, // Valor Total
    { wch: 16 }, // Status
    { wch: 24 }  // Justificativa
  ];

  XLSX.utils.book_append_sheet(wb, wsDetails, "Detalhamento de Itens HL");

  // Summary Sheet
  const summaryRows = Object.values(monthlySummary).map(m => ({
    "Mês / Ano": m.month,
    "Qtd Registros": m.count,
    "Quantidade Física Total": m.totalQty,
    "Valor Total (R$)": Number(m.totalSpent.toFixed(2)),
    "Hectolitros Totais (HL)": Number(m.totalHL.toFixed(4)),
    "Média HL / Registro": Number((m.totalHL / (m.count || 1)).toFixed(4))
  }));

  // Add Grand Total Row
  summaryRows.push({
    "Mês / Ano": "TOTAL GERAL",
    "Qtd Registros": records.length,
    "Quantidade Física Total": totalQtySum,
    "Valor Total (R$)": Number(totalSpentSum.toFixed(2)),
    "Hectolitros Totais (HL)": Number(totalHLSum.toFixed(4)),
    "Média HL / Registro": Number((totalHLSum / (records.length || 1)).toFixed(4))
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Mensal HL");

  const timestampStr = new Date().toISOString().slice(0, 10);
  const fileName = `${filenamePrefix}_${timestampStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
