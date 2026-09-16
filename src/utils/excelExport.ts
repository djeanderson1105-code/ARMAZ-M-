import * as XLSX from "xlsx";
import { ExchangeRecord, PendingRequest, calculateValeRateio, isDriverX } from "../types";
import { ValeEntry } from "../components/ValesHistoryDashboard";
import { PRODUCT_DATABASE, calculateRequestValueAndHL } from "../data/products";
import { getHectoFactor, getRecordHL } from "./hectoFactors";
import { isRequestWithVale } from "./valeCheck";
import { getPdvDatabase } from "../data/pdvData";

/**
 * Formats a date string (YYYY-MM-DD or DD/MM/YYYY) cleanly to DD/MM/YYYY for Excel export
 */
function formatExcelDate(dStr?: string): string {
  if (!dStr) return "-";
  const clean = String(dStr).trim();
  const isoMatch = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${d}/${m}/${y}`;
  }
  const brMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, "0");
    const m = brMatch[2].padStart(2, "0");
    const y = brMatch[3];
    return `${d}/${m}/${y}`;
  }
  return clean;
}

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

  const pdvDb = getPdvDatabase();

  const data = vales.map((v) => {
    const orig = v.originalRequest || {};
    const mapa = orig.mapa || v.mapa || "S/M";
    const nb = orig.nb || (v as any).nb || "000000";
    let cliente = orig.nomeCliente || orig.razaoSocial || orig.nomeFantasia || "";
    if (!cliente || cliente === "PONTO DE VENDA (PDV)") {
      if (pdvDb[nb]) {
        cliente = pdvDb[nb].nomeFantasia || pdvDb[nb].razaoSocial || "PONTO DE VENDA (PDV)";
      } else {
        cliente = "PONTO DE VENDA (PDV)";
      }
    }

    // 1ª Coluna: Data (formatada DD/MM/YYYY)
    const rawDate = v.dataEmissao || orig.data || orig.cadastroDate || "";
    const dataFormatada = formatExcelDate(rawDate);

    // 2ª Coluna: Código, 3ª Coluna: Descrição, 4ª Coluna: Quantidade
    let codigo = "";
    let descricao = "";
    let quantidade = 1;

    if (orig.items && Array.isArray(orig.items) && orig.items.length > 0) {
      if (orig.items.length === 1) {
        const first = orig.items[0];
        codigo = String(first.item || first.itemCode || first.produto || first.codigo || "").trim();
        descricao = first.descricao || first.productDesc || first.descricaoProduto || "";
        quantidade = Number(first.quantidade) || 1;
      } else {
        codigo = orig.items.map((it: any) => it.item || it.itemCode || it.produto || it.codigo).filter(Boolean).join(", ");
        descricao = orig.items.map((it: any) => it.descricao || it.productDesc || it.descricaoProduto || it.item).filter(Boolean).join(" | ");
        quantidade = orig.items.reduce((acc: number, it: any) => acc + (Number(it.quantidade) || 0), 0) || 1;
      }
    }

    if (!codigo) {
      codigo = String(orig.item || orig.itemCode || orig.produto || orig.codigo || (v as any).itemCode || (v as any).item || (v as any).produto || "").trim();
    }

    if (!descricao) {
      descricao = orig.descricaoProduto || orig.descricao || orig.productDesc || (v as any).itemDesc || (v as any).descricao || "";
    }

    // Resolução precisa da descrição através do banco de produtos
    if (!descricao || descricao === "N/A" || descricao === "-") {
      const cleanCode = codigo.replace(/^0+/, "");
      const prod = PRODUCT_DATABASE.find(p => p.codigo === codigo || p.codigo === cleanCode);
      if (prod && prod.descricao) {
        descricao = prod.descricao;
      }
    }

    if (!quantidade || quantidade <= 0) {
      quantidade = Number(orig.quantidade) || Number(v.itemsCount) || 1;
    }

    // 5ª Coluna: Valor Total (inalterado e coerente com a realidade)
    const valorTotal = v.valorTotal != null ? Number(v.valorTotal) : (orig.valorTotal != null ? Number(orig.valorTotal) : 0);
    const valorTotalNum = Number(valorTotal.toFixed(2));

    const rateioInfo = calculateValeRateio(
      valorTotal,
      v.motorista,
      v.motoristaCpf,
      v.ajudante1,
      v.ajudante1Cpf,
      v.ajudante2,
      v.ajudante2Cpf,
      v.ajudantes
    );

    let h1 = v.ajudante1 || "";
    let h2 = v.ajudante2 || "";
    if (!h1 && v.ajudantes && v.ajudantes.trim() && v.ajudantes.toUpperCase() !== "NÃO DECLARADOS") {
      const parts = v.ajudantes.split(",").map((s: string) => s.trim());
      if (parts[0]) h1 = parts[0];
      if (parts[1]) h2 = parts[1];
    }

    const countPessoas = rateioInfo.count;
    const valorRateado = Number(rateioInfo.individualValue.toFixed(2));
    const isX = rateioInfo.isDriverX;

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
      skusDetail = `${orig.item} - ${orig.descricao || orig.descricaoProduto || ""} (${orig.quantidade || 1} ${orig.unidadeMedida || "CX"})`;
    } else if (codigo && codigo !== "-") {
      skusDetail = `${codigo} - ${descricao} (${quantidade} CX)`;
    } else {
      skusDetail = `REPOSIÇÃO SSTR SKU (${v.itemsCount || 1} ITENS)`;
    }

    const statusLabel = 
      v.status === "compensado" ? "Compensado" :
      v.status === "assinado" ? "Assinado" :
      v.status === "emitido" ? "Emitido" : "Pendente de Assinatura";

    return {
      "Data": dataFormatada,
      "Código": codigo || "-",
      "Descrição": descricao || "-",
      "Quantidade": quantidade,
      "Valor Total": valorTotalNum,
      "Motorista": v.motorista ? (isX ? `${v.motorista} (Isento de Rateio)` : v.motorista) : (orig.faltaMotorista || "Não Declarado"),
      "CPF Motorista": v.motoristaCpf || orig.faltaMotoristaCpf || "Ausente",
      "Ajudante 1": h1 || orig.faltaAjudante1 || "-",
      "CPF Ajudante 1": v.ajudante1Cpf || orig.faltaAjudante1Cpf || "Ausente",
      "Ajudante 2": h2 || orig.faltaAjudante2 || "-",
      "CPF Ajudante 2": v.ajudante2Cpf || orig.faltaAjudante2Cpf || "Ausente",
      "Equipe Completa": v.ajudantes || orig.faltaAjudantes || (h1 ? `${h1}${h2 ? `, ${h2}` : ""}` : "Sem Ajudantes"),
      "Código Cliente (NB)": nb,
      "Razão Social / Cliente": cliente,
      "Nota Fiscal (NF)": v.nf || orig.nf || "-",
      "Mapa de Carga": mapa,
      "Rota / Setor": v.rota || orig.setor || "-",
      "Volume Total (HL)": Number((v.hectolitros || orig.hectolitros || 0).toFixed(4)),
      "Status do Vale": statusLabel,
      "Total Integrantes Rateio": isX ? `${countPessoas} Ajudante(s) (Motorista X Isento)` : `${countPessoas} Integrante(s)`,
      "Valor Rateado p/ Pessoa (R$)": valorRateado,
      "Detalhamento dos SKUs / Faltas": skusDetail,
      "ID Vale SSTR": v.id || "-"
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 14 }, // Data (1ª)
    { wch: 14 }, // Código (2ª)
    { wch: 38 }, // Descrição (3ª)
    { wch: 12 }, // Quantidade (4ª)
    { wch: 16 }, // Valor Total (5ª)
    { wch: 28 }, // Motorista
    { wch: 18 }, // CPF Motorista
    { wch: 24 }, // Ajudante 1
    { wch: 18 }, // CPF Ajudante 1
    { wch: 24 }, // Ajudante 2
    { wch: 18 }, // CPF Ajudante 2
    { wch: 32 }, // Equipe Completa
    { wch: 18 }, // Código Cliente (NB)
    { wch: 35 }, // Razão Social / Cliente
    { wch: 16 }, // Nota Fiscal (NF)
    { wch: 14 }, // Mapa de Carga
    { wch: 12 }, // Rota / Setor
    { wch: 16 }, // Volume Total (HL)
    { wch: 20 }, // Status do Vale
    { wch: 22 }, // Total Integrantes Rateio
    { wch: 24 }, // Valor Rateado p/ Pessoa (R$)
    { wch: 50 }, // Detalhamento dos SKUs / Faltas
    { wch: 24 }  // ID Vale SSTR
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Base de Vales");

  const timestampStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filenamePrefix}_${timestampStr}.xlsx`);
}

