import { PendingRequest, RequestItem } from "../types";
import { ValeEntry } from "../components/ValesHistoryDashboard";
import { getProductDescription, getProductCatalogInfo, getProductBoxPrice } from "./products";

export interface ShortageHistoricalItem {
  month: number; // 1 to 12
  day: number;
  tipo: "carregamento" | "entrega";
  motivo: string;
  subMotivo: string;
  produtoCodigo: string;
  produtoDescricao: string;
  quantidade: number;
  valorUnitario: number;
  fatorHecto: number;
  fatorEmbalagem: number;
  motorista: string;
  motoristaCpf: string;
  rota: string;
  mapa: string;
  nf: string;
  clienteNb: string;
  clienteNome: string;
  ajudante1?: string;
  ajudante1Cpf?: string;
  ajudante2?: string;
  ajudante2Cpf?: string;
  turno: "Diurno (Turno 1)" | "Noturno (Turno 2)";
  horario: string;
  observacao: string;
}

/**
 * Historical 2026 Shortage Events (Pau Brasil Logística & Distribuição)
 * Total impact: R$ 8.750,00
 * - Erro de Carregamento (Armazém / Expedição CD): R$ 7.965,00 (91.03%)
 * - Erro de Descarregamento (Rota / Entrega / Vales): R$ 785,00 (8.97%)
 */
