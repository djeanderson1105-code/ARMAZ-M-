import * as XLSX from "xlsx";
import { ExchangeRecord, PendingRequest, calculateValeRateio, isDriverX } from "../types";
import { ValeEntry } from "../components/ValesHistoryDashboard";
import { PRODUCT_DATABASE, calculateRequestValueAndHL, calculateItemValue, calculateItemHL } from "../data/products";
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
 * Helper to resolve accurate client registration (Fantasia, Razão, Documento)
 * using local PDV catalog, historical Promax cache, and direct request metadata.
 */
function resolveClientInfo(
  nb: string | undefined,
  reqCliente?: string,
  promaxRecords: ExchangeRecord[] = []
): { codigoNb: string; nomeFantasia: string; razaoSocial: string; doc: string } {
  const pdvDb = getPdvDatabase();
  const cleanNb = String(nb || "").trim();

  let nomeFantasia = "";
  let razaoSocial = "";
  let doc = "";

  // 1. Direct match or numeric match in PDV database
  if (cleanNb) {
    if (pdvDb[cleanNb]) {
      nomeFantasia = pdvDb[cleanNb].nomeFantasia || "";
      razaoSocial = pdvDb[cleanNb].razaoSocial || "";
      doc = pdvDb[cleanNb].documento || "";
    } else {
      const nbAsNum = parseInt(cleanNb, 10);
      if (!isNaN(nbAsNum)) {
        const foundKey = Object.keys(pdvDb).find(k => parseInt(k, 10) === nbAsNum);
        if (foundKey && pdvDb[foundKey]) {
          nomeFantasia = pdvDb[foundKey].nomeFantasia || "";
          razaoSocial = pdvDb[foundKey].razaoSocial || "";
          doc = pdvDb[foundKey].documento || "";
        }
      }
    }
  }

  // 2. Historical Promax records lookup
  if (!nomeFantasia && cleanNb) {
    const matchingRecord = promaxRecords.find(r => {
      const recCd = String(r.codigoCliente || "").trim();
      if (recCd === cleanNb) return true;
      const recAsNum = parseInt(recCd, 10);
      const nbAsNum = parseInt(cleanNb, 10);
      return !isNaN(recAsNum) && !isNaN(nbAsNum) && recAsNum === nbAsNum;
    });

    if (matchingRecord && matchingRecord.nomeCliente) {
      nomeFantasia = matchingRecord.nomeCliente;
      razaoSocial = matchingRecord.nomeCliente;
      doc = (matchingRecord as any).cpfCnpj || (matchingRecord as any).documento || "";
    }
  }

  // 3. Direct informed name on request
  if (!nomeFantasia && reqCliente && reqCliente.trim()) {
    nomeFantasia = reqCliente.trim();
    razaoSocial = reqCliente.trim();
  }

  // 4. Professional fallback
  if (!nomeFantasia) {
    nomeFantasia = cleanNb ? `CLIENTE PARCEIRO (#${cleanNb})` : "CLIENTE NÃO INFORMADO";
    razaoSocial = nomeFantasia;
  }

  return {
    codigoNb: cleanNb || "-",
    nomeFantasia: nomeFantasia || "-",
    razaoSocial: razaoSocial || nomeFantasia || "-",
    doc: doc || "-"
  };
}

