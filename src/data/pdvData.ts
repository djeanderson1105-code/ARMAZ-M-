import PASTED_PDV_CSV_RAW from "./pdv_csv_consolidated.txt?raw";

export const PASTED_PDV_CSV = PASTED_PDV_CSV_RAW;

import { PdvInfo } from "../types";

let memoizedPdvs: Record<string, PdvInfo> | null = null;

export const getPdvDatabase = (): Record<string, PdvInfo> => {
  if (memoizedPdvs) return memoizedPdvs;

  const db: Record<string, PdvInfo> = {};

  // Parse the raw CSV
  const lines = PASTED_PDV_CSV.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(";");
    if (parts.length >= 10) {
      const codigo = parts[0].trim();
      if (codigo && codigo !== "CdPDV" && codigo !== "CódPDV" && codigo !== "Cód PDV" && codigo !== "Codigo PDV" && !codigo.startsWith("Cód") && !codigo.startsWith("Cd")) {
        db[codigo] = {
          codigo,
          documento: parts[1]?.trim() || "",
          nomeFantasia: parts[2]?.trim() || "",
          razaoSocial: parts[3]?.trim() || "",
          endereco: parts[4]?.trim() || "",
          complemento: parts[5]?.trim() || "",
          bairro: parts[6]?.trim() || "",
          municipio: parts[7]?.trim() || "", // Cidade -> Municipio
          uf: parts[8]?.trim() || "",
          cep: parts[9]?.trim() || ""
        };
      }
    }
  }

  // Load custom registered NBs from localStorage
  if (typeof window !== "undefined") {
    const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
    if (customPdvsRaw) {
      try {
        const customPdvs: PdvInfo[] = JSON.parse(customPdvsRaw);
        for (const pdv of customPdvs) {
          if (pdv.codigo) {
            db[pdv.codigo] = {
              codigo: pdv.codigo.trim(),
              razaoSocial: pdv.razaoSocial.trim(),
              nomeFantasia: pdv.nomeFantasia.trim(),
              municipio: pdv.municipio.trim(),
              documento: pdv.documento || "",
              endereco: pdv.endereco || "",
              complemento: pdv.complemento || "",
              bairro: pdv.bairro || "",
              uf: pdv.uf || "",
              cep: pdv.cep || ""
            };
          }
        }
      } catch (e) {
        console.error("Error parsing custom PDVs:", e);
      }
    }
  }

  memoizedPdvs = db;
  return db;
};

// Reset memoized cache (to refresh when a new one is added)
export const clearPdvCache = () => {
  memoizedPdvs = null;
};

// Save a new custom PDV
export const registerNewPdv = (pdv: PdvInfo): { success: boolean; error?: string } => {
  if (!pdv.codigo.trim() || !pdv.razaoSocial.trim() || !pdv.nomeFantasia.trim() || !pdv.municipio.trim()) {
    return { success: false, error: "Preencha todos os campos obrigatórios." };
  }
  
  if (typeof window === "undefined") return { success: false, error: "Ambiente inválido" };
  
  const formattedCode = pdv.codigo.trim();
  
  let customList: PdvInfo[] = [];
  const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
  if (customPdvsRaw) {
    try {
      customList = JSON.parse(customPdvsRaw);
    } catch (e) {
      customList = [];
    }
  }
  
  const existsInCustom = customList.some(p => p.codigo === formattedCode);
  
  if (existsInCustom) {
    customList = customList.map(p => p.codigo === formattedCode ? pdv : p);
  } else {
    customList.push(pdv);
  }
  
  localStorage.setItem("sstr_custom_pdvs_v1", JSON.stringify(customList));
  clearPdvCache();
  return { success: true };
};

// Save multiple custom PDVs at once
export const registerMultiplePdvs = (pdvs: PdvInfo[]): { success: boolean; count: number; error?: string } => {
  if (typeof window === "undefined") return { success: false, count: 0, error: "Ambiente inválido" };
  
  let customList: PdvInfo[] = [];
  const customPdvsRaw = localStorage.getItem("sstr_custom_pdvs_v1");
  if (customPdvsRaw) {
    try {
      customList = JSON.parse(customPdvsRaw);
    } catch (e) {
      customList = [];
    }
  }

  // Create a map of existing items for O(1) lookups and updates
  const customMap = new Map<string, PdvInfo>();
  for (const item of customList) {
    if (item && item.codigo) {
      customMap.set(item.codigo.trim(), item);
    }
  }

  let count = 0;
  for (const pdv of pdvs) {
    const formattedCode = pdv.codigo.trim();
    if (!formattedCode || !pdv.razaoSocial.trim() || !pdv.nomeFantasia.trim() || !pdv.municipio.trim()) {
      continue;
    }
    
    customMap.set(formattedCode, pdv);
    count++;
  }

  const updatedList = Array.from(customMap.values());

  try {
    localStorage.setItem("sstr_custom_pdvs_v1", JSON.stringify(updatedList));
  } catch (err: any) {
    console.error("Quota exceeded or error writing to localStorage:", err);
    return { success: false, count, error: "Limite de armazenamento do navegador excedido. Tente enviar uma lista menor." };
  }

  clearPdvCache();
  return { success: true, count };
};