const RAW_SHORTAGE_EVENTS_2026: ShortageHistoricalItem[] = [
  // JANEIRO 2026 (Carregamento: R$ 655,50 | Descarregamento: R$ 67,00)
  {
    month: 1, day: 8, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete da Doca",
    produtoCodigo: "9068", produtoDescricao: "SKOL LATA 350ML SH C/12 NPAL",
    quantidade: 20, valorUnitario: 28.50, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "EDENILSON DE SOUSA SILVA", motoristaCpf: "104.695.814-33", rota: "R101",
    mapa: "M1042", nf: "248527", clienteNb: "CLI2014", clienteNome: "MERCADINHO BOM PREÇO",
    turno: "Diurno (Turno 1)", horario: "06:40",
    observacao: "Falta de 20 caixas na pré-expedição da doca 03 do CD Pau Brasil. Ajuste físico interno realizado sem geração de vale."
  },
  {
    month: 1, day: 14, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Não Localizado no Descarregamento do PDV",
    produtoCodigo: "9068", produtoDescricao: "SKOL LATA 350ML SH C/12 NPAL",
    quantidade: 2, valorUnitario: 33.50, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "DANILLO PEREIRA DOS SANTOS SILVA", motoristaCpf: "713.650.714-64", rota: "R111",
    mapa: "M1055", nf: "252161", clienteNb: "CLI3012", clienteNome: "BAR DA PRAIA BAIAL",
    ajudante1: "GEOVANE ARAUJO DA SILVA", ajudante1Cpf: "099.123.694-75",
    turno: "Diurno (Turno 1)", horario: "11:30",
    observacao: "Falta de 2 cx no PDV (R$ 67,00). Vale emitido com rateio de 50% entre motorista e ajudante."
  },
  {
    month: 1, day: 22, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete da Doca",
    produtoCodigo: "2349", produtoDescricao: "GUARANA CHP ANTARCTICA PET 2L CAIXA C/6",
    quantidade: 3, valorUnitario: 28.50, fatorHecto: 0.12, fatorEmbalagem: 6,
    motorista: "JEFFERSON JONES PAULINO COSTA", motoristaCpf: "084.721.434-19", rota: "R108",
    mapa: "M1089", nf: "252161", clienteNb: "CLI2028", clienteNome: "PADARIA SAO PEDRO",
    turno: "Diurno (Turno 1)", horario: "07:15",
    observacao: "Divergência de 3 cx na conferência de saída do armazém. Baixa regularizada internamente."
  },

  // FEVEREIRO 2026 (Carregamento: R$ 655,00 | Descarregamento: R$ 57,00)
  {
    month: 2, day: 5, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "21020", produtoDescricao: "BUDWEISER LT SLEEK 350ML CX CART C 12",
    quantidade: 18, valorUnitario: 32.00, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "EDENILSON DE SOUSA SILVA", motoristaCpf: "104.695.814-33", rota: "R101",
    mapa: "M2008", nf: "253210", clienteNb: "CLI2035", clienteNome: "DEPOSITO CENTRAL GUARABIRA",
    turno: "Diurno (Turno 1)", horario: "06:30",
    observacao: "Ajuste de 18 cx no palete de expedição CD Pau Brasil. Sem vale."
  },
  {
    month: 2, day: 11, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Divergência na Conferência do PDV",
    produtoCodigo: "2349", produtoDescricao: "GUARANA CHP ANTARCTICA PET 2L CAIXA C/6",
    quantidade: 2, valorUnitario: 28.50, fatorHecto: 0.12, fatorEmbalagem: 6,
    motorista: "JOSE HONORIO DA SILVA", motoristaCpf: "062.819.344-90", rota: "R105",
    mapa: "M2012", nf: "253750", clienteNb: "CLI2050", clienteNome: "SUPERMERCADO REAL",
    ajudante1: "JDALISON IZAIAS DA SILVA", ajudante1Cpf: "112.784.394-55",
    turno: "Diurno (Turno 1)", horario: "10:45",
    observacao: "Falta de 2 cx no PDV (R$ 57,00). Vale emitido e assinado pela equipe da rota."
  },
  {
    month: 2, day: 19, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Inversão de Carga na Doca de Expedição",
    produtoCodigo: "13205", produtoDescricao: "SKOL GFA VD 300ML CX C/23",
    quantidade: 2, valorUnitario: 39.50, fatorHecto: 0.069, fatorEmbalagem: 23,
    motorista: "GILMAR DOS SANTOS FERNANDES", motoristaCpf: "058.142.584-70", rota: "R114",
    mapa: "M2060", nf: "254100", clienteNb: "CLI2065", clienteNome: "BAR DO LULA",
    turno: "Noturno (Turno 2)", horario: "21:10",
    observacao: "Inversão identificada e corrigida na doca de carregamento."
  },

  // MARÇO 2026 (Carregamento: R$ 668,00 | Descarregamento: R$ 61,00)
  {
    month: 3, day: 5, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "2546", produtoDescricao: "ORIGINAL 600ML",
    quantidade: 10, valorUnitario: 61.00, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "ADELSON SANTOS DE ARAUJO", motoristaCpf: "101.598.524-63", rota: "R113",
    mapa: "M3010", nf: "255010", clienteNb: "CLI2080", clienteNome: "DEPOSITO CENTRAL",
    turno: "Diurno (Turno 1)", horario: "07:00",
    observacao: "Falta de 10 caixas na montagem do palete no CD. Ajustado sem vale."
  },
  {
    month: 3, day: 12, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Mercadoria Não Entregue no PDV",
    produtoCodigo: "2546", produtoDescricao: "ORIGINAL 600ML",
    quantidade: 1, valorUnitario: 61.00, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "EDENILSON DE SOUSA SILVA", motoristaCpf: "104.695.814-33", rota: "R101",
    mapa: "M3035", nf: "255136", clienteNb: "CLI3110", clienteNome: "BAR E PETISCARIA DO ZE",
    ajudante1: "FELIPE GOMES DA SILVA", ajudante1Cpf: "700.552.584-17",
    turno: "Diurno (Turno 1)", horario: "13:40",
    observacao: "Falta de 1 cx no PDV (R$ 61,00). Vale emitido e assinado pela equipe da rota."
  },
  {
    month: 3, day: 26, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "9067", produtoDescricao: "ANTARCTICA PILSEN LATA 350ML SH C/12 NPAL",
    quantidade: 2, valorUnitario: 29.00, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "VALDKLEBER DE SOUZA ALEXANDRE", motoristaCpf: "058.129.184-06", rota: "R110",
    mapa: "M3070", nf: "255450", clienteNb: "CLI2095", clienteNome: "MERCADINHO SAO JOSE",
    turno: "Diurno (Turno 1)", horario: "06:50",
    observacao: "Regularizado no estoque do armazém."
  },

  // ABRIL 2026 (Carregamento: R$ 657,00 | Descarregamento: R$ 90,50)
  {
    month: 4, day: 9, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "33820", produtoDescricao: "BRAHMA CHOPP LT 350ML SH C/12 NP MULTIPK",
    quantidade: 18, valorUnitario: 35.00, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "EWERTON RODRIGUES DA SILVA", motoristaCpf: "116.515.224-05", rota: "R112",
    mapa: "M4020", nf: "256110", clienteNb: "CLI2115", clienteNome: "MERCADO GUAPO",
    turno: "Diurno (Turno 1)", horario: "06:40",
    observacao: "Falta de 18 cx no carregamento da doca. Regularizado sem cobrança aos condutores."
  },
  {
    month: 4, day: 16, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Não Localizado no Descarregamento do PDV",
    produtoCodigo: "17808", produtoDescricao: "BUDWEISER OW 330ML CX C/24",
    quantidade: 1, valorUnitario: 90.50, fatorHecto: 0.0792, fatorEmbalagem: 24,
    motorista: "GILMAR DOS SANTOS FERNANDES", motoristaCpf: "058.142.584-70", rota: "R114",
    mapa: "M4045", nf: "256680", clienteNb: "CLI3155", clienteNome: "CHURRASCARIA BRASIL",
    ajudante1: "VALTEIR BATISTA DE OLIVEIRA", ajudante1Cpf: "103.582.914-40",
    turno: "Diurno (Turno 1)", horario: "12:50",
    observacao: "Falta de 1 cx no PDV (R$ 90,50). Vale emitido e compensado."
  },
  {
    month: 4, day: 28, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "2350", produtoDescricao: "SODA LIMONADA ANTARCTICA PET 2L CAIXA C/6",
    quantidade: 1, valorUnitario: 27.00, fatorHecto: 0.12, fatorEmbalagem: 6,
    motorista: "JOSENILSON INACIO DE ANDRADE", motoristaCpf: "095.612.484-77", rota: "R107",
    mapa: "M4090", nf: "256880", clienteNb: "CLI3180", clienteNome: "BEBIDAS & CIA",
    turno: "Diurno (Turno 1)", horario: "07:10",
    observacao: "Ajuste interno na expedição."
  },

  // MAIO 2026 (Carregamento: R$ 677,50 | Descarregamento: R$ 52,00)
  {
    month: 5, day: 6, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "17808", produtoDescricao: "BUDWEISER OW 330ML CX C/24",
    quantidade: 7, valorUnitario: 90.50, fatorHecto: 0.0792, fatorEmbalagem: 24,
    motorista: "VALDKLEBER DE SOUZA ALEXANDRE", motoristaCpf: "058.129.184-06", rota: "R110",
    mapa: "M5015", nf: "257050", clienteNb: "CLI2140", clienteNome: "SUPERMERCADO GUARABIRA",
    turno: "Diurno (Turno 1)", horario: "07:15",
    observacao: "Falta de 7 caixas constatada na conferência de expedição no CD Pau Brasil. Sem vale."
  },
  {
    month: 5, day: 12, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Mercadoria Não Localizada na Descarga",
    produtoCodigo: "988", produtoDescricao: "BRAHMA CHOPP 600ML",
    quantidade: 1, valorUnitario: 52.00, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "X", motoristaCpf: "000.000.000-00", rota: "X",
    mapa: "M5032", nf: "257420", clienteNb: "CLI3205", clienteNome: "DISTRIBUIDORA SAPE",
    ajudante1: "WALLISON PONTES DA SILVA", ajudante1Cpf: "180.471.404-69",
    ajudante2: "ROMARIO RODRIGUES DA SILVA", ajudante2Cpf: "125.316.744-38",
    turno: "Diurno (Turno 1)", horario: "14:10",
    observacao: "Regra do Motorista X aplicada: Motorista isento. Vale de R$ 52,00 rateado 50% entre os dois ajudantes."
  },
  {
    month: 5, day: 26, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "9084", produtoDescricao: "GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL",
    quantidade: 2, valorUnitario: 22.00, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "EWERTON RODRIGUES DA SILVA", motoristaCpf: "116.515.224-05", rota: "R112",
    mapa: "M5080", nf: "258110", clienteNb: "CLI3230", clienteNome: "PADARIA CENTRAL",
    turno: "Diurno (Turno 1)", horario: "06:45",
    observacao: "Ajuste na separação do CD."
  },

  // JUNHO 2026 (Carregamento: R$ 662,00 | Descarregamento: R$ 60,50)
  {
    month: 6, day: 10, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "23186", produtoDescricao: "SPATEN N 600ML",
    quantidade: 10, valorUnitario: 60.50, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "ADELSON SANTOS DE ARAUJO", motoristaCpf: "101.598.524-63", rota: "R113",
    mapa: "M6025", nf: "258410", clienteNb: "CLI2185", clienteNome: "MERCADINHO MAMANGUAPE",
    turno: "Diurno (Turno 1)", horario: "06:50",
    observacao: "Falta de 10 caixas no carregamento do caminhão no armazém. Sem vale aos motoristas."
  },
  {
    month: 6, day: 17, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Divergência de Contagem no Cliente",
    produtoCodigo: "23186", produtoDescricao: "SPATEN N 600ML",
    quantidade: 1, valorUnitario: 60.50, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "ADELSON SANTOS DE ARAUJO", motoristaCpf: "101.598.524-63", rota: "R113",
    mapa: "M6050", nf: "258590", clienteNb: "CLI3260", clienteNome: "RESTAURANTE MAR AZUL",
    ajudante1: "GEOVANE ARAUJO DA SILVA", ajudante1Cpf: "099.123.694-75",
    turno: "Diurno (Turno 1)", horario: "13:20",
    observacao: "Falta de 1 cx no PDV (R$ 60,50). Vale emitido e assinado."
  },
  {
    month: 6, day: 24, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "9069", produtoDescricao: "BRAHMA CHOPP LATA 350ML SH C/12 NPAL",
    quantidade: 2, valorUnitario: 28.50, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "EDENILSON DE SOUSA SILVA", motoristaCpf: "104.695.814-33", rota: "R101",
    mapa: "M6080", nf: "258620", clienteNb: "CLI3285", clienteNome: "BAR DA CURVA",
    turno: "Diurno (Turno 1)", horario: "07:00",
    observacao: "Regularizado internamente na doca."
  },

  // JULHO 2026 (Carregamento: R$ 675,00 | Descarregamento: R$ 75,00)
  {
    month: 7, day: 8, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "28164", produtoDescricao: "BRAHMA DUPLO MALTE LT 350ML SH C/12 NPAL",
    quantidade: 16, valorUnitario: 37.50, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "VALDKLEBER DE SOUZA ALEXANDRE", motoristaCpf: "058.129.184-06", rota: "R110",
    mapa: "M7018", nf: "258640", clienteNb: "CLI2210", clienteNome: "DEPOSITO SAO SEBASTIAO",
    turno: "Diurno (Turno 1)", horario: "07:05",
    observacao: "Falta de 16 caixas na conferência da doca. Ajuste efetuado sem vale."
  },
  {
    month: 7, day: 15, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Divergência de Contagem no Cliente",
    produtoCodigo: "13061", produtoDescricao: "H2OH LIMONETO PET 500ML SHRINK C/12 NPAL",
    quantidade: 2, valorUnitario: 37.50, fatorHecto: 0.06, fatorEmbalagem: 12,
    motorista: "JOSE MATUZALEM PONTES DE OLIVEIRA", motoristaCpf: "049.812.564-88", rota: "R104",
    mapa: "M7040", nf: "258676", clienteNb: "CLI3310", clienteNome: "RESTAURANTE BOA VISTA",
    ajudante1: "ROMARIO RODRIGUES DA SILVA", ajudante1Cpf: "125.316.744-38",
    turno: "Diurno (Turno 1)", horario: "14:00",
    observacao: "Falta de 2 caixas no PDV (R$ 75,00). Vale emitido e rateado com equipe."
  },
  {
    month: 7, day: 22, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "19668", produtoDescricao: "ORIGINAL LATA 350ML SH C/12 NPAL",
    quantidade: 2, valorUnitario: 37.50, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "JOSE MATUZALEM PONTES DE OLIVEIRA", motoristaCpf: "049.812.564-88", rota: "R104",
    mapa: "M7060", nf: "258833", clienteNb: "CLI3325", clienteNome: "BAR DO MATUZALEM",
    turno: "Diurno (Turno 1)", horario: "06:35",
    observacao: "Ajuste de estoque CD Pau Brasil."
  },

  // AGOSTO 2026 (Carregamento: R$ 659,00 | Descarregamento: R$ 70,00)
  {
    month: 8, day: 5, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "988", produtoDescricao: "BRAHMA CHOPP 600ML",
    quantidade: 12, valorUnitario: 52.00, fatorHecto: 0.072, fatorEmbalagem: 12,
    motorista: "ADELSON SANTOS DE ARAUJO", motoristaCpf: "101.598.524-63", rota: "R113",
    mapa: "M8012", nf: "259100", clienteNb: "CLI2250", clienteNome: "PANIFICADORA DO VALE",
    turno: "Diurno (Turno 1)", horario: "06:45",
    observacao: "Regularizado no armazém CD Pau Brasil sem impacto financeiro aos condutores."
  },
  {
    month: 8, day: 18, tipo: "entrega",
    motivo: "Falta no Descarregamento (Rota / Entrega)",
    subMotivo: "Divergência na Descarga do PDV",
    produtoCodigo: "33820", produtoDescricao: "BRAHMA CHOPP LT 350ML SH C/12 NP MULTIPK",
    quantidade: 2, valorUnitario: 35.00, fatorHecto: 0.042, fatorEmbalagem: 12,
    motorista: "JEFFERSON JONES PAULINO COSTA", motoristaCpf: "084.721.434-19", rota: "R108",
    mapa: "M8055", nf: "259550", clienteNb: "CLI3340", clienteNome: "SUPERMERCADO REAL NORTE",
    ajudante1: "IDALMO FELIPE DOS SANTOS", ajudante1Cpf: "067.166.734-31",
    turno: "Diurno (Turno 1)", horario: "13:15",
    observacao: "Falta de 2 cx no PDV (R$ 70,00). Vale emitido e assinado."
  },
  {
    month: 8, day: 26, tipo: "carregamento",
    motivo: "Falta de SKU no Carregamento (Armazém)",
    subMotivo: "Separação Incompleta no Palete",
    produtoCodigo: "2319", produtoDescricao: "GUARANA CHP ANTARCTICA PET 1L CAIXA C/12",
    quantidade: 1, valorUnitario: 35.00, fatorHecto: 0.12, fatorEmbalagem: 12,
    motorista: "JOSE MATUZALEM PONTES DE OLIVEIRA", motoristaCpf: "049.812.564-88", rota: "R104",
    mapa: "M8080", nf: "248527", clienteNb: "CLI3355", clienteNome: "MERCADO PONTES",
    turno: "Diurno (Turno 1)", horario: "07:20",
    observacao: "Ajustado no CD."
  }
];

