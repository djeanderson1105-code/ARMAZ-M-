import { ExchangeRecord } from "../types";

/**
 * Checks if an ExchangeRecord is classified as "REPOSIÇÃO" (Falta de Produto / Relatório 03.18.05).
 * Match criteria: Justificativa, Tipo, or Observação contains "falta".
 */
export const isRecordReposicao = (r: ExchangeRecord): boolean => {
  if (!r) return false;
  const j = (r.justificativa || "").toLowerCase();
  const t = (r.tipo || "").toLowerCase();
  const o = (r.observacao || "").toLowerCase();
  return j.includes("falta") || t.includes("falta") || o.includes("falta");
};

/**
 * Checks if an ExchangeRecord is classified as "TROCA" (Outros Motivos / Avaria, Inversão, Vencimento, Qualidade, etc.).
 * Match criteria: Any reason other than product lack.
 */
export const isRecordTroca = (r: ExchangeRecord): boolean => {
  return !isRecordReposicao(r);
};
