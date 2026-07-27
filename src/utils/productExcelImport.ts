import * as XLSX from "xlsx";
import { ProductInfo, extractFatorFromDescricao, clearProductsCache } from "../data/products";
import { PendingRequest, ValeEntry, ExchangeRecord } from "../types";

/**
 * Parses Excel (.xlsx, .xls) and CSV files for Product Database according to the structure:
 * Column 1 (0): COD
 * Column 2 (1): DESCRIÇÃO PRODUTO
 * Column 3 (2): FATO (Fator Embalagem / Qtd por caixa)
 * Column 4 (3): VALOR (R$)
 * Column 5 (4): FATOR HECTO (HL)
 */
export function parseProductExcel(buffer: ArrayBuffer): ProductInfo[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return [];
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Convert sheet to array of rows (header: 1 returns 2D array)
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  
  if (!rows || rows.length === 0) return [];

  let startRowIndex = 0;
  let colIndices = {
    cod: 0,
    descricao: 1,
    fato: 2,
    valor: 3,
    fatorHecto: 4
  };

  // Inspect first 10 rows for potential headers
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = rows[i].map(c => String(c).toUpperCase()).join(" ");
    const normStr = rowStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normStr.includes("COD") || normStr.includes("DESCRIC") || normStr.includes("VALOR") || normStr.includes("HECTO")) {
      // Found header row, map exact column indices
      rows[i].forEach((cellVal: any, colIdx: number) => {
        const c = String(cellVal).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (c.includes("COD") || c === "SKU") {
          colIndices.cod = colIdx;
        } else if (c.includes("DESCRIC") || c.includes("PRODUTO") || c.includes("NOME")) {
          colIndices.descricao = colIdx;
        } else if (c.includes("FATO") || c.includes("EMBALAGEM") || c.includes("CX") || c.includes("QTD")) {
          colIndices.fato = colIdx;
        } else if (c.includes("VALOR") || c.includes("PRECO") || c.includes("R$")) {
          colIndices.valor = colIdx;
        } else if (c.includes("HECTO") || c.includes("HL") || c.includes("FATOR H")) {
          colIndices.fatorHecto = colIdx;
        }
      });
      startRowIndex = i + 1;
      break;
    }
  }

  const products: ProductInfo[] = [];
  const seenCodes = new Set<string>();

  for (let r = startRowIndex; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawCod = String(row[colIndices.cod] ?? "").trim();
    if (!rawCod) continue;

    // Clean codigo: strip leading zero padding or keep standard number
    const codigo = rawCod.replace(/^0+/, "") || rawCod;
    if (seenCodes.has(codigo)) continue;

    const rawDesc = String(row[colIndices.descricao] ?? "").trim();
    const descricao = rawDesc || `PRODUTO SKU ${codigo}`;

    // Fato (Fator / Qtd por caixa)
    const rawFato = row[colIndices.fato];
    let fato = 0;
    if (typeof rawFato === "number") {
      fato = rawFato;
    } else if (rawFato) {
      const parsed = parseFloat(String(rawFato).replace(/\s/g, "").replace(",", "."));
      if (!isNaN(parsed) && parsed > 0) fato = parsed;
    }
    if (!fato || fato <= 0) {
      fato = extractFatorFromDescricao(descricao);
    }

    // Valor (Price R$)
    const rawValor = row[colIndices.valor];
    let valor = 0;
    if (typeof rawValor === "number") {
      valor = rawValor;
    } else if (rawValor) {
      const cleanVal = String(rawValor)
        .replace("R$", "")
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".");
      valor = parseFloat(cleanVal) || 0;
    }

    // Fator Hecto (HL factor)
    const rawHecto = row[colIndices.fatorHecto];
    let fatorHecto = 0;
    if (typeof rawHecto === "number") {
      fatorHecto = rawHecto;
    } else if (rawHecto) {
      const cleanHecto = String(rawHecto)
        .replace(/\s/g, "")
        .replace(",", ".");
      fatorHecto = parseFloat(cleanHecto) || 0;
    }

    seenCodes.add(codigo);
    products.push({
      codigo,
      descricao,
      fator: fato,
      valor: Number(valor.toFixed(2)),
      fatorHecto: Number(fatorHecto.toFixed(4))
    });
  }

  return products;
}

/**
 * Recalculates request and vales items based on updated product database
 */
export function recalculateAllRecordsWithProducts(
  productsList: ProductInfo[],
  requests: PendingRequest[],
  valesList: ValeEntry[],
  promaxRecords: ExchangeRecord[] = []
): { updatedRequests: PendingRequest[]; updatedVales: ValeEntry[] } {
  const getProduct = (codeStr: string | undefined): ProductInfo | undefined => {
    if (!codeStr) return undefined;
    const clean = codeStr.trim().replace(/^0+/, "");
    return productsList.find(p => p.codigo === codeStr.trim() || p.codigo === clean || p.codigo.replace(/^0+/, "") === clean);
  };

  const updatedRequests = requests.map(req => {
    let hasChanges = false;
    let newTotalVal = 0;
    let newHecto = 0;

    const newItems = (req.items || []).map(item => {
      const code = item.item || item.itemCode || "";
      const p = getProduct(code);
      if (p) {
        hasChanges = true;
        const isUnd = (item.unidadeMedida || "").toLowerCase() === "und";
        const embalagem = p.fator || item.fatorEmbalagem || 12;
        const boxPrice = p.valor && p.valor > 0 ? p.valor : 0;
        const unitVal = isUnd ? (boxPrice / embalagem) : boxPrice;
        const itemVal = unitVal * (item.quantidade || 1);
        const itemHecto = (p.fatorHecto || 0) * (item.quantidade || 1);

        newTotalVal += itemVal;
        newHecto += itemHecto;

        return {
          ...item,
          descricao: p.descricao || item.descricao,
          customUnitPrice: boxPrice,
          precoCalculated: itemVal,
          fatorHecto: p.fatorHecto
        };
      } else {
        const fallbackPrice = item.customUnitPrice || item.precoSugerido || 0;
        newTotalVal += fallbackPrice * (item.quantidade || 1);
        newHecto += (item.hectolitros || 0);
        return item;
      }
    });

    if (newItems.length === 0 && req.item) {
      const p = getProduct(req.item);
      if (p) {
        hasChanges = true;
        const boxPrice = p.valor || 0;
        const itemVal = boxPrice * (req.quantidade || 1);
        const itemHecto = (p.fatorHecto || 0) * (req.quantidade || 1);
        return {
          ...req,
          descricaoItem: p.descricao || req.descricaoItem,
          valorTotal: Number(itemVal.toFixed(2)),
          hectolitros: Number(itemHecto.toFixed(4))
        };
      }
    }

    if (hasChanges && newItems.length > 0) {
      return {
        ...req,
        items: newItems,
        valorTotal: Number(newTotalVal.toFixed(2)),
        hectolitros: Number(newHecto.toFixed(4))
      };
    }

    return req;
  });

  const updatedVales = valesList.map(vale => {
    const origReq = updatedRequests.find(r => r.id === vale.requestId);
    if (origReq) {
      return {
        ...vale,
        valorTotal: origReq.valorTotal || vale.valorTotal,
        hectolitros: origReq.hectolitros || vale.hectolitros,
        originalRequest: origReq
      };
    }
    return vale;
  });

  return { updatedRequests, updatedVales };
}