export function generateHistoricalShortagesAndVales2026(): {
  requests: PendingRequest[];
  vales: ValeEntry[];
} {
  const requests: PendingRequest[] = [];
  const vales: ValeEntry[] = [];

  RAW_SHORTAGE_EVENTS_2026.filter(e => e.month <= 8).forEach((evt, idx) => {
    const seq = 1000 + idx;
    const dayStr = evt.day < 10 ? `0${evt.day}` : `${evt.day}`;
    const monthStr = evt.month < 10 ? `0${evt.month}` : `${evt.month}`;
    const dateFormatted = `${dayStr}/${monthStr}/2026`;
    const timestamp = new Date(2026, evt.month - 1, evt.day, 10, 0, 0).getTime();

    const prod = getProductCatalogInfo(evt.produtoCodigo);
    const resolvedDesc = getProductDescription(evt.produtoCodigo, evt.produtoDescricao);
    const boxPrice = prod && prod.valor > 0 ? prod.valor : evt.valorUnitario;
    const factorHl = prod && prod.fatorHecto > 0 ? prod.fatorHecto : evt.fatorHecto;
    const factorEmbalagem = prod && prod.fator > 0 ? prod.fator : evt.fatorEmbalagem;

    const totalVal = Number((evt.quantidade * boxPrice).toFixed(2));
    const totalHl = Number((evt.quantidade * factorHl).toFixed(4));

    const reqItem: RequestItem = {
      id: `item_hist_short_${seq}`,
      item: evt.produtoCodigo,
      itemCode: evt.produtoCodigo,
      descricao: resolvedDesc,
      itemDesc: resolvedDesc,
      quantidade: evt.quantidade,
      unidadeMedida: "cx",
      fatorEmbalagem: factorEmbalagem,
      fatorHecto: factorHl,
      customUnitPrice: boxPrice,
      precoCalculated: totalVal,
      hectolitros: totalHl,
      motivo: evt.motivo
    };

    const isCarregamento = evt.tipo === "carregamento";
    const reqId = `req_hist_short_${seq}`;
    const valeId = isCarregamento ? undefined : `vale_hist_${seq}`;

    const req: PendingRequest = {
      id: reqId,
      timestamp,
      nb: evt.clienteNb,
      fotoUrl: "",
      nf: evt.nf,
      mapa: evt.mapa,
      setor: evt.rota,
      data: dateFormatted,
      statusPromax: "cadastrado",
      motivo: evt.motivo,
      observacao: evt.observacao,
      item: evt.produtoCodigo,
      descricaoProduto: resolvedDesc,
      quantidade: evt.quantidade,
      unidadeMedida: "cx",
      hectolitros: totalHl,
      valorTotal: totalVal,
      items: [reqItem],
      faltaTipoErro: isCarregamento ? "carregamento" : "entrega",
      tipoRegistroFalta: true,
      faltaMotorista: evt.motorista,
      faltaMotoristaCpf: evt.motoristaCpf,
      faltaAjudante1: evt.ajudante1,
      faltaAjudante1Cpf: evt.ajudante1Cpf,
      faltaAjudante2: evt.ajudante2,
      faltaAjudante2Cpf: evt.ajudante2Cpf,
      faltaAjudantes: evt.ajudante2 ? `${evt.ajudante1}, ${evt.ajudante2}` : evt.ajudante1,
      gerouVale: !isCarregamento,
      valeId: valeId,
      faltaBaixa: true,
      faltaDataBaixa: dateFormatted,
      faltaUsuarioBaixa: isCarregamento ? "Controle Operacional Armazém CD" : "Gestor Logística Distribuição",
      reviewedByControle: true
    };

    requests.push(req);

    if (!isCarregamento && valeId) {
      const vale: ValeEntry = {
        id: valeId,
        requestId: reqId,
        nf: evt.nf,
        rota: evt.rota,
        dataEmissao: dateFormatted,
        motorista: evt.motorista,
        motoristaCpf: evt.motoristaCpf,
        ajudante1: evt.ajudante1 || "",
        ajudante1Cpf: evt.ajudante1Cpf || "",
        ajudante2: evt.ajudante2 || "",
        ajudante2Cpf: evt.ajudante2Cpf || "",
        ajudantes: evt.ajudante2 ? `${evt.ajudante1}, ${evt.ajudante2}` : (evt.ajudante1 || ""),
        hectolitros: totalHl,
        valorTotal: totalVal,
        itemsCount: 1,
        status: (evt.month <= 6) ? "compensado" : "assinado",
        originalRequest: req
      };
      vales.push(vale);
    }
  });

  return { requests, vales };
}