/**
 * Exports the filtered requests database with exact period, financial,
 * and voucher (vale) tracking information to an Excel (.xlsx) file.
 */
export function exportFilteredRequestsExcel(
  requests: PendingRequest[],
  valesList: ValeEntry[] = [],
  promaxRecords: ExchangeRecord[] = [],
  filters: {
    startDate?: string;
    endDate?: string;
    sectorFilter?: string;
    processTypeFilter?: string;
    valeFilter?: string;
  } = {}
) {
  if (!requests || requests.length === 0) {
    alert("Nenhum registro correspondente ao filtro aplicado para exportação.");
    return;
  }

  const data = requests.map((req) => {
    const hasVale = isRequestWithVale(req, valesList);
    const { valorTotal, hectolitros } = calculateRequestValueAndHL(req, promaxRecords);
    
    // Resolve product / SKU info
    let sku = req.item || req.produto || "";
    let desc = req.descricaoProduto || req.productDesc || "";
    let qtd = req.quantidade || 0;
    let um = (req.unidadeMedida || (req as any).um || "CX").toUpperCase();

    if (req.items && req.items.length > 0) {
      if (req.items.length === 1) {
        sku = req.items[0].item || req.items[0].itemCode || (req.items[0] as any).produto || sku;
        desc = req.items[0].descricao || desc;
        qtd = req.items[0].quantidade || qtd;
        um = (req.items[0].unidadeMedida || um).toUpperCase();
      } else {
        sku = req.items.map(it => it.item || it.itemCode || (it as any).produto).filter(Boolean).join(", ");
        desc = req.items.map(it => `${it.descricao || it.item} (${it.quantidade} ${it.unidadeMedida || "cx"})`).join(" | ");
        qtd = req.items.reduce((acc, it) => acc + (it.quantidade || 0), 0);
      }
    }

    if (!desc || desc === "N/A" || desc === "-") {
      const cleanCode = String(sku).replace(/^0+/, "");
      const prod = PRODUCT_DATABASE.find(p => p.codigo === sku || p.codigo === cleanCode);
      if (prod && prod.descricao) {
        desc = prod.descricao;
      }
    }

    const motivoLower = (req.motivo || "").toLowerCase();
    const isRep = motivoLower.includes("falta") || (req.items && req.items.some(it => (it.motivo || "").toLowerCase().includes("falta")));
    const cast = req as any;
    const isBaixada = !!cast.faltaBaixa || !!cast.contingenciaBaixada || cast.status === "baixado" || cast.status === "concluido" || req.statusPromax === "cadastrado";

    return {
      "Data": formatExcelDate(req.data || req.cadastroDate),
      "Código": sku || "-",
      "Descrição": desc || "-",
      "Quantidade": qtd,
      "Valor Total": Number(valorTotal.toFixed(2)),
      "Motorista": req.faltaMotorista || "-",
      "Ajudantes": req.faltaAjudantes || "-",
      "Código Cliente (NB)": req.nb || "-",
      "Nota Fiscal (NF)": req.nf || "-",
      "Mapa": req.mapa || "-",
      "Setor / Rota": req.setor || "-",
      "Unidade Medida (UM)": um,
      "Volume (HL)": Number(hectolitros.toFixed(4)),
      "Motivo Declarado": req.motivo || "-",
      "Tipo de Processo": isRep ? "Reposição (Falta)" : "Troca",
      "Elegível Recibo Contingência": (!req.motivo?.toLowerCase().includes("completo") && !req.motivo?.toLowerCase().includes("fechado") && req.statusPromax !== "reprovado") ? "SIM" : "NÃO",
      "Status Promax": req.statusPromax || "-",
      "Situação da Baixa": isBaixada ? "Baixada" : "Pendente",
      "Status do Vale": hasVale ? "COM VALE EMITIDO" : "SEM VALE",
      "ID Vale": req.valeId || (hasVale ? "Identificado p/ Mapa e SKU" : "-"),
      "Origem Cadastro": req.cadastroRole || req.origem || "-",
      "Usuário Cadastro": req.cadastroUser || "-",
      "ID Solicitação": req.id,
      "Observações": req.observacao || "-"
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);

  worksheet["!cols"] = [
    { wch: 14 }, // Data (1ª)
    { wch: 14 }, // Código (2ª)
    { wch: 38 }, // Descrição (3ª)
    { wch: 12 }, // Quantidade (4ª)
    { wch: 16 }, // Valor Total (5ª)
    { wch: 26 }, // Motorista
    { wch: 26 }, // Ajudantes
    { wch: 18 }, // Código Cliente (NB)
    { wch: 16 }, // Nota Fiscal (NF)
    { wch: 14 }, // Mapa
    { wch: 14 }, // Setor / Rota
    { wch: 12 }, // UM
    { wch: 14 }, // Volume HL
    { wch: 24 }, // Motivo Declarado
    { wch: 20 }, // Tipo Processo
    { wch: 22 }, // Elegível Recibo Contingência
    { wch: 16 }, // Status Promax
    { wch: 16 }, // Situação Baixa
    { wch: 20 }, // Status do Vale
    { wch: 26 }, // ID Vale
    { wch: 18 }, // Origem Cadastro
    { wch: 22 }, // Usuário Cadastro
    { wch: 26 }, // ID Solicitação
    { wch: 40 }  // Observações
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Base Filtrada SSTR");

  const startStr = filters.startDate ? filters.startDate.replace(/-/g, "") : "ini";
  const endStr = filters.endDate ? filters.endDate.replace(/-/g, "") : "fim";
  const valeSuffix = filters.valeFilter === "sem_vale" ? "_SemVale" : filters.valeFilter === "com_vale" ? "_ComVale" : "";
  const filename = `base_filtrada_sstr_${startStr}_a_${endStr}${valeSuffix}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

