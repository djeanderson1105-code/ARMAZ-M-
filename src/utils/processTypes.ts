import { ExchangeRecord, PendingRequest } from "../types";
import { calculateItemHL, calculateItemValue } from "../data/products";

/**
 * Universal helper to determine if a request has been Baixada / Finalizada / Concluída
 */
export const isRequestBaixada = (req: Partial<PendingRequest> | undefined | null): boolean => {
  if (!req) return false;
  const cast = req as any;
  if (req.faltaBaixa === true || cast.faltaBaixa === true) return true;
  if (cast.contingenciaBaixada === true) return true;
  if (req.status === "baixado" || req.status === "concluido" || cast.status === "baixado" || cast.status === "concluido") return true;
  if (req.statusPromax === "cadastrado" || cast.status === "cadastrado") return true;
  if (Boolean(cast.faltaBaixaDate || cast.faltaDataBaixa)) return true;
  if (Boolean(cast.faltaBaixaReciboUrl || cast.faltaBaixaReciboName)) return true;
  if (cast.reviewedByControle === true) return true;
  if (req.id && (req.id.startsWith("req_hist_") || req.id.startsWith("rec_"))) return true;
  return false;
};

/**
 * Checks if a PendingRequest is classified as "REPOSIÇÃO"
 */
export const isRequestReposicao = (req: Partial<PendingRequest> | undefined | null): boolean => {
  if (!req) return false;
  const cast = req as any;
  if (cast.tipoRegistro === "reposicao") return true;
  if (req.tipoRegistroFalta === true) return true;

  const m = (req.motivo || "").toLowerCase();
  const o = (req.observacao || "").toLowerCase();
  const sub = (cast.subMotivo || "").toLowerCase();

  // If explicitly Falta or Reposição
  if (m.includes("falta") || m.includes("reposi") || o.includes("falta") || o.includes("reposi") || sub.includes("falta") || sub.includes("reposi")) {
    return true;
  }

  // Items specific check
  if (req.items && req.items.length > 0) {
    const hasFaltaItem = req.items.some(it => {
      const itM = (it.motivo || "").toLowerCase();
      return itM.includes("falta") || itM.includes("reposi");
    });
    if (hasFaltaItem) return true;
  }

  return false;
};

/**
 * Checks if an ExchangeRecord is classified as "REPOSIÇÃO" (Falta de Produto / Relatório 03.18.05 / Reposição Oficial).
 */
export const isRecordReposicao = (r: Partial<ExchangeRecord> | any): boolean => {
  if (!r) return false;
  // Promax 03.18.05 is specifically the official Reposição report
  if (r.sistemaOrigem === "Promax" || (r.importBatchName && r.importBatchName.includes("03.18.05"))) {
    return true;
  }
  const j = (r.justificativa || "").toLowerCase();
  const t = (r.tipo || "").toLowerCase();
  const o = (r.observacao || "").toLowerCase();
  const orig = (r.sistemaOrigem || "").toLowerCase();
  
  return j.includes("falta") || j.includes("reposi") || 
         t.includes("falta") || t.includes("reposi") || 
         o.includes("falta") || o.includes("reposi") ||
         orig.includes("reposição") || orig.includes("reposicao");
};

/**
 * Checks if an ExchangeRecord is classified as "TROCA" (Outros Motivos / Avaria, Inversão, Vencimento, Qualidade, etc.).
 */
export const isRecordTroca = (r: Partial<ExchangeRecord> | any): boolean => {
  return !isRecordReposicao(r);
};

/**
 * Safely extracts date in DD/MM/YYYY format from a PendingRequest
 */
