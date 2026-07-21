export interface ExchangeRecord {
  id: string; // Unique generated ID (hash or index of import)
  unb: string;
  descricaoUnb: string;
  codigoCliente: string;
  nomeCliente: string;
  solicitacao: string; // Solicitação Reposição
  tipo: string; // Tipo Solicitação
  dataSolicitacao: string;
  hora: string;
  status: string; // Status Solicitação (Aprovada, Pendente, Reprovada)
  dataAcao: string;
  usuarioAcao: string;
  mapa: string; // Mapa Reposição
  nf: string; // Nota Fiscal/Serie
  statusNf: string;
  produto: string; // Código do Produto
  descricaoProduto: string;
  quantidade: number;
  um: string; // Unidade de medida
  valorUnitario: number;
  valorTotal: number; // Valor final do repasse
  justificativa: string;
  fatorHecto?: number;
  hectolitros?: number;
  
  // Deliveries / logistics
  veiculo: string;
  placa: string;
  transportadora: string;
  nomeTransportadora: string;
  motorista: string;
  nomeMotorista: string;
  conferente: string; // Conferente - Solicitação Reposição
  conferenteCarregamento: string;
  
  // Audits and Systems
  nrPedidoReposicao: string;
  statusCheck: string;
  sistemaOrigem: string;
  observacao: string;
  setorVenda: string; // Setor da solicitação
  
  // Metadata for history
  importTimestamp: number;
  importBatchName: string;
}

export interface SectorAnalytics {
  setor: string;
  totalSpent: number;
  requestCount: number;
  averageSpent: number;
  topProducts: { produto: string; descricao: string; quantity: number; totalSpent: number }[];
  topClients: { codigoCliente: string; nome: string; requestCount: number; totalSpent: number }[];
  justificationCounts: { [justification: string]: { count: number; totalSpent: number } };
}

export interface ImportBatch {
  id: string;
  timestamp: number;
  fileName: string;
  recordCount: number;
  totalValue: number;
}

export interface RepresentativeInfo {
  setor: string;
  nome: string;
  gv: string;
}

const DEFAULT_REPRESENTATIVOS_SETOR: Record<string, RepresentativeInfo> = {
  "600": { setor: "600", nome: "THIAGO BATISTA", gv: "DIEGO" },
  "601": { setor: "601", nome: "FELIPE MOREIRA", gv: "DIEGO" },
  "602": { setor: "602", nome: "JEAN REGIS", gv: "DIEGO" },
  "603": { setor: "603", nome: "JOSÉ KLEBSON", gv: "DIEGO" },
  "604": { setor: "604", nome: "MARCOS ANTONIO", gv: "DIEGO" },
  "605": { setor: "605", nome: "LUCAS GABRIEL", gv: "DIEGO" },
  "606": { setor: "606", nome: "MARCOS VINICIUS", gv: "DIEGO" },
  "607": { setor: "607", nome: "KAHLIL GIBRAN", gv: "DIEGO" },
  "608": { setor: "608", nome: "JHONATAN BOTOLO", gv: "DIEGO" },
  "700": { setor: "700", nome: "VALDEMIR VANDEREI", gv: "ERIVAN" },
  "701": { setor: "701", nome: "ROBSON ALLAN", gv: "ERIVAN" },
  "702": { setor: "702", nome: "JUAN PABLO", gv: "ERIVAN" },
  "703": { setor: "703", nome: "CARLOS EMANUEL", gv: "ERIVAN" },
  "704": { setor: "704", nome: "JOAO LUCAS", gv: "ERIVAN" },
  "705": { setor: "705", nome: "RONIELYSON ALVES", gv: "ERIVAN" },
  "706": { setor: "706", nome: "ALEX JUNIOR", gv: "ERIVAN" },
  "707": { setor: "707", nome: "MATHEUS ALVES", gv: "ERIVAN" }
};

let cachedRepresentativosSetor: Record<string, RepresentativeInfo> | null = null;

export const clearRepresentativosCache = () => {
  cachedRepresentativosSetor = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    cachedRepresentativosSetor = null;
  });
}

export const getRepresentativosSetor = (): Record<string, RepresentativeInfo> => {
  if (cachedRepresentativosSetor) return cachedRepresentativosSetor;
  if (typeof window === "undefined") return DEFAULT_REPRESENTATIVOS_SETOR;
  const saved = localStorage.getItem("sstr_reps_setor");
  if (saved) {
    try {
      cachedRepresentativosSetor = JSON.parse(saved);
      return cachedRepresentativosSetor!;
    } catch (e) {
      console.error(e);
    }
  }
  cachedRepresentativosSetor = DEFAULT_REPRESENTATIVOS_SETOR;
  return DEFAULT_REPRESENTATIVOS_SETOR;
};