const { requests: generatedHistoricalShortages, vales: generatedHistoricalVales } = generateHistoricalShortagesAndVales2026();
export const HISTORICAL_SHORTAGES_2026: PendingRequest[] = generatedHistoricalShortages;
export const HISTORICAL_VALES_2026: ValeEntry[] = generatedHistoricalVales;

/**
 * Ensures any dynamic or cached request has valid SKU description, value and type
 */
export function sanitizeRequestProductDescription(req: PendingRequest): PendingRequest {
  const resolvedDesc = getProductDescription(
    req.item || (req as any).itemCode || (req as any).produto, 
    req.descricaoProduto
  );

  let updatedItems = req.items;
  if (req.items && req.items.length > 0) {
    updatedItems = req.items.map(item => ({
      ...item,
      descricao: getProductDescription(item.item || item.itemCode, item.descricao || item.itemDesc),
      itemDesc: getProductDescription(item.item || item.itemCode, item.descricao || item.itemDesc)
    }));
  }

  return {
    ...req,
    descricaoProduto: resolvedDesc,
    items: updatedItems
  };
}

export function combineShortagesWithDynamic(dynamicRequests: PendingRequest[]): PendingRequest[] {
  const map = new Map<string, PendingRequest>();
  
  // 1. Base 2026 shortages with calibrated R$ 8.750,00 total (R$ 7.965,00 Carregamento / R$ 785,00 Descarregamento)
  HISTORICAL_SHORTAGES_2026.forEach(r => {
    map.set(r.id, sanitizeRequestProductDescription(r));
  });

  // 2. Overlay dynamic requests with sanitized SKU names
  dynamicRequests.forEach(r => {
    map.set(r.id, sanitizeRequestProductDescription(r));
  });

  return Array.from(map.values());
}

export function combineValesWithDynamic(dynamicVales: ValeEntry[]): ValeEntry[] {
  const map = new Map<string, ValeEntry>();

  // 1. Base 2026 vales
  HISTORICAL_VALES_2026.forEach(v => {
    if (v.originalRequest) {
      v.originalRequest = sanitizeRequestProductDescription(v.originalRequest);
    }
    map.set(v.id, v);
  });

  // 2. Overlay dynamic vales
  dynamicVales.forEach(v => {
    if (v.originalRequest) {
      v.originalRequest = sanitizeRequestProductDescription(v.originalRequest);
    }
    map.set(v.id, v);
  });

  return Array.from(map.values());
}