export function extractDateFromRequest(req: Partial<PendingRequest>): string {
  if (req.data) {
    const clean = req.data.split(" às ")[0].split(" ")[0].trim();
    if (clean.includes("/") && clean.split("/").length === 3) return clean;
  }
  if (req.cadastroDate) {
    const clean = req.cadastroDate.split(" às ")[0].split(" ")[0].trim();
    if (clean.includes("/") && clean.split("/").length === 3) return clean;
  }
  if (req.timestamp) {
    const d = new Date(req.timestamp);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = String(d.getFullYear());
      return `${day}/${month}/${year}`;
    }
  }
  const now = new Date();
  return `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

/**
 * Converts a baixada reposição request into one or more ExchangeRecord instances
 */
export function convertBaixadaRequestToRecords(req: PendingRequest): ExchangeRecord[] {
  if (!isRequestBaixada(req)) return [];
  if (!isRequestReposicao(req)) return [];

  const dateStr = extractDateFromRequest(req);
  const timeStr = req.data?.includes(" às ") ? req.data.split(" às ")[1] : "08:00";
  const solNum = req.solicitacao || (req.id ? req.id.replace(/\D/g, "").slice(-8) : String(Date.now()).slice(-8));
  const nfNum = req.nf || "000";
  const clientCode = req.nb || "CLIENTE";
  const clientName = req.cliente || (req as any).nomeCliente || clientCode;
  const sector = req.setor || "600";
  const driver = (req as any).motorista || req.faltaMotorista || "";
  const driverName = (req as any).nomeMotorista || driver || "Motorista de Distribuição";

  const results: ExchangeRecord[] = [];

  if (req.items && req.items.length > 0) {
    req.items.forEach((item, idx) => {
      const pCode = (item.item || item.itemCode || "SKU").trim();
      const pDesc = item.descricao || item.itemDesc || "Produto Reposição Plataforma";
      const qty = Number(item.quantidade) || 1;
      const um = item.unidadeMedida || req.unidadeMedida || "CX";
      
      const itemHl = item.hectolitros && item.hectolitros > 0 
        ? item.hectolitros 
        : calculateItemHL({
            item: pCode,
            quantidade: qty,
            unidadeMedida: um,
            descricao: pDesc,
            fatorHecto: item.fatorHecto,
            fatorEmbalagem: item.fatorEmbalagem,
            motivo: item.motivo || req.motivo
          });

      const itemVal = item.precoCalculated && item.precoCalculated > 0
        ? item.precoCalculated
        : calculateItemValue({
            item: pCode,
            quantidade: qty,
            unidadeMedida: um,
            descricao: pDesc,
            fatorEmbalagem: item.fatorEmbalagem,
            customUnitPrice: item.customUnitPrice,
            precoCalculated: item.precoCalculated,
            motivo: item.motivo || req.motivo
          });

      results.push({
        id: `baixada_req_${req.id}_${pCode}_${idx}`,
        unb: "5",
        descricaoUnb: "PAU BRASIL GUARABIRA",
        codigoCliente: clientCode,
        nomeCliente: clientName,
        solicitacao: solNum,
        tipo: "Reposição Plataforma (Baixada)",
        dataSolicitacao: dateStr,
        hora: timeStr,
        status: "Aprovada",
        dataAcao: req.faltaBaixaDate || req.faltaDataBaixa || dateStr,
        usuarioAcao: req.faltaBaixaUser || req.faltaUsuarioBaixa || req.cadastroUser || "Controle Promax",
        mapa: req.mapa || "",
        nf: nfNum,
        statusNf: "Baixada",
        produto: pCode,
        descricaoProduto: pDesc,
        quantidade: qty,
        um: um,
        valorUnitario: qty > 0 ? itemVal / qty : itemVal,
        valorTotal: itemVal,
        justificativa: item.motivo || req.motivo || "Falta de Produto / Reposição",
        fatorHecto: item.fatorHecto || 0,
        hectolitros: itemHl,
        veiculo: "CAMINHÃO M-DISTRIBUIÇÃO",
        placa: req.placaVeiculo || "SSTR-0200",
        transportadora: "1",
        nomeTransportadora: "DISTRIBUIDORA DE BEBIDAS",
        motorista: driver,
        nomeMotorista: driverName,
        conferente: req.faltaConferente || "SSTR-CONFERE",
        conferenteCarregamento: "",
        nrPedidoReposicao: (req as any).nrPedidoReposicao || ("100" + nfNum),
        statusCheck: "Com Venda",
        sistemaOrigem: "Plataforma SSTR (Baixada)",
        observacao: `Reposição baixada via plataforma - NF: ${nfNum}`,
        setorVenda: sector,
        importTimestamp: req.timestamp || Date.now(),
        importBatchName: "Reposições Baixadas (Plataforma SSTR)"
      });
    });
  } else {
    const pCode = (req.item || req.produto || "SKU").trim();
    const pDesc = req.descricaoProduto || req.productDesc || "Produto Reposição Plataforma";
    const qty = Number(req.quantidade) || 1;
    const um = req.unidadeMedida || req.um || "CX";

    const itemHl = req.hectolitros && req.hectolitros > 0
      ? req.hectolitros
      : calculateItemHL({
          item: pCode,
          quantidade: qty,
          unidadeMedida: um,
          descricao: pDesc,
          fatorHecto: req.fatorHecto,
          fatorEmbalagem: req.fatorEmbalagem,
          motivo: req.motivo
        });

    const itemVal = req.valorTotal && req.valorTotal > 0
      ? req.valorTotal
      : calculateItemValue({
          item: pCode,
          quantidade: qty,
          unidadeMedida: um,
          descricao: pDesc,
          fatorEmbalagem: req.fatorEmbalagem,
          customUnitPrice: req.customUnitPrice,
          precoCalculated: req.valorTotal,
          motivo: req.motivo
        });

    results.push({
      id: `baixada_req_${req.id}_${pCode}`,
      unb: "5",
      descricaoUnb: "PAU BRASIL GUARABIRA",
      codigoCliente: clientCode,
      nomeCliente: clientName,
      solicitacao: solNum,
      tipo: "Reposição Plataforma (Baixada)",
      dataSolicitacao: dateStr,
      hora: timeStr,
      status: "Aprovada",
      dataAcao: req.faltaBaixaDate || req.faltaDataBaixa || dateStr,
      usuarioAcao: req.faltaBaixaUser || req.faltaUsuarioBaixa || req.cadastroUser || "Controle Promax",
      mapa: req.mapa || "",
      nf: nfNum,
      statusNf: "Baixada",
      produto: pCode,
      descricaoProduto: pDesc,
      quantidade: qty,
      um: um,
      valorUnitario: qty > 0 ? itemVal / qty : itemVal,
      valorTotal: itemVal,
      justificativa: req.motivo || "Falta de Produto / Reposição",
      fatorHecto: req.fatorHecto || 0,
      hectolitros: itemHl,
      veiculo: "CAMINHÃO M-DISTRIBUIÇÃO",
      placa: req.placaVeiculo || "SSTR-0200",
      transportadora: "1",
      nomeTransportadora: "DISTRIBUIDORA DE BEBIDAS",
      motorista: driver,
      nomeMotorista: driverName,
      conferente: req.faltaConferente || "SSTR-CONFERE",
      conferenteCarregamento: "",
      nrPedidoReposicao: (req as any).nrPedidoReposicao || ("100" + nfNum),
      statusCheck: "Com Venda",
      sistemaOrigem: "Plataforma SSTR (Baixada)",
      observacao: `Reposição baixada via plataforma - NF: ${nfNum}`,
      setorVenda: sector,
      importTimestamp: req.timestamp || Date.now(),
      importBatchName: "Reposições Baixadas (Plataforma SSTR)"
    });
  }

  return results;
}

/**
 * Combines 03.18.05 Promax records with all platform-sent reposições that were BAIXADAS
 */
export function getUnifiedOfficialRecords(
  promaxRecords: ExchangeRecord[],
  pendingRequests: PendingRequest[] = []
): ExchangeRecord[] {
  const map = new Map<string, ExchangeRecord>();

  // 1. Add all Promax imported records (03.18.05)
  (promaxRecords || []).forEach(r => {
    const key = r.id || `${r.solicitacao}_${r.produto}_${r.dataSolicitacao}`;
    map.set(key, r);
  });

  // 2. Add platform requests that are REPOSIÇÃO and WERE BAIXADAS
  (pendingRequests || []).forEach(req => {
    if (!isRequestBaixada(req)) return;
    if (!isRequestReposicao(req)) return;

    const convertedRecords = convertBaixadaRequestToRecords(req);
    convertedRecords.forEach(cr => {
      const key = cr.id;
      if (!map.has(key)) {
        map.set(key, cr);
      }
    });
  });

  return Array.from(map.values());
}