export const REPRESENTATIVOS_SETOR: Record<string, RepresentativeInfo> = new Proxy({}, {
  get(target, prop: string | symbol) {
    if (typeof prop === "symbol" || prop === "prototype") {
      return (target as any)[prop];
    }
    const list = getRepresentativosSetor();
    return list[prop as string];
  },
  ownKeys() {
    return Reflect.ownKeys(getRepresentativosSetor());
  },
  getOwnPropertyDescriptor(target, prop) {
    const list = getRepresentativosSetor();
    if (Object.prototype.hasOwnProperty.call(list, prop)) {
      return {
        enumerable: true,
        configurable: true,
        writable: true,
        value: list[prop as string]
      };
    }
    return undefined;
  },
  has(target, prop) {
    if (typeof prop === "symbol") return false;
    return prop in getRepresentativosSetor();
  }
});

export interface RouteDriverInfo {
  rota: string;
  nome: string;
  veiculo: string;
}

const DEFAULT_MOTORISTAS_ROTAS: Record<string, RouteDriverInfo> = {
  "R101": { rota: "R101", nome: "EDENILSON DE SOUSA SILVA", veiculo: "Motorista de Distribuição" },
  "R102": { rota: "R102", nome: "VITOR MACENA GOMES", veiculo: "Ajudante de Distribuição" },
  "R103": { rota: "R103", nome: "IDALMO FELIPE DOS SANTOS", veiculo: "Ajudante de Distribuição" },
  "R104": { rota: "R104", nome: "JEFFERSON SOARES PONTES DA SILVA", veiculo: "Ajudante de Distribuição" },
  "R105": { rota: "R105", nome: "JOSE DE MESQUITA FABRICIO", veiculo: "Ajudante de Distribuição" },
  "R106": { rota: "R106", nome: "KERCY JONES BERNARDINO DOS SANTOS", veiculo: "Ajudante de Distribuição" },
  "R107": { rota: "R107", nome: "JOAB DA SILVA MONTE", veiculo: "Ajudante de Distribuição" },
  "R108": { rota: "R108", nome: "ITALO BRUNO SILVA DE MEDEIROS", veiculo: "Ajudante de Distribuição" },
  "R109": { rota: "R109", nome: "ABRAAO EVANGELISTA DOS SANTOS", veiculo: "Ajudante de Distribuição II" },
  "R110": { rota: "R110", nome: "VALDKLEBER DE SOUZA ALEXANDRE", veiculo: "Motorista de Distribuição" },
  "R111": { rota: "R111", nome: "DANILLO PEREIRA DOS SANTOS SILVA", veiculo: "Motorista de Distribuição" },
  "R112": { rota: "R112", nome: "EWERTON RODRIGUES DA SILVA", veiculo: "Motorista de Distribuição" },
  "R113": { rota: "R113", nome: "ADELSON SANTOS DE ARAUJO", veiculo: "Motorista de Distribuição" },
  "R114": { rota: "R114", nome: "GILMAR DOS SANTOS FERNANDES", veiculo: "Motorista de Distribuição" },
  "R115": { rota: "R115", nome: "MANOEL ALVES DUTRA NETO", veiculo: "Motorista de Distribuição" },
  "R116": { rota: "R116", nome: "CESARIO FERREIRA DE VASCONCELOS", veiculo: "Motorista de Distribuição" },
  "R117": { rota: "R117", nome: "JOSE HONORIO DA SILVA", veiculo: "Motorista de Distribuição" },
  "R118": { rota: "R118", nome: "JOSENILSON INACIO DE ANDRADE", veiculo: "Motorista de Distribuição" },
  "R119": { rota: "R119", nome: "JOSE CARLOS DE LIMA ARAUJO", veiculo: "Motorista de Distribuição" },
  "R120": { rota: "R120", nome: "EDILSON DE ANDRADE LIMA JUNIOR", veiculo: "Motorista de Distribuição" },
  "R121": { rota: "R121", nome: "JEFFERSON JONES PAULINO COSTA", veiculo: "Motorista de Distribuição" },
  "R122": { rota: "R122", nome: "JOSE MATUZALEM PONTES DE OLIVEIRA", veiculo: "Motorista de Distribuição" },
  "R123": { rota: "R123", nome: "JOSICLAUDIO DE OLIVEIRA RODRIGUES", veiculo: "Motorista de Distribuição" }
};

let cachedMotoristasRotas: Record<string, RouteDriverInfo> | null = null;

export const clearMotoristasRotasCache = () => {
  cachedMotoristasRotas = null;
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    cachedMotoristasRotas = null;
  });
}

