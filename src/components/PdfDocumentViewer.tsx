import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Printer, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  AlertCircle,
  Loader2,
  Maximize2
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// Configure pdfjs worker safely
try {
  if (typeof window !== "undefined" && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    // Use worker from unpkg or cdnjs as reliable fallback
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  }
} catch (err) {
  console.warn("Could not set PDF.js workerSrc:", err);
}

interface PdfDocumentViewerProps {
  source: string | null;
  onClose: () => void;
  title?: string;
  fileName?: string;
}

export default function PdfDocumentViewer({ 
  source, 
  onClose, 
  title = "Visualizador de Documento PDF", 
  fileName = "documento_sstr.pdf" 
}: PdfDocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImage, setIsImage] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  // Check if source is image or PDF
  useEffect(() => {
    if (!source) return;

    const lower = source.toLowerCase();
    const isImg = lower.startsWith("data:image/") || 
      lower.endsWith(".png") || 
      lower.endsWith(".jpg") || 
      lower.endsWith(".jpeg") || 
      lower.endsWith(".webp");

    setIsImage(isImg);

    if (isImg) {
      setIsLoading(false);
      return;
    }

    // Load PDF
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setCurrentPage(1);

    const loadPdf = async () => {
      try {
        if (source === "pdf_placeholder") {
          setIsLoading(false);
          return;
        }

        let pdfData: any = source;

        // Convert base64 Data URL to Uint8Array if needed
        if (typeof source === "string" && source.startsWith("data:application/pdf")) {
          const base64Data = source.split(",")[1];
          if (base64Data) {
            const raw = window.atob(base64Data);
            const rawLength = raw.length;
            const array = new Uint8Array(new ArrayBuffer(rawLength));
            for (let i = 0; i < rawLength; i++) {
              array[i] = raw.charCodeAt(i);
            }
            pdfData = { data: array };
          }
        }

        const loadingTask = pdfjsLib.getDocument(pdfData);
        const doc = await loadingTask.promise;

        if (isCancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setIsLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.error("Error loading PDF via PDF.js:", err);
        setErrorMessage(err?.message || "Não foi possível carregar o arquivo PDF diretamente no navegador.");
        setIsLoading(false);
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [source]);

  // Render current page to Canvas
  useEffect(() => {
    if (!pdfDocRef.current || isImage || isLoading) return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDocRef.current.getPage(currentPage);
        if (isCancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Cancel previous render task if active
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (e) {}
        }

        const viewport = page.getViewport({ scale: scale, rotation: rotation });
        
        // Crisp rendering on high-DPI screens
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        const renderContext = {
          canvasContext: ctx,
          transform: transform,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name === "RenderingCancelledException") {
          return;
        }
        console.warn("Render page error:", err);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [currentPage, scale, rotation, isLoading, isImage]);

  // Handle Download PDF/Image
  const handleDownload = () => {
    if (!source) return;

    if (source === "pdf_placeholder") {
      alert("Este é um registro demonstrativo de documento.");
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = source;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  // Handle Print PDF
  const handlePrint = () => {
    if (!source) return;

    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const printWin = window.open("", "_blank");
      if (printWin) {
        printWin.document.write(`
          <html>
            <head>
              <title>${fileName}</title>
              <style>
                body { margin: 0; display: flex; justify-content: center; align-items: center; background: #fff; }
                img { max-width: 100%; height: auto; }
              </style>
            </head>
            <body onload="window.print(); window.close();">
              <img src="${dataUrl}" />
            </body>
          </html>
        `);
        printWin.document.close();
      }
    } else if (source.startsWith("data:image")) {
      const printWin = window.open("", "_blank");
      if (printWin) {
        printWin.document.write(`
          <html>
            <head><title>${fileName}</title></head>
            <body onload="window.print(); window.close();">
              <img src="${source}" style="max-width:100%;" />
            </body>
          </html>
        `);
        printWin.document.close();
      }
    }
  };

  // Handle Open in New Tab
  const handleOpenInNewTab = () => {
    if (!source) return;

    try {
      if (source.startsWith("data:application/pdf")) {
        const base64 = source.split(",")[1];
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } else {
        window.open(source, "_blank");
      }
    } catch (err) {
      console.error("Open in new tab failed:", err);
      window.open(source, "_blank");
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in no-print"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-700/80 w-full max-w-5xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 bg-emerald-950/60 border border-emerald-700/40 rounded-lg text-emerald-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h3 className="text-sm font-bold text-white tracking-wide truncate">{title}</h3>
              <p className="text-[10.5px] font-mono text-slate-400 truncate">{fileName}</p>
            </div>
          </div>

          {/* CONTROLS & ACTIONS */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {!isImage && numPages > 1 && (
              <div className="flex items-center bg-slate-900 border border-slate-750 rounded-lg px-2 py-1 gap-1.5 text-xs text-slate-300 font-mono">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-bold text-emerald-400">{currentPage} / {numPages}</span>
                <button
                  type="button"
                  disabled={currentPage >= numPages}
                  onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                  className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {!isImage && (
              <div className="hidden sm:flex items-center bg-slate-900 border border-slate-750 rounded-lg p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setScale(s => Math.max(0.6, Number((s - 0.2).toFixed(1))))}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-slate-300 px-1 font-bold">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setScale(s => Math.min(2.5, Number((s + 0.2).toFixed(1))))}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer ml-0.5"
                  title="Girar 90°"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              title="Imprimir Documento"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              title="Baixar Arquivo PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Baixar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Nova Aba</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DOCUMENT VIEWPORT AREA */}
        <div className="flex-1 overflow-auto bg-slate-950 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] relative select-none">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <p className="text-xs font-mono">Processando e renderizando documento...</p>
            </div>
          )}

          {errorMessage && (
            <div className="max-w-md p-6 bg-slate-900 border border-rose-900/60 rounded-2xl text-center space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-800/40 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Visualização Direta Indisponível</h4>
                <p className="text-xs text-slate-400">{errorMessage}</p>
              </div>
              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Download className="w-4 h-4" /> Baixar Arquivo PDF
                </button>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" /> Abrir no Navegador
                </button>
              </div>
            </div>
          )}

          {source === "pdf_placeholder" && !isLoading && (
            <div className="max-w-lg p-8 bg-slate-900 border border-emerald-900/40 rounded-2xl text-center space-y-3 shadow-xl">
              <FileText className="w-16 h-16 text-emerald-400 mx-auto animate-pulse" />
              <h4 className="text-sm font-bold text-white">Documento Oficial Registrado</h4>
              <p className="text-xs text-slate-400 font-mono">
                O arquivo oficial de comprovante foi armazenado na base de dados do SSTR.
              </p>
            </div>
          )}

          {isImage && source && !isLoading && (
            <div className="max-w-full max-h-full flex items-center justify-center overflow-auto">
              <img
                src={source}
                alt="Documento Anexado"
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-slate-800"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {!isImage && source !== "pdf_placeholder" && !errorMessage && (
            <div 
              className={`transition-opacity duration-200 flex justify-center items-center ${isLoading ? "opacity-0 h-0" : "opacity-100"}`}
            >
              <canvas
                ref={canvasRef}
                className="shadow-2xl rounded-lg bg-white border border-slate-700"
              />
            </div>
          )}
        </div>

        {/* FOOTER BAR */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <span>SSTR Gestão Logística • Ambev CD Pau Brasil</span>
          <span className="hidden sm:inline">Pressione ESC ou clique fora para fechar</span>
        </div>
      </div>
    </div>
  );
}
