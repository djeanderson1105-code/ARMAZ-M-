import React, { useState, useEffect, useMemo, useRef } from "react";
import { ExchangeRecord } from "../types";
import { getApiUrl } from "../utils/apiUrl";
import { 
  BookOpen, 
  Bot, 
  FileText, 
  Printer, 
  Send, 
  Sparkles, 
  X, 
  HelpCircle, 
  Check, 
  MessageSquare,
  Maximize2,
  Minimize2,
  ChevronRight,
  ChevronDown,
  Download,
  AlertTriangle,
  ClipboardList,
  ShieldCheck,
  Truck,
  Package,
  Layers,
  Users,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getPdvDatabase } from "../data/pdvData";

interface SstrOperationalAssistantProps {
  records: ExchangeRecord[];
}

export default function SstrOperationalAssistant({ records }: SstrOperationalAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("manual");
  const [isMaximized, setIsMaximized] = useState(false);
  
  // AI Chat states
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant" | "system"; text: string; timestamp: Date }>>([
    {
      role: "assistant",
      text: "Olá! Sou o SSTR-AI, assistente inteligente do SSTR Pau Brasil Guarabira. Estou munido com o novo manual operacional revisado de POP/RACI e com a base de dados de reposições importada! Posso te responder perguntas sobre os fluxos operacionais, rateios de refugo, erros de carregamento, duplicatas e dar estatísticas reais do sistema. Como posso te apoiar hoje?",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isAiLoading]);

  // Compute stats context to enrich the AI with actual database insights!
  const statsContext = useMemo(() => {
    if (!records || records.length === 0) return { totalRecords: 0, totalValue: 0, pending: 0, metaLimit: 15000, topClient: null, pendingByClient: {} };
    
    const totalRecords = records.length;
    const approved = records.filter(r => r.status?.toLowerCase().includes("aprov") || r.statusNf?.toLowerCase().includes("aprov")).length;
    const pending = records.filter(r => r.status?.toLowerCase().includes("pend") || r.statusNf?.toLowerCase().includes("pend") || !r.status).length;
    const rejected = records.filter(r => r.status?.toLowerCase().includes("reprov") || r.status?.toLowerCase().includes("recus") || r.statusNf?.toLowerCase().includes("reprov")).length;
    
    // Total physical volumes (quantidade) and estimated monetary value
    const totalQuantity = records.reduce((sum, r) => sum + (r.quantidade || 0), 0);
    const totalValue = records.reduce((sum, r) => sum + (r.valorUnitario * r.quantidade || 0), 0);

    // Calculate Sector breakdown
    const sectorCounts: { [key: string]: number } = {};
    const sectorValues: { [key: string]: number } = {};
    records.forEach(r => {
      const sec = r.unb || "Geral";
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
      sectorValues[sec] = (sectorValues[sec] || 0) + (r.valorUnitario * r.quantidade || 0);
    });

    // Top 3 sectors by quantity
    const topSectors = Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([sector, count]) => ({ sector, count, value: sectorValues[sector] }));

    // Find reasons/motivos
    const motives: { [key: string]: number } = {};
    records.forEach(r => {
      const motive = r.tipo || r.solicitacao || "Reposição Geral";
      motives[motive] = (motives[motive] || 0) + 1;
    });
    const topMotives = Object.entries(motives)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([motive, count]) => `${motive} (${count} ocorrências)`);

    // --- ENHANCEMENTS FOR THE AI QUERY CAPABILITIES ---
    // 1. Find client with the highest number of exchange requests (cliente com maior solicitações de trocas)
    const clientRequests: Record<string, { nome: string; count: number; totalValue: number }> = {};
    records.forEach(r => {
      const code = r.codigoCliente;
      if (code) {
        if (!clientRequests[code]) {
          clientRequests[code] = { nome: r.nomeCliente || "Cliente sem Nome", count: 0, totalValue: 0 };
        }
        clientRequests[code].count += 1;
        clientRequests[code].totalValue += (r.valorUnitario * r.quantidade || 0);
      }
    });

    const sortedClients = Object.entries(clientRequests)
      .sort((a, b) => b[1].count - a[1].count);

    const topClient = sortedClients[0] ? {
      codigo: sortedClients[0][0],
      nome: sortedClients[0][1].nome,
      count: sortedClients[0][1].count,
      totalValue: sortedClients[0][1].totalValue
    } : null;

    // 2. Meta Limit calculations ("quanto falta de limite pra estourar a meta")
    const metaLimit = 15000; // Monthly limit in R$
    const amountToMeta = Math.max(0, metaLimit - totalValue);
    const metaExceeded = totalValue > metaLimit;

    // 3. Pending requests grouped by client NB (codigoCliente)
    const pendingByClient: Record<string, Array<{ id: string; mapa: string; nf: string; produto: string; descricao: string; quantidade: number; valorTotal: number; data: string }>> = {};
    records.forEach(r => {
      const isPending = r.status?.toLowerCase().includes("pend") || r.statusNf?.toLowerCase().includes("pend") || !r.status;
      if (isPending && r.codigoCliente) {
        const clientCode = r.codigoCliente.trim();
        if (!pendingByClient[clientCode]) {
          pendingByClient[clientCode] = [];
        }
        pendingByClient[clientCode].push({
          id: r.id,
          mapa: r.mapa || "N/A",
          nf: r.nf || "N/A",
          produto: r.produto || "N/A",
          descricao: r.descricaoProduto || "N/A",
          quantidade: r.quantidade || 0,
          valorTotal: r.valorTotal || (r.valorUnitario * r.quantidade) || 0,
          data: r.dataSolicitacao || "N/A"
        });
      }
    });

    return {
      totalRecords,
      approved,
      pending,
      rejected,
      totalQuantity,
      totalValue,
      topSectors,
      topMotives,
      topClient,
      metaLimit,
      amountToMeta,
      metaExceeded,
      pendingByClient
    };
  }, [records]);

  // Handle message submission
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isAiLoading) return;

    const userText = inputMessage.trim();
    setInputMessage("");
    
    // Add user message locally
    const newUserMessage = { role: "user" as const, text: userText, timestamp: new Date() };
    setMessages(prev => [...prev, newUserMessage]);
    setIsAiLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/gemini/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          context: {
            stats: statsContext,
            rules: {
              roles: ["Controle Operacional", "Representante de Negócios (RN)", "Motorista", "Monitoramento", "Armazém"],
              conferenciaPreRota: "O motorista é obrigado a realizar a conferência física da carga antes de sair do pátio da revenda para evitar erros de faturamento ou falta de produto.",
              errorCarregamento: "Se for identificado erro de carregamento pelo armazém, a entrega do SKU em falta será programada para a próxima data de entrega regular do PDV.",
              errorDescarregamento: "Se for identificado erro de descarregamento e não for localizado o produto físico, gera-se um vale no valor proporcional do SKU extraviado para rateio solidário entre a equipe da rota correspondente.",
              reportId: "03.18.05",
              validationStep: "Importar relatório 03.18.05 para cruzar registros do Promax, analisando na guia 'Duplicatas' do SSTR para identificar desvios. Se houver duplicatas ou desvios, a solicitação é reprovada."
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error("Falha ao comunicar com o servidor de inteligência artificial.");
      }

      const data = await response.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        text: data.text || "Desculpe, não consegui processar uma resposta agora.",
        timestamp: new Date()
      }]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: "assistant",
        text: `⚠️ Erro de Conexão: Não foi possível obter uma resposta do SSTR-AI. Certifique-se de que a chave de API GEMINI_API_KEY esteja devidamente configurada.
Detalhes do erro: ${err?.message || "Servidor offline"}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Print Manual logic
  const handlePrintManual = () => {
    const printContent = document.getElementById("sstr-pop-manual-content");
    if (!printContent) return;

    const win = window.open("", "_blank");
    if (!win) {
      alert("Por favor, ative as permissões de pop-up no seu navegador para exportar o manual.");
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>SSTR Pau Brasil Guarabira - Manual de Funcionamento, POP & RACI</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              line-height: 1.6;
              padding: 50px;
              max-width: 900px;
              margin: 0 auto;
              background-color: #ffffff;
            }
            .header-banner {
              text-align: center;
              border-bottom: 3px double #0284c7;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header-banner h1 {
              margin: 5px 0;
              font-size: 26px;
              color: #0369a1;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .header-banner p {
              margin: 5px 0;
              color: #64748b;
              font-size: 13px;
              font-weight: bold;
            }
            h2 {
              color: #0f172a;
              margin-top: 35px;
              font-size: 18px;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 6px;
              text-transform: uppercase;
            }
            h3 {
              color: #0284c7;
              font-size: 14px;
              margin-top: 20px;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            p, li {
              font-size: 13px;
              color: #334155;
            }
            li {
              margin-bottom: 8px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 25px 0;
              font-size: 12px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 12px;
              text-align: left;
            }
            th {
              background-color: #f8fafc;
              font-weight: bold;
              color: #0f172a;
            }
            .badge {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .badge-r { background-color: #dbeafe; color: #1e40af; }
            .badge-a { background-color: #d1fae5; color: #065f46; }
            .badge-c { background-color: #fef3c7; color: #92400e; }
            .badge-i { background-color: #f1f5f9; color: #334155; }
            
            .flowchart-step {
              background-color: #f8fafc;
              border-left: 4px solid #0284c7;
              padding: 15px;
              margin: 15px 0;
              border-radius: 0 8px 8px 0;
            }
            .flowchart-step strong {
              color: #0f172a;
              display: block;
              margin-bottom: 5px;
              font-size: 13px;
            }
            .important-box {
              background-color: #fef2f2;
              border: 1px solid #fee2e2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .important-box h4 {
              margin: 0 0 5px 0;
              color: #991b1b;
              font-size: 13px;
              text-transform: uppercase;
            }
            .footer-info {
              margin-top: 50px;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 15px;
            }
            .grid-sign {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 40px;
              margin-top: 40px;
              text-align: center;
            }
            .sign-box {
              border-top: 1px solid #94a3b8;
              padding-top: 10px;
              font-size: 12px;
              color: #475569;
            }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-banner">
            <h1>SSTR PAU BRASIL GUARABIRA-PB</h1>
            <p>SISTEMA DE SOLUÇÕES DE TROCAS E REPOSIÇÕES • PADRÃO OPERACIONAL DE FUNCIONAMENTO (POP & RACI)</p>
            <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Código de Documento: POP-SSTR-001-REV1.5 • Emissão: Julho/2026</p>
          </div>
          ${printContent.innerHTML}
          <div class="footer-info">
            SSTR Pau Brasil Guarabira-PB • Tecnologia de Controle Operacional • Todos os direitos reservados.
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <>
      {/* FLOATING TRIGGER ICON AT THE BOTTOM RIGHT - Optimized for Mobile touch target and non-blocking layout */}
      <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 no-print">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`flex items-center justify-center space-x-0 md:space-x-2 rounded-full cursor-pointer shadow-2xl border transition-all duration-300 w-12 h-12 md:w-auto md:px-4 md:h-12 ${
            isOpen 
              ? "bg-slate-900 border-rose-500 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]" 
              : "bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-650 hover:from-blue-600 hover:to-indigo-550 border-blue-500 text-white shadow-[0_0_25px_rgba(37,99,235,0.35)]"
          }`}
          title="Manual de Funcionamento POP/RACI e Assistente de IA SSTR"
        >
          <div className="relative flex items-center justify-center">
            {isOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <>
                <Bot className="w-5 h-5 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </>
            )}
          </div>
          <span className="hidden md:inline text-xs font-bold font-sans tracking-wide uppercase">
            {isOpen ? "Fechar Manual/IA" : "Manual & Assistente IA"}
          </span>
        </motion.button>
      </div>

      {/* FLOATING DRAWER CONTAINER - Responsive with CSS viewport units */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              width: isMaximized ? "94vw" : "min(540px, 94vw)",
              height: isMaximized ? "88vh" : "min(620px, 82vh)",
              right: isMaximized ? "3vw" : "min(24px, 3vw)",
              bottom: isMaximized ? "6vh" : "min(80px, 10vh)"
            }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 220, damping: 25 }}
            className="fixed z-50 bg-slate-950 border border-slate-800 shadow-[0_15px_50px_-15px_rgba(0,0,0,0.8)] rounded-3xl overflow-hidden flex flex-col no-print text-left"
          >
            {/* WIDGET HEADER */}
            <div className="bg-slate-900 border-b border-slate-950 px-4 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-950/80 border border-blue-900 text-blue-400 rounded-xl">
                  <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                    Manual SSTR & Assistente IA
                  </h3>
                  <p className="text-[9px] font-mono text-slate-500">
                    POP Operacional, Matriz RACI, Segurança & Auditoria 03.18.05
                  </p>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={isMaximized ? "Minimizar" : "Maximizar"}
                >
                  {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-rose-950/50 hover:text-rose-400 rounded-lg text-slate-400 transition-colors cursor-pointer"
                  title="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="bg-slate-950 px-4 py-2 border-b border-slate-900 flex items-center justify-between shrink-0">
              <div className="flex space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveTab("manual")}
                  className={`px-3 py-1.5 rounded-md text-[10.5px] font-bold font-sans flex items-center space-x-1.5 transition-all cursor-pointer ${
                    activeTab === "manual"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Manual POP & RACI</span>
                </button>
                <button
                  onClick={() => setActiveTab("ai")}
                  className={`px-3 py-1.5 rounded-md text-[10.5px] font-bold font-sans flex items-center space-x-1.5 transition-all cursor-pointer ${
                    activeTab === "ai"
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Perguntas & Respostas (IA)</span>
                </button>
              </div>

              {activeTab === "manual" && (
                <button
                  onClick={handlePrintManual}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] text-slate-300 font-bold font-sans rounded-lg flex items-center space-x-1 hover:text-white cursor-pointer transition-all"
                  title="Exportar Manual em PDF ou Imprimir"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-400" />
                  <span>PDF / Imprimir Manual</span>
                </button>
              )}
            </div>

            {/* TAB CONTENTS CONTAINER */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
              
              {/* TAB 1: OPERATIONAL MANUAL */}
              {activeTab === "manual" && (
                <div className="space-y-6 animate-fade-in text-slate-300 text-xs">
                  
                  {/* PRINTABLE CORE BOX */}
                  <div id="sstr-pop-manual-content" className="space-y-6">
                    
                    {/* SECTION 1: OBJETIVO */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-2">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <Check className="w-4 h-4 text-blue-500" />
                        1. OBJETIVO
                      </h3>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Este Padrão Operacional tem por objetivo normatizar o processo de trocas, devoluções parciais e reposições físicas de SKUs (falta de produto completo) na distribuidora <strong>Pau Brasil Guarabira-PB</strong>. Busca assegurar a integridade do estoque físico, conferência contábil, eliminação de duplicidades via conciliação de relatórios Promax, correta destinação de avarias, além de definir claramente os direitos e deveres dos agentes operacionais (Representantes, Motoristas, Armazém, Monitoramento e Controle).
                      </p>
                    </div>

                    {/* SECTION 2: CAMPO DE APLICAÇÃO */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-2">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-500" />
                        2. CAMPO DE APLICAÇÃO
                      </h3>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Aplica-se integralmente aos seguintes setores e papéis da unidade de distribuição Pau Brasil:
                      </p>
                      <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-400">
                        <li><strong>Força de Vendas / Comercial:</strong> Representantes de Negócio (RNs) e Supervisores.</li>
                        <li><strong>Logística e Transportes:</strong> Motoristas de Rota e Ajudantes de Entrega.</li>
                        <li><strong>Monitoramento de Frota:</strong> Operadores de monitoramento e auditoria de rota.</li>
                        <li><strong>Armazém e Inventário:</strong> Conferentes, Operadores de Empilhadeira e Supervisão de estoque.</li>
                        <li><strong>Controle Operacional / Faturamento:</strong> Analistas administrativos responsáveis pelo fechamento e Promax.</li>
                      </ul>
                    </div>

                    {/* SECTION 3: SEGURANÇA E EPIS */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-2">
                      <h3 className="text-xs font-extrabold text-rose-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-rose-500" />
                        3. SEGURANÇA E EPIs OBRIGATÓRIOS
                      </h3>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        A movimentação, manuseio e triagem física de produtos (especialmente vasilhames de vidro e fardos de bebidas) exigem estrito cumprimento das normas de segurança. São obrigatórios os seguintes Equipamentos de Proteção Individual (EPIs):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                        <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center gap-2">
                          <span className="text-lg">🥾</span>
                          <div>
                            <strong className="text-white block">Sapato de Segurança</strong>
                            <span className="text-slate-500 text-[9.5px]">Com biqueira de aço contra impactos.</span>
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center gap-2">
                          <span className="text-lg">🧤</span>
                          <div>
                            <strong className="text-white block">Luvas de Proteção</strong>
                            <span className="text-slate-500 text-[9.5px]">Tácteis/antiderrapantes para vidros e fardos.</span>
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center gap-2">
                          <span className="text-lg">🦺</span>
                          <div>
                            <strong className="text-white block">Colete Refletivo</strong>
                            <span className="text-slate-500 text-[9.5px]">Uso obrigatório nas vias e pátio do armazém.</span>
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-xl flex items-center gap-2">
                          <span className="text-lg">👓</span>
                          <div>
                            <strong className="text-white block">Óculos de Proteção</strong>
                            <span className="text-slate-500 text-[9.5px]">Proteção contra estilhaços de vidro em caso de quebras.</span>
                          </div>
                        </div>
                      </div>
                      <div className="p-2.5 bg-rose-950/20 border border-rose-900/40 rounded-xl text-[10px] text-rose-400 font-mono mt-1 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span><strong>ATENÇÃO:</strong> Qualquer quebra física de garrafas ou fardos na rota ou durante o descarregamento de refugo no pátio deve ser isolada imediatamente, varrida e depositada em recipiente apropriado, utilizando luvas e óculos protetores.</span>
                      </div>
                    </div>

                    {/* SECTION 4: CONFERÊNCIA DE CARGA (PRÉ-ROTA) & DESCARREGAMENTO */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-3">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <Truck className="w-4 h-4 text-blue-500" />
                        4. CONFERÊNCIA DE CARGA (PRÉ-ROTA) & FLUXO DE DESCARREGAMENTO
                      </h3>
                      
                      <div className="p-3 bg-blue-950/20 border border-blue-900/35 rounded-xl space-y-1">
                        <strong className="text-white block font-sans text-[11px] uppercase tracking-wide">📦 CONFERÊNCIA OBRIGATÓRIA ANTES DA SAÍDA:</strong>
                        <p className="text-[10.5px] text-slate-300 leading-relaxed font-mono">
                          É dever e responsabilidade exclusiva do <strong>Motorista</strong> realizar a conferência detalhada de toda a carga física carregada no veículo <strong>antes de sair do pátio da revenda</strong>. Essa medida preventiva garante que as quantidades e tipos de SKUs batam exatamente com as notas de entrega, eliminando antecipadamente erros de carregamento e prevenindo faltas de produtos no ato da entrega aos clientes.
                        </p>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
                        No retorno da rota de entrega de bebidas, o motorista e a equipe do veículo devem seguir este rito padrão de descarregamento no pátio de refugo da Pau Brasil:
                      </p>
                      <ul className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 pl-1 leading-normal">
                        <li><strong>Apresentação de Notas:</strong> O motorista deve entregar todas as Notas Fiscais (NF-e) que possuam ressalvas de recusa física ou avaria de produto diretamente ao conferente do pátio.</li>
                        <li><strong>Segregação Física:</strong> Os produtos físicos recusados (avarias, produtos incorretos) devem estar segregados em paletes separados dos vasilhames vazios normais.</li>
                        <li><strong>Conferência Visual:</strong> O conferente avalia as quantidades físicas e códigos de cada SKU contra o registro lançado na plataforma SSTR e a ressalva manuscrita no verso da nota fiscal física original.</li>
                      </ul>
                    </div>

                    {/* SECTION 5: DESCRIÇÃO DO FLUXO (WITH DETAILED VISUAL FLOWCHART) */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-4">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-500" />
                        5. DESCRIÇÃO DO FLUXO OPERACIONAL DETALHADO
                      </h3>

                      {/* AWESOME VISUAL FLOWCHART STEP-BY-STEP */}
                      <div className="space-y-3.5 border-l-2 border-slate-800 ml-2.5 pl-4 py-1 text-slate-300 font-sans text-[11px]">
                        
                        {/* FLOW STEP 0 */}
                        <div className="relative">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-slate-700 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">0</span>
                          <strong className="text-slate-400 text-[11.5px] uppercase tracking-wide block">CONFERÊNCIA DE CARGA (PRÉ-ROTA - MOTORISTA)</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5 font-mono">
                            Antes de sair do pátio da revenda, o motorista realiza a conferência obrigatória da carga do caminhão, certificando-se de que não faltam SKUs e eliminando erros operacionais do carregamento.
                          </p>
                        </div>

                        {/* FLOW STEP 1 */}
                        <div className="relative">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-blue-600 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">1</span>
                          <strong className="text-white text-[11.5px] uppercase tracking-wide block">IDENTIFICAÇÃO EM ROTA (MOTORISTA)</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5">
                            O motorista identifica avaria/recusa física no cliente. Registra no aplicativo SSTR preenchendo o <strong>NB do Cliente</strong>, <strong>Mapa de Carga</strong>, <strong>Nº da Nota Fiscal (NF-e)</strong>, <strong>Código do Produto (SKU)</strong>, quantidade e descrição do produto a ser recolhido.
                          </p>
                        </div>

                        {/* FLOW STEP 2 */}
                        <div className="relative">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-indigo-650 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">2</span>
                          <strong className="text-indigo-400 text-[11.5px] uppercase tracking-wide block">ENTRADA E INTEGRAÇÃO (MONITORAMENTO & CONTROLE)</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5">
                            O controle operacional recebe as solicitações em tempo real no dashboard. O setor operacional registra a respectiva devolução física/troca nos sistemas do Promax, espelhando os dados coletados na ponta da rota.
                          </p>
                        </div>

                        {/* FLOW STEP 3 */}
                        <div className="relative">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-amber-600 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">3</span>
                          <strong className="text-amber-400 text-[11.5px] uppercase tracking-wide block">CONCILIAÇÃO OPERACIONAL E CONFERÊNCIA (RELATÓRIO 03.18.05)</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5">
                            Periodicamente, o Analista de Controle exporta o relatório oficial de conciliação de faturamento <strong>03.18.05</strong> do Promax e importa o arquivo CSV correspondente na plataforma SSTR para verificação detalhada.
                          </p>
                        </div>

                        {/* FLOW STEP 4 */}
                        <div className="relative">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-rose-650 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">4</span>
                          <strong className="text-rose-400 text-[11.5px] uppercase tracking-wide block">FILTRO DE DUPLICATAS & AUDITORIA DE FRAUDES</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5 font-mono">
                            O SSTR cruza os dados do Promax com os registros locais na guia <strong className="text-white bg-slate-900 px-1 py-0.5 rounded border border-slate-800">Duplicatas</strong>. Caso identifique solicitações repetidas para o mesmo NB, nota fiscal, produto e volumetria, o sistema sinaliza desvio e ela é <strong className="text-rose-500">Reprovada</strong>. Se estiver tudo correto e elegível, é <strong className="text-emerald-500">Aprovada com Venda</strong> e encaminhada automaticamente na próxima data de entrega do PDV.
                          </p>
                        </div>

                        {/* FLOW STEP 5 */}
                        <div className="relative font-sans">
                          <span className="absolute -left-[25px] top-0 w-4 h-4 rounded-full bg-emerald-600 border border-slate-950 flex items-center justify-center text-[8px] font-bold text-white">5</span>
                          <strong className="text-emerald-400 text-[11.5px] uppercase tracking-wide block">ATUAÇÃO DO REPRESENTANTE (RN) EM CAMPO</strong>
                          <p className="text-slate-400 leading-relaxed mt-0.5">
                            O Representante de Negócios (RN) pode monitorar os status em tempo real das solicitações de seus clientes no portal. Ele também pode abrir novas solicitações de trocas identificadas em visitas de rota que por algum motivo não tenham sido lançadas previamente pelo motorista.
                          </p>
                        </div>

                      </div>

                      {/* SPECIAL RULE BOX: MISSING COMPLETE SKU (REPOSITIONS) */}
                      <div className="mt-4 p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-2">
                        <div className="flex items-center gap-1.5 border-b border-slate-850 pb-1.5 text-[11px] text-amber-500 font-bold uppercase tracking-wide">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500 animate-pulse" />
                          <span>REGRA DE TRATAMENTO DE REPOSIÇÕES (SKU COMPLETO EM FALTA)</span>
                        </div>
                        <p className="text-[10.5px] text-slate-300 leading-relaxed">
                          Sempre que for verificada a falta física de um SKU completo no ato da entrega, a equipe de rota (motorista/ajudantes) juntamente ao responsável pelo PDV deve registrar o desvio na plataforma. A tratativa de apuração de responsabilidade obedece aos seguintes critérios de triagem técnica:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[10px]">
                          <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl space-y-1">
                            <strong className="text-blue-400 block uppercase">📦 1. ERRO DE CARREGAMENTO (ARMAZÉM)</strong>
                            <p className="text-slate-400 leading-normal">
                              O armazém realiza o inventário físico do dia. Constatando sobra no estoque, fica configurado o Erro de Carregamento. A reposição do SKU físico será programada e alinhada para a <strong>próxima data de entrega regular do PDV</strong>.
                            </p>
                          </div>
                          <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl space-y-1">
                            <strong className="text-rose-400 block uppercase">🚚 2. ERRO DE DESCARREGAMENTO (ROTA)</strong>
                            <p className="text-slate-400 leading-normal font-mono">
                              O setor de monitoramento faz a auditoria física e de rotas (GPS, sensores). Se ficar configurado extravio, furto ou erro de descarga na rota sem rastreamento do produto físico, <strong>será gerado um vale no valor proporcional do SKU desviado, o qual será rateado financeiramente de forma solidária entre toda a equipe do veículo correspondente</strong>.
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* SECTION 5.1: MATRIZ RACI DO PROCESSO */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-3">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-blue-500" />
                        5.1 MATRIZ DE RESPONSABILIDADES (RACI)
                      </h3>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        A Matriz RACI operacional abaixo detalha as obrigações fundamentais de cada papel envolvido no ecossistema SSTR:
                      </p>
                      <div className="overflow-x-auto border border-slate-800 rounded-xl">
                        <table className="min-w-full divide-y divide-slate-800 text-[10px] text-slate-300 font-sans">
                          <thead className="bg-slate-900/80">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-slate-400">Atividade / Etapa</th>
                              <th className="px-2 py-2 text-center font-bold text-slate-400">Motorista</th>
                              <th className="px-2 py-2 text-center font-bold text-slate-400">RN</th>
                              <th className="px-2 py-2 text-center font-bold text-slate-400">Armazém</th>
                              <th className="px-2 py-2 text-center font-bold text-slate-400">Monitoramento</th>
                              <th className="px-2 py-2 text-center font-bold text-slate-400">Controle</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 bg-slate-950/25">
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Conferência de Carga (Pré-Rota)</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-a">A</span> <span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Identificação & Lançamento de Avarias</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Conferência Física do Refugo (Descarregamento)</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-a">A</span> <span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Cruzamento de Duplicatas (Relatório 03.18.05)</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-a">A</span> <span className="badge badge-r">R</span></td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Tratativas de Reposição (Erros de Carga)</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-a">A</span> <span className="badge badge-r">R</span></td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-white">Blitz de Refugo (Auditoria Surpresa)</td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-i">I</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-c">C</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-a">A</span> <span className="badge badge-r">R</span></td>
                              <td className="px-2 py-2 text-center"><span className="badge badge-r">R</span></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[9px] text-slate-500 font-mono">
                        <span><strong>R:</strong> Responsável (Executa)</span>
                        <span><strong>A:</strong> Aprovador (Responde)</span>
                        <span><strong>C:</strong> Consultado</span>
                        <span><strong>I:</strong> Informado</span>
                      </div>
                    </div>

                    {/* SECTION 6: BLITZ DE REFUGO */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-2">
                      <h3 className="text-xs font-extrabold text-blue-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-500" />
                        6. BLITZ DE REFUGO (AUDITORIA DE SURPRESA)
                      </h3>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-mono">
                        A Blitz de Refugo consiste em uma auditoria física, aleatória e de surpresa realizada pela supervisão de logística e analistas de controle no exato momento de chegada dos veículos de rota. Objetiva-se abrir fisicamente as caixas de devolução e confrontar os produtos físicos com as fotografias das evidências e os respectivos registros de devolução abertos no SSTR. Desvios constatados ou adulterações nas fotos ensejarão sanções disciplinares e abertura de investigação interna.
                      </p>
                    </div>

                    {/* SECTION 7: ARQUITETURA DE TI, DESENVOLVIMENTO & GUIA DE ALOCAÇÃO EM SERVIDOR */}
                    <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl space-y-4">
                      <h3 className="text-xs font-extrabold text-emerald-400 tracking-wider uppercase font-sans flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-500" />
                        7. DOCUMENTAÇÃO DE TI: CRIAÇÃO, ALOCAÇÃO DE SERVIDOR & RECRIAÇÃO DO SSTR
                      </h3>

                      {/* 7.1 Como Foi Criado */}
                      <div className="p-3.5 bg-slate-955 border border-slate-850 rounded-xl space-y-2">
                        <strong className="text-white text-[11px] font-mono uppercase tracking-wide block border-b border-slate-800 pb-1 flex items-center gap-1.5">
                          <span>🛠️ 7.1 Ferramentas e Tecnologias Utilizadas na Criação</span>
                        </strong>
                        <p className="text-[10.5px] text-slate-300 leading-relaxed">
                          O <strong>SSTR (Sistema de Soluções de Trocas e Reposições)</strong> foi idealizado e projetado por <strong>Djeanderson Soares</strong> (Coordenador de Armazém • Pau Brasil Guarabira) para automatizar a gestão de avarias, trocas, inversões e vales de falta de carga.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] pt-1">
                          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                            <strong className="text-blue-400 block">Plataforma de Desenvolvimento:</strong>
                            <span className="text-slate-400">Google AI Studio (Ambiente Agentic AI / Container Cloud Run com React + Vite + Node.js).</span>
                          </div>
                          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                            <strong className="text-indigo-400 block">Linguagem & Framework:</strong>
                            <span className="text-slate-400">TypeScript, React 18, Vite, Tailwind CSS v4, Lucide Icons e Motion.</span>
                          </div>
                          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                            <strong className="text-emerald-400 block">Persistência & Banco de Dados:</strong>
                            <span className="text-slate-400">Firebase Firestore Cloud Database com suporte a sincronização offline / IndexedDB local.</span>
                          </div>
                          <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                            <strong className="text-amber-400 block">Motor de Inteligência Artificial:</strong>
                            <span className="text-slate-400">Google Gemini API (SDK @google/genai) para assistente virtual e cruzamento de dados.</span>
                          </div>
                        </div>
                      </div>

                      {/* 7.2 Alocação em Servidor / Conta Empresarial */}
                      <div className="p-3.5 bg-slate-955 border border-slate-850 rounded-xl space-y-2">
                        <strong className="text-white text-[11px] font-mono uppercase tracking-wide block border-b border-slate-800 pb-1 flex items-center gap-1.5">
                          <span>🏢 7.2 Como Alocar em Servidor / Conta Empresarial da Pau Brasil</span>
                        </strong>
                        <p className="text-[10.5px] text-slate-300 leading-relaxed">
                          Caso a empresa opte por hospedar a aplicação em um servidor local/VPN da distribuidora ou em uma conta em nuvem corporativa (Google Cloud Platform / Cloud Run / AWS / Vercel Empresarial):
                        </p>
                        <ol className="list-decimal list-inside space-y-2 text-[10.5px] text-slate-300 pl-1 leading-relaxed">
                          <li>
                            <strong>Exportação do Código Fonte:</strong> Acesse o menu principal do AI Studio e escolha a opção <strong>"Export to ZIP"</strong> ou <strong>"Export to GitHub"</strong> para transferir todos os arquivos do projeto para o repositório oficial de TI da empresa.
                          </li>
                          <li>
                            <strong>Configuração das Variáveis de Ambiente (.env):</strong> No novo servidor empresarial, configure o arquivo de ambiente com as credenciais do projeto corporativo:
                            <div className="mt-1 p-2 bg-slate-900 font-mono text-[9.5px] text-emerald-300 rounded border border-slate-800 space-y-0.5">
                              <div>VITE_FIREBASE_PROJECT_ID=pau-brasil-sstr-prod</div>
                              <div>VITE_FIREBASE_API_KEY=sua_chave_firebase_empresarial</div>
                              <div>GEMINI_API_KEY=sua_chave_gemini_api_corporativa</div>
                            </div>
                          </li>
                          <li>
                            <strong>Compilação de Produção:</strong> Execute o comando <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded font-mono">npm run build</code> para gerar a pasta minificada <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded font-mono">dist/</code> e o arquivo bundled <code className="text-amber-300 bg-slate-900 px-1 py-0.5 rounded font-mono">dist/server.cjs</code>.
                          </li>
                          <li>
                            <strong>Execução em Produção:</strong> Inicie o serviço Node.js executando <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded font-mono">npm start</code> (que roda <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded font-mono">node dist/server.cjs</code> na porta 3000) ou utilize o Dockerfile containerizado.
                          </li>
                        </ol>
                      </div>

                      {/* 7.3 Como Outra Pessoa Pode Refazer o Sistema */}
                      <div className="p-3.5 bg-slate-955 border border-slate-850 rounded-xl space-y-2">
                        <strong className="text-white text-[11px] font-mono uppercase tracking-wide block border-b border-slate-800 pb-1 flex items-center gap-1.5">
                          <span>🔄 7.3 Como Outra Pessoa Pode Refazer ou Recriar a Aplicação do Zero</span>
                        </strong>
                        <p className="text-[10.5px] text-slate-300 leading-relaxed">
                          Para um novo desenvolvedor ou profissional de TI recriar este sistema mantendo 100% da compatibilidade operacional:
                        </p>
                        <ul className="list-disc list-inside space-y-1.5 text-[10.5px] text-slate-300 pl-1 leading-relaxed">
                          <li><strong>Passo 1 (Instalação):</strong> Instale Node.js v18+ e clone o código fonte do repositório. Execute <code className="text-blue-300 font-mono">npm install</code> para baixar as dependências de interface e backend Express.</li>
                          <li><strong>Passo 2 (Banco de Dados Firestore):</strong> Crie um projeto no Firebase Console com Firestore Database ativado em modo de produção. Importe as coleções primárias: <code className="text-indigo-300 font-mono">exchange_requests</code> (solicitações), <code className="text-indigo-300 font-mono">vales_historico</code> (vales) e <code className="text-indigo-300 font-mono">rep_credentials</code> (acessos dos representantes).</li>
                          <li><strong>Passo 3 (Regras de Segurança):</strong> Aplique as regras de acesso Firestore permitindo leitura/escrita autenticada dos registros.</li>
                          <li><strong>Passo 4 (Base de Dados Promax):</strong> Certifique-se de manter o parser de relatórios CSV do Promax (Relatório <code className="text-amber-300 font-mono">03.18.05</code>) localizado em <code className="text-slate-400 font-mono">src/utils/promaxParser.ts</code> para garantir a detecção automática de duplicatas.</li>
                        </ul>
                      </div>
                    </div>

                    {/* SECTIONS 8 & 9: ELABORADORES E APROVADORES */}
                    <div className="border-t border-slate-900 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px]">
                      <div className="p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl space-y-1">
                        <strong className="text-slate-400 uppercase font-sans tracking-wider block text-[9.5px]">✒️ Elaborado Por:</strong>
                        <p className="text-white font-bold">Djeanderson Soares</p>
                        <p className="text-slate-500">Coordenador de Armazém • Pau Brasil Guarabira</p>
                      </div>
                      <div className="p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl space-y-1">
                        <strong className="text-slate-400 uppercase font-sans tracking-wider block text-[9.5px]">🔒 Aprovado Por:</strong>
                        <p className="text-white font-bold">Marcos Guilherme (Gerente de Operação)</p>
                        <p className="text-slate-500">Operação Pau Brasil Guarabira</p>
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 2: AI CHAT ASSISTANT */}
              {activeTab === "ai" && (
                <div className="h-full flex flex-col space-y-3 font-sans">
                  
                  {/* Database stats banner at a glance for the user */}
                  <div className="p-3 bg-gradient-to-br from-indigo-950/60 to-slate-900/60 rounded-2xl border border-indigo-900/40 flex items-center justify-between text-[10.5px] shrink-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                      <span className="text-slate-300 font-medium">Dados SSTR Ativos:</span>
                      <span className="font-mono font-bold text-white bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850">
                        {statsContext.totalRecords} lançamentos
                      </span>
                    </div>
                    <span className="text-[9.5px] text-indigo-400 font-bold tracking-wide">
                      Total: R$ {statsContext.totalValue ? (statsContext.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"}
                    </span>
                  </div>

                  {/* MESSAGES FLOW CONTAINER */}
                  <div className="flex-1 min-h-[250px] max-h-[360px] overflow-y-auto bg-slate-900/45 border border-slate-900/80 rounded-2xl p-3.5 space-y-3.5 flex flex-col">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`max-w-[85%] rounded-2xl p-3 text-[11px] leading-relaxed flex flex-col space-y-1 text-left ${
                          msg.role === "user"
                            ? "bg-indigo-650 text-white ml-auto rounded-tr-none"
                            : "bg-slate-900 text-slate-100 mr-auto rounded-tl-none border border-slate-800"
                        }`}
                      >
                        <span className="font-semibold break-words whitespace-pre-wrap">{msg.text}</span>
                        <span className={`text-[8.5px] self-end ${msg.role === "user" ? "text-indigo-300" : "text-slate-500"} font-mono`}>
                          {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}

                    {/* AI LOADING PLACEHOLDER */}
                    {isAiLoading && (
                      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl rounded-tl-none p-3 mr-auto max-w-[85%] flex items-center space-x-2 text-[11px]">
                        <div className="flex space-x-1">
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                        </div>
                        <span className="text-[10px] text-indigo-400 font-mono font-medium">SSTR-AI está processando...</span>
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>

                  {/* CHAT INPUT FIELD FORM */}
                  <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Pergunte sobre POP, RACI, rateio de refugo ou erros..."
                      className="flex-1 bg-slate-900 border border-slate-800 hover:border-slate-750 focus:border-indigo-500 rounded-xl px-3.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none transition-colors h-10"
                      disabled={isAiLoading}
                    />
                    <button
                      type="submit"
                      className="w-10 h-10 bg-indigo-600 hover:bg-indigo-550 border border-indigo-500 text-white rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-55"
                      disabled={!inputMessage.trim() || isAiLoading}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                  
                  {/* Suggestion tags for easy clicks */}
                  <div className="flex flex-wrap gap-1.5 justify-start text-[9.5px]">
                    {[
                      "O que acontece no erro de carregamento?",
                      "Como funciona o rateio de descarregamento?",
                      "Qual o objetivo do manual?",
                      "O que é conferido na Blitz de Refugo?",
                      "Quais EPIs são exigidos por segurança?"
                    ].map((sug, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setInputMessage(sug);
                        }}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-indigo-400 border border-slate-850 hover:border-indigo-950 rounded-lg cursor-pointer transition-all font-sans font-medium"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>

                </div>
              )}

            </div>

            {/* WIDGET FOOTER */}
            <div className="bg-slate-900 border-t border-slate-950 px-4 py-2.5 flex items-center justify-between text-[9px] text-slate-500 font-mono shrink-0">
              <span>Distribuidora Pau Brasil Guarabira-PB v1.5</span>
              <span className="flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-500" /> Banco Auditado 2026
              </span>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
