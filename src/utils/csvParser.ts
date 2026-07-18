import { ExchangeRecord, SectorAnalytics } from "../types";
import { PRODUCT_DATABASE } from "../data/products";

// Helper to normalize strings for comparison (removes accents, converts to lowercase)
function normalizeHeaderName(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Removes accents
    .replace(/[^a-z0-9]/g, "") // Removes special characters and spaces
    .trim();
}

// Convert Brazilian float string formatted like '   4,37' or '4.37' to number safely
function parseBrazilianFloat(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function parseCSVToRecords(csvText: string, batchName: string = "Manual"): ExchangeRecord[] {
  if (!csvText) return [];

  // Split lines, handling both CRLF and LF
  const lines = csvText.split(/\r?\n/);
  if (lines.length < 2) return [];

  // First non-empty line is header
  let headerLineIndex = 0;
  while (headerLineIndex < lines.length && !lines[headerLineIndex].trim()) {
    headerLineIndex++;
  }

  if (headerLineIndex >= lines.length) return [];

  const headerLine = lines[headerLineIndex];
  const headers = headerLine.split(";").map(h => h.trim());
  const normalizedHeaders = headers.map(normalizeHeaderName);

  // Find column indices based on normalized matching
  const findIndex = (keywords: string[]): number => {
    return normalizedHeaders.findIndex(h => 
      keywords.every(kw => h.includes(kw))
    );
  };

  // Match key columns dynamically
  const indices = {
    unb: findIndex(["unb"]) !== -1 ? findIndex(["unb"]) : 0,
    descricaoUnb: findIndex(["descricaounb"]) !== -1 ? findIndex(["descricaounb"]) : (findIndex(["descri", "unb"]) !== -1 ? findIndex(["descri", "unb"]) : 1),
    codigoCliente: findIndex(["codigocliente"]) !== -1 ? findIndex(["codigocliente"]) : (
      findIndex(["codigo", "cliente"]) !== -1 ? findIndex(["codigo", "cliente"]) : (
        findIndex(["cod", "clie"]) !== -1 ? findIndex(["cod", "clie"]) : (
          normalizedHeaders.findIndex(h => h.includes("nb") && !h.includes("unb")) !== -1 ? normalizedHeaders.findIndex(h => h.includes("nb") && !h.includes("unb")) : (
            findIndex(["numerobase"]) !== -1 ? findIndex(["numerobase"]) : (
              findIndex(["num", "base"]) !== -1 ? findIndex(["num", "base"]) : 2 // Fallback to Column C (index 2)
            )
          )
        )
      )
    ),
    nomeCliente: findIndex(["nomecliente"]) !== -1 ? findIndex(["nomecliente"]) : (
      findIndex(["nome", "clie"]) !== -1 ? findIndex(["nome", "clie"]) : (
        findIndex(["nome", "cliente"]) !== -1 ? findIndex(["nome", "cliente"]) : (
          findIndex(["cliente"]) !== -1 ? findIndex(["cliente"]) : 3 // Fallback to Column D (index 3)
        )
      )
    ),
    solicitacao: findIndex(["solicitacaoreposicao"]) !== -1 ? findIndex(["solicitacaoreposicao"]) : (findIndex(["solic", "repo"]) !== -1 ? findIndex(["solic", "repo"]) : (findIndex(["solicitacao"]) !== -1 ? findIndex(["solicitacao"]) : 4)),
    tipo: findIndex(["tiposolicitacao"]) !== -1 ? findIndex(["tiposolicitacao"]) : findIndex(["tipo", "soli"]),
    dataSolicitacao: findIndex(["datasolicitacao"]) !== -1 ? findIndex(["datasolicitacao"]) : findIndex(["data", "soli"]),
    hora: findIndex(["hora"]),
    status: findIndex(["statussolicitacao"]) !== -1 ? findIndex(["statussolicitacao"]) : findIndex(["status", "soli"]),
    dataAcao: findIndex(["dataacao"]) !== -1 ? findIndex(["dataacao"]) : findIndex(["data", "acao"]),
    usuarioAcao: findIndex(["usuarioacao"]) !== -1 ? findIndex(["usuarioacao"]) : findIndex(["user", "acao"]),
    mapa: findIndex(["mapareposicao"]) !== -1 ? findIndex(["mapareposicao"]) : findIndex(["mapa"]),
    nf: findIndex(["notafiscalserie"]) !== -1 ? findIndex(["notafiscalserie"]) : findIndex(["nota", "serie"]),
    statusNf: findIndex(["statusnf"]),
    produto: findIndex(["produto"]),
    descricaoProduto: findIndex(["descricaoproduto"]) !== -1 ? findIndex(["descricaoproduto"]) : findIndex(["descri", "prod"]),
    quantidade: findIndex(["quantidade"]),
    um: findIndex(["um"]),
    valorUnitario: findIndex(["valorunitario"]) !== -1 ? findIndex(["valorunitario"]) : findIndex(["valor", "unit"]),
    valorTotal: findIndex(["valor"]), // wait, valor is sometimes general; let's find exact matches
    justificativa: findIndex(["justificativa"]),
    veiculo: findIndex(["veiculo"]),
    placa: findIndex(["placa"]),
    transportadora: findIndex(["transportadora"]),
    nomeTransportadora: findIndex(["nometransportadora"]),
    motorista: findIndex(["motorista"]),
    nomeMotorista: findIndex(["nomemotorista"]),
    conferente: findIndex(["conferentesolicitacaoreposicao"]) !== -1 ? findIndex(["conferentesolicitacaoreposicao"]) : findIndex(["conf", "soli"]),
    conferenteCarregamento: findIndex(["conferentecarregamento"]) !== -1 ? findIndex(["conferentecarregamento"]) : findIndex(["conf", "carr"]),
    nrPedidoReposicao: findIndex(["nrpedidoreposicao"]) !== -1 ? findIndex(["nrpedidoreposicao"]) : findIndex(["pedi", "repo"]),
    statusCheck: findIndex(["statuscheckreposicao"]) !== -1 ? findIndex(["statuscheckreposicao"]) : findIndex(["status", "check"]),
    sistemaOrigem: findIndex(["sistemaorigem"]),
    observacao: findIndex(["observacao"]) !== -1 ? findIndex(["observacao"]) : findIndex(["obs"]),
    setorVenda: findIndex(["setorvenda"]) !== -1 ? findIndex(["setorvenda"]) : findIndex(["setor"]),
  };

  // Specific corrections for overrides if findIndex returned same index for valor and valorUnitario
  if (indices.valorUnitario === indices.valorTotal && indices.valorTotal !== -1) {
    // Re-evaluate: usually 'valorunitario' is column 18 and 'valor' (total) is 19
    const unitIndex = normalizedHeaders.findIndex(h => h === "valorunitario" || h === "vlrunit");
    const totalIndex = normalizedHeaders.findIndex(h => h === "valor" || h === "vlr");
    if (unitIndex !== -1) indices.valorUnitario = unitIndex;
    if (totalIndex !== -1) indices.valorTotal = totalIndex;
  }

  // Fallbacks based on static indices from the sample
  const getValSafe = (parts: string[], index: number, fallbackVal = ""): string => {
    if (index === -1 || index >= parts.length) return fallbackVal;
    return parts[index].trim();
  };

  const records: ExchangeRecord[] = [];
  const timestamp = Date.now();

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(";");
    if (parts.length < 5) continue; // Skip lines with too few columns

    // Parse unique exchange key or fallback
    const solicitacaoVal = getValSafe(parts, indices.solicitacao, String(i));
    const produtoVal = getValSafe(parts, indices.produto, "");
    
    // Generate clean ID
    const uniqueId = `rec_${solicitacaoVal}_${produtoVal}_${i}`;

    const qty = parseBrazilianFloat(getValSafe(parts, indices.quantidade, "0"));
    const unitPrice = parseBrazilianFloat(getValSafe(parts, indices.valorUnitario, "0"));
    let totalPrice = parseBrazilianFloat(getValSafe(parts, indices.valorTotal, "0"));

    // If total price is parsed as 0 but we have qty and unitPrice, calculate it
    if (totalPrice === 0 && qty > 0 && unitPrice > 0) {
      totalPrice = Number((qty * unitPrice).toFixed(2));
    }

    // Clean client code (remove spaces)
    let clientCode = getValSafe(parts, indices.codigoCliente, "").replace(/\s/g, "");
    if (!clientCode) {
      clientCode = "S/C"; // Sem Código
    }

    // Clean sector code (remove spaces, e.g. "604" instead of "  604  ")
    let sector = getValSafe(parts, indices.setorVenda, "").replace(/\s/g, "");
    if (!sector) {
      sector = "Sem Setor";
    }

    const matchedProduct = PRODUCT_DATABASE.find(p => p.codigo === produtoVal.trim());
    const fatHecto = matchedProduct ? matchedProduct.fatorHecto : 0;
    const computedHl = matchedProduct ? Number((qty * fatHecto).toFixed(4)) : 0;

    const record: ExchangeRecord = {
      id: uniqueId,
      unb: getValSafe(parts, indices.unb, "").trim(),
      descricaoUnb: getValSafe(parts, indices.descricaoUnb, "PAU BRASIL GUARABIRA").trim(),
      codigoCliente: clientCode,
      nomeCliente: getValSafe(parts, indices.nomeCliente, "Consumidor Desconhecido").trim().replace(/\s+/g, ' '),
      solicitacao: solicitacaoVal,
      tipo: getValSafe(parts, indices.tipo, "Externa").trim(),
      dataSolicitacao: getValSafe(parts, indices.dataSolicitacao, "").trim(),
      hora: getValSafe(parts, indices.hora, "").trim(),
      status: getValSafe(parts, indices.status, "Pendente").trim() || "Pendente",
      dataAcao: getValSafe(parts, indices.dataAcao, "").trim(),
      usuarioAcao: getValSafe(parts, indices.usuarioAcao, "").trim(),
      mapa: getValSafe(parts, indices.mapa, "").trim(),
      nf: getValSafe(parts, indices.nf, "").trim(),
      statusNf: getValSafe(parts, indices.statusNf, "").trim(),
      produto: produtoVal,
      descricaoProduto: getValSafe(parts, indices.descricaoProduto, "Produto Sem Descrição").trim().replace(/\s+/g, ' '),
      quantidade: qty,
      um: getValSafe(parts, indices.um, "Un").trim(),
      valorUnitario: unitPrice,
      valorTotal: totalPrice,
      justificativa: getValSafe(parts, indices.justificativa, "Produto Avariado").trim() || "Produto Avariado",
      fatorHecto: fatHecto,
      hectolitros: computedHl,
      
      veiculo: getValSafe(parts, indices.veiculo, "").trim(),
      placa: getValSafe(parts, indices.placa, "").trim(),
      transportadora: getValSafe(parts, indices.transportadora, "").trim(),
      nomeTransportadora: getValSafe(parts, indices.nomeTransportadora, "").trim(),
      motorista: getValSafe(parts, indices.motorista, "").trim(),
      nomeMotorista: getValSafe(parts, indices.nomeMotorista, "").trim().replace(/\s+/g, ' '),
      conferente: getValSafe(parts, indices.conferente, "").trim(),
      conferenteCarregamento: getValSafe(parts, indices.conferenteCarregamento, "").trim(),
      
      nrPedidoReposicao: getValSafe(parts, indices.nrPedidoReposicao, "").trim(),
      statusCheck: getValSafe(parts, indices.statusCheck, "").trim(),
      sistemaOrigem: getValSafe(parts, indices.sistemaOrigem, "").trim(),
      observacao: getValSafe(parts, indices.observacao, "").trim(),
      setorVenda: sector,
      
      importTimestamp: timestamp,
      importBatchName: batchName
    };

    records.push(record);
  }

  return records;
}

