import { safeSetItem } from "../utils/apiSync";

export interface ProductInfo {
  codigo: string;
  descricao: string;
  fator: number; // Embalagem / itens por caixa (ex: 12, 23, 24, 6, 1)
  valor: number; // Preço em R$ por CAIXA
  fatorHecto: number; // Volume em Hectolitros por CAIXA
  embalagem?: number;
}

// Official product catalog inserted from prompt CSV
const DEFAULT_PRODUCT_DATABASE: ProductInfo[] = [
  { codigo: "9067", descricao: "ANTARCTICA PILSEN LATA 350ML SH C/12 NPAL", fator: 12, valor: 28.95, fatorHecto: 0.04 },
  { codigo: "9068", descricao: "SKOL LATA 350ML SH C/12 NPAL", fator: 12, valor: 28.52, fatorHecto: 0.04 },
  { codigo: "34608", descricao: "SKOL LATA 350ML SH C/12 NPAL MULTIPACK", fator: 12, valor: 39.00, fatorHecto: 0.04 },
  { codigo: "33820", descricao: "BRAHMA CHOPP LT 350ML SH C/12 NP MULTIPK", fator: 12, valor: 34.90, fatorHecto: 0.04 },
  { codigo: "13205", descricao: "SKOL GFA VD 300ML CX C/23", fator: 23, valor: 39.14, fatorHecto: 0.07 },
  { codigo: "19164", descricao: "GUARANA CHP ANTARCTICA PET 1L PACK C/2 MULTPACK", fator: 2, valor: 3.90, fatorHecto: 0.02 },
  { codigo: "21020", descricao: "BUDWEISER LT SLEEK 350ML CX CART C 12", fator: 12, valor: 31.78, fatorHecto: 0.04 },
  { codigo: "21787", descricao: "DREHER GARRAFA VIDRO 900ML", fator: 1, valor: 18.51, fatorHecto: 0.01 },
  { codigo: "503", descricao: "SUKITA PET 2L CAIXA C/6", fator: 6, valor: 19.45, fatorHecto: 0.12 },
  { codigo: "504", descricao: "PEPSI COLA PET 2L CAIXA C/6", fator: 6, valor: 26.97, fatorHecto: 0.12 },
  { codigo: "982", descricao: "SKOL 600ML", fator: 12, valor: 53.35, fatorHecto: 0.07 },
  { codigo: "988", descricao: "BRAHMA CHOPP 600ML", fator: 12, valor: 52.23, fatorHecto: 0.07 },
  { codigo: "1388", descricao: "SKOL GFA VD 1L 2,99", fator: 12, valor: 51.44, fatorHecto: 0.12 },
  { codigo: "1743", descricao: "ANTARCTICA PILSEN GFA VD 1L COM TTC", fator: 12, valor: 40.76, fatorHecto: 0.12 },
  { codigo: "2319", descricao: "GUARANA CHP ANTARCTICA PET 1L CAIXA C/12", fator: 12, valor: 34.22, fatorHecto: 0.12 },
  { codigo: "2349", descricao: "GUARANA CHP ANTARCTICA PET 2L CAIXA C/6", fator: 6, valor: 28.39, fatorHecto: 0.12 },
  { codigo: "2353", descricao: "GUARANA CHP ANTARCTICA DIET PET 2L CAIXA C/6", fator: 6, valor: 28.09, fatorHecto: 0.12 },
  { codigo: "2538", descricao: "ANTARCTICA PILSEN 600ML", fator: 12, valor: 48.22, fatorHecto: 0.07 },
  { codigo: "2546", descricao: "ORIGINAL 600ML", fator: 12, valor: 61.02, fatorHecto: 0.07 },
  { codigo: "2548", descricao: "BUDWEISER 600ML", fator: 12, valor: 53.65, fatorHecto: 0.07 },
  { codigo: "9069", descricao: "BRAHMA CHOPP LATA 350ML SH C/12 NPAL", fator: 12, valor: 28.51, fatorHecto: 0.04 },
  { codigo: "9083", descricao: "SKOL LT 473ML SH C/12 NPAL", fator: 12, valor: 37.84, fatorHecto: 0.06 },
  { codigo: "9084", descricao: "GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL", fator: 12, valor: 22.12, fatorHecto: 0.04 },
  { codigo: "9085", descricao: "GUARANA CHP ANTARCTICA DIET LATA 350ML SH C/12 NPAL", fator: 12, valor: 22.33, fatorHecto: 0.04 },
  { codigo: "9274", descricao: "PEPSI ZERO LATA 350ML SH C/12 NPAL", fator: 12, valor: 21.89, fatorHecto: 0.04 },
  { codigo: "12948", descricao: "BRAHMA CHOPP ZERO LATA 350ML SH C/12 NPAL", fator: 12, valor: 30.89, fatorHecto: 0.04 },
  { codigo: "13061", descricao: "H2OH LIMONETO PET 500ML SHRINK C/12 NPAL", fator: 12, valor: 32.79, fatorHecto: 0.06 },
  { codigo: "13065", descricao: "H2OH LIMONETO PET 1,5 SHRINK C/06 NPAL", fator: 6, valor: 27.23, fatorHecto: 0.09 },
  { codigo: "13201", descricao: "BRAHMA CHOPP GFA VD 300ML CX C/23", fator: 23, valor: 39.08, fatorHecto: 0.07 },
  { codigo: "17808", descricao: "BUDWEISER OW 330ML CX C/24", fator: 24, valor: 90.67, fatorHecto: 0.08 },
  { codigo: "18152", descricao: "GUARANA CHP ANTARCTICA PET 200ML SH C/12", fator: 12, valor: 13.21, fatorHecto: 0.02 },
  { codigo: "18266", descricao: "PEPSI COLA PET 200ML SH C/12", fator: 12, valor: 12.08, fatorHecto: 0.02 },
  { codigo: "19229", descricao: "RED BULL BR LATA 250ML SIX PACK NPAL .", fator: 6, valor: 37.23, fatorHecto: 0.02 },
  { codigo: "19668", descricao: "ORIGINAL LATA 350ML SH C/12 NPAL", fator: 12, valor: 37.58, fatorHecto: 0.04 },
  { codigo: "20217", descricao: "ORIGINAL GFA VD 300ML CX C/23", fator: 23, valor: 45.94, fatorHecto: 0.07 },
  { codigo: "21526", descricao: "JOHNNIE WALKER RED LABEL GARRAFA VIDRO 1 L", fator: 1, valor: 74.00, fatorHecto: 0.01 },
  { codigo: "22177", descricao: "BUDWEISER ZERO LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 23.10, fatorHecto: 0.03 },
  { codigo: "23186", descricao: "SPATEN N 600ML", fator: 12, valor: 60.57, fatorHecto: 0.07 },
  { codigo: "24409", descricao: "QUINTA DO MORGADO VINHO TINTO SUAVE GFA VD 750 ML", fator: 1, valor: 14.24, fatorHecto: 0.01 },
  { codigo: "26037", descricao: "MONTILLA CARTA CRISTAL GFA VDR 1L", fator: 1, valor: 22.97, fatorHecto: 0.01 },
  { codigo: "32500", descricao: "STELLA ARTOIS PURE GOLD LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 30.30, fatorHecto: 0.03 },
  { codigo: "32526", descricao: "PETROPOLIS AGUA MIN SEM GAS GARRAFA PET 500MLCX C12", fator: 12, valor: 10.58, fatorHecto: 0.06 },
  { codigo: "32528", descricao: "PETROPOLIS AGUA MIN COM GAS GARRAFA PET 500MLCX C12", fator: 12, valor: 12.17, fatorHecto: 0.06 },
  { codigo: "21658", descricao: "SPATEN N LT SLEEK 350ML CX CART C 12", fator: 12, valor: 40.16, fatorHecto: 0.04 },
  { codigo: "34475", descricao: "ELEVE AGUA MIN S GAS GFA PET 510ML FD C/12", fator: 12, valor: 10.04, fatorHecto: 0.06 },
  { codigo: "20164", descricao: "SKOL LT 473ML SH C/12 NPAL MULTPACK 12", fator: 12, valor: 37.40, fatorHecto: 0.06 },
  { codigo: "34027", descricao: "GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL MULTIPACK", fator: 12, valor: 30.48, fatorHecto: 0.04 },
  { codigo: "35331", descricao: "BUDWEISER GFA VD 1L", fator: 12, valor: 65.61, fatorHecto: 0.12 },
  { codigo: "34325", descricao: "ELEVE AGUA MIN C GAS GFA PET 510ML FD C/12", fator: 12, valor: 17.90, fatorHecto: 0.06 },
  { codigo: "347", descricao: "SUKITA PET 1L CAIXA C/12", fator: 12, valor: 30.48, fatorHecto: 0.12 },
  { codigo: "620", descricao: "CARACU LONG NECK 355ML SIX-PACK BANDEJA C/4", fator: 24, valor: 78.20, fatorHecto: 0.09 },
  { codigo: "838", descricao: "CHOPP BRAHMA CLARO BARRIL KEG 50L", fator: 1, valor: 13.40, fatorHecto: 0.01 },
  { codigo: "1114", descricao: "GUARANA CHP ANTARCTICA PET 3,3 L SH C/04", fator: 4, valor: 27.55, fatorHecto: 0.13 },
  { codigo: "1116", descricao: "PEPSI COLA PET 3,3 L SH C/04", fator: 4, valor: 28.10, fatorHecto: 0.13 },
  { codigo: "1166", descricao: "SUKITA UVA PET 2L CAIXA C/6", fator: 6, valor: 20.09, fatorHecto: 0.12 },
  { codigo: "1695", descricao: "BRAHMA CHOPP GFA VD 1L COM TTC", fator: 12, valor: 59.89, fatorHecto: 0.12 },
  { codigo: "1699", descricao: "STELLA ARTOIS LT 269ML CX C/8 FRIDGE PACK", fator: 8, valor: 21.95, fatorHecto: 0.02 },
  { codigo: "1745", descricao: "SKOL LT 269ML SH C15 NPAL", fator: 15, valor: 30.91, fatorHecto: 0.04 },
  { codigo: "1898", descricao: "BRAHMA CHOPP LT 269ML SH C15 NPAL", fator: 15, valor: 30.92, fatorHecto: 0.04 },
  { codigo: "2006", descricao: "ANTARCTICA SUBZERO 600ML", fator: 12, valor: 60.00, fatorHecto: 0.07 },
  { codigo: "2008", descricao: "ANTARCTICA SUBZERO LATA 350ML SH C/12 NPAL", fator: 12, valor: 27.01, fatorHecto: 0.04 },
  { codigo: "2320", descricao: "SODA LIMONADA ANTARCTICA PET 1L CAIXA C/12", fator: 12, valor: 31.82, fatorHecto: 0.12 },
  { codigo: "2350", descricao: "SODA LIMONADA ANTARCTICA PET 2L CAIXA C/6", fator: 6, valor: 27.02, fatorHecto: 0.12 },
  { codigo: "2585", descricao: "GUARANA CHP ANTARCTICA GFA VD 1L", fator: 12, valor: 27.69, fatorHecto: 0.12 },
  { codigo: "3733", descricao: "BOHEMIA NOVA EMBALAGEM 600ML", fator: 12, valor: 47.39, fatorHecto: 0.07 },
  { codigo: "4141", descricao: "PATAGONIA AMB LAG NACIONAL LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 31.95, fatorHecto: 0.03 },
  { codigo: "4143", descricao: "PATAGONIA BOH PILS NACIONAL LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 28.94, fatorHecto: 0.03 },
  { codigo: "4198", descricao: "PATAGONIA IPA LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 31.94, fatorHecto: 0.03 },
  { codigo: "4262", descricao: "MICHELOB ULTRA N LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 32.83, fatorHecto: 0.03 },
  { codigo: "4293", descricao: "PEPSI BLACK PET 200ML SH C/12", fator: 12, valor: 12.48, fatorHecto: 0.02 },
  { codigo: "4367", descricao: "INDAIA AGUA MINERAL S/GAS GFA PET 1,5L FD C/6", fator: 6, valor: 13.57, fatorHecto: 0.09 },
  { codigo: "4409", descricao: "PEPSI TWIST PET 2L SHRINK C/6", fator: 6, valor: 32.00, fatorHecto: 0.12 },
  { codigo: "6181", descricao: "AGUA MIN DIAS DAVILA S/GAS PET 500ML CAIXA C/12", fator: 12, valor: 6.08, fatorHecto: 0.06 },
  { codigo: "6183", descricao: "AGUA MIN DIAS DAVILA C/GAS PET 500ML CAIXA C/12", fator: 12, valor: 14.98, fatorHecto: 0.06 },
  { codigo: "6185", descricao: "AGUA MIN DIAS DAVILA S/GAS PET 1,5L CAIXA C/6", fator: 6, valor: 9.32, fatorHecto: 0.09 },
  { codigo: "7325", descricao: "PEPSI COLA PET 1L CAIXA C/12", fator: 12, valor: 34.09, fatorHecto: 0.12 },
  { codigo: "7945", descricao: "PEPSI COLA PET 2,5L CAIXA C/6", fator: 6, valor: 31.34, fatorHecto: 0.15 },
  { codigo: "7947", descricao: "GUARANA CHP ANTARCTICA PET 2,5L CAIXA C/6", fator: 6, valor: 32.35, fatorHecto: 0.15 },
  { codigo: "7977", descricao: "GATORADE UVA PET 500ML SIXPACK", fator: 6, valor: 23.14, fatorHecto: 0.03 },
  { codigo: "7979", descricao: "GATORADE FRUTAS CITRICAS PET 500ML SIXPACK", fator: 6, valor: 28.68, fatorHecto: 0.03 },
  { codigo: "7980", descricao: "GATORADE TANGERINA PET 500ML SIXPACK", fator: 6, valor: 23.41, fatorHecto: 0.03 },
  { codigo: "7981", descricao: "GATORADE LARANJA PET 500ML SIXPACK", fator: 6, valor: 23.25, fatorHecto: 0.03 },
  { codigo: "7982", descricao: "GATORADE LIMAO PET 500ML SIXPACK", fator: 6, valor: 23.40, fatorHecto: 0.03 },
  { codigo: "7983", descricao: "GATORADE MORANGO-MARACUJA PET 500ML SIXPACK", fator: 6, valor: 23.32, fatorHecto: 0.03 },
  { codigo: "7985", descricao: "GATORADE MARACUJA PET 500ML SIXPACK", fator: 6, valor: 23.82, fatorHecto: 0.03 },
  { codigo: "8791", descricao: "H2OH LIMAO C/GAS PET 500ML CAIXA C/12", fator: 12, valor: 30.08, fatorHecto: 0.06 },
  { codigo: "8793", descricao: "H2OH LIMAO C/GAS PET 1,5L CAIXA C/6", fator: 6, valor: 28.15, fatorHecto: 0.09 },
  { codigo: "8919", descricao: "GUARANA CHP ANTARCTICA PET 600ML CX12 NPAL", fator: 12, valor: 29.33, fatorHecto: 0.07 },
  { codigo: "9072", descricao: "BOHEMIA NOVA EMBALAGEM LATA 350ML SH C/12 NPAL", fator: 12, valor: 33.26, fatorHecto: 0.04 },
  { codigo: "9087", descricao: "SODA LIMONADA ANTARCTICA LATA 350ML SH C/12 NPAL", fator: 12, valor: 19.41, fatorHecto: 0.04 },
  { codigo: "9089", descricao: "SUKITA LATA 350ML SH C/12 NPAL", fator: 12, valor: 20.64, fatorHecto: 0.04 },
  { codigo: "9091", descricao: "TONICA ANTARCTICA LATA 350ML SH C/12 NPAL", fator: 12, valor: 24.92, fatorHecto: 0.04 },
  { codigo: "9092", descricao: "TONICA ANTARCTICA DIET LATA 350ML SH C/12 NPAL", fator: 12, valor: 23.57, fatorHecto: 0.04 },
  { codigo: "9096", descricao: "PEPSI COLA LATA 350ML SH C/12 NPAL", fator: 12, valor: 20.03, fatorHecto: 0.04 },
  { codigo: "9276", descricao: "PEPSI ZERO PET 2L CAIXA C/6", fator: 6, valor: 26.13, fatorHecto: 0.12 },
  { codigo: "9320", descricao: "BRAHMA CHOPP LT 473ML SH C/12 NPAL", fator: 12, valor: 35.46, fatorHecto: 0.06 },
  { codigo: "9795", descricao: "GUARANA ANTARCTICA ZERO PET 1L CAIXA C/12", fator: 12, valor: 33.45, fatorHecto: 0.12 },
  { codigo: "10175", descricao: "ANTARCTICA SUBZERO LT 473ML SH C/12 NPAL", fator: 12, valor: 44.85, fatorHecto: 0.06 },
  { codigo: "10537", descricao: "BOHEMIA GFA VD 990ML", fator: 12, valor: 51.64, fatorHecto: 0.12 },
  { codigo: "11593", descricao: "PEPSI COLA GFA VD 1L", fator: 12, valor: 33.90, fatorHecto: 0.12 },
  { codigo: "12951", descricao: "BRAHMA CHOPP ZERO LN 355ML SIXPACK CX CART C/04", fator: 24, valor: 77.30, fatorHecto: 0.09 },
  { codigo: "13194", descricao: "BRAHMA CHOPP ONE WAY 300ML CX C/23", fator: 23, valor: 61.72, fatorHecto: 0.07 },
  { codigo: "13196", descricao: "SKOL ONE WAY 300ML CX C/23", fator: 23, valor: 61.72, fatorHecto: 0.07 },
  { codigo: "13307", descricao: "BUDWEISER GFA VD 990ML CX C/12", fator: 12, valor: 56.96, fatorHecto: 0.12 },
  { codigo: "13486", descricao: "FUSION PET 1L SH C/06", fator: 6, valor: 38.58, fatorHecto: 0.06 },
  { codigo: "13566", descricao: "SKOL BEATS SENSES LT 269ML CX C/8 FRIDGE PACK", fator: 8, valor: 29.40, fatorHecto: 0.02 },
  { codigo: "13839", descricao: "BUDWEISER LT 269ML CX C/8 FRIDGE PACK", fator: 8, valor: 18.23, fatorHecto: 0.02 },
  { codigo: "14099", descricao: "BUDWEISER ONE WAY 600ML CX C/12 NPAL", fator: 12, valor: 60.30, fatorHecto: 0.07 },
  { codigo: "14135", descricao: "BUDWEISER LATA 473ML SIX-PACK SH C/2 NPAL", fator: 12, valor: 38.78, fatorHecto: 0.06 },
  { codigo: "14283", descricao: "WALS DUBBEL ONE WAY 375ML CX C/12 ARTE", fator: 12, valor: 188.23, fatorHecto: 0.05 },
  { codigo: "14293", descricao: "WALS TRIPPEL ONE WAY 375ML CX C/12 ARTE", fator: 12, valor: 166.59, fatorHecto: 0.05 },
  { codigo: "14550", descricao: "COLORADO APPIA ONE WAY 600ML CX C-12 ARTE", fator: 12, valor: 133.46, fatorHecto: 0.07 },
  { codigo: "16503", descricao: "BOHEMIA GFA VD 300ML CX C/23", fator: 23, valor: 38.28, fatorHecto: 0.07 },
  { codigo: "17266", descricao: "BOHEMIA LT 473ML CX CARTAO C/12", fator: 12, valor: 73.00, fatorHecto: 0.06 },
  { codigo: "17268", descricao: "PATAGONIA BOH PILS NACIONAL LN 355ML CX C/12", fator: 12, valor: 51.57, fatorHecto: 0.04 },
  { codigo: "17276", descricao: "PATAGONIA AMB LAG NACIONAL LN 355ML CX C/12", fator: 12, valor: 51.89, fatorHecto: 0.04 },
  { codigo: "17278", descricao: "PATAGONIA WEISSE NACIONAL LN 355ML CX C/12", fator: 12, valor: 54.15, fatorHecto: 0.04 },
  { codigo: "17757", descricao: "BECKS N LONG NECK 330ML SIX-PACK SHRINK C/4", fator: 24, valor: 98.82, fatorHecto: 0.08 },
  { codigo: "18142", descricao: "GOOSE ISLAND MIDWAY NAC LN 355ML CX C/12", fator: 12, valor: 81.76, fatorHecto: 0.04 },
  { codigo: "18267", descricao: "SODA LIMONADA ANTARCTICA PET 200ML SH C/12", fator: 12, valor: 12.24, fatorHecto: 0.02 },
  { codigo: "18268", descricao: "SUKITA PET 200ML SH C/12", fator: 12, valor: 12.47, fatorHecto: 0.02 },
  { codigo: "18676", descricao: "SKOL PURO MALTE LT 473ML SH C/12 NPAL", fator: 12, valor: 24.71, fatorHecto: 0.06 },
  { codigo: "18677", descricao: "SKOL PURO MALTE 600ML", fator: 12, valor: 75.00, fatorHecto: 0.07 },
  { codigo: "18780", descricao: "CORONITA EXTRA N OW 210ML CX C/4 SIX PACK", fator: 24, valor: 83.63, fatorHecto: 0.05 },
  { codigo: "18807", descricao: "STELLA ARTOIS LONG NECK 330ML SIX-PACK SHRINK C/4", fator: 24, valor: 101.72, fatorHecto: 0.08 },
  { codigo: "18833", descricao: "SKOL PURO MALTE LONG NECK 275ML SIX PACK CX04 PULL OFF", fator: 24, valor: 79.84, fatorHecto: 0.07 },
  { codigo: "18836", descricao: "CORONA EXTRA N LONG NECK 330ML CX C/24 NPAL", fator: 24, valor: 118.01, fatorHecto: 0.08 },
  { codigo: "19166", descricao: "COLORADO LAGER ONE WAY 600ML CX C-12 ARTE", fator: 12, valor: 112.88, fatorHecto: 0.07 },
  { codigo: "19225", descricao: "RED BULL BR LATA 250ML CX C 24 NPAL .", fator: 24, valor: 138.15, fatorHecto: 0.06 },
  { codigo: "19227", descricao: "RED BULL BR LATA 355ML FOUR PACK .", fator: 4, valor: 29.08, fatorHecto: 0.01 },
  { codigo: "19231", descricao: "RED BULL SUGAR FREE BR LATA 250ML FOUR PACK NPAL .", fator: 4, valor: 24.82, fatorHecto: 0.01 },
  { codigo: "19321", descricao: "GUARANA ANTARCTICA ZERO PET 200ML SH C/12", fator: 12, valor: 12.84, fatorHecto: 0.02 },
  { codigo: "19644", descricao: "SKOL PURO MALTE LT SLEEK 350ML SH C 12", fator: 12, valor: 28.51, fatorHecto: 0.04 },
  { codigo: "19729", descricao: "STELLA ARTOIS LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 28.85, fatorHecto: 0.03 },
  { codigo: "19849", descricao: "BOHEMIA_ LT SLEEK 350ML SH C 12", fator: 12, valor: 28.90, fatorHecto: 0.04 },
  { codigo: "20329", descricao: "BRAHMA DUPLO MALTE 600ML", fator: 12, valor: 54.69, fatorHecto: 0.07 },
  { codigo: "20498", descricao: "BRAHMA DUPLO MALTE LT SLEEK 350ML SH C 12", fator: 12, valor: 32.48, fatorHecto: 0.04 },
  { codigo: "20530", descricao: "STELLA ARTOIS 600 ML", fator: 12, valor: 64.71, fatorHecto: 0.07 },
  { codigo: "20533", descricao: "BRAHMA DUPLO MALTE GFA VD 1L", fator: 12, valor: 55.86, fatorHecto: 0.12 },
  { codigo: "20535", descricao: "STELLA ARTOIS ONE WAY 600ML CX C/12 NPAL", fator: 12, valor: 76.89, fatorHecto: 0.07 },
  { codigo: "20549", descricao: "BRAHMA DUPLO MALTE GFA VD 300ML CX C/23", fator: 23, valor: 44.19, fatorHecto: 0.07 },
  { codigo: "20651", descricao: "CORONA EXTRA N LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 29.95, fatorHecto: 0.03 },
  { codigo: "20853", descricao: "COLORADO LAGER LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 34.58, fatorHecto: 0.03 },
  { codigo: "21119", descricao: "SKOL BEATS GT LT 269ML CX CARTAO C/8 NPAL", fator: 8, valor: 31.27, fatorHecto: 0.02 },
  { codigo: "21441", descricao: "SUKITA LIMAO PET 2L CAIXA C/6", fator: 6, valor: 19.02, fatorHecto: 0.12 },
  { codigo: "21527", descricao: "TANQUERAY GIN LONDON DRY GARRAFA VIDRO 750ML", fator: 1, valor: 79.90, fatorHecto: 0.01 },
  { codigo: "21529", descricao: "ABSOLUT ORIGINAL GARRAFA VIDRO 1 L", fator: 1, valor: 77.85, fatorHecto: 0.01 },
  { codigo: "21530", descricao: "SMIRNOFF ORIGINAL GARRAFA VIDRO 998ML", fator: 1, valor: 30.28, fatorHecto: 0.01 },
  { codigo: "21632", descricao: "SPATEN N LN 355ML SIXPACK SH C/4", fator: 24, valor: 94.58, fatorHecto: 0.09 },
  { codigo: "21666", descricao: "RED BULL TROPICAL BR LATA 250ML FOUR PACK NPAL .", fator: 4, valor: 24.82, fatorHecto: 0.01 },
  { codigo: "21668", descricao: "SPATEN N ONE WAY 600ML CX C/12 NP ARTE", fator: 12, valor: 70.31, fatorHecto: 0.07 },
  { codigo: "21778", descricao: "JOHNNIE WALKER RED LABEL GARRAFA VIDRO 750ML", fator: 1, valor: 59.00, fatorHecto: 0.01 },
  { codigo: "21781", descricao: "SMIRNOFF ICE GARRAFA VD 275ML CX C24", fator: 24, valor: 154.89, fatorHecto: 0.07 },
  { codigo: "21789", descricao: "ORLOFF GARRAFA VIDRO 1 L", fator: 1, valor: 29.97, fatorHecto: 0.01 },
  { codigo: "21791", descricao: "PIRASSUNUNGA 51 GARRAFA VIDRO 965ML", fator: 1, valor: 9.30, fatorHecto: 0.01 },
  { codigo: "21792", descricao: "WHITE HORSE GARRAFA VIDRO 1 L", fator: 1, valor: 62.13, fatorHecto: 0.01 },
  { codigo: "21955", descricao: "CHIVAS REGAL 12 ANOS GARRAFA VIDRO 1 L", fator: 1, valor: 144.81, fatorHecto: 0.01 },
  { codigo: "21968", descricao: "TRIDENT HORTELA ENVELOPE 8G CX C/21", fator: 21, valor: 34.05, fatorHecto: 0.00 },
  { codigo: "21970", descricao: "TRIDENT MENTA ENVELOPE 8G CX C/21", fator: 21, valor: 34.05, fatorHecto: 0.00 },
  { codigo: "21973", descricao: "TRIDENT MELANCIA ENVELOPE 8G CX C/21", fator: 21, valor: 34.04, fatorHecto: 0.00 },
  { codigo: "21974", descricao: "TRIDENT TUTTI-FRUTTI ENVELOPE 8G CX C/21", fator: 21, valor: 34.05, fatorHecto: 0.00 },
  { codigo: "22003", descricao: "HALLS CEREJA ENVELOPE 28G CX C/21", fator: 21, valor: 21.85, fatorHecto: 0.01 },
  { codigo: "22005", descricao: "HALLS MENTA ENVELOPE 28G CX C/21", fator: 21, valor: 21.85, fatorHecto: 0.01 },
  { codigo: "22007", descricao: "HALLS EXTRA FORTE ENVELOPE 28G CX C/21", fator: 21, valor: 21.85, fatorHecto: 0.01 },
  { codigo: "22009", descricao: "CHICLETE ADAMS HORTELA CAIXINHA 2,8G CX C/100", fator: 100, valor: 18.65, fatorHecto: 0.00 },
  { codigo: "22027", descricao: "COLORADO APPIA LT SLEEK 350ML C8 CX CARTAO NPAL", fator: 8, valor: 35.00, fatorHecto: 0.03 },
  { codigo: "22106", descricao: "MINI OREO PCT 35G CX C/10", fator: 10, valor: 18.07, fatorHecto: 0.00 },
  { codigo: "22180", descricao: "BUDWEISER ZERO LONG NECK 330ML SIX-PACK SHRINK C/4", fator: 24, valor: 86.52, fatorHecto: 0.08 },
  { codigo: "22200", descricao: "TONICA ANTARCTICA PET 1 L SH C/06", fator: 6, valor: 27.31, fatorHecto: 0.06 },
  { codigo: "22202", descricao: "TONICA ANTARCTICA ZERO PET 1L SH C/06", fator: 6, valor: 25.67, fatorHecto: 0.06 },
  { codigo: "22326", descricao: "BRAHMA DUPLO MALTE LT 473ML SH C/12 NPAL", fator: 12, valor: 37.67, fatorHecto: 0.06 },
  { codigo: "22330", descricao: "MENDORATO PCT 27G CX C/60", fator: 60, valor: 26.53, fatorHecto: 0.02 },
  { codigo: "22562", descricao: "DOMECQ COQ. COMPOSTO GARRAFA VIDRO 1 L", fator: 1, valor: 42.19, fatorHecto: 0.01 },
  { codigo: "23028", descricao: "BUCHANANS WHISKY DELUXE 12 ANOS GARRAFA VIDRO 1 L", fator: 1, valor: 180.86, fatorHecto: 0.01 },
  { codigo: "29926", descricao: "JOHNNIE WALKER BLACK LABEL WHISKY ICONS GARRAFA VIDRO 1 L", fator: 1, valor: 177.42, fatorHecto: 0.01 },
  { codigo: "23184", descricao: "PITU AGUARDENTE LT 350ML CX C/12", fator: 12, valor: 48.03, fatorHecto: 0.04 },
  { codigo: "23246", descricao: "PIRACANJUBA LEITE CONDENSADO TETRAPAK 395G CX C/27", fator: 27, valor: 120.96, fatorHecto: 0.11 },
  { codigo: "23256", descricao: "PIRACANJUBA CREME DE LEITE TETRAPAK 200G CX C/27", fator: 27, valor: 72.63, fatorHecto: 0.05 },
  { codigo: "23269", descricao: "SKOL BEATS GT LONG NECK 269ML SIX-PACK SH C/4", fator: 24, valor: 115.95, fatorHecto: 0.06 },
  { codigo: "23271", descricao: "SKOL BEATS SENSES LONG NECK 269ML SIX-PACK SH C/4", fator: 24, valor: 107.11, fatorHecto: 0.06 },
  { codigo: "23443", descricao: "PITU AGUARDENTE GARRAFA VIDRO 965ML", fator: 1, valor: 9.50, fatorHecto: 0.01 },
  { codigo: "23449", descricao: "MIKES HARD LEMONADE N LT 269ML SH C12 NP", fator: 12, valor: 40.00, fatorHecto: 0.03 },
  { codigo: "23546", descricao: "INDAIA AGUA MINERAL C/GAS GFA PET 500ML PACK C/12", fator: 12, valor: 16.34, fatorHecto: 0.06 },
  { codigo: "23552", descricao: "INDAIA AGUA MINERAL S/GAS GFA PET 500ML PACK C/12", fator: 12, valor: 14.21, fatorHecto: 0.06 },
  { codigo: "23594", descricao: "PIRAKIDS BEBIDA LACTEA CHOCOLATE TETRA PAK 200 ML CX C/27", fator: 27, valor: 31.07, fatorHecto: 0.05 },
  { codigo: "24168", descricao: "MICHELOB ULTRA N LONG NECK 330ML SIX-PACK SHRINK C/4", fator: 24, valor: 130.86, fatorHecto: 0.08 },
  { codigo: "24256", descricao: "PETROPOLIS AGUA MIN SEM GAS PET 1,5 SHRINK C/6", fator: 6, valor: 9.50, fatorHecto: 0.09 },
  { codigo: "24306", descricao: "RED BULL MELANCIA LATA 250ML FOUR PACK NPAL", fator: 4, valor: 23.86, fatorHecto: 0.01 },
  { codigo: "24408", descricao: "QUINTA DO MORGADO VINHO TINTO SECO GFA VD 750 ML", fator: 1, valor: 13.77, fatorHecto: 0.01 },
  { codigo: "24410", descricao: "QUINTA DO MORGADO VINHO BRANCO SUAVE GFA VD 750 ML", fator: 1, valor: 16.00, fatorHecto: 0.01 },
  { codigo: "24479", descricao: "BOHEMIA LONG NECK 330ML SIX-PACK SHRINK C/4", fator: 24, valor: 78.42, fatorHecto: 0.08 },
  { codigo: "25151", descricao: "OLD PARR WHISKY GFA VDR 1L", fator: 1, valor: 108.92, fatorHecto: 0.01 },
  { codigo: "25160", descricao: "BLACK & WHITE WHISKY GFA VDR 1L", fator: 1, valor: 44.51, fatorHecto: 0.01 },
  { codigo: "25178", descricao: "51 ICE LIMAO GARRAFA VD 275ML CX C24", fator: 24, valor: 100.48, fatorHecto: 0.07 },
  { codigo: "25194", descricao: "CACHACA 51 LT 350ML CX C/12", fator: 12, valor: 29.82, fatorHecto: 0.04 },
  { codigo: "25220", descricao: "CACHACA 51 PIRASS OURO DESCARTAVEL GFA DE VDRO 965ML", fator: 1, valor: 12.30, fatorHecto: 0.01 },
  { codigo: "25546", descricao: "GARRAFEIRA PL. AL. LAT. AB. PRETA BEES 1 UN P/ 23 GFA 300ML", fator: 1, valor: 25.00, fatorHecto: 0.02 },
  { codigo: "25700", descricao: "FUSION PET 2L SHRINK C/6", fator: 6, valor: 31.02, fatorHecto: 0.12 },
  { codigo: "25837", descricao: "SPATEN N LT 473ML CX CARTAO C/12", fator: 12, valor: 85.90, fatorHecto: 0.06 },
  { codigo: "26462", descricao: "ORIGINAL LT 473ML CX CARTAO C/12", fator: 12, valor: 41.67, fatorHecto: 0.06 },
  { codigo: "26607", descricao: "RED BULL PITAYA LATA 250ML FOUR PACK NPAL", fator: 4, valor: 25.01, fatorHecto: 0.01 },
  { codigo: "27001", descricao: "GORDONS GIN DRY GFA VD 750 ML", fator: 1, valor: 54.90, fatorHecto: 0.01 },
  { codigo: "27177", descricao: "HALLS MENTOL ENVELOPE 28G CX C/21", fator: 21, valor: 21.85, fatorHecto: 0.01 },
  { codigo: "27179", descricao: "HALLS MORANGO ENVELOPE 28G CX C/21", fator: 21, valor: 21.85, fatorHecto: 0.01 },
  { codigo: "27522", descricao: "CACHACA 51 PIRASSUNUNGA GFA VD 965ML RET CX/12", fator: 12, valor: 64.28, fatorHecto: 0.12 },
  { codigo: "27559", descricao: "CACHACA 51 PIRASSUNUNGA OURO GFA VD 965ML RET CX/12", fator: 12, valor: 89.64, fatorHecto: 0.12 },
  { codigo: "27686", descricao: "MIKES HARD LEMONADE N LONG NECK 275ML SIX PACK SH C/4", fator: 24, valor: 126.46, fatorHecto: 0.07 },
  { codigo: "27866", descricao: "CORONA CERO SUNBREW N LONG NECK 330 ML SP BASKET CX C4", fator: 24, valor: 119.80, fatorHecto: 0.08 },
  { codigo: "28137", descricao: "SKOL BEATS CAIPIRINHA LT 269ML CX CARTAO C/8 NPAL", fator: 8, valor: 32.58, fatorHecto: 0.02 },
  { codigo: "28203", descricao: "BUBBALOO MORANGO DISPLAY 300G", fator: 1, valor: 11.31, fatorHecto: 0.00 },
  { codigo: "28204", descricao: "BUBBALOO UVA DISPLAY 300G", fator: 1, valor: 10.99, fatorHecto: 0.00 },
  { codigo: "29197", descricao: "TANG REFRESCO EM PO LIMAO PCT 18G DP C/18", fator: 18, valor: 13.38, fatorHecto: 0.00 },
  { codigo: "29199", descricao: "TANG REFRESCO EM PO LARANJA PCT 18G DP C/18", fator: 18, valor: 13.37, fatorHecto: 0.00 },
  { codigo: "29201", descricao: "TANG REFRESCO EM PO ABACAXI PCT 18G DP C/18", fator: 18, valor: 13.38, fatorHecto: 0.00 },
  { codigo: "29207", descricao: "TANG REFRESCO EM PO MORANGO PCT 18G DP C/18", fator: 18, valor: 13.37, fatorHecto: 0.00 },
  { codigo: "29209", descricao: "TANG REFRESCO EM PO MARACUJA PCT 18G DP C/18", fator: 18, valor: 13.37, fatorHecto: 0.00 },
  { codigo: "29215", descricao: "TANG REFRESCO EM PO UVA PCT 18G DP C/18", fator: 18, valor: 13.37, fatorHecto: 0.00 },
  { codigo: "29253", descricao: "ORIGINAL GFA VD 1L", fator: 12, valor: 62.85, fatorHecto: 0.12 },
  { codigo: "29485", descricao: "SKOL BEATS CAIPIRINHA LONG NECK 269ML SIX-PACK SH C/4", fator: 24, valor: 122.65, fatorHecto: 0.06 },
  { codigo: "29504", descricao: "OLD PARR WHISKY 12 ANOS GFA VD 750 ML", fator: 1, valor: 98.90, fatorHecto: 0.01 },
  { codigo: "29505", descricao: "CIROC VODKA GFA VD 750 ML", fator: 1, valor: 162.39, fatorHecto: 0.01 },
  { codigo: "29508", descricao: "JOHNNIE WALKER WHISKY GOLD LABEL RESERVE GFA VD 750 ML", fator: 1, valor: 201.64, fatorHecto: 0.01 },
  { codigo: "29518", descricao: "JOHNNIE WALKER WHISKY BLONDE GFA VD 750 ML", fator: 1, valor: 50.61, fatorHecto: 0.01 },
  { codigo: "29580", descricao: "STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4", fator: 24, valor: 106.95, fatorHecto: 0.08 },
  { codigo: "29845", descricao: "PEPSI BLACK PET 1 L SH C/12", fator: 12, valor: 34.44, fatorHecto: 0.12 },
  { codigo: "30045", descricao: "RED BULL BR LATA 473ML CX C 12", fator: 12, valor: 96.18, fatorHecto: 0.06 },
  { codigo: "30852", descricao: "BUBBALOO BALA TUTTI FRUTI DISPLAY 15G CX/12", fator: 12, valor: 14.00, fatorHecto: 0.00 },
  { codigo: "30854", descricao: "BUBBALOO BALA MIX DISPLAY 15G CX/12", fator: 12, valor: 14.00, fatorHecto: 0.00 },
  { codigo: "31064", descricao: "BUDWEISER LT 269ML SH C 15", fator: 15, valor: 33.68, fatorHecto: 0.04 },
  { codigo: "31272", descricao: "FUSION LT 473ML SH C/12 NPAL", fator: 12, valor: 45.00, fatorHecto: 0.06 },
  { codigo: "32067", descricao: "GATORADE BERRY BLUE PET 500ML SIXPACK", fator: 6, valor: 22.72, fatorHecto: 0.03 },
  { codigo: "32126", descricao: "AMINDUS GRELHADITOS AMEND. TOR. S/ PELE PCT 24G FD C/60", fator: 60, valor: 26.53, fatorHecto: 0.01 },
  { codigo: "32128", descricao: "PACOQUITA QUADRADA PCT PL 18G DSP C/24", fator: 24, valor: 10.01, fatorHecto: 0.00 },
  { codigo: "32131", descricao: "PACOQUITA ROLHA EMBALADA PCT 15G PT/50", fator: 50, valor: 18.35, fatorHecto: 0.01 },
  { codigo: "32155", descricao: "PACOQUITA ZERO QUADRADA PCT PL 18G DSP C/24", fator: 24, valor: 21.25, fatorHecto: 0.00 },
  { codigo: "32349", descricao: "BEATS TROPICAL LT 269ML CX CARTAO C/8 NPAL", fator: 8, valor: 32.12, fatorHecto: 0.02 },
  { codigo: "32361", descricao: "BEATS TROPICAL LONG NECK 269ML SIX-PACK SH C/4", fator: 24, valor: 123.34, fatorHecto: 0.06 },
  { codigo: "32425", descricao: "FUSION MELANCIA LT 473ML SH C/12 NPAL", fator: 12, valor: 51.48, fatorHecto: 0.06 },
  { codigo: "32427", descricao: "FUSION TROPICAL LT 473ML SH C/12 NPAL", fator: 12, valor: 45.00, fatorHecto: 0.06 },
  { codigo: "32644", descricao: "BUBBALOO UVA DISPLAY 5G CX/60", fator: 60, valor: 12.44, fatorHecto: 0.00 },
  { codigo: "32646", descricao: "BUBBALOO TUTTI FRUTTI DISPLAY 5G CX/60", fator: 60, valor: 12.44, fatorHecto: 0.00 },
  { codigo: "32648", descricao: "BUBBALOO MORANGO DISPLAY 5G CX/60", fator: 60, valor: 12.44, fatorHecto: 0.00 },
  { codigo: "33109", descricao: "51 OURO AGUARDENTE COMPOSTA LT 350ML CX C/12", fator: 12, valor: 50.02, fatorHecto: 0.04 },
  { codigo: "33734", descricao: "BEATS RED MIX LT 269ML SH C/8", fator: 8, valor: 35.29, fatorHecto: 0.02 },
  { codigo: "33738", descricao: "BEATS RED MIX LONG NECK 269ML SIX-PACK SH C/2", fator: 12, valor: 67.23, fatorHecto: 0.03 },
  { codigo: "22859", descricao: "PIRAQUE LEITE MALTADO PCT 160G CX C/40", fator: 40, valor: 140.00, fatorHecto: 0.06 },
  { codigo: "22860", descricao: "PIRAQUE BISC AGUA GERGELIM PCT 240G CX C/40", fator: 40, valor: 70.00, fatorHecto: 0.10 },
  { codigo: "22871", descricao: "PIRAQUE ROLAD. GOIABA PCT 75G CX C/40", fator: 40, valor: 120.80, fatorHecto: 0.03 },
  { codigo: "22876", descricao: "PIRAQUE SALG QUEIJINHO PCT 100G CX C/20", fator: 20, valor: 50.00, fatorHecto: 0.02 },
  { codigo: "24184", descricao: "PIRAQUE MALTADO COBERTO PCT 80G CX C/40", fator: 40, valor: 120.80, fatorHecto: 0.03 },
  { codigo: "30132", descricao: "VITARELLA BISC MARIA TRADICIONAL PCT 350G CX 24", fator: 24, valor: 70.00, fatorHecto: 0.08 },
  { codigo: "30134", descricao: "VITARELLA BISC MAIZENA TRADICIONAL PCT 350G CX 24", fator: 24, valor: 70.00, fatorHecto: 0.08 },
  { codigo: "30136", descricao: "VITARELLA CREAM CRACKER TRADICIONAL PCT 350G CX 24", fator: 24, valor: 89.75, fatorHecto: 0.08 },
  { codigo: "30148", descricao: "TRELOSO BISCOITO RECHEADO CHOCOLATE PCT 120G CX/36", fator: 36, valor: 53.28, fatorHecto: 0.04 },
  { codigo: "30151", descricao: "TRELOSO RECHEADO BAUNILHA CHOCORESCO PCT 120G CX/36", fator: 36, valor: 53.28, fatorHecto: 0.04 },
  { codigo: "30152", descricao: "TRELOSO BISCOITO RECHEADO MORANGO PCT 120G CX/36", fator: 36, valor: 53.28, fatorHecto: 0.04 },
  { codigo: "30220", descricao: "PIRAQUE NEWAFER CHOCOLATE PCT PLAST 100G CX/20", fator: 20, valor: 50.60, fatorHecto: 0.02 },
  { codigo: "30440", descricao: "ISABELA BISCOITO SABOR LEITE PCT 350G CX 24", fator: 24, valor: 70.00, fatorHecto: 0.08 },
  { codigo: "32036", descricao: "PIRAQUE MAIZENA PCT PLAST 175G C48", fator: 48, valor: 94.08, fatorHecto: 0.08 },
  { codigo: "32754", descricao: "PIRAQUE BISC DOCE C/ LEITE MALT BLACK PCT PLAST 132G C50", fator: 50, valor: 159.00, fatorHecto: 0.07 },
  { codigo: "34681", descricao: "PIRAQUE RECH PRETTY PCT 76G CX40", fator: 40, valor: 65.00, fatorHecto: 0.03 },
  { codigo: "34683", descricao: "PIRAQUE RECH LIMAO PCT 76G CX40", fator: 40, valor: 90.00, fatorHecto: 0.03 },
  { codigo: "34685", descricao: "PIRAQUE RECH CHOCOLATE PCT 76G CX40", fator: 40, valor: 90.00, fatorHecto: 0.03 },
  { codigo: "34687", descricao: "PIRAQUE RECH MORANGO PCT 76G CX40", fator: 40, valor: 65.00, fatorHecto: 0.03 },
  { codigo: "34296", descricao: "TRIDENT CANELA ENVELOPE 8G CX C/21", fator: 21, valor: 31.23, fatorHecto: 0.00 },
  { codigo: "34298", descricao: "TRIDENT MORANGO ENVELOPE 8G CX C/21", fator: 21, valor: 31.23, fatorHecto: 0.00 },
  { codigo: "29733", descricao: "HALLS MELANCIA ENVELOPE 28G CX C/21", fator: 21, valor: 19.97, fatorHecto: 0.01 },
  { codigo: "10530", descricao: "ANTARCTICA SUBZERO GFA VD 1L", fator: 12, valor: 78.40, fatorHecto: 0.12 },
  { codigo: "32175", descricao: "CROKISSIMO AMEND CROC LEV SALGADO PCT 24G FD/36", fator: 36, valor: 127.38, fatorHecto: 0.01 },
  { codigo: "22514", descricao: "BALLANTINES FINEST GARRAFA VIDRO 750ML", fator: 1, valor: 50.39, fatorHecto: 0.01 },
  { codigo: "34410", descricao: "HALLS UVA VERDE ENVELOPE 28G CX C/21", fator: 21, valor: 30.90, fatorHecto: 0.01 },
  { codigo: "34263", descricao: "CORONA CERO SUNBREW N LT SLEEK 350ML C 8 CX CARTAO", fator: 8, valor: 28.21, fatorHecto: 0.03 },
  { codigo: "9071", descricao: "CARACU LATA 350ML SH C/12 NPAL", fator: 12, valor: 51.10, fatorHecto: 0.04 },
  { codigo: "9081", descricao: "MALZBIER BRAHMA LATA 350ML SH C/12 NPAL", fator: 12, valor: 37.90, fatorHecto: 0.04 },
  { codigo: "9093", descricao: "PEPSI TWIST LATA 350ML SH C/12 NPAL", fator: 12, valor: 28.92, fatorHecto: 0.04 },
  { codigo: "24304", descricao: "TODDYNHO 200ML TETRA PAK 200 ML CX C/27", fator: 27, valor: 55.56, fatorHecto: 0.05 },
  { codigo: "31582", descricao: "YPE LAVA LOUCAS LIQUIDO CLEAR FRASCO PLASTICO 500 ML C24", fator: 24, valor: 46.10, fatorHecto: 0.12 },
  { codigo: "31589", descricao: "YPE LAVA LOUCAS LIQUIDO MACA FRASCO PLASTICO 500 ML C24", fator: 24, valor: 46.10, fatorHecto: 0.12 },
  { codigo: "31667", descricao: "YPE LAVA LOUCAS LIQUIDO NEUTRO FRASCO PLASTICO 500 ML C24", fator: 24, valor: 46.10, fatorHecto: 0.12 },
  { codigo: "31669", descricao: "YPE LAVA LOUCAS LIQUIDO COCO FRASCO PLASTICO 500 ML C24", fator: 24, valor: 46.10, fatorHecto: 0.12 },
  { codigo: "33042", descricao: "YPE LAVA LOUCAS LIQUIDO LIMAO FRASCO PLASTICO 500 ML C24", fator: 24, valor: 46.93, fatorHecto: 0.12 },
  { codigo: "33046", descricao: "YPE TIXAN LAVA ROUPAS PO MACIEZ SACHE PLASTICO 800G CX20", fator: 20, valor: 168.40, fatorHecto: 0.16 },
  { codigo: "33048", descricao: "YPE TIXAN LAVA ROUPAS PO PRIMAV SACHE PLASTICO 800G CX20", fator: 20, valor: 168.40, fatorHecto: 0.16 },
  { codigo: "33061", descricao: "YPE TIXAN LAVA ROUPAS PO MACIEZ SACHE 400G CX C/24", fator: 24, valor: 90.06, fatorHecto: 0.10 },
  { codigo: "33066", descricao: "YPE TIXAN LAVA ROUPAS PO PRIMAV SACHE 400G CX C/24", fator: 24, valor: 90.06, fatorHecto: 0.10 },
  { codigo: "34420", descricao: "RED BULL SUMMER MARACUJA E MELAO LATA 250ML FOUR PACK NPAL", fator: 4, valor: 29.16, fatorHecto: 0.01 },
  { codigo: "34429", descricao: "RED BULL SUGAR FREE AMORA LATA 250ML FOUR PACK NPAL", fator: 4, valor: 31.96, fatorHecto: 0.01 },
  { codigo: "34479", descricao: "ELEVE AGUA MIN S GAS PET 1,5 SHRINK C/6", fator: 6, valor: 13.42, fatorHecto: 0.09 },
  { codigo: "34770", descricao: "RED BULL SUGAR FREE POMELO LATA 250ML FOUR PACK NPAL", fator: 4, valor: 31.96, fatorHecto: 0.01 },
  { codigo: "35003", descricao: "TRIDENT XFRESH 5S PRETO CEREJA ENVELOPE 8G CX C/21", fator: 21, valor: 34.04, fatorHecto: 0.00 },
  { codigo: "371", descricao: "MALZBIER BRAHMA LONG NECK 355ML SIX-PACK BANDEJA C/4", fator: 24, valor: 115.80, fatorHecto: 0.09 },
  { codigo: "1164", descricao: "SUKITA UVA LATA 350ML SH C/12 NPAL", fator: 12, valor: 25.00, fatorHecto: 0.04 },
  { codigo: "8411", descricao: "GUARANA CHP ANTARCTICA PET 1,5 SHRINK C/6", fator: 6, valor: 25.00, fatorHecto: 0.09 },
  { codigo: "18752", descricao: "PATAGONIA WEISSE NACIONAL ONE WAY 740ML CX6", fator: 6, valor: 71.96, fatorHecto: 0.04 },
  { codigo: "18772", descricao: "PATAGONIA AMB LAG NACIONAL ONE WAY 740ML CX6", fator: 6, valor: 71.96, fatorHecto: 0.04 },
  { codigo: "22382", descricao: "PASSPORT SELECTION GARRAFA VIDRO 1 L", fator: 1, valor: 31.79, fatorHecto: 0.01 },
  { codigo: "22508", descricao: "PERGOLA SEL. VINHO TINTO SUAVE GARRAFA VIDRO 750ML", fator: 1, valor: 19.93, fatorHecto: 0.01 },
  { codigo: "25429", descricao: "MATUTA CACHACA CRISTAL GARRAFA VIDRO 1 L", fator: 1, valor: 21.92, fatorHecto: 0.01 },
  { codigo: "25430", descricao: "MATUTA CACHACA UMBURANA GARRAFA VIDRO 1 L", fator: 1, valor: 25.28, fatorHecto: 0.01 },
  { codigo: "27560", descricao: "CASILLERO DEL DIABLO VINH RESERVA MALBEC GFA VD 750 ML", fator: 1, valor: 51.57, fatorHecto: 0.01 },
  { codigo: "27562", descricao: "CASILLERO DEL DIABLO VINH RESERVA MERLOT GFA VD 750 ML", fator: 1, valor: 51.57, fatorHecto: 0.01 },
  { codigo: "27566", descricao: "RESERVADO VINHO SWEET RED GFA VD 750 ML", fator: 1, valor: 28.81, fatorHecto: 0.01 },
  { codigo: "27613", descricao: "CASILLERO DEL DIABLO VNH RSV CABER SAUVG GFA VD 750 ML", fator: 1, valor: 51.57, fatorHecto: 0.01 },
  { codigo: "27624", descricao: "RESERVADO VINHO MALBEC GFA VD 750 ML", fator: 1, valor: 28.81, fatorHecto: 0.01 },
  { codigo: "32538", descricao: "PERGOLA SEL. VINHO TINTO SUAVE GARRAFA VIDRO 1 L", fator: 1, valor: 21.50, fatorHecto: 0.01 },
  { codigo: "34529", descricao: "YPE TIXAN LAVA ROUPAS LIQ MACIEZ FRASCO PLAST 1L CX12", fator: 12, valor: 120.60, fatorHecto: 0.12 },
  { codigo: "31713", descricao: "YPE AMACIANTE CONC PINK FRASCO PLAST 500ML CX/12", fator: 12, valor: 86.21, fatorHecto: 0.06 },
  { codigo: "31789", descricao: "YPE AMACIANTE TRADICIONAL ACONCHEGO FRASCO PLASTICO 2 L CX6", fator: 6, valor: 47.68, fatorHecto: 0.12 },
  { codigo: "34890", descricao: "YPE ASSOLAN ESPONJA LA ACO CX PAPEL CART 1,6KG LEVE 20 PAG 18", fator: 1, valor: 25.00, fatorHecto: 0.02 },
  { codigo: "31805", descricao: "YPE TIXAN LAVA ROUPAS LIQ PRIMAVERA FRASCO PLAST 1 L CX12", fator: 12, valor: 120.60, fatorHecto: 0.12 },
  { codigo: "34527", descricao: "YPE AMACIANTE TRADICIONAL ACONCHEGO FRASCO PLASTICO 500 ML C24", fator: 24, valor: 62.51, fatorHecto: 0.12 },
  { codigo: "31708", descricao: "YPE AMACIANTE CONC BLUE GARDEN FRASCO PLAST 500ML CX/12", fator: 12, valor: 83.80, fatorHecto: 0.06 },
  { codigo: "34320", descricao: "GUARANA ANTARCTICA ZERO LATA 350ML SH C/12 NPAL MULTIPACK", fator: 12, valor: 35.88, fatorHecto: 0.04 },
  { codigo: "34432", descricao: "RED BULL TROPICAL BR LATA 473ML CX C 12", fator: 12, valor: 140.44, fatorHecto: 0.06 },
  { codigo: "24411", descricao: "QUINTA DO MORGADO VINHO BRANCO SECO GFA VD 750 ML", fator: 1, valor: 13.77, fatorHecto: 0.01 },
  { codigo: "25329", descricao: "SALTON ESPUMANTE BRUT GFA VD 750 ML", fator: 1, valor: 40.18, fatorHecto: 0.01 },
  { codigo: "25335", descricao: "SALTON ESPUMANTE BRUT ROSE GFA VD 750 ML", fator: 1, valor: 40.18, fatorHecto: 0.01 },
  { codigo: "25347", descricao: "SALTON ESPUMANTE CLASSIC MOSCATEL GFA VD 750 ML", fator: 1, valor: 40.18, fatorHecto: 0.01 },
  { codigo: "22543", descricao: "ROCKS STRAMBERRY GARRAFA VIDRO 1 L", fator: 1, valor: 24.32, fatorHecto: 0.01 },
  { codigo: "29891", descricao: "ROCKS DRY GIN GARRAFA VIDRO 1 L", fator: 1, valor: 24.32, fatorHecto: 0.01 },
  { codigo: "32969", descricao: "RED BULL SUMMER MORANGO E PESSEGO LATA 250ML FOUR PACK NPAL", fator: 4, valor: 31.96, fatorHecto: 0.01 },
  { codigo: "25434", descricao: "MATUTA CACHACA MEL E LIMAO GARRAFA VIDRO 1 L", fator: 1, valor: 42.80, fatorHecto: 0.01 },
  { codigo: "35617", descricao: "BEATS GREEN MIX LT 269ML SH C/8", fator: 8, valor: 38.71, fatorHecto: 0.02 },
  { codigo: "35136", descricao: "YPE SABAO BARRA MULTIATIVO PCT PLAST 800G", fator: 1, valor: 8.95, fatorHecto: 0.01 },
  { codigo: "35134", descricao: "YPE SABAO BARRA NEUTRO PCT PLAST 800G", fator: 1, valor: 8.95, fatorHecto: 0.01 },
  { codigo: "36034", descricao: "BUDWEISER LT 473ML SH C12 NP MULTIPACK", fator: 12, valor: 64.88, fatorHecto: 0.06 },
  { codigo: "35620", descricao: "BEATS GREEN MIX LONG NECK 269ML SIX-PACK SH C/4", fator: 24, valor: 135.00, fatorHecto: 0.06 },
  { codigo: "35108", descricao: "CERVEGELA PLASTICA SPATEN 1 UN P/ GFA 600ML CX3", fator: 3, valor: 51.77, fatorHecto: 0.00 },
  { codigo: "21788", descricao: "BALLANTINES FINEST GARRAFA VIDRO 1 L", fator: 1, valor: 83.39, fatorHecto: 0.01 },
  { codigo: "22563", descricao: "CHIVAS REGAL 12 ANOS GARRAFA VIDRO 750ML", fator: 1, valor: 75.00, fatorHecto: 0.01 },
  { codigo: "24161", descricao: "S. JOAO BARRA CONHAQUE ALC. GARRAFA VIDRO 900ML", fator: 1, valor: 19.30, fatorHecto: 0.01 },
  { codigo: "35061", descricao: "YPE AMACIANTE CONC BLUE GARDEN FRASCO PLAST 500 ML", fator: 1, valor: 83.80, fatorHecto: 0.01 },
  { codigo: "30878", descricao: "YPE AMACIANTE TRADICIONAL ACONCHEGO FRASCO PLASTICO 2L", fator: 1, valor: 58.43, fatorHecto: 0.02 },
  { codigo: "31674", descricao: "YPE AMACIANTE INTENSO FRASCO PLASTICO 2 L CX6", fator: 6, valor: 47.68, fatorHecto: 0.12 },
  { codigo: "31678", descricao: "YPE AMACIANTE CONC BLUE GARDEN FRASCO PLAST 1 L CX12", fator: 12, valor: 166.00, fatorHecto: 0.12 },
  { codigo: "33854", descricao: "YPE TIXAN LAVA ROUPAS LIQ PRIMAVERA FRASCO PLAST 1L", fator: 1, valor: 120.60, fatorHecto: 0.01 },
  { codigo: "35012", descricao: "MENDORATO PCT 45G DISPLAY C10", fator: 10, valor: 13.95, fatorHecto: 0.00 },
  { codigo: "34920", descricao: "DIAS DAVILA AGUA MINERAL S GAS GFA PET 1,5L FD C/6", fator: 6, valor: 20.12, fatorHecto: 0.09 },
  { codigo: "34923", descricao: "DIAS DAVILA AGUA MINERAL C GAS GFA PET 500ML PACK C/12", fator: 12, valor: 19.59, fatorHecto: 0.06 },
  { codigo: "34918", descricao: "DIAS DAVILA AGUA MINERAL S GAS GFA PET 500ML PACK C/12", fator: 12, valor: 19.54, fatorHecto: 0.06 },
  { codigo: "35980", descricao: "CASAL GARCIA VINHO ROSE GFA VD 750 ML", fator: 1, valor: 53.49, fatorHecto: 0.01 },
  { codigo: "35992", descricao: "CASAL GARCIA VINHO BR VERDE GFA VD 750 ML", fator: 1, valor: 51.00, fatorHecto: 0.01 },
  { codigo: "13203", descricao: "ANTARCTICA PILSEN GFA VD 300ML CX C/23", fator: 23, valor: 53.90, fatorHecto: 0.07 },
  { codigo: "33818", descricao: "ORIGINAL LATA 350ML SHRINK C/12 MULTPACK", fator: 12, valor: 37.58, fatorHecto: 0.04 },
  { codigo: "9427", descricao: "ANTARCTICA PILSEN LT 473ML SH C/12 NPAL", fator: 12, valor: 45.90, fatorHecto: 0.06 },
  { codigo: "37576", descricao: "DOCES VIEIRA PE DE MOCA PCT PLAST 23G POTE C/40", fator: 40, valor: 40.91, fatorHecto: 0.01 },
  { codigo: "37579", descricao: "DOCES VIEIRA BEIJO DE LEITE PCT PLAST 23G POTE C/40", fator: 40, valor: 51.03, fatorHecto: 0.01 },
  { codigo: "37580", descricao: "DOCES VIEIRA CHURRITOS PCT PLAST 23G POTE C/40", fator: 40, valor: 48.90, fatorHecto: 0.01 },
  { codigo: "37581", descricao: "DOCES VIEIRA COCADA BAIANA PCT PLAST 23G POTE C/40", fator: 40, valor: 51.03, fatorHecto: 0.01 },
  { codigo: "37582", descricao: "DOCES VIEIRA COCADA BRANCA PCT PLAST 23G POTE C/40", fator: 40, valor: 48.90, fatorHecto: 0.01 },
  { codigo: "37583", descricao: "DOCES VIEIRA BEIJO DE MOCA PCT PLAST 23G POTE C/40", fator: 40, valor: 39.20, fatorHecto: 0.01 },
  { codigo: "23671", descricao: "CERVEGELA PLASTICA BRAHMA 1 UN P/ GFA 1L CX C/3", fator: 3, valor: 51.77, fatorHecto: 0.01 },
  { codigo: "23672", descricao: "CERVEGELA PLASTICA BRAHMA 1 UN P/ GFA 600ML CX C/3", fator: 3, valor: 51.77, fatorHecto: 0.00 },
  { codigo: "29416", descricao: "CERVEGELA BUDWEISER 1 UN P/ GF 600ML CX3", fator: 3, valor: 51.77, fatorHecto: 0.02 },
  { codigo: "29418", descricao: "CERVEGELA BUDWEISER LITRAO 1 UN P/ GF 1L PACK C3", fator: 3, valor: 51.77, fatorHecto: 0.03 },
  { codigo: "24604", descricao: "MINALBA AGUA PREMIUM C/GAS GFA VDR 300ML CX/12", fator: 12, valor: 56.70, fatorHecto: 0.04 },
  { codigo: "24609", descricao: "MINALBA AGUA PREMIUM S/GAS GFA VDR 300ML CX/12", fator: 12, valor: 49.00, fatorHecto: 0.04 },
  { codigo: "37933", descricao: "DOCES VIEIRA BRIGADEIRO PCT PLAST 23G POTE C/40", fator: 40, valor: 48.90, fatorHecto: 0.01 },
  { codigo: "34454", descricao: "H2OH LIMONETO LT SLEEK 350ML SH C 12", fator: 12, valor: 33.60, fatorHecto: 0.04 },
  { codigo: "1708", descricao: "GUARANA ANTARCTICA ZERO PET 2,5L CAIXA C/6", fator: 6, valor: 48.00, fatorHecto: 0.15 },
  { codigo: "25303", descricao: "GARRAFEIRA PL. PRETO BEES 1 UN P/24 GFA 600ML", fator: 1, valor: 31.16, fatorHecto: 0.02 },
  { codigo: "24486", descricao: "GALLO AZEITE OLIVA EX. VIR. GFA VDR 500ML", fator: 1, valor: 29.97, fatorHecto: 0.005 },
  { codigo: "24488", descricao: "GALLO AZEITE OLIVA EX. VIR. GFA VDR 250ML", fator: 1, valor: 17.21, fatorHecto: 0.0025 },
  { codigo: "33857", descricao: "STELLA ARTOIS PURE GOLD 600ML", fator: 12, valor: 108.00, fatorHecto: 0.07 },
  { codigo: "37450", descricao: "BUDWEISER LT SLEEK 350ML SH C 12 MULTIPACK", fator: 12, valor: 41.69, fatorHecto: 0.04 },
  { codigo: "31795", descricao: "BRUTAL FRUIT LONG NECK 275ML SIX PACK SH C 2", fator: 12, valor: 103.80, fatorHecto: 0.03 },
  { codigo: "35338", descricao: "BUDWEISER ZERO LT 473ML SH C/12 NPAL", fator: 12, valor: 55.90, fatorHecto: 0.06 },
  { codigo: "33212", descricao: "SKOL BEATS SENSES PET 1 L SH C/06", fator: 6, valor: 75.36, fatorHecto: 0.06 }
];

let cachedProducts: ProductInfo[] | null = null;

export const clearProductsCache = () => {
  cachedProducts = null;
};

export const setProductsCache = (newList: ProductInfo[]) => {
  cachedProducts = newList;
  if (typeof window !== "undefined") {
    safeSetItem("sstr_products_database", JSON.stringify(newList));
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    cachedProducts = null;
  });
}

export function extractFatorFromDescricao(descricao: string): number {
  const descUpper = descricao.toUpperCase();
  const match = descUpper.match(/\b(?:CX|FD|C\/|C-|C\s+|C)([0-9]+)\b/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > 0 && val <= 100) {
      return val;
    }
  }
  return 12; // Standard default
}

export const getProductsDatabase = (): ProductInfo[] => {
  if (cachedProducts) return cachedProducts;
  if (typeof window === "undefined") {
    return DEFAULT_PRODUCT_DATABASE;
  }
  const saved = localStorage.getItem("sstr_products_database");
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as ProductInfo[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge defaults to ensure no new products are missing
        const mergedMap = new Map<string, ProductInfo>();
        DEFAULT_PRODUCT_DATABASE.forEach(p => mergedMap.set(p.codigo, p));
        parsed.forEach(p => {
          if (p && p.codigo) {
            const defaultItem = mergedMap.get(p.codigo);
            mergedMap.set(p.codigo, {
              ...defaultItem,
              ...p,
              fator: p.fator && p.fator > 0 ? p.fator : (defaultItem?.fator || extractFatorFromDescricao(p.descricao)),
              valor: p.valor && p.valor > 0 ? p.valor : (defaultItem?.valor || 0),
              fatorHecto: p.fatorHecto && p.fatorHecto > 0 ? p.fatorHecto : (defaultItem?.fatorHecto || 0.04)
            });
          }
        });
        const mergedList = Array.from(mergedMap.values());
        cachedProducts = mergedList;
        return mergedList;
      }
    } catch (e) {
      console.error("Error reading sstr_products_database", e);
    }
  }
  
  safeSetItem("sstr_products_database", JSON.stringify(DEFAULT_PRODUCT_DATABASE));
  cachedProducts = DEFAULT_PRODUCT_DATABASE;
  return DEFAULT_PRODUCT_DATABASE;
};

export const PRODUCT_DATABASE: ProductInfo[] = new Proxy([] as ProductInfo[], {
  get(target, prop) {
    const list = getProductsDatabase();
    const val = (list as any)[prop];
    if (typeof val === "function") {
      return val.bind(list);
    }
    return val;
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getProductsDatabase(), prop);
  },
  ownKeys(target) {
    return Reflect.ownKeys(getProductsDatabase());
  }
});

export function getProductByCodeOrName(term: string): ProductInfo | undefined {
  const t = term.trim().toLowerCase();
  if (!t) return undefined;
  const list = getProductsDatabase();
  return list.find(
    (p) => p.codigo === t || p.codigo === t.replace(/^0+/, "") || p.descricao.toLowerCase().includes(t)
  );
}

// Calculate accurate HL for single item accounting for UND vs CX unit of measure
export function calculateItemHL(item: {
  item?: string;
  itemCode?: string;
  codigo?: string;
  quantidade?: number;
  unidadeMedida?: string;
  fatorEmbalagem?: number;
  fatorHecto?: number;
  hectolitros?: number;
  descricao?: string;
}): number {
  const rawCode = String(item.item || item.itemCode || item.codigo || "").trim();
  const list = getProductsDatabase();
  const cleanCode = rawCode.replace(/^#/, "").trim().replace(/^0+/, "");
  const numericCode = rawCode.replace(/[^0-9]/g, "");

  let dbProduct = rawCode ? list.find(p => 
    p.codigo === rawCode || 
    p.codigo === cleanCode || 
    (numericCode && (p.codigo === numericCode || p.codigo.replace(/^0+/, "") === numericCode))
  ) : undefined;

  if (!dbProduct && item.descricao) {
    dbProduct = getProductByCodeOrName(item.descricao);
  }
  
  const boxFactorHecto = dbProduct?.fatorHecto ?? item.fatorHecto ?? 0.04;
  const embalagem = dbProduct?.fator && dbProduct.fator > 0 ? dbProduct.fator : (item.fatorEmbalagem || 12);
  const umStr = (item.unidadeMedida || (item as any).um || "").toLowerCase().trim();
  const isCx = umStr === "cx" || umStr === "caixa" || umStr === "cxs" || umStr === "caixas" || umStr === "cx.";
  const isUnd = !isCx;
  const qty = item.quantidade || 1;

  const hl = isUnd ? ((qty / embalagem) * boxFactorHecto) : (qty * boxFactorHecto);
  return Number(hl.toFixed(4));
}

// Calculate accurate Financial Value (R$) for single item accounting for UND vs CX unit of measure
export function calculateItemValue(item: {
  item?: string;
  itemCode?: string;
  codigo?: string;
  quantidade?: number;
  unidadeMedida?: string;
  fatorEmbalagem?: number;
  customUnitPrice?: number;
  precoCalculated?: number;
  precoSugerido?: number;
  descricao?: string;
}): number {
  const rawCode = String(item.item || item.itemCode || item.codigo || "").trim();
  const list = getProductsDatabase();
  const cleanCode = rawCode.replace(/^#/, "").trim().replace(/^0+/, "");
  const numericCode = rawCode.replace(/[^0-9]/g, "");

  let dbProduct = rawCode ? list.find(p => 
    p.codigo === rawCode || 
    p.codigo === cleanCode || 
    (numericCode && (p.codigo === numericCode || p.codigo.replace(/^0+/, "") === numericCode))
  ) : undefined;

  if (!dbProduct && item.descricao) {
    dbProduct = getProductByCodeOrName(item.descricao);
  }

  const boxPrice = dbProduct?.valor || 0;
  const embalagem = dbProduct?.fator && dbProduct.fator > 0 ? dbProduct.fator : (item.fatorEmbalagem || 12);
  const umStr = (item.unidadeMedida || (item as any).um || "").toLowerCase().trim();
  const isCx = umStr === "cx" || umStr === "caixa" || umStr === "cxs" || umStr === "caixas" || umStr === "cx.";
  const isUnd = !isCx;
  const qty = item.quantidade || 1;

  if (boxPrice > 0) {
    const actualUnitPrice = isUnd ? (boxPrice / embalagem) : boxPrice;
    return Number((actualUnitPrice * qty).toFixed(2));
  }

  const customP = item.customUnitPrice || item.precoSugerido;
  if (customP && customP > 0 && customP !== 98.50) {
    let unitP = customP;
    if (unitP > 1000) unitP = unitP / 100;
    const actualUnitPrice = isUnd && unitP > 15 ? (unitP / embalagem) : unitP;
    return Number((actualUnitPrice * qty).toFixed(2));
  }

  if (item.precoCalculated && item.precoCalculated > 0 && item.precoCalculated !== 98.50) {
    let price = item.precoCalculated;
    if (price > 10000) price = price / 100;
    else if (price > 1000) price = price / 100;

    // If unit is UN and price was saved as boxPrice * qty (or inflated > 20 for UN), scale to UN price
    if (isUnd && price > 20) {
      const unitP = (price / qty) > 15 ? (price / qty / embalagem) : (price / qty);
      return Number((unitP * qty).toFixed(2));
    }
    return Number(price.toFixed(2));
  }

  return 0;
}

export function calculateHectolitros(codigo: string, quantidade: number): number {
  return calculateItemHL({ codigo, quantidade, unidadeMedida: "cx" });
}