export const getMotoristasRotas = (): Record<string, RouteDriverInfo> => {
  if (cachedMotoristasRotas) return cachedMotoristasRotas;
  if (typeof window === "undefined") return DEFAULT_MOTORISTAS_ROTAS;
  const saved = localStorage.getItem("sstr_motoristas_rotas");
  if (saved) {
    try {
      cachedMotoristasRotas = JSON.parse(saved);
      return cachedMotoristasRotas!;
    } catch (e) {
      console.error(e);
    }
  }
  cachedMotoristasRotas = DEFAULT_MOTORISTAS_ROTAS;
  return DEFAULT_MOTORISTAS_ROTAS;
};

export const MOTORISTAS_ROTAS: Record<string, RouteDriverInfo> = new Proxy({}, {
  get(target, prop: string | symbol) {
    if (typeof prop === "symbol" || prop === "prototype") {
      return (target as any)[prop];
    }
    const list = getMotoristasRotas();
    return list[prop as string];
  },
  ownKeys() {
    return Reflect.ownKeys(getMotoristasRotas());
  },
  getOwnPropertyDescriptor(target, prop) {
    const list = getMotoristasRotas();
    if (Object.prototype.hasOwnProperty.call(list, prop)) {
      return {
        enumerable: true,
        configurable: true,
        writable: true,
        value: list[prop as string]
      };
    }
    return undefined;
  },
  has(target, prop) {
    if (typeof prop === "symbol") return false;
    return prop in getMotoristasRotas();
  }
});

export interface RequestItem {
  id: string;
  item: string; // SKU code
  descricao?: string; // Product name
  quantidade: number;
  fatorHecto?: number;
  hectolitros?: number;
  motivo?: string; // specific item reason: Product Avariado, Falta no SKU, Falta de SKU Completo, Inversão
  
  // Specific fields for Inversion ("Inversão")
  produtoAhEnviar?: string; // product that should go
  produtoARecolher?: string; // product that should be collected
}

export interface PendingRequest {
  id: string; // e.g. "pending_req_1720239023..."
  timestamp: number;
  data: string; // formatted date (e.g., "20/06/2026")
  setor: string; // e.g. "600", "700" or "ROTA - R101"
  mapa: string;
  nb: string; // client code
  nf: string; // Nota Fiscal (Required)
  fotoUrl: string; // Base64 encoding or image link (Required)
  observacao: string;
  statusPromax: "pendente" | "cadastrado" | "reprovado" | "corrigir";
  cadastroUser?: string;
  cadastroDate?: string;
  motivo?: string; // e.g., "Avaria", "Falta no SKU", etc.
  notified?: boolean; // has the RN seen the approval notification
  rejeitadoObs?: string; // Motivo de reprovação (Required if rejected)
  reprovadoDate?: string;
  reprovadoUser?: string;
  item?: string; // added to support duplicate checks and detailed listings
  quantidade?: number; // added to support duplicate checks and detailed listings
  fatorHecto?: number;
  hectolitros?: number;
  isOffline?: boolean;
  items?: RequestItem[];

  // Shortage physical settlement properties (Faltas e Inversões)
  faltaBaixa?: boolean;
  faltaBaixaDate?: string;
  faltaBaixaUser?: string;
  faltaBaixaReciboName?: string;
  faltaBaixaReciboUrl?: string;
  faltaBaixaReciboType?: string;
  faltaBaixaObs?: string;
  faltaTipoErro?: string; // "carregamento" or "entrega"
  faltaMotorista?: string;
  faltaMotoristaCpf?: string;
  faltaAjudantes?: string;
  faltaAjudante1?: string;
  faltaAjudante1Cpf?: string;
  faltaAjudante2?: string;
  faltaAjudante2Cpf?: string;
  mapaDataAnomalia?: string;
  dataEntregaRecibo?: string;
  observacaoRecibo?: string;
  municipioRecibo?: string;
}

export interface CrewMember {
  nome: string;
  cargo: string;
  cpf: string;
}