export function parseSectorAnalytics(records: ExchangeRecord[]): SectorAnalytics[] {
  const sectorsMap: { [sector: string]: ExchangeRecord[] } = {};
  
  records.forEach(rec => {
    const s = rec.setorVenda;
    if (!sectorsMap[s]) {
      sectorsMap[s] = [];
    }
    sectorsMap[s].push(rec);
  });

  const analytics: SectorAnalytics[] = [];

  Object.entries(sectorsMap).forEach(([sector, recs]) => {
    let totalSpent = 0;
    const prodSpent: { [prod: string]: { description: string; quantity: number; spent: number } } = {};
    const clientSpent: { [client: string]: { name: string; requests: number; spent: number } } = {};
    const justificationCounts: { [just: string]: { count: number; totalSpent: number } } = {};

    recs.forEach(r => {
      totalSpent += r.valorTotal;

      // Top products spending
      if (!prodSpent[r.produto]) {
        prodSpent[r.produto] = { description: r.descricaoProduto, quantity: 0, spent: 0 };
      }
      prodSpent[r.produto].quantity += r.quantidade;
      prodSpent[r.produto].spent += r.valorTotal;

      // Top requesting clients
      if (!clientSpent[r.codigoCliente]) {
        clientSpent[r.codigoCliente] = { name: r.nomeCliente, requests: 0, spent: 0 };
      }
      clientSpent[r.codigoCliente].requests += 1;
      clientSpent[r.codigoCliente].spent += r.valorTotal;

      // Justifications
      const just = r.justificativa || "Não Especificado";
      if (!justificationCounts[just]) {
        justificationCounts[just] = { count: 0, totalSpent: 0 };
      }
      justificationCounts[just].count += 1;
      justificationCounts[just].totalSpent += r.valorTotal;
    });

    // Top products array sorted
    const topProducts = Object.entries(prodSpent).map(([prod, d]) => ({
      produto: prod,
      descricao: d.description,
      quantity: d.quantity,
      totalSpent: Number(d.spent.toFixed(2))
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    // Top clients array sorted
    const topClients = Object.entries(clientSpent).map(([cli, d]) => ({
      codigoCliente: cli,
      nome: d.name,
      requestCount: d.requests,
      totalSpent: Number(d.spent.toFixed(2))
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    analytics.push({
      setor: sector,
      totalSpent: Number(totalSpent.toFixed(2)),
      requestCount: recs.length,
      averageSpent: recs.length > 0 ? Number((totalSpent / recs.length).toFixed(2)) : 0,
      topProducts: topProducts.slice(0, 10), // Top 10 items
      topClients: topClients.slice(0, 10), // Top 10 clients
      justificationCounts
    });
  });

  return analytics.sort((a, b) => b.totalSpent - a.totalSpent);
}
