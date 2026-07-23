import { safeSetItem } from "../utils/apiSync";

export interface ProductInfo {
  codigo: string;
  descricao: string;
  fator?: number;
  valor?: number;
  fatorHecto: number;
  embalagem?: number;
}

const DEFAULT_PRODUCT_DATABASE: ProductInfo[] = [
  { codigo: "29508", descricao: "JOHNNIE WALKER WHISKY GOLD LABEL RESERVE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "23028", descricao: "BUCHANANS WHISKY DELUXE 12 ANOS GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "29926", descricao: "JOHNNIE WALKER BLACK LABEL WHISKY ICONS GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "33046", descricao: "YPE TIXAN LAVA ROUPAS PO MACIEZ SACHE PLASTICO 800G CX20", fatorHecto: 0.16 },
  { codigo: "33048", descricao: "YPE TIXAN LAVA ROUPAS PRIMAV SACHE PLASTICO 800G CX20", fatorHecto: 0.16 },
  { codigo: "31678", descricao: "YPE AMACIANTE CONC BLUE FRASCO PLAST 1 L C12", fatorHecto: 0.12 },
  { codigo: "29505", descricao: "CIROC VODKA GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "21781", descricao: "SMIRNOFF ICE GARRAFA VD 275ML CX C24", fatorHecto: 0.07 },
  { codigo: "21955", descricao: "CHIVAS REGAL 12 ANOS GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "34432", descricao: "RED BULL TROPICAL BR LATA 473ML CX C 12", fatorHecto: 0.06 },
  { codigo: "19225", descricao: "RED BULL BR LATA 250ML CX C 24 NPAL .", fatorHecto: 0.06 },
  { codigo: "35620", descricao: "BEATS GREEN MIX LONG NECK 269ML SIX-PACK SH C", fatorHecto: 0.06 },
  { codigo: "14550", descricao: "COLORADO APPIA ONE WAY 600ML CX C-12 ARTE", fatorHecto: 0.07 },
  { codigo: "24168", descricao: "MICHELOB ULTRA N LONG NECK 330ML SIX-PACK SHRINK C/4", fatorHecto: 0.08 },
  { codigo: "32175", descricao: "CROKISSIMO AMEND CROC LEV SALGADO PCT 24G FD/36", fatorHecto: 0.01 },
  { codigo: "27686", descricao: "MIKES HARD LEMONADE N LONG NECK 275ML SIX PACK SH C/4", fatorHecto: 0.07 },
  { codigo: "32361", descricao: "BEATS TROPICAL LONG NECK 269ML SIX-PACK SH C/4", fatorHecto: 0.06 },
  { codigo: "29485", descricao: "SKOL BEATS CAIPIRINHA LONG NECK 269ML SIX-PACK SH C/4", fatorHecto: 0.06 },
  { codigo: "23246", descricao: "PIRACANJUBA LEITE CONDENSADO TETRAPAK 395G CX C/27", fatorHecto: 0.11 },
  { codigo: "31805", descricao: "YPE TIXAN LAVA ROUPAS LIQ PRIMAVERA FRASCO PLAST 1 L C12", fatorHecto: 0.12 },
  { codigo: "34529", descricao: "YPE TIXAN LAVA ROUPAS LIQ MACIEZ FRASCO PLAST 1L CX12", fatorHecto: 0.12 },
  { codigo: "27866", descricao: "CORONA CERO SUNBREW N LONG NECK 330 ML SP BASKET CX C4", fatorHecto: 0.08 },
  { codigo: "18836", descricao: "CORONA EXTRA N LONG NECK 330ML CX C/24 NPAL", fatorHecto: 0.08 },
  { codigo: "25174", descricao: "51 ICE BALADA GARRAFA VD 275ML CX C24", fatorHecto: 0.07 },
  { codigo: "25176", descricao: "51 ICE FRUIT MIX MORANGO + LARANJA GARRAFA VD 275ML CX C24", fatorHecto: 0.07 },
  { codigo: "23269", descricao: "SKOL BEATS GT LONG NECK 269ML SIX-PACK SH C/4", fatorHecto: 0.06 },
  { codigo: "371", descricao: "MALZBIER BRAHMA LONG NECK 355ML SIX-PACK BANDEJA C/4", fatorHecto: 0.09 },
  { codigo: "19166", descricao: "COLORADO LAGER ONE WAY 600ML CX C-12 ARTE", fatorHecto: 0.07 },
  { codigo: "25151", descricao: "OLD PARR WHISKY GFA VDR 1L", fatorHecto: 0.01 },
  { codigo: "23271", descricao: "SKOL BEATS SENSES LONG NECK 269ML SIX-PACK SH C/4", fatorHecto: 0.06 },
  { codigo: "29580", descricao: "STELLA ARTOIS PURE GOLD LONG NECK 330ML SP SH C/4", fatorHecto: 0.08 },
  { codigo: "31795", descricao: "BRUTAL FRUIT LONG NECK 275ML SIX PACK SH C 2", fatorHecto: 0.03 },
  { codigo: "18807", descricao: "STELLA ARTOIS LONG NECK 330ML SIX-PACK SHRINK C/4", fatorHecto: 0.08 },
  { codigo: "25178", descricao: "51 ICE LIMAO GARRAFA VD 275ML CX C24", fatorHecto: 0.07 },
  { codigo: "29504", descricao: "OLD PARR WHISKY 12 ANOS GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "30045", descricao: "RED BULL BR LATA 473ML CX C 12", fatorHecto: 0.06 },
  { codigo: "21632", descricao: "SPATEN N LN 355ML SIXPACK SH C/4", fatorHecto: 0.09 },
  { codigo: "17808", descricao: "BUDWEISER OW 330ML CX C/24", fatorHecto: 0.08 },
  { codigo: "33061", descricao: "YPE TIXAN LAVA ROUPAS PO MACIEZ SACHE 400G CX C/24", fatorHecto: 0.10 },
  { codigo: "33066", descricao: "YPE TIXAN LAVA ROUPAS PRIMAV SACHE 400G CX C/24", fatorHecto: 0.10 },
  { codigo: "27559", descricao: "CACHACA 51 PIRASSUNUNGA OURO GFA VD 965ML RET CX/12", fatorHecto: 0.12 },
  { codigo: "22180", descricao: "BUDWEISER ZERO LONG NECK 330ML SIX-PACK SHRINK C/4", fatorHecto: 0.08 },
  { codigo: "31713", descricao: "YPE AMACIANTE CONC PINK FRASCO PLAST 500ML CX/12", fatorHecto: 0.06 },
  { codigo: "25837", descricao: "SPATEN N LT 473ML CX CARTAO C/12", fatorHecto: 0.06 },
  { codigo: "31708", descricao: "YPE AMACIANTE CONC BLUE FRASCO PLAST 500ML CX/12", fatorHecto: 0.06 },
  { codigo: "18780", descricao: "CORONITA EXTRA N OW 210ML CX C/4 SIX PACK", fatorHecto: 0.05 },
  { codigo: "21788", descricao: "BALLANTINES FINEST GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "21527", descricao: "TANQUERAY GIN LONDON DRY GARRAFA VIDRO 750ML", fatorHecto: 0.01 },
  { codigo: "10530", descricao: "ANTARCTICA SUBZERO GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "21529", descricao: "ABSOLUT ORIGINAL GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "12951", descricao: "BRAHMA CHOPP ZERO LN 355ML SIXPACK CX CART C/04", fatorHecto: 0.09 },
  { codigo: "20535", descricao: "STELLA ARTOIS ONE WAY 600ML CX C/12 NPAL", fatorHecto: 0.07 },
  { codigo: "22563", descricao: "CHIVAS REGAL 12 ANOS GARRAFA VIDRO 750ML", fatorHecto: 0.01 },
  { codigo: "21526", descricao: "JOHNNIE WALKER RED LABEL GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "17266", descricao: "BOHEMIA LT 473ML CX CARTAO C/12", fatorHecto: 0.06 },
  { codigo: "23256", descricao: "PIRACANJUBA CREME DE LEITE TETRAPAK 200G CX C/27", fatorHecto: 0.05 },
  { codigo: "18752", descricao: "PATAGONIA WEISSE NACIONAL ONE WAY 740ML CX6", fatorHecto: 0.04 },
  { codigo: "18772", descricao: "PATAGONIA AMB LAG NACIONAL ONE WAY 740ML CX6", fatorHecto: 0.04 },
  { codigo: "21668", descricao: "SPATEN N ONE WAY 600ML CX C/12 NP ARTE", fatorHecto: 0.07 },
  { codigo: "33738", descricao: "BEATS RED MIX LONG NECK 269ML SIX-PACK SH C/2", fatorHecto: 0.03 },
  { codigo: "35331", descricao: "BUDWEISER GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "36034", descricao: "BUDWEISER LT 473ML SH C12 NP MULTIPACK", fatorHecto: 0.06 },
  { codigo: "20530", descricao: "STELLA ARTOIS 600 ML", fatorHecto: 0.07 },
  { codigo: "27522", descricao: "CACHACA 51 PIRASSUNUNGA GFA VD 965ML RET CX/12", fatorHecto: 0.12 },
  { codigo: "29253", descricao: "ORIGINAL GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "34527", descricao: "YPE AMACIANTE TRADICIONAL ACONCHEGO FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "21792", descricao: "WHITE HORSE GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "13196", descricao: "SKOL ONE WAY 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "2546", descricao: "ORIGINAL 600ML", fatorHecto: 0.07 },
  { codigo: "23186", descricao: "SPATEN N 600ML", fatorHecto: 0.07 },
  { codigo: "2006", descricao: "ANTARCTICA SUBZERO 600ML", fatorHecto: 0.07 },
  { codigo: "1695", descricao: "BRAHMA CHOPP GFA VD 1L COM TTC", fatorHecto: 0.12 },
  { codigo: "21778", descricao: "JOHNNIE WALKER RED LABEL GARRAFA VIDRO 750ML", fatorHecto: 0.01 },
  { codigo: "24604", descricao: "MINALBA AGUA PREMIUM C/GAS GFA VDR 300ML CX/12", fatorHecto: 0.04 },
  { codigo: "35338", descricao: "BUDWEISER ZERO LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "20533", descricao: "BRAHMA DUPLO MALTE GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "24304", descricao: "TODDYNHO 200ML TETRA PAK 200 ML CX C/27", fatorHecto: 0.05 },
  { codigo: "27001", descricao: "GORDONS GIN DRY GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "20329", descricao: "BRAHMA DUPLO MALTE 600ML", fatorHecto: 0.07 },
  { codigo: "13203", descricao: "ANTARCTICA PILSEN GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "2548", descricao: "BUDWEISER 600ML", fatorHecto: 0.07 },
  { codigo: "35980", descricao: "CASAL GARCIA VINHO ROSE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "982", descricao: "SKOL 600ML", fatorHecto: 0.07 },
  { codigo: "988", descricao: "BRAHMA CHOPP 600ML", fatorHecto: 0.07 },
  { codigo: "35108", descricao: "CERVEGELA PLASTICA SPATEN 1 UN P/ GFA 600ML C", fatorHecto: 0.01 },
  { codigo: "29418", descricao: "CERVEGELA BUDWEISER LITRAO 1 UN P/ GF 1L PCK3", fatorHecto: 0.03 },
  { codigo: "23671", descricao: "CERVEGELA PLASTICA BRAHMA 1 UN P/ GFA 1L CX C/3", fatorHecto: 0.01 },
  { codigo: "29416", descricao: "CERVEGELA BUDWEISER 1 UN P/ GF 600ML CX3", fatorHecto: 0.02 },
  { codigo: "23672", descricao: "CERVEGELA PLASTICA BRAHMA 1 UN P/ GFA 600ML CX C/3", fatorHecto: 0.01 },
  { codigo: "10537", descricao: "BOHEMIA GFA VD 990ML", fatorHecto: 0.12 },
  { codigo: "27562", descricao: "CASILLERO DEL DIABLO VINH RESERVA MERLOT GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "27560", descricao: "CASILLERO DEL DIABLO VINH RESERVA MALBEC GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "27613", descricao: "CASILLERO DEL DIABLO VNH RSV CABER SAUVG GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "32425", descricao: "FUSION MELANCIA LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "1388", descricao: "SKOL GFA VD 1L 2,99", fatorHecto: 0.12 },
  { codigo: "9071", descricao: "CARACU LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "37579", descricao: "DOCES VIEIRA BEIJO DE LEITE PCT PLAST 23G POT", fatorHecto: 0.01 },
  { codigo: "37581", descricao: "DOCES VIEIRA COCADA BAIANA PCT PLAST 23G POTE", fatorHecto: 0.01 },
  { codigo: "35992", descricao: "CASAL GARCIA VINHO BR VERDE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "29518", descricao: "JOHNNIE WALKER WHISKY BLONDE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "33109", descricao: "51 OURO AGUARDENTE COMPOSTA LT 350ML CX C/12", fatorHecto: 0.04 },
  { codigo: "24609", descricao: "MINALBA AGUA PREMIUM S/GAS GFA VDR 300ML CX/12", fatorHecto: 0.04 },
  { codigo: "37933", descricao: "DOCES VIEIRA BRIGADEIRO PCT PLAST 23G POTE C/", fatorHecto: 0.01 },
  { codigo: "37582", descricao: "DOCES VIEIRA COCADA BRANCA PCT PLAST 23G POTE", fatorHecto: 0.01 },
  { codigo: "37580", descricao: "DOCES VIEIRA CHURRITOS PCT PLAST 23G POTE C/4", fatorHecto: 0.01 },
  { codigo: "2538", descricao: "ANTARCTICA PILSEN 600ML", fatorHecto: 0.07 },
  { codigo: "23184", descricao: "PITU AGUARDENTE LT 350ML CX C/12", fatorHecto: 0.04 },
  { codigo: "1708", descricao: "GUARANA ANTARCTICA ZERO PET 2,5L CAIXA C/6", fatorHecto: 0.15 },
  { codigo: "31789", descricao: "YPE AMACIANTE TRADICIONAL ACONCHEGO FRASCO PLASTICO 2 L C6", fatorHecto: 0.12 },
  { codigo: "31674", descricao: "YPE AMACIANTE INTENSO FRASCO PLASTICO 2 L C6", fatorHecto: 0.12 },
  { codigo: "3733", descricao: "BOHEMIA NOVA EMBALAGEM 600ML", fatorHecto: 0.07 },
  { codigo: "33042", descricao: "YPE LAVA LOUCAS LIQUIDO LIMAO FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "31582", descricao: "YPE LAVA LOUCAS LIQUIDO CLEAR FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "31669", descricao: "YPE LAVA LOUCAS LIQUIDO COCO FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "31589", descricao: "YPE LAVA LOUCAS LIQUIDO MACA FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "31667", descricao: "YPE LAVA LOUCAS LIQUIDO NEUTRO FRASCO PLASTICO 500 ML C24", fatorHecto: 0.12 },
  { codigo: "20217", descricao: "ORIGINAL GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "9427", descricao: "ANTARCTICA PILSEN LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "32427", descricao: "FUSION TROPICAL LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "31272", descricao: "FUSION LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "10175", descricao: "ANTARCTICA SUBZERO LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "25160", descricao: "BLACK & WHITE WHISKY GFA VDR 1L", fatorHecto: 0.01 },
  { codigo: "20549", descricao: "BRAHMA DUPLO MALTE GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "25434", descricao: "MATUTA CACHACA MEL E LIMAO GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "22562", descricao: "DOMECQ COQ. COMPOSTO GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "37450", descricao: "BUDWEISER LT SLEEK 350ML SH C 12 MULTIPACK", fatorHecto: 0.04 },
  { codigo: "26462", descricao: "ORIGINAL LT 473ML CX CARTAO C/12", fatorHecto: 0.06 },
  { codigo: "37576", descricao: "DOCES VIEIRA PE DE MOCA PCT PLAST 23G POTE C/", fatorHecto: 0.01 },
  { codigo: "1743", descricao: "ANTARCTICA PILSEN GFA VD 1L COM TTC", fatorHecto: 0.12 },
  { codigo: "25347", descricao: "SALTON ESPUMANTE CLASSIC MOSCATEL GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "25329", descricao: "SALTON ESPUMANTE BRUT GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "25335", descricao: "SALTON ESPUMANTE BRUT ROSE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "21658", descricao: "SPATEN N LT SLEEK 350ML CX CART C 12", fatorHecto: 0.04 },
  { codigo: "23449", descricao: "MIKES HARD LEMONADE N LT 269ML SH C12 NP", fatorHecto: 0.03 },
  { codigo: "37583", descricao: "DOCES VIEIRA BEIJO DE MOCA PCT PLAST 23G POTE", fatorHecto: 0.01 },
  { codigo: "13205", descricao: "SKOL GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "13201", descricao: "BRAHMA CHOPP GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "34608", descricao: "SKOL LATA 350ML SH C/12 NPAL MULTIPACK", fatorHecto: 0.04 },
  { codigo: "14135", descricao: "BUDWEISER LATA 473ML SIX-PACK SH C/2 NPAL", fatorHecto: 0.06 },
  { codigo: "35617", descricao: "BEATS GREEN MIX LT 269ML SH C/8", fatorHecto: 0.02 },
  { codigo: "13486", descricao: "FUSION PET 1L SH C/06", fatorHecto: 0.06 },
  { codigo: "16503", descricao: "BOHEMIA GFA VD 300ML CX C/23", fatorHecto: 0.07 },
  { codigo: "9081", descricao: "MALZBIER BRAHMA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "9083", descricao: "SKOL LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "22326", descricao: "BRAHMA DUPLO MALTE LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "33818", descricao: "ORIGINAL LATA 350ML SHRINK C/12 MULTPACK", fatorHecto: 0.04 },
  { codigo: "19668", descricao: "ORIGINAL LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "20164", descricao: "SKOL LT 473ML SH C/12 NPAL MULTPACK 12", fatorHecto: 0.06 },
  { codigo: "19229", descricao: "RED BULL BR LATA 250ML SIX PACK NPAL .", fatorHecto: 0.02 },
  { codigo: "34320", descricao: "GUARANA ANTARCTICA ZERO LATA 350ML SH C/12 NPAL MULTIPACK", fatorHecto: 0.04 },
  { codigo: "9320", descricao: "BRAHMA CHOPP LT 473ML SH C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "33734", descricao: "BEATS RED MIX LT 269ML SH C/8", fatorHecto: 0.02 },
  { codigo: "22027", descricao: "COLORADO APPIA LT SLEEK 350ML C8 CX CARTAO NPAL", fatorHecto: 0.03 },
  { codigo: "33820", descricao: "BRAHMA CHOPP LATA 350ML SH C/12 NPAL MULTIPACK .", fatorHecto: 0.04 },
  { codigo: "20853", descricao: "COLORADO LAGER LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "29845", descricao: "PEPSI BLACK PET 1 L SH C/12", fatorHecto: 0.12 },
  { codigo: "2319", descricao: "GUARANA CHP ANTARCTICA PET 1L CAIXA C/12", fatorHecto: 0.12 },
  { codigo: "7325", descricao: "PEPSI COLA PET 1L CAIXA C/12", fatorHecto: 0.12 },
  { codigo: "21970", descricao: "TRIDENT MENTA ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "21974", descricao: "TRIDENT TUTTI-FRUTTI ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "21968", descricao: "TRIDENT HORTELA ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "35003", descricao: "TRIDENT XFRESH 5S PRETO CEREJA ENVELOPE 8G CX", fatorHecto: 0.01 },
  { codigo: "21973", descricao: "TRIDENT MELANCIA ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "11593", descricao: "PEPSI COLA GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "31064", descricao: "BUDWEISER LT 269ML SH C 15", fatorHecto: 0.04 },
  { codigo: "34454", descricao: "H2OH LIMONETO LT SLEEK 350ML SH C 12", fatorHecto: 0.04 },
  { codigo: "9795", descricao: "GUARANA ANTARCTICA ZERO PET 1L CAIXA C/12", fatorHecto: 0.12 },
  { codigo: "9072", descricao: "BOHEMIA NOVA EMBALAGEM LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "4262", descricao: "MICHELOB ULTRA N LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "13061", descricao: "H2OH LIMONETO PET 500ML SHRINK C/12 NPAL", fatorHecto: 0.06 },
  { codigo: "28137", descricao: "SKOL BEATS CAIPIRINHA LT 269ML CX CARTAO C/8 NPAL", fatorHecto: 0.02 },
  { codigo: "20498", descricao: "BRAHMA DUPLO MALTE LT SLEEK 350ML SH C 12", fatorHecto: 0.04 },
  { codigo: "7947", descricao: "GUARANA CHP ANTARCTICA PET 2,5L CAIXA C/6", fatorHecto: 0.15 },
  { codigo: "32349", descricao: "BEATS TROPICAL LT 269ML CX CARTAO C/8 NPAL", fatorHecto: 0.02 },
  { codigo: "4409", descricao: "PEPSI TWIST PET 2L SHRINK C/6", fatorHecto: 0.12 },
  { codigo: "34770", descricao: "RED BULL SUGAR FREE POMELO LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "34429", descricao: "RED BULL AMORA LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "32969", descricao: "RED BULL SUMMER MORANGO E PESSEGO LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "4141", descricao: "PATAGONIA AMB LAG NACIONAL LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "4198", descricao: "PATAGONIA IPA LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "2320", descricao: "SODA LIMONADA ANTARCTICA PET 1L CAIXA C/12", fatorHecto: 0.12 },
  { codigo: "22382", descricao: "PASSPORT SELECTION GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "21020", descricao: "BUDWEISER LT SLEEK 350ML CX CART C 12", fatorHecto: 0.04 },
  { codigo: "7945", descricao: "PEPSI COLA PET 2,5L CAIXA C/6", fatorHecto: 0.15 },
  { codigo: "21119", descricao: "SKOL BEATS GT LT 269ML CX CARTAO C/8 NPAL", fatorHecto: 0.02 },
  { codigo: "34298", descricao: "TRIDENT MORANGO ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "34296", descricao: "TRIDENT CANELA ENVELOPE 8G CX C/21", fatorHecto: 0.01 },
  { codigo: "25303", descricao: "GARRAFEIRA PL. PRETO BEES 1 UN P/24 GFA 600ML", fatorHecto: 0.02 },
  { codigo: "23594", descricao: "PIRAKIDS BEBIDA LACTEA CHOCOLATE TETRA PAK 200 ML CX C/27", fatorHecto: 0.05 },
  { codigo: "25700", descricao: "FUSION PET 2L SHRINK C/6", fatorHecto: 0.12 },
  { codigo: "1898", descricao: "BRAHMA CHOPP LT 269ML SH C15 NPAL", fatorHecto: 0.04 },
  { codigo: "1745", descricao: "SKOL LT 269ML SH C15 NPAL", fatorHecto: 0.04 },
  { codigo: "34410", descricao: "HALLS UVA VERDE ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "12948", descricao: "BRAHMA CHOPP ZERO LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "34027", descricao: "GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL MULTIPACK", fatorHecto: 0.04 },
  { codigo: "347", descricao: "SUKITA PET 1L CAIXA C/12", fatorHecto: 0.12 },
  { codigo: "32500", descricao: "STELLA ARTOIS PURE GOLD LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "21530", descricao: "SMIRNOFF ORIGINAL GARRAFA VIDRO 998ML", fatorHecto: 0.01 },
  { codigo: "8791", descricao: "H2OH LIMAO C/GAS PET 500ML CAIXA C/12", fatorHecto: 0.06 },
  { codigo: "24486", descricao: "GALLO AZEITE OLIVA EX. VIR. GFA VDR 500ML", fatorHecto: 0.01 },
  { codigo: "21789", descricao: "ORLOFF GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "20651", descricao: "CORONA EXTRA N LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "25194", descricao: "CACHACA 51 LT 350ML CX C/12", fatorHecto: 0.04 },
  { codigo: "13566", descricao: "SKOL BEATS SENSES LT 269ML CX C/8 FRIDGE PACK", fatorHecto: 0.02 },
  { codigo: "8919", descricao: "GUARANA CHP ANTARCTICA PET 600ML CX12 NPAL", fatorHecto: 0.07 },
  { codigo: "34420", descricao: "RED BULL SUMMER MARACUJA E MELAO LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "19227", descricao: "RED BULL BR LATA 355ML FOUR PACK .", fatorHecto: 0.01 },
  { codigo: "9067", descricao: "ANTARCTICA PILSEN LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "9093", descricao: "PEPSI TWIST LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "19729", descricao: "STELLA ARTOIS LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "27624", descricao: "RESERVADO VINHO MALBEC GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "27566", descricao: "RESERVADO VINHO SWEET RED GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "7979", descricao: "GATORADE FRUTAS CITRICAS PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "9068", descricao: "SKOL LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "9069", descricao: "BRAHMA CHOPP LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "2349", descricao: "GUARANA CHP ANTARCTICA PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "34263", descricao: "CORONA CERO SUNBREW N LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "8793", descricao: "H2OH LIMAO C/GAS PET 1,5L CAIXA C/6", fatorHecto: 0.09 },
  { codigo: "2353", descricao: "GUARANA CHP ANTARCTICA DIET PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "23731", descricao: "GATORADE MELANCIA-MORANGO PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "2585", descricao: "GUARANA CHP ANTARCTICA GFA VD 1L", fatorHecto: 0.12 },
  { codigo: "22200", descricao: "TONICA ANTARCTICA PET 1 L SH C/06", fatorHecto: 0.06 },
  { codigo: "13065", descricao: "H2OH LIMONETO PET 1,5 SHRINK C/06 NPAL", fatorHecto: 0.09 },
  { codigo: "2350", descricao: "SODA LIMONADA ANTARCTICA PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "2008", descricao: "ANTARCTICA SUBZERO LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "504", descricao: "PEPSI COLA PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "32126", descricao: "AMINDUS GRELHADITOS AMEND. TOR. S/ PELE PCT 24G FD C/60", fatorHecto: 0.01 },
  { codigo: "22330", descricao: "MENDORATO PCT 27G CX C/60", fatorHecto: 0.02 },
  { codigo: "9276", descricao: "PEPSI ZERO PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "20647", descricao: "BRAHMA DUPLO MALTE LT 269ML SH C15 NPAL", fatorHecto: 0.04 },
  { codigo: "22202", descricao: "TONICA ANTARCTICA ZERO PET 1L SH C/06", fatorHecto: 0.06 },
  { codigo: "25430", descricao: "MATUTA CACHACA UMBURANA GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "26607", descricao: "RED BULL PITAYA LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "34890", descricao: "YPE ASSOLAN ESPONJA LA ACO CX PAPEL CART 1,6KG LEVE 20 PAG 18", fatorHecto: 0.02 },
  { codigo: "8411", descricao: "GUARANA CHP ANTARCTICA PET 1,5 SHRINK C/6", fatorHecto: 0.09 },
  { codigo: "1164", descricao: "SUKITA UVA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "25546", descricao: "GARRAFEIRA PL. AL. LAT. AB. PRETA BEES 1 UN P/ 23 GFA 300ML", fatorHecto: 0.02 },
  { codigo: "9091", descricao: "TONICA ANTARCTICA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "21666", descricao: "RED BULL TROPICAL BR LATA 250ML FOUR PACK NPAL .", fatorHecto: 0.01 },
  { codigo: "19231", descricao: "RED BULL SUGAR FREE BR LATA 250ML FOUR PACK NPAL .", fatorHecto: 0.01 },
  { codigo: "29326", descricao: "INDAIA BEB MISTA CITRUS LARANJA GFA PET 1,5L FD C/6", fatorHecto: 0.09 },
  { codigo: "29891", descricao: "ROCKS DRY GIN GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "22543", descricao: "ROCKS STRAMBERRY GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "24306", descricao: "RED BULL MELANCIA LATA 250ML FOUR PACK NPAL", fatorHecto: 0.01 },
  { codigo: "7985", descricao: "GATORADE MARACUJA PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "9092", descricao: "TONICA ANTARCTICA DIET LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "7980", descricao: "GATORADE TANGERINA PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "7982", descricao: "GATORADE LIMAO PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "7983", descricao: "GATORADE MORANGO-MARACUJA PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "7981", descricao: "GATORADE LARANJA PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "7977", descricao: "GATORADE UVA PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "22177", descricao: "BUDWEISER ZERO LT SLEEK 350ML C 8 CX CARTAO", fatorHecto: 0.03 },
  { codigo: "26037", descricao: "MONTILLA CARTA CRISTAL GFA VDR 1L", fatorHecto: 0.01 },
  { codigo: "32067", descricao: "GATORADE BERRY BLUE PET 500ML SIXPACK", fatorHecto: 0.03 },
  { codigo: "9085", descricao: "GUARANA CHP ANTARCTICA DIET LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "9084", descricao: "GUARANA CHP ANTARCTICA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "21786", descricao: "MONTILLA CARTA BRANCA GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "1699", descricao: "STELLA ARTOIS LT 269ML CX C/8 FRIDGE PACK", fatorHecto: 0.02 },
  { codigo: "25429", descricao: "MATUTA CACHACA CRISTAL GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "9274", descricao: "PEPSI ZERO LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "27177", descricao: "HALLS MENTOL ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "22003", descricao: "HALLS CEREJA ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "22005", descricao: "HALLS MENTA ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "27179", descricao: "HALLS MORANGO ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "22007", descricao: "HALLS EXTRA FORTE ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "32538", descricao: "PERGOLA SEL. VINHO TINTO SUAVE GARRAFA VIDRO 1 L", fatorHecto: 0.01 },
  { codigo: "9089", descricao: "SUKITA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "34920", descricao: "DIAS DAVILA AGUA MINERAL S GAS GFA PET 1,5L F", fatorHecto: 0.09 },
  { codigo: "1166", descricao: "SUKITA UVA PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "9096", descricao: "PEPSI COLA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "29733", descricao: "HALLS MELANCIA ENVELOPE 28G CX C/21", fatorHecto: 0.01 },
  { codigo: "22508", descricao: "PERGOLA SEL. VINHO TINTO SUAVE GARRAFA VIDRO 750ML", fatorHecto: 0.01 },
  { codigo: "34923", descricao: "DIAS DAVILA AGUA MINERAL C GAS GFA PET 500ML ", fatorHecto: 0.06 },
  { codigo: "34918", descricao: "DIAS DAVILA AGUA MINERAL S GAS GFA PET 500ML ", fatorHecto: 0.06 },
  { codigo: "503", descricao: "SUKITA PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "9087", descricao: "SODA LIMONADA ANTARCTICA LATA 350ML SH C/12 NPAL", fatorHecto: 0.04 },
  { codigo: "24161", descricao: "S. JOAO BARRA CONHAQUE ALC. GARRAFA VIDRO 900ML", fatorHecto: 0.01 },
  { codigo: "21441", descricao: "SUKITA LIMAO PET 2L CAIXA C/6", fatorHecto: 0.12 },
  { codigo: "22009", descricao: "CHICLETE ADAMS HORTELA CAIXINHA 2,8G CX C/100", fatorHecto: 0.01 },
  { codigo: "21787", descricao: "DREHER GARRAFA VIDRO 900ML", fatorHecto: 0.01 },
  { codigo: "34325", descricao: "ELEVE AGUA MIN C GAS GFA PET 510ML FD C/12", fatorHecto: 0.06 },
  { codigo: "24488", descricao: "GALLO AZEITE OLIVA EX. VIR. GFA VDR 250ML", fatorHecto: 0.03 },
  { codigo: "23546", descricao: "INDAIA AGUA MINERAL C/GAS GFA PET 500ML PACK C/12", fatorHecto: 0.06 },
  { codigo: "24410", descricao: "QUINTA DO MORGADO VINHO BRANCO SUAVE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "29323", descricao: "INDAIA BEB MISTA CITRUS LARANJA GFA PET 330ML FD C/12", fatorHecto: 0.04 },
  { codigo: "24409", descricao: "QUINTA DO MORGADO VINHO TINTO SUAVE GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "23552", descricao: "INDAIA AGUA MINERAL S/GAS GFA PET 500ML PACK C/12", fatorHecto: 0.06 },
  { codigo: "35012", descricao: "MENDORATO PCT 45G DISPLAY C10", fatorHecto: 0.01 },
  { codigo: "24408", descricao: "QUINTA DO MORGADO VINHO TINTO SECO GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "24411", descricao: "QUINTA DO MORGADO VINHO BRANCO SECO GFA VD 750 ML", fatorHecto: 0.01 },
  { codigo: "4367", descricao: "INDAIA AGUA MINERAL S/GAS GFA PET 1,5L FD C/6", fatorHecto: 0.09 },
  { codigo: "34479", descricao: "ELEVE AGUA MIN S GAS PET 1,5 SHRINK C/6", fatorHecto: 0.09 },
  { codigo: "29197", descricao: "TANG REFRESCO EM PO LIMAO PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "29201", descricao: "TANG REFRESCO EM PO ABACAXI PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "29199", descricao: "TANG REFRESCO EM PO LARANJA PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "29215", descricao: "TANG REFRESCO EM PO UVA PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "29209", descricao: "TANG REFRESCO EM PO MARACUJA PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "29207", descricao: "TANG REFRESCO EM PO MORANGO PCT 18G DP C/18", fatorHecto: 0.01 },
  { codigo: "18152", descricao: "GUARANA CHP ANTARCTICA PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "19321", descricao: "GUARANA ANTARCTICA ZERO PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "4293", descricao: "PEPSI BLACK PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "18268", descricao: "SUKITA PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "32648", descricao: "BUBBALOO MORANGO DISPLAY 5G CX/60", fatorHecto: 0.01 },
  { codigo: "32644", descricao: "BUBBALOO UVA DISPLAY 5G CX/60", fatorHecto: 0.01 },
  { codigo: "32646", descricao: "BUBBALOO TUTTI FRUTTI DISPLAY 5G CX/60", fatorHecto: 0.01 },
  { codigo: "25220", descricao: "CACHACA 51 PIRASS OURO DESCARTAVEL GFA DE VDRO 965ML", fatorHecto: 0.01 },
  { codigo: "18267", descricao: "SODA LIMONADA ANTARCTICA PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "32528", descricao: "PETROPOLIS AGUA MIN COM GAS GARRAFA PET 500MLCX C12", fatorHecto: 0.06 },
  { codigo: "18266", descricao: "PEPSI COLA PET 200ML SH C/12", fatorHecto: 0.02 },
  { codigo: "32526", descricao: "PETROPOLIS AGUA MIN SEM GAS GARRAFA PET 500MLCX C12", fatorHecto: 0.06 },
  { codigo: "34475", descricao: "ELEVE AGUA MIN S GAS GFA PET 510ML FD C/12", fatorHecto: 0.06 },
  { codigo: "23443", descricao: "PITU AGUARDENTE GARRAFA VIDRO 965ML", fatorHecto: 0.01 },
  { codigo: "24256", descricao: "PETROPOLIS AGUA MIN SEM GAS PET 1,5 SHRINK C/6", fatorHecto: 0.09 },
  { codigo: "35136", descricao: "YPE SABAO BARRA MULTIATIVO PCT PLAST 800G", fatorHecto: 0.01 },
  { codigo: "35134", descricao: "YPE SABAO BARRA NEUTRO PCT PLAST 800G", fatorHecto: 0.01 },
  { codigo: "19164", descricao: "GUARANA CHP ANTARCTICA PET 1L PACK C/2 MULTPACK", fatorHecto: 0.02 }
];

let cachedProducts: ProductInfo[] | null = null;

export const clearProductsCache = () => {
  cachedProducts = null;
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
    return DEFAULT_PRODUCT_DATABASE.map(p => ({
      ...p,
      fator: p.fator !== undefined ? p.fator : extractFatorFromDescricao(p.descricao),
      valor: p.valor !== undefined ? p.valor : 98.50
    }));
  }
  const saved = localStorage.getItem("sstr_products_database");
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as ProductInfo[];
      let updated = false;
      const migrated = parsed.map(p => {
        let isModified = false;
        let { fator, valor } = p;
        if (fator === undefined) {
          fator = extractFatorFromDescricao(p.descricao);
          isModified = true;
        }
        if (valor === undefined) {
          valor = 98.50;
          isModified = true;
        }
        if (isModified) {
          updated = true;
        }
        return {
          ...p,
          fator,
          valor
        };
      });
      if (updated) {
        safeSetItem("sstr_products_database", JSON.stringify(migrated));
      }
      cachedProducts = migrated;
      return migrated;
    } catch (e) {
      console.error(e);
    }
  }
  
  const mappedDefaults = DEFAULT_PRODUCT_DATABASE.map(p => ({
    ...p,
    fator: p.fator !== undefined ? p.fator : extractFatorFromDescricao(p.descricao),
    valor: p.valor !== undefined ? p.valor : 98.50
  }));
  safeSetItem("sstr_products_database", JSON.stringify(mappedDefaults));
  cachedProducts = mappedDefaults;
  return mappedDefaults;
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
  return PRODUCT_DATABASE.find(
    (p) => p.codigo === t || p.descricao.toLowerCase().includes(t)
  );
}

export function calculateHectolitros(codigo: string, quantidade: number): number {
  const p = PRODUCT_DATABASE.find((prod) => prod.codigo === codigo.trim());
  if (p) {
    return Number((quantidade * p.fatorHecto).toFixed(4));
  }
  return 0; // Default fallback if not found in db
}
