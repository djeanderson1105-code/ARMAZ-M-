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
    const um = (r.um || "UN").trim().toUpperCase();
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

  data.sort((a, b) => b["Volume Calculado (HL)"] - a["Volume Calculado (HL)"]);
  // Re-number Item Nº
  data.forEach((row, i) => { row["Item Nº"] = i + 1; });

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

/**
 * Exports all emitted Vales/Vouchers to an Excel (.xlsx) file configured as a "Pacote Prejuízo",
 * containing full details: emission date, NF, Mapa, Driver, Driver CPF, Helpers, Helper CPFs,
 * Status, Volume (HL), Total Loss Value (R$), Crew Member count, Rateio per Person (R$),
 * Client NB, Client Name, and SKU Item details for importing into third-party log/financial systems.
 */
export function exportValesPacotePrejuizoExcel(vales: any[], filenamePrefix = "pacote_prejuizo_vales_sstr") {
  if (!vales || vales.length === 0) {
    alert("Nenhum vale emitido disponível para exportação.");
    return;
  }

  const data = vales.map((v, idx) => {
    const orig = v.originalRequest || {};
    const mapa = orig.mapa || v.mapa || "S/M";
    const nb = orig.nb || "000000";
    const cliente = orig.nomeCliente || orig.razaoSocial || orig.nomeFantasia || "PONTO DE VENDA (PDV)";

    // Helpers count & split calculation
    let countPessoas = 1; // Motorista
    let h1 = v.ajudante1 || "";
    let h2 = v.ajudante2 || "";
    if (!h1 && v.ajudantes && v.ajudantes.trim() && v.ajudantes.toUpperCase() !== "NÃO DECLARADOS") {
      const parts = v.ajudantes.split(",").map((s: string) => s.trim());
      if (parts[0]) h1 = parts[0];
      if (parts[1]) h2 = parts[1];
    }

    if (h1 && h1.trim()) countPessoas++;
    if (h2 && h2.trim()) countPessoas++;

    const valorTotal = v.valorTotal || 0;
    const valorRateado = countPessoas > 0 ? Number((valorTotal / countPessoas).toFixed(2)) : valorTotal;

    // SKUs string formatting
    let skusDetail = "";
    if (orig.items && Array.isArray(orig.items) && orig.items.length > 0) {
      skusDetail = orig.items.map((it: any) => {
        const code = it.item || it.produto || it.itemCode || "";
        const desc = it.descricao || it.productDesc || "";
        const qty = it.quantidade || 1;
        const um = (it.unidadeMedida || it.um || "cx").toUpperCase();
        return `${code} - ${desc} (${qty} ${um})`;
      }).join(" | ");
    } else if (orig.item) {
      skusDetail = `${orig.item} - ${orig.descricao || ""} (${orig.quantidade || 1} ${orig.unidadeMedida || "CX"})`;
    } else {
      skusDetail = `REPOSIÇÃO SSTR SKU (${v.itemsCount || 1} ITENS)`;
    }

    const statusLabel = 
      v.status === "compensado" ? "Compensado" :
      v.status === "assinado" ? "Assinado" :
      v.status === "emitido" ? "Emitido" : "Pendente de Assinatura";

    return {
      "Item Nº": idx + 1,
      "Data Emissão": v.dataEmissao || "-",
      "Nota Fiscal (NF)": v.nf || "-",
      "Mapa de Carga": mapa,
      "Rota / Setor": v.rota || "-",
      "Motorista": v.motorista || "Não Declarado",
      "CPF Motorista": v.motoristaCpf || "Ausente",
      "Ajudante 1": h1 || "-",
      "CPF Ajudante 1": v.ajudante1Cpf || "Ausente",
      "Ajudante 2": h2 || "-",
      "CPF Ajudante 2": v.ajudante2Cpf || "Ausente",
      "Equipe Completa": v.ajudantes || (h1 ? `${h1}${h2 ? `, ${h2}` : ""}` : "Sem Ajudantes"),
      "Status do Vale": statusLabel,
      "Volume Total (HL)": Number((v.hectolitros || 0).toFixed(4)),
      "Valor Total Prejuízo (R$)": Number(valorTotal.toFixed(2)),
      "Total Integrantes Equipe": countPessoas,
      "Valor Rateado p/ Pessoa (R$)": valorRateado,
      "Qtd Itens": v.itemsCount || 1,
      "Código Cliente (NB)": nb,
      "Razão Social / Cliente": cliente,
      "Detalhamento dos SKUs / Faltas": skusDetail,
      "ID Vale SSTR": v.id || "-"
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 8 },  // Item Nº
    { wch: 14 }, // Data Emissão
    { wch: 16 }, // NF
    { wch: 14 }, // Mapa
    { wch: 12 }, // Rota
    { wch: 28 }, // Motorista
    { wch: 18 }, // CPF Motorista
    { wch: 24 }, // Ajudante 1
    { wch: 18 }, // CPF Ajudante 1
    { wch: 24 }, // Ajudante 2
    { wch: 18 }, // CPF Ajudante 2
    { wch: 32 }, // Equipe Completa
    { wch: 20 }, // Status do Vale
    { wch: 18 }, // Volume HL
    { wch: 22 }, // Valor Total Prejuízo
    { wch: 20 }, // Total Integrantes
    { wch: 24 }, // Valor Rateado
    { wch: 12 }, // Qtd Itens
    { wch: 16 }, // Código Cliente
    { wch: 35 }, // Cliente
    { wch: 50 }, // SKUs
    { wch: 24 }  // ID Vale
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pacote Prejuízo Vales");

  const timestampStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}_${timestampStr}.xlsx`);
}

