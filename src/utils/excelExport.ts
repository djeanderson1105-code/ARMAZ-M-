import * as XLSX from "xlsx";
import { ExchangeRecord } from "../types";
import { PRODUCT_DATABASE } from "../data/products";
import { getHectoFactor, getRecordHL } from "./hectoFactors";

/**
 * Exports all active records to an Excel (.xlsx) file with detailed quantity,
 * unit of measure, box factors, and exact hectoliter (HL) calculation formulas.
 */
export function exportHectoliterAuditExcel(records: ExchangeRecord[], filenamePrefix = "auditoria_calculo_hectolitros") {
  if (!records || records.length === 0) {
    alert("Nenhum item disponível para exportação.");
    return;
  }

  const data = records.map((r, idx) => {
    const codeStr = String(r.produto || "").trim();
    const cleanCode = codeStr.replace(/^0+/, "");
    const prod = PRODUCT_DATABASE.find(p => p.codigo === codeStr || p.codigo === cleanCode);

    const fatorCaixa = (prod && prod.fator && prod.fator > 0) ? prod.fator : 1;
    const fatorHectoCaixa = prod ? prod.fatorHecto : getHectoFactor(codeStr);
    const um = (r.um || "CX").trim().toUpperCase();
    const qtd = r.quantidade || 0;
    const computedHL = getRecordHL(r);

    const hlPorUnidade = fatorCaixa > 0 ? (fatorHectoCaixa / fatorCaixa) : fatorHectoCaixa;

    let formulaExplicacao = "";
    if (um === "UN" || um === "UNID" || um.startsWith("UN")) {
      formulaExplicacao = `${qtd} UN x (${fatorHectoCaixa.toFixed(4)} HL/CX ÷ ${fatorCaixa} un/CX) = ${computedHL.toFixed(4)} HL (${hlPorUnidade.toFixed(6)} HL/UN)`;
    } else if (um === "DZ" || um === "DUZIA" || um.startsWith("DZ")) {
      formulaExplicacao = `${qtd} DZ (${qtd * 12} UN) x ${hlPorUnidade.toFixed(6)} HL/UN = ${computedHL.toFixed(4)} HL`;
    } else {
      formulaExplicacao = `${qtd} CX x ${fatorHectoCaixa.toFixed(4)} HL/CX = ${computedHL.toFixed(4)} HL`;
    }

    return {
      "Item Nº": idx + 1,
      "ID Solicitação": r.solicitacao || "-",
      "Data Lançamento": r.dataSolicitacao || "-",
      "Setor Venda": r.setorVenda || "-",
      "Código Cliente": r.codigoCliente || "-",
      "Nome Cliente": r.nomeCliente || "-",
      "Código Produto": r.produto || "-",
      "Descrição Produto": r.descricaoProduto || "-",
      "Quantidade Lançada": qtd,
      "Unidade Medida (UM)": um,
      "Fator Caixa (Unidades por Caixa)": fatorCaixa,
      "Fator Hecto da Caixa (HL/CX)": fatorHectoCaixa,
      "Hectoliter por Unidade (HL/UN)": Number(hlPorUnidade.toFixed(6)),
      "Volume Calculado (HL)": Number(computedHL.toFixed(4)),
      "Fórmula & Detalhes do Cálculo HL": formulaExplicacao,
      "Valor Unitário (R$)": r.valorUnitario || 0,
      "Valor Total (R$)": r.valorTotal || 0,
      "Status": r.status || "-",
      "Motivo / Justificativa": r.justificativa || "-",
      "Nota Fiscal": r.nf || "-",
      "Motorista": r.nomeMotorista || "-",
      "Veículo": r.veiculo || "-",
      "Placa": r.placa || "-",
      "Conferente": r.conferente || "-",
      "Origem Sistema": r.sistemaOrigem || "-"
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Set explicit column widths for readability in Excel
  worksheet["!cols"] = [
    { wch: 8 },  // Item Nº
    { wch: 15 }, // ID Solicitação
    { wch: 14 }, // Data
    { wch: 12 }, // Setor
    { wch: 14 }, // Cód Cliente
    { wch: 32 }, // Nome Cliente
    { wch: 14 }, // Cód Produto
    { wch: 38 }, // Descrição Produto
    { wch: 18 }, // Quantidade
    { wch: 18 }, // UM
    { wch: 28 }, // Fator Caixa
    { wch: 28 }, // Fator Hecto Caixa
    { wch: 28 }, // HL por UN
    { wch: 22 }, // Volume HL
    { wch: 65 }, // Fórmula
    { wch: 18 }, // Valor Unitário
    { wch: 18 }, // Valor Total
    { wch: 16 }, // Status
    { wch: 28 }, // Justificativa
    { wch: 14 }, // NF
    { wch: 25 }, // Motorista
    { wch: 18 }, // Veículo
    { wch: 12 }, // Placa
    { wch: 20 }, // Conferente
    { wch: 20 }  // Origem
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoria Hectolitros");

  const timestampStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}_${timestampStr}.xlsx`);
}
