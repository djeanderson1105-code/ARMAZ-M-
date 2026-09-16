import { PendingRequest } from "../types";
import { ValeEntry } from "../components/ValesHistoryDashboard";

/**
 * Checks whether a request has an associated Vale (Voucher) emitted.
 * Evaluates:
 * 1. Direct flags on the request (req.gerouVale, req.valeId, etc.)
 * 2. Direct ID or requestId matches in vales list
 * 3. Cross-reference matching by MAPA and SKU CADASTRADO (as explicitly requested:
 *    "se houver alguma reposição que já tenha sido gerado vale não entre nos dados e na soma, identifique pelo mapa e o sku cadastrado")
 */
export function isRequestWithVale(req: PendingRequest, vales: ValeEntry[] = []): boolean {
  if (!req) return false;

  // 1. Direct flags on request
  if (req.gerouVale === true || Boolean(req.valeId)) return true;
  const cast = req as any;
  if (cast.temVale === true || cast.hasVale === true) return true;

  // 2. Direct ID or requestId match
  const reqId = req.id;
  if (vales && vales.length > 0) {
    const directMatch = vales.some(v => 
      (v.requestId && v.requestId === reqId) ||
      (v.originalRequest?.id && v.originalRequest.id === reqId) ||
      (req.valeId && v.id === req.valeId)
    );
    if (directMatch) return true;
  }

  // 3. Match by MAPA and SKU CADASTRADO
  const rawMapa = String(req.mapa || "").trim().toLowerCase();
  if (!rawMapa || rawMapa === "0" || rawMapa === "-") {
    return false;
  }
  const cleanReqMapa = rawMapa.replace(/^m/i, "").replace(/^0+/, "");

  // Extract all SKUs from request
  const reqSkus = new Set<string>();
  if (req.item) {
    const s = String(req.item).trim().toLowerCase();
    reqSkus.add(s);
    reqSkus.add(s.replace(/^0+/, ""));
  }
  if (req.produto) {
    const s = String(req.produto).trim().toLowerCase();
    reqSkus.add(s);
    reqSkus.add(s.replace(/^0+/, ""));
  }
  if (req.items && Array.isArray(req.items)) {
    req.items.forEach(it => {
      const s = String(it.item || it.itemCode || (it as any).produto || "").trim().toLowerCase();
      if (s) {
        reqSkus.add(s);
        reqSkus.add(s.replace(/^0+/, ""));
      }
    });
  }

  if (reqSkus.size === 0 || !vales || vales.length === 0) {
    return false;
  }

  // Iterate over vales to find a match on MAPA + SKU
  for (const v of vales) {
    const rawVMapa = String(v.originalRequest?.mapa || (v as any).mapa || "").trim().toLowerCase();
    if (!rawVMapa || rawVMapa === "0" || rawVMapa === "-") continue;

    const cleanVMapa = rawVMapa.replace(/^m/i, "").replace(/^0+/, "");
    const mapaMatches = rawMapa === rawVMapa || (cleanReqMapa.length >= 2 && cleanReqMapa === cleanVMapa);

    if (mapaMatches) {
      // Extract all SKUs from vale
      const vSkus = new Set<string>();
      if (v.originalRequest?.item) {
        const s = String(v.originalRequest.item).trim().toLowerCase();
        vSkus.add(s);
        vSkus.add(s.replace(/^0+/, ""));
      }
      if (v.originalRequest?.produto) {
        const s = String(v.originalRequest.produto).trim().toLowerCase();
        vSkus.add(s);
        vSkus.add(s.replace(/^0+/, ""));
      }
      if (v.originalRequest?.items && Array.isArray(v.originalRequest.items)) {
        v.originalRequest.items.forEach((it: any) => {
          const s = String(it.item || it.itemCode || it.produto || "").trim().toLowerCase();
          if (s) {
            vSkus.add(s);
            vSkus.add(s.replace(/^0+/, ""));
          }
        });
      }
      if ((v as any).itemCode) {
        const s = String((v as any).itemCode).trim().toLowerCase();
        vSkus.add(s);
        vSkus.add(s.replace(/^0+/, ""));
      }
      if ((v as any).produto) {
        const s = String((v as any).produto).trim().toLowerCase();
        vSkus.add(s);
        vSkus.add(s.replace(/^0+/, ""));
      }

      // Check for SKU intersection
      for (const sku of reqSkus) {
        if (sku && vSkus.has(sku)) {
          return true;
        }
      }
    }
  }

  return false;
}