const DEFAULT_LISTA_CREW: CrewMember[] = [
  { nome: "EDENILSON DE SOUSA SILVA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "104.695.814-33" },
  { nome: "GEOVANE ARAUJO DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "099.123.694-75" },
  { nome: "FELIPE GOMES DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "700.552.584-17" },
  { nome: "VALDKLEBER DE SOUZA ALEXANDRE", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "058.129.184-06" },
  { nome: "VITOR MACENA GOMES", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "705.138.374-42" },
  { nome: "WALLISON PONTES DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "180.471.404-69" },
  { nome: "IDALMO FELIPE DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "067.166.734-31" },
  { nome: "VALTEIR BATISTA DE OLIVEIRA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "703.583.194-04" },
  { nome: "ROMARIO RODRIGUES DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "125.316.744-38" },
  { nome: "CARLOS ALBERTO ROQUE DE OLIVEIRA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "071.040.024-13" },
  { nome: "DANILLO PEREIRA DOS SANTOS SILVA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "713.650.714-64" },
  { nome: "EWERTON RODRIGUES DA SILVA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "116.515.224-05" },
  { nome: "ADELSON SANTOS DE ARAUJO", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "101.598.524-63" },
  { nome: "GILMAR DOS SANTOS FERNANDES", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "058.142.584-70" },
  { nome: "JEFFERSON SOARES PONTES DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "700.478.734-69" },
  { nome: "JOALISON JACINTO DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "078.444.084-05" },
  { nome: "MANOEL ALVES DUTRA NETO", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "095.438.274-94" },
  { nome: "CESARIO FERREIRA DE VASCONCELOS", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "032.354.034-18" },
  { nome: "DANIEL FIRMINO DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "074.441.964-60" },
  { nome: "ISAIAS DE OLIVEIRA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "016.308.564-10" },
  { nome: "ALAN JUNIOR MATIAS DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "152.088.094-43" },
  { nome: "JOSE DE MESQUITA FABRICIO", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "085.892.124-32" },
  { nome: "GERLANDO MOREIRA DE AZEVEDO JUNIOR", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "132.603.344-16" },
  { nome: "JOSE HONORIO DA SILVA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "111.327.744-03" },
  { nome: "JOSENILSON INACIO DE ANDRADE", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "098.104.994-00" },
  { nome: "JOSE CARLOS DE LIMA ARAUJO", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "122.277.104-70" },
  { nome: "EDILSON DE ANDRADE LIMA JUNIOR", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "068.171.834-05" },
  { nome: "RONALDO SILVA DE LIMA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "125.745.814-07" },
  { nome: "KERCY JONES BERNARDINO DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "110.833.744-94" },
  { nome: "JEFFERSON JONES PAULINO COSTA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "071.317.444-76" },
  { nome: "DJONAS RODRIGUES DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "096.863.654-35" },
  { nome: "JOAB DA SILVA MONTE", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "086.792.164-10" },
  { nome: "ABRAAO EVANGELISTA DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO II", cpf: "708.579.944-76" },
  { nome: "EDSON RODRIGUES FILGUEIRA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "709.551.614-60" },
  { nome: "ALISSON ROMAO DA TRINDADE", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "102.677.124-21" },
  { nome: "JOSE MATUZALEM PONTES DE OLIVEIRA", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "702.136.704-02" },
  { nome: "JOSICLAUDIO DE OLIVEIRA RODRIGUES", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "011.689.864-00" },
  { nome: "ITALO BRUNO SILVA DE MEDEIROS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "709.966.924-95" },
  { nome: "ALBERTO LUCAS ARAUJO DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "166.575.744-28" },
  { nome: "LEONARDO MAURICIO DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "095.408.544-23" },
  { nome: "JOALISON IZAIAS DA SILVA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "700.261.874-18" },
  { nome: "JANDEILSON BEZERRA LINS DA CRUZ", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "080.093.804-66" },
  { nome: "RENAN DOS SANTOS LIMA", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "154.483.594-93" },
  { nome: "IRIMARQUE JOSE BATISTA DOS SANTOS", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "095.506.644-14" },
  { nome: "JORGE DO CARMO DAMIANO", cargo: "AJUDANTE DE DISTRIBUICAO", cpf: "049.127.314-20" },
  { nome: "THIAGO JOSE SANTINO DOS SANTOS", cargo: "MOTORISTA DE DISTRIBUICAO", cpf: "061.720.027-08" }
];

export const getListaCrew = (): CrewMember[] => {
  if (typeof window === "undefined") return DEFAULT_LISTA_CREW;
  const saved = localStorage.getItem("sstr_lista_crew");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
  }
  // Initialize in localStorage so users can edit it
  localStorage.setItem("sstr_lista_crew", JSON.stringify(DEFAULT_LISTA_CREW));
  return DEFAULT_LISTA_CREW;
};

export const LISTA_CREW: CrewMember[] = new Proxy([] as CrewMember[], {
  get(target, prop) {
    const list = getListaCrew();
    const val = (list as any)[prop];
    if (typeof val === "function") {
      return val.bind(list);
    }
    return val;
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getListaCrew(), prop);
  },
  ownKeys(target) {
    return Reflect.ownKeys(getListaCrew());
  }
});

export function getCrewDetailByName(name: string): CrewMember | undefined {
  if (!name) return undefined;
  const cleanName = name.trim().toUpperCase();
  let found = LISTA_CREW.find(c => c.nome.toUpperCase() === cleanName);
  if (!found) {
    found = LISTA_CREW.find(c => c.nome.toUpperCase().includes(cleanName) || cleanName.includes(c.nome.toUpperCase()));
  }
  return found;
}

export interface PdvInfo {
  codigo: string; // NB
  razaoSocial: string;
  nomeFantasia: string;
  municipio: string;
  documento?: string;
  endereco?: string;
  complemento?: string;
  bairro?: string;
  uf?: string;
  cep?: string;
}


