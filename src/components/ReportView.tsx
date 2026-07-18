import React, { useMemo } from "react";
import { ExchangeRecord } from "../types";
import { Download, Printer, Table, CheckSquare, RefreshCw, AlertTriangle, Layers } from "lucide-react";

interface ReportViewProps {
  records: ExchangeRecord[];
}

export default function ReportView({ records: rawRecords }: ReportViewProps) {
  // Exclude manual representative portal entries so we only count and report officially imported Promax data (User request)
  const records = useMemo(() => {
    return rawRecords.filter(r => r.sistemaOrigem !== "Portal de Campo SSTR");
  }, [rawRecords]);

  // Current query analytics
  const metrics = useMemo(() => {
    let totalBRL = 0;
    let approvedBRL = 0;
    let pendingBRL = 0;
    let reprovedBRL = 0;
    let totalItems = 0;

    const sectorSpent: { [sector: string]: number } = {};
    const justificationSpent: { [justify: string]: number } = {};

    records.forEach(r => {
      totalBRL += r.valorTotal;
      totalItems += r.quantidade;

      const sc = r.status.toLowerCase();
      if (sc.includes("aprov")) approvedBRL += r.valorTotal;
      else if (sc.includes("pend")) pendingBRL += r.valorTotal;
      else if (sc.includes("reprov")) reprovedBRL += r.valorTotal;

      if (!sectorSpent[r.setorVenda]) sectorSpent[r.setorVenda] = 0;
      sectorSpent[r.setorVenda] += r.valorTotal;

      if (!justificationSpent[r.justificativa]) justificationSpent[r.justificativa] = 0;
      justificationSpent[r.justificativa] += r.valorTotal;
    });

    return {
      totalBRL,
      approvedBRL,
      pendingBRL,
      reprovedBRL,
      totalCount: records.length,
      totalItems,
      sectorSpent: Object.entries(sectorSpent).sort((a,b) => b[1] - a[1]),
      justificationSpent: Object.entries(justificationSpent).sort((a,b) => b[1] - a[1]),
    };
  }, [records]);

  // Format currency cash
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Convert currently active database parameters into native CSV text file matching Microsoft Excel layout
  const handleDownloadCSV = () => {
    if (records.length === 0) return;

    // Headers
    const headers = [
      "ID Solicitação",
      "Setor Venda",
      "Código Cliente",
      "Nome Cliente",
      "Status",
      "Código Produto",
      "Descrição Produto",
      "Quantidade",
      "Medida",
      "Valor Unitário",
      "Valor Total",
      "Justificativa",
      "Nota Fiscal Gerada",
      "Motorista",
      "Veículo",
      "Placa",
      "Conferente",
      "Data Solicitação",
      "Observação"
    ];

    const lines = [headers.join(";")];

    records.forEach(r => {
      const row = [
        r.solicitacao,
        r.setorVenda,
        r.codigoCliente,
        `"${r.nomeCliente.replace(/"/g, '""')}"`,
        r.status,
        r.produto,
        `"${r.descricaoProduto.replace(/"/g, '""')}"`,
        r.quantidade,
        r.um,
        r.valorUnitario.toString().replace(".", ","),
        r.valorTotal.toString().replace(".", ","),
        `"${(r.justificativa || "Avaria").replace(/"/g, '""')}"`,
        r.nf || "-",
        `"${(r.nomeMotorista || "").replace(/"/g, '""')}"`,
        `"${(r.veiculo || "").replace(/"/g, '""')}"`,
        r.placa || "-",
        `"${(r.conferente || "").replace(/"/g, '""')}"`,
        r.dataSolicitacao,
        `"${(r.observacao || "").replace(/"/g, '""')}"`
      ];
      lines.push(row.join(";"));
    });

    const csvContent = "\uFEFF" + lines.join("\n"); // UTF-8 BOM for Microsoft Excel compliance
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const timestampStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_trocas_auditoria_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTriggerPrint = () => {
    let printedWithNewTab = false;
    const printElement = document.getElementById("report-printable-area");
    if (printElement) {
      try {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(el => el.outerHTML)
            .join('\n');
          
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>SSTR - Relatório Geral de Trocas</title>
                ${styles}
                <style>
                  body {
                    background-color: white !important;
                    color: black !important;
                    padding: 24px 32px !important;
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                  }
                  #report-printable-area {
                    display: block !important;
                    color: black !important;
                    background-color: white !important;
                  }
                  /* Override dark theme classes for print output compatibility */
                  .bg-slate-950, .bg-slate-900, .bg-blue-950\\/40, .bg-amber-950\\/40 {
                    background-color: #f8fafc !important;
                    color: black !important;
                    border: 1px solid #cbd5e1 !important;
                  }
                  .text-white, .text-slate-200, .text-slate-300, .text-slate-400, .text-slate-500, .text-blue-300, .text-blue-400, .text-amber-300, .text-amber-400 {
                    color: black !important;
                  }
                  .border-slate-800, .border-slate-850, .border-blue-900\\/40, .border-amber-900\\/40 {
                    border-color: #cbd5e1 !important;
                  }
                  table {
                    border-collapse: collapse !important;
                    width: 100% !important;
                  }
                  th, td {
                    border: 1px solid #cbd5e1 !important;
                    padding: 6px 8px !important;
                    color: black !important;
                  }
                  th {
                    background-color: #f1f5f9 !important;
                    font-weight: bold !important;
                  }
                  /* Make sure text truncations aren't hidden */
                  .truncate {
                    overflow: visible !important;
                    white-space: normal !important;
                  }
                </style>
              </head>
              <body class="bg-white text-black">
                <div id="report-printable-area" class="space-y-8">
                  ${printElement.innerHTML}
                </div>
                <script>
                  window.onload = function() {
                    window.focus();
                    setTimeout(function() {
                      window.print();
                    }, 450);
                  };
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
          printedWithNewTab = true;
        }
      } catch (e) {
        console.warn("Could not print in a new tab, falling back to window.print()", e);
      }
    }

    if (!printedWithNewTab) {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn("Iframe blocked print dialog:", e);
      }
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Exporter triggers row */}
      <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print">
        <div>
          <h3 className="text-lg font-bold font-display text-white">Central de Relatórios & Exportação</h3>
          <p className="text-xs text-slate-400 font-mono">Gere planilhas nos padrões Excel ou baixe relatórios formatados em PDF de trocas.</p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto shrink-0">
          <button
            onClick={handleDownloadCSV}
            disabled={records.length === 0}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer shadow-lg shadow-blue-900/20"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Excel (CSV)</span>
          </button>

          <button
            onClick={handleTriggerPrint}
            disabled={records.length === 0}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-slate-300 rounded-lg border border-slate-800 text-xs font-semibold flex items-center justify-center space-x-2 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>Imprimir PDF</span>
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="bg-slate-900 text-center py-20 rounded-2xl border border-slate-850 text-slate-500 font-mono text-xs no-print">
          Adicione dados ou limpe os filtros para gerar relatórios completos.
        </div>
      ) : (
        /* Printable preview sheet card */
        <div id="report-printable-area" className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-8 select-all print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
          {/* Print letterhead */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-800 print:border-b print:border-gray-300">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400 font-mono print:text-blue-600">Pau Brasil Guarabira LTDA</p>
              <h2 className="text-2xl font-bold font-display text-white mt-1 print:text-gray-900">
                Relatório Geral de Trocas e Reposições
              </h2>
              <p className="text-xs text-slate-400 mt-1 print:text-gray-500">Histórico auditado de transações consolidadas</p>
            </div>
            <div className="text-right text-xs font-mono text-slate-400 print:text-gray-500">
              <p>Lançamentos: <strong className="text-white print:text-black">{metrics.totalCount}</strong></p>
              <p className="mt-0.5">Gerado: <strong className="text-white print:text-black">{new Date().toLocaleDateString("pt-BR")}</strong></p>
            </div>
          </div>

          {/* Consolidated financial row list */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 print:bg-gray-100 print:border-gray-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase font-mono block print:text-gray-500">Valoração Total</span>
              <span className="text-lg font-bold text-slate-200 block font-mono mt-1 print:text-black">{formatCurrency(metrics.totalBRL)}</span>
            </div>
            <div className="p-4 bg-blue-950/40 rounded-xl border border-blue-900/40 print:bg-blue-50 print:border-blue-100">
              <span className="text-[9px] font-bold text-blue-400 uppercase font-mono block print:text-blue-600">Volume Aprovado</span>
              <span className="text-lg font-bold text-blue-300 block font-mono mt-1 print:text-blue-900">{formatCurrency(metrics.approvedBRL)}</span>
            </div>
            <div className="p-4 bg-amber-950/40 rounded-xl border border-amber-900/40 print:bg-amber-50 print:border-amber-100">
              <span className="text-[9px] font-bold text-amber-400 uppercase font-mono block print:text-amber-600 font-mono">Volume em Análise</span>
              <span className="text-lg font-bold text-amber-300 block font-mono mt-1 print:text-amber-900">{formatCurrency(metrics.pendingBRL)}</span>
            </div>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 font-mono print:bg-gray-100 print:border-gray-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase font-sans block print:text-gray-500">Itens Lançados</span>
              <span className="text-lg font-bold text-slate-200 block mt-1 print:text-black">{metrics.totalItems} un</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Sector matrix totals */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono pb-2 border-b border-slate-800 print:border-b print:border-gray-250 print:text-gray-700">
                Divisão de Recursos por Setores de Venda
              </h4>
              <div className="space-y-2">
                {metrics.sectorSpent.map(([sector, spent]) => {
                  const percent = metrics.totalBRL > 0 ? (spent / metrics.totalBRL) * 100 : 0;
                  return (
                    <div key={sector} className="flex justify-between items-center text-xs font-mono py-1 border-b border-slate-850/40 print:border-b print:border-gray-100">
                      <span className="font-semibold text-slate-450 print:text-gray-655">Setor {sector} ({percent.toFixed(1)}%)</span>
                      <span className="font-bold text-slate-200 print:text-black">{formatCurrency(spent)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Justifications list */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono pb-2 border-b border-slate-800 print:border-b print:border-gray-250 print:text-gray-700">
                Valoração por Justificativa (Poupança & Perdas)
              </h4>
              <div className="space-y-2">
                {metrics.justificationSpent.map(([justkey, spent]) => {
                  const percent = metrics.totalBRL > 0 ? (spent / metrics.totalBRL) * 100 : 0;
                  return (
                    <div key={justkey} className="flex justify-between items-center text-xs font-mono py-1 border-b border-slate-850/40 print:border-b print:border-gray-100">
                      <span className="font-semibold text-slate-455 print:text-gray-655 truncate max-w-[70%]">{justkey} ({percent.toFixed(1)}%)</span>
                      <span className="font-bold text-slate-200 print:text-black">{formatCurrency(spent)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Records Table Preview */}
          <div className="pt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono mb-3 print:text-gray-700">Linhas de Auditoria Selecionadas ({records.length})</h4>
            
            <div className="overflow-x-auto border border-slate-800 rounded-xl print:border print:border-gray-300">
              <table className="min-w-full text-left font-mono text-[10px] divide-y divide-slate-850 print:divide-y print:divide-gray-200">
                <thead className="bg-slate-950 text-slate-400 font-sans font-semibold print:bg-gray-100 print:text-gray-600">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">S.R.</th>
                    <th className="p-3">Cli Cód</th>
                    <th className="p-3 font-sans">Cliente</th>
                    <th className="p-3 text-center">Setor</th>
                    <th className="p-3">Cód Prod</th>
                    <th className="p-3 font-sans">Descrição Produto</th>
                    <th className="p-3 text-right">Qtd</th>
                    <th className="p-3 text-right">Unitário</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 font-sans">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850/60 text-slate-300 bg-slate-900/60 print:bg-white print:text-black print:divide-y print:divide-gray-100">
                  {records.map((r, i) => (
                    <tr key={r.id} className="hover:bg-slate-950/40 print:hover:bg-transparent">
                      <td className="p-3 whitespace-nowrap">{r.dataSolicitacao}</td>
                      <td className="p-3 font-semibold text-slate-200 print:text-black">{r.solicitacao}</td>
                      <td className="p-3">{r.codigoCliente}</td>
                      <td className="p-3 font-sans truncate max-w-[120px]" title={r.nomeCliente}>{r.nomeCliente}</td>
                      <td className="p-3 text-center">{r.setorVenda}</td>
                      <td className="p-3">{r.produto}</td>
                      <td className="p-3 font-sans truncate max-w-[180px]" title={r.descricaoProduto}>{r.descricaoProduto}</td>
                      <td className="p-3 text-right font-semibold text-blue-400 print:text-black">{r.quantidade} {r.um}</td>
                      <td className="p-3 text-right">{r.valorUnitario.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-white print:text-black">{r.valorTotal.toFixed(2)}</td>
                      <td className="p-3 font-sans font-semibold">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
