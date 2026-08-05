import { ExchangeRecord, SectorAnalytics } from "../types";
import { PRODUCT_DATABASE } from "../data/products";
import { getHectoFactor, calculateHL, getRecordHL } from "./hectoFactors";

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

  // Auto-detect header line index by scoring candidate lines for Promax 03.18.05 keywords
  const promaxKeywords = [
    "solicitacao", "solic", "cliente", "produto", "quantidade", "qtd",
    "unb", "mapa", "notafiscal", "nf", "justificativa", "valor", "vlr",
    "setor", "status", "tipo", "data", "usuario", "user", "reposicao"
  ];

  let bestHeaderIndex = -1;
  let maxKeywordScore = 0;
  let chosenDelimiter = ";";

  const candidateLimit = Math.min(lines.length, 50);
  for (let i = 0; i < candidateLimit; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect delimiters on this line
    const semicolonCount = (line.match(/;/g) || []).length;
    const tabCount = (line.match(/\t/g) || []).length;
    const commaCount = (line.match(/,/g) || []).length;
    const pipeCount = (line.match(/\|/g) || []).length;

    let lineDelim = ";";
    let maxDelim = semicolonCount;
    if (tabCount > maxDelim) { lineDelim = "\t"; maxDelim = tabCount; }
    if (commaCount > maxDelim) { lineDelim = ","; maxDelim = commaCount; }
    if (pipeCount > maxDelim) { lineDelim = "|"; maxDelim = pipeCount; }

    if (maxDelim === 0) continue; // No delimiters on this line

    const normLine = normalizeHeaderName(line);
    let score = 0;
    for (const kw of promaxKeywords) {
      if (normLine.includes(kw)) score++;
    }

    if (score > maxKeywordScore) {
      maxKeywordScore = score;
      bestHeaderIndex = i;
      chosenDelimiter = lineDelim;
    }
  }

  // Fallback if no keywords found: pick first non-empty line with delimiters
  if (bestHeaderIndex === -1) {
    for (let i = 0; i < candidateLimit; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const semicolonCount = (line.match(/;/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      if (semicolonCount > 0 || tabCount > 0 || commaCount > 0) {
        bestHeaderIndex = i;
        if (tabCount > semicolonCount && tabCount > commaCount) chosenDelimiter = "\t";
        else if (commaCount > semicolonCount && commaCount > tabCount) chosenDelimiter = ",";
        else chosenDelimiter = ";";
        break;
      }
    }
  }

  if (bestHeaderIndex === -1) return [];

  const headerLineIndex = bestHeaderIndex;
  const headerLine = lines[headerLineIndex];
  const headers = headerLine.split(chosenDelimiter).map(h => h.trim());
  const normalizedHeaders = headers.map(normalizeHeaderName);

  // Find column indices based on normalized matching
  const findIndex = (keywords: string[]): number => {
    return normalizedHeaders.findIndex(h => 
      keywords.every(kw => h.includes(kw))
    );
  };

  const findAnyIndex = (keywordSets: string[][]): number => {
    for (const kwSet of keywordSets) {
      const idx = findIndex(kwSet);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Match key columns dynamically with fallback to default position indices
  const indices = {
    unb: findAnyIndex([["unb"]]),
    descricaoUnb: findAnyIndex([["descricaounb"], ["descri", "unb"], ["desc", "unb"]]),
    codigoCliente: findAnyIndex([
      ["codigocliente"], ["codigo", "cliente"], ["cod", "clie"], ["cod", "cliente"],
      ["numerobase"], ["num", "base"], ["nbase"]
    ]),
    nomeCliente: findAnyIndex([
      ["nomecliente"], ["nome", "clie"], ["nome", "cliente"], ["razaosocial"], ["razao"], ["cliente"]
    ]),
    solicitacao: findAnyIndex([
      ["solicitacaoreposicao"], ["solic", "repo"], ["solicitacao"], ["solic"], ["nrsolicitacao"], ["nrosolicitacao"]
    ]),
    tipo: findAnyIndex([["tiposolicitacao"], ["tipo", "soli"], ["tipo"]]),
    dataSolicitacao: findAnyIndex([["datasolicitacao"], ["data", "soli"], ["datasolic"], ["dt", "solic"], ["data"]]),
    hora: findAnyIndex([["hora"], ["hr"]]),
    status: findAnyIndex([["statussolicitacao"], ["status", "soli"], ["statussolic"], ["status"]]),
    dataAcao: findAnyIndex([["dataacao"], ["data", "acao"], ["dt", "acao"]]),
    usuarioAcao: findAnyIndex([["usuarioacao"], ["user", "acao"], ["usuario"], ["user"]]),
    mapa: findAnyIndex([["mapareposicao"], ["mapa", "repo"], ["mapa"]]),
    nf: findAnyIndex([["notafiscalserie"], ["nota", "serie"], ["notafiscal"], ["nf"]]),
    statusNf: findAnyIndex([["statusnf"], ["status", "nota"]]),
    produto: findAnyIndex([["codigoproduto"], ["cod", "prod"], ["produto"], ["sku"]]),
    descricaoProduto: findAnyIndex([["descricaoproduto"], ["descri", "prod"], ["desc", "prod"], ["descricao"]]),
    quantidade: findAnyIndex([["quantidade"], ["qtd"], ["quant"]]),
    um: findAnyIndex([["unidademedida"], ["unidade"], ["um"]]),
    valorUnitario: findAnyIndex([["valorunitario"], ["vlr", "unit"], ["valor", "unit"], ["vlrunit"]]),
    valorTotal: findAnyIndex([["valortotal"], ["vlr", "total"], ["valor"], ["vlr"]]),
    justificativa: findAnyIndex([["justificativa"], ["motivo"]]),
    veiculo: findAnyIndex([["veiculo"]]),
    placa: findAnyIndex([["placa"]]),
    transportadora: findAnyIndex([["transportadora"]]),
    nomeTransportadora: findAnyIndex([["nometransportadora"], ["nome", "transp"]]),
    motorista: findAnyIndex([["motorista"]]),
    nomeMotorista: findAnyIndex([["nomemotorista"], ["nome", "motor"]]),
    conferente: findAnyIndex([["conferentesolicitacaoreposicao"], ["conf", "soli"], ["conferente"]]),
    conferenteCarregamento: findAnyIndex([["conferentecarregamento"], ["conf", "carr"]]),
    nrPedidoReposicao: findAnyIndex([["nrpedidoreposicao"], ["pedi", "repo"], ["pedido"]]),
    statusCheck: findAnyIndex([["statuscheckreposicao"], ["status", "check"]]),
    sistemaOrigem: findAnyIndex([["sistemaorigem"], ["origem"]]),
    observacao: findAnyIndex([["observacao"], ["obs"], ["observacoes"]]),
    setorVenda: findAnyIndex([["setorvenda"], ["setor"]]),
  };

  // Positional fallbacks for standard 03.18.05 Promax CSV column layout if headers were non-standard
  if (indices.codigoCliente === -1) indices.codigoCliente = 2;
  if (indices.nomeCliente === -1) indices.nomeCliente = 3;
  if (indices.solicitacao === -1) indices.solicitacao = 4;
  if (indices.usuarioAcao === -1) indices.usuarioAcao = 10;

  // Specific corrections for overrides if findIndex returned same index for valor and valorUnitario
  if (indices.valorUnitario === indices.valorTotal && indices.valorTotal !== -1) {
    const unitIndex = normalizedHeaders.findIndex(h => h === "valorunitario" || h === "vlrunit");
    const totalIndex = normalizedHeaders.findIndex(h => h === "valor" || h === "vlr" || h === "valortotal");
    if (unitIndex !== -1) indices.valorUnitario = unitIndex;
    if (totalIndex !== -1) indices.valorTotal = totalIndex;
  }

  const getValSafe = (parts: string[], index: number, fallbackVal = ""): string => {
    if (index === -1 || index >= parts.length) return fallbackVal;
    return parts[index].trim();
  };

  const records: ExchangeRecord[] = [];
  const timestamp = Date.now();

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Ignore title/footer summary lines
    const normLineLower = line.toLowerCase();
    if (normLineLower.startsWith("total") || normLineLower.startsWith("soma") || normLineLower.startsWith("---")) {
      continue;
    }

    const parts = line.split(chosenDelimiter);
    if (parts.length < 3) continue; // Skip lines with too few columns

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

    const umVal = getValSafe(parts, indices.um, "Un").trim();
    const descVal = getValSafe(parts, indices.descricaoProduto, "").trim().replace(/\s+/g, ' ');
    const fatHecto = getHectoFactor(produtoVal);
    const computedHl = calculateHL(produtoVal, qty, umVal, descVal);

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
    let totalHl = 0;
    const prodSpent: { [prod: string]: { description: string; quantity: number; spent: number; hl: number } } = {};
    const clientSpent: { [client: string]: { name: string; requests: number; spent: number; hl: number } } = {};
    const justificationCounts: { [just: string]: { count: number; totalSpent: number; hl: number } } = {};

    recs.forEach(r => {
      const recHl = getRecordHL(r);
      totalSpent += r.valorTotal || 0;
      totalHl += recHl;

      // Top products spending
      if (!prodSpent[r.produto]) {
        prodSpent[r.produto] = { description: r.descricaoProduto, quantity: 0, spent: 0, hl: 0 };
      }
      prodSpent[r.produto].quantity += r.quantidade;
      prodSpent[r.produto].spent += r.valorTotal || 0;
      prodSpent[r.produto].hl += recHl;

      // Top requesting clients
      if (!clientSpent[r.codigoCliente]) {
        clientSpent[r.codigoCliente] = { name: r.nomeCliente, requests: 0, spent: 0, hl: 0 };
      }
      clientSpent[r.codigoCliente].requests += 1;
      clientSpent[r.codigoCliente].spent += r.valorTotal || 0;
      clientSpent[r.codigoCliente].hl += recHl;

      // Justifications
      const just = r.justificativa || "Não Especificado";
      if (!justificationCounts[just]) {
        justificationCounts[just] = { count: 0, totalSpent: 0, hl: 0 };
      }
      justificationCounts[just].count += 1;
      justificationCounts[just].totalSpent += r.valorTotal || 0;
      justificationCounts[just].hl += recHl;
    });

    // Top products array sorted
    const topProducts = Object.entries(prodSpent).map(([prod, d]) => ({
      produto: prod,
      descricao: d.description,
      quantity: d.quantity,
      totalSpent: Number(d.spent.toFixed(2)),
      hl: Number(d.hl.toFixed(4))
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    // Top clients array sorted
    const topClients = Object.entries(clientSpent).map(([cli, d]) => ({
      codigoCliente: cli,
      nome: d.name,
      requestCount: d.requests,
      totalSpent: Number(d.spent.toFixed(2)),
      hl: Number(d.hl.toFixed(4))
    })).sort((a, b) => b.totalSpent - a.totalSpent);

    analytics.push({
      setor: sector,
      totalSpent: Number(totalSpent.toFixed(2)),
      totalHl: Number(totalHl.toFixed(4)),
      requestCount: recs.length,
      averageSpent: recs.length > 0 ? Number((totalSpent / recs.length).toFixed(2)) : 0,
      averageHl: recs.length > 0 ? Number((totalHl / recs.length).toFixed(4)) : 0,
      topProducts: topProducts.slice(0, 10), // Top 10 items
      topClients: topClients.slice(0, 10), // Top 10 clients
      justificationCounts
    });
  });

  return analytics.sort((a, b) => b.totalSpent - a.totalSpent);
}