/**
 * Exports the filtered requests database with exact client-level breakdown,
 * itemized per product/SKU (one row per item), with unit price, total value,
 * unit of measure (UN/CX/DZ), reason (avaria/falta), date, and sector.
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
    onlyContingencia?: boolean;
  } = {}
) {
  if (!requests || requests.length === 0) {
    alert("Nenhum registro correspondente ao filtro aplicado para exportação.");
    return;
  }

  // Flatten and expand every request into item-level rows with full client context
  const itemRows: any[] = [];

  // Summary aggregation by client NB for Sheet 2
  const clientSummaryMap: Record<string, {
    codigoNb: string;
    nomeFantasia: string;
    razaoSocial: string;
    setor: string;
    solicitacoesCount: Set<string>;
    totalItens: number;
    totalQuantidade: number;
    totalValor: number;
    totalHl: number;
    comValeCount: number;
    semValeCount: number;
  }> = {};

  for (const req of requests) {
    const hasVale = isRequestWithVale(req, valesList);
    const motivoLower = (req.motivo || "").toLowerCase();
    const isRep = motivoLower.includes("falta") || (req.items && req.items.some(it => (it.motivo || "").toLowerCase().includes("falta")));
    const cast = req as any;
    const isBaixada = !!cast.faltaBaixa || !!cast.contingenciaBaixada || cast.status === "baixado" || cast.status === "concluido" || req.statusPromax === "cadastrado";
    const dataSol = formatExcelDate(req.data || req.cadastroDate);
    const setorSol = req.setor || "-";
    const nfSol = req.nf || "-";
    const mapaSol = req.mapa || "-";
    const motoristaSol = req.faltaMotorista || "-";
    const ajudantesSol = req.faltaAjudantes || "-";
    const statusPromax = req.statusPromax || "-";
    const situacaoBaixa = isBaixada ? "Baixada" : "Pendente";
    const statusVale = hasVale ? "COM VALE EMITIDO" : "SEM VALE";
    const obsSol = req.observacao || "-";

    const clientInfo = resolveClientInfo(
      req.nb,
      req.cliente || cast.nomeCliente || req.nomeRecibo,
      promaxRecords
    );

    // Initialize or get client summary record
    const clientKey = clientInfo.codigoNb !== "-" ? clientInfo.codigoNb : clientInfo.nomeFantasia;
    if (!clientSummaryMap[clientKey]) {
      clientSummaryMap[clientKey] = {
        codigoNb: clientInfo.codigoNb,
        nomeFantasia: clientInfo.nomeFantasia,
        razaoSocial: clientInfo.razaoSocial,
        setor: setorSol,
        solicitacoesCount: new Set(),
        totalItens: 0,
        totalQuantidade: 0,
        totalValor: 0,
        totalHl: 0,
        comValeCount: 0,
        semValeCount: 0
      };
    }
    clientSummaryMap[clientKey].solicitacoesCount.add(req.id);
    if (hasVale) {
      clientSummaryMap[clientKey].comValeCount++;
    } else {
      clientSummaryMap[clientKey].semValeCount++;
    }

    // Determine items inside this request card
    const rawItems = (req.items && req.items.length > 0)
      ? req.items
      : [
          {
            id: req.id,
            item: req.item || req.produto || "9999",
            itemCode: req.item || req.produto || "9999",
            descricao: req.descricaoProduto || req.productDesc || "",
            quantidade: req.quantidade || 1,
            unidadeMedida: req.unidadeMedida || cast.um || "CX",
            customUnitPrice: cast.customUnitPrice,
            precoCalculated: cast.precoCalculated,
            motivo: req.motivo
          }
        ];

    for (const item of rawItems) {
      const sku = String(item.item || item.itemCode || (item as any).codigo || (item as any).produto || req.item || req.produto || "").trim();
      let desc = item.descricao || (item as any).itemDesc || (item as any).descricaoProduto || req.descricaoProduto || req.productDesc || "";
      const qtd = Number(item.quantidade) || 0;
      let um = String(item.unidadeMedida || (item as any).um || req.unidadeMedida || cast.um || "CX").trim().toUpperCase();

      // Normalize unit of measure string (UN, CX, DZ)
      if (um === "UND" || um === "UNIDADE" || um === "UNIDADES" || um === "GFA" || um === "LATA" || um === "PET" || um === "U.M.") {
        um = "UN";
      } else if (um === "DUZIA" || um === "DUZIAS" || um === "DZ") {
        um = "DZ";
      } else if (um === "CAIXA" || um === "CAIXAS" || um === "PACK" || um === "FARDO" || um === "PCT" || um === "SH") {
        um = "CX";
      }

      // Fill in description from catalog if missing or generic
      const cleanCode = sku.replace(/^0+/, "");
      const prod = PRODUCT_DATABASE.find(p => p.codigo === sku || p.codigo === cleanCode);
      if (!desc || desc === "N/A" || desc === "-" || desc.toUpperCase().includes("PRODUTO NÃO")) {
        if (prod && prod.descricao) {
          desc = prod.descricao;
        } else {
          desc = "PRODUTO DIVERSO / NÃO IDENTIFICADO";
        }
      }

      const itemsPerBox = prod?.fator || prod?.embalagem || (item as any).fatorEmbalagem || 12;

      // 1. Calculate authoritative total financial value for this line item strictly matching calculateRequestValueAndHL
      const finalItemTotal = calculateItemValue({
        item: sku,
        quantidade: qtd,
        unidadeMedida: um,
        customUnitPrice: item.customUnitPrice || cast.customUnitPrice,
        precoCalculated: item.precoCalculated || cast.precoCalculated,
        descricao: desc,
        motivo: item.motivo || req.motivo
      });

      // 2. Calculate true unit price (Valor Unitário) based on unit of measure (UN, CX, DZ)
      let itemUnitVal = 0;
      if (qtd > 0 && finalItemTotal > 0) {
        itemUnitVal = Number((finalItemTotal / qtd).toFixed(2));
      } else if (prod && prod.valor && prod.valor > 0) {
        if (um === "UN") {
          itemUnitVal = Number((prod.valor / Math.max(1, itemsPerBox)).toFixed(2));
        } else if (um === "DZ") {
          itemUnitVal = Number(((prod.valor / Math.max(1, itemsPerBox)) * 12).toFixed(2));
        } else {
          itemUnitVal = Number(prod.valor.toFixed(2));
        }
      } else {
        itemUnitVal = um === "UN" ? Number((52.00 / itemsPerBox).toFixed(2)) : 52.00;
      }

      const itemHL = calculateItemHL({
        item: sku,
        quantidade: qtd,
        unidadeMedida: um,
        descricao: desc
      });

      const itemMotivo = item.motivo || req.motivo || "Avaria / Troca";

      // Aggregate into client summary
      clientSummaryMap[clientKey].totalItens += 1;
      clientSummaryMap[clientKey].totalQuantidade += qtd;
      clientSummaryMap[clientKey].totalValor += finalItemTotal;
      clientSummaryMap[clientKey].totalHl += itemHL;

      itemRows.push({
        _sortNb: clientInfo.codigoNb,
        _sortDate: req.data || req.cadastroDate || "",
        _sortReqId: req.id,
        "Código NB": clientInfo.codigoNb,
        "Nome Fantasia do Cliente": clientInfo.nomeFantasia,
        "Razão Social do Cliente": clientInfo.razaoSocial,
        "Cód. do Produto": sku || "-",
        "Descrição do Produto": desc,
        "Unidade de Medida (UM)": um,
        "Quantidade": qtd,
        "Valor Unitário (R$)": Number(itemUnitVal.toFixed(2)),
        "Valor Total (R$)": Number(finalItemTotal.toFixed(2)),
        "Data da Solicitação": dataSol,
        "Setor / Rota RN": setorSol,
        "Motivo (Avaria / Ocorrência)": itemMotivo,
        "Nota Fiscal (NF)": nfSol,
        "Mapa de Carga": mapaSol,
        "Motorista": motoristaSol,
        "Ajudantes / Equipe": ajudantesSol,
        "Tipo de Processo": isRep ? "Reposição (Falta)" : "Troca",
        "Status Promax": statusPromax,
        "Situação da Baixa": situacaoBaixa,
        "Status do Vale": statusVale,
        "Volume (HL)": Number(itemHL.toFixed(4)),
        "ID da Solicitação": req.id,
        "Observações": obsSol
      });
    }
  }

  // Sort rows cleanly grouped by Client NB, then by Date and Request ID
  itemRows.sort((a, b) => {
    const cleanA = String(a._sortNb).replace(/\D/g, "");
    const cleanB = String(b._sortNb).replace(/\D/g, "");
    const nbA = cleanA ? parseInt(cleanA, 10) : 999999999;
    const nbB = cleanB ? parseInt(cleanB, 10) : 999999999;

    if (nbA !== nbB) return nbA - nbB;

    // Same NB: compare by Name Fantasia
    const nameComp = String(a["Nome Fantasia do Cliente"]).localeCompare(String(b["Nome Fantasia do Cliente"]));
    if (nameComp !== 0) return nameComp;

    // Compare by Request ID
    return String(a._sortReqId).localeCompare(String(b._sortReqId));
  });

  // Remove internal sort keys before building sheet
  const exportData = itemRows.map(({ _sortNb, _sortDate, _sortReqId, ...row }) => row);

  // Build Sheet 1: Detalhamento por Cliente (Requested Table)
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  worksheet["!cols"] = [
    { wch: 16 }, // Código NB (1ª)
    { wch: 38 }, // Nome Fantasia do Cliente (2ª)
    { wch: 38 }, // Razão Social do Cliente (3ª)
    { wch: 16 }, // Cód. do Produto (4ª)
    { wch: 42 }, // Descrição do Produto (5ª)
    { wch: 14 }, // Unidade de Medida (UM) (6ª)
    { wch: 12 }, // Quantidade (7ª)
    { wch: 16 }, // Valor Unitário (R$) (8ª)
    { wch: 16 }, // Valor Total (R$) (9ª)
    { wch: 16 }, // Data da Solicitação (10ª)
    { wch: 16 }, // Setor / Rota RN (11ª)
    { wch: 28 }, // Motivo (Avaria / Ocorrência) (12ª)
    { wch: 16 }, // Nota Fiscal (NF)
    { wch: 14 }, // Mapa de Carga
    { wch: 28 }, // Motorista
    { wch: 30 }, // Ajudantes / Equipe
    { wch: 20 }, // Tipo de Processo
    { wch: 16 }, // Status Promax
    { wch: 16 }, // Situação da Baixa
    { wch: 20 }, // Status do Vale
    { wch: 14 }, // Volume (HL)
    { wch: 28 }, // ID da Solicitação
    { wch: 40 }  // Observações
  ];

  // Build Sheet 2: Resumo Analítico por Cliente
  const summaryRows = Object.values(clientSummaryMap).map(cs => ({
    "Código NB": cs.codigoNb,
    "Nome Fantasia": cs.nomeFantasia,
    "Razão Social": cs.razaoSocial,
    "Setor / Rota RN": cs.setor,
    "Total Solicitações": cs.solicitacoesCount.size,
    "Total Linhas / Itens": cs.totalItens,
    "Quantidade de Peças": cs.totalQuantidade,
    "Valor Total Acumulado (R$)": Number(cs.totalValor.toFixed(2)),
    "Volume Total Acumulado (HL)": Number(cs.totalHl.toFixed(4)),
    "Ocorrências com Vale": cs.comValeCount,
    "Ocorrências sem Vale": cs.semValeCount
  }));

  // Sort summary by NB
  summaryRows.sort((a, b) => {
    const nbA = parseInt(String(a["Código NB"]).replace(/\D/g, ""), 10) || 999999999;
    const nbB = parseInt(String(b["Código NB"]).replace(/\D/g, ""), 10) || 999999999;
    return nbA - nbB;
  });

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet["!cols"] = [
    { wch: 16 }, // Código NB
    { wch: 38 }, // Nome Fantasia
    { wch: 38 }, // Razão Social
    { wch: 16 }, // Setor / Rota RN
    { wch: 18 }, // Total Solicitações
    { wch: 18 }, // Total Linhas / Itens
    { wch: 18 }, // Quantidade de Peças
    { wch: 22 }, // Valor Total Acumulado (R$)
    { wch: 22 }, // Volume Total Acumulado (HL)
    { wch: 18 }, // Ocorrências com Vale
    { wch: 18 }  // Ocorrências sem Vale
  ];

  const workbook = XLSX.utils.book_new();
  const isContingenciaBase = filters.processTypeFilter === "troca_exceto_sku_fechado" || filters.processTypeFilter === "contingencia" || (filters as any).onlyContingencia;
  const sheet1Title = isContingenciaBase ? "Itens Contingência por Cliente" : "Detalhamento por Cliente";
  const sheet2Title = "Resumo por Cliente";

  XLSX.utils.book_append_sheet(workbook, worksheet, sheet1Title);
  XLSX.utils.book_append_sheet(workbook, summarySheet, sheet2Title);

  const startStr = filters.startDate ? filters.startDate.replace(/-/g, "") : "ini";
  const endStr = filters.endDate ? filters.endDate.replace(/-/g, "") : "fim";
  const prefix = isContingenciaBase ? "base_contingencias_clientes" : "base_solicitacoes_clientes";
  const valeSuffix = filters.valeFilter === "sem_vale" ? "_SemVale_Limpas" : filters.valeFilter === "com_vale" ? "_ComVale" : "";
  const filename = `${prefix}_${startStr}_a_${endStr}${valeSuffix}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

