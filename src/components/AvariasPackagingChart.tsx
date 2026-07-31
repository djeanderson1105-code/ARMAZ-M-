import React, { useMemo, useState } from "react";
import { PendingRequest, ExchangeRecord, isRGBProduct } from "../types";
import { calculateItemHL, calculateItemValue } from "../data/products";
import { getRecordHL } from "../utils/hectoFactors";
import { 
  Package, 
  RefreshCw, 
  Layers, 
  BarChart3, 
  PieChart as PieIcon, 
  DollarSign, 
  Droplet, 
  Boxes, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";

interface AvariasPackagingChartProps {
  requests?: PendingRequest[];
  records?: ExchangeRecord[];
  promaxRecords?: ExchangeRecord[];
}

export default function AvariasPackagingChart({ requests = [], records = [], promaxRecords = [] }: AvariasPackagingChartProps) {
  const [activeMetric, setActiveMetric] = useState<"hl" | "val" | "qty">("hl");
  const [showProductDetails, setShowProductDetails] = useState(false);

  // Compute breakdown for RGB vs One Way
  const stats = useMemo(() => {
    let rgb = { qty: 0, val: 0, hl: 0, count: 0, products: new Map<string, { code: string; desc: string; qty: number; val: number; hl: number }>() };
    let oneWay = { qty: 0, val: 0, hl: 0, count: 0, products: new Map<string, { code: string; desc: string; qty: number; val: number; hl: number }>() };

    // Select primary dataset: prefer records/promaxRecords if available, otherwise requests
    const hasRecords = (records && records.length > 0) || (promaxRecords && promaxRecords.length > 0);

    if (hasRecords) {
      const allRecords = [...records, ...promaxRecords];
      allRecords.forEach(rec => {
        const code = (rec.produto || "").toString().trim();
        const desc = rec.descricaoProduto || `Produto ${code}`;
        const qty = Number(rec.quantidade || 1);
        const val = Number(rec.valorTotal || 0);
        const hl = getRecordHL(rec) || Number(rec.hectolitros || 0);

        const isRgb = isRGBProduct(code, desc);
        const targetMap = isRgb ? rgb.products : oneWay.products;

        if (isRgb) {
          rgb.qty += qty;
          rgb.val += val;
          rgb.hl += hl;
          rgb.count += 1;
        } else {
          oneWay.qty += qty;
          oneWay.val += val;
          oneWay.hl += hl;
          oneWay.count += 1;
        }

        if (code) {
          const existing = targetMap.get(code) || { code, desc, qty: 0, val: 0, hl: 0 };
          existing.qty += qty;
          existing.val += val;
          existing.hl += hl;
          targetMap.set(code, existing);
        }
      });
    } else if (requests && requests.length > 0) {
      requests.forEach(req => {
        // Process items array if present
        if (req.items && req.items.length > 0) {
          req.items.forEach(item => {
            const code = (item.item || (item as any).itemCode || req.item || "").toString().trim();
            const desc = (item as any).descricaoProduto || (item as any).descricao || req.descricaoProduto || req.productDesc || `Produto ${code}`;
            const qty = Number(item.quantidade || 0);
            const val = calculateItemValue(item);
            const hl = calculateItemHL(item);

            const isRgb = isRGBProduct(code, desc);
            const targetMap = isRgb ? rgb.products : oneWay.products;
            if (isRgb) {
              rgb.qty += qty;
              rgb.val += val;
              rgb.hl += hl;
              rgb.count += 1;
            } else {
              oneWay.qty += qty;
              oneWay.val += val;
              oneWay.hl += hl;
              oneWay.count += 1;
            }

            if (code) {
              const existing = targetMap.get(code) || { code, desc, qty: 0, val: 0, hl: 0 };
              existing.qty += qty;
              existing.val += val;
              existing.hl += hl;
              targetMap.set(code, existing);
            }
          });
        } else {
          // Single item
          const code = (req.item || "").toString().trim();
          const desc = req.descricaoProduto || req.productDesc || `Produto ${code}`;
          const qty = Number(req.quantidade || 0);
          
          let val = 0;
          if (req.item) {
            val = calculateItemValue({
              item: req.item,
              quantidade: req.quantidade,
              unidadeMedida: (req as any).unidadeMedida || (req as any).um,
              customUnitPrice: (req as any).customUnitPrice
            });
          }
          if (val <= 0 && req.valorTotal && req.valorTotal > 0 && req.valorTotal !== 98.50) {
            val = req.valorTotal;
          }

          let hl = 0;
          if (req.item) {
            hl = calculateItemHL({
              item: req.item,
              quantidade: req.quantidade,
              unidadeMedida: (req as any).unidadeMedida || (req as any).um,
              fatorHecto: (req as any).fatorHecto
            });
          }
          if (hl <= 0 && req.hectolitros && req.hectolitros > 0) {
            hl = req.hectolitros;
          }

          const isRgb = isRGBProduct(code, desc);
          const targetMap = isRgb ? rgb.products : oneWay.products;

          if (isRgb) {
            rgb.qty += qty;
            rgb.val += val;
            rgb.hl += hl;
            rgb.count += 1;
          } else {
            oneWay.qty += qty;
            oneWay.val += val;
            oneWay.hl += hl;
            oneWay.count += 1;
          }

          if (code) {
            const existing = targetMap.get(code) || { code, desc, qty: 0, val: 0, hl: 0 };
            existing.qty += qty;
            existing.val += val;
            existing.hl += hl;
            targetMap.set(code, existing);
          }
        }
      });
    }

    const totalQty = rgb.qty + oneWay.qty;
    const totalVal = rgb.val + oneWay.val;
    const totalHl = rgb.hl + oneWay.hl;
    const totalCount = hasRecords ? (records.length + promaxRecords.length) : requests.length;

    const rgbHlPct = totalHl > 0 ? (rgb.hl / totalHl) * 100 : 0;
    const oneWayHlPct = totalHl > 0 ? (oneWay.hl / totalHl) * 100 : 0;

    const rgbValPct = totalVal > 0 ? (rgb.val / totalVal) * 100 : 0;
    const oneWayValPct = totalVal > 0 ? (oneWay.val / totalVal) * 100 : 0;

    const rgbQtyPct = totalQty > 0 ? (rgb.qty / totalQty) * 100 : 0;
    const oneWayQtyPct = totalQty > 0 ? (oneWay.qty / totalQty) * 100 : 0;

    const sortedRgbProducts = Array.from(rgb.products.values()).sort((a, b) => b.hl - a.hl);
    const sortedOneWayProducts = Array.from(oneWay.products.values()).sort((a, b) => b.hl - a.hl);

    return {
      rgb,
      oneWay,
      totalQty,
      totalVal,
      totalHl,
      totalCount,
      rgbHlPct,
      oneWayHlPct,
      rgbValPct,
      oneWayValPct,
      rgbQtyPct,
      oneWayQtyPct,
      sortedRgbProducts,
      sortedOneWayProducts
    };
  }, [requests, records, promaxRecords]);

  const activeMainPctRGB = activeMetric === "hl" ? stats.rgbHlPct : activeMetric === "val" ? stats.rgbValPct : stats.rgbQtyPct;
  const activeMainPctOW = activeMetric === "hl" ? stats.oneWayHlPct : activeMetric === "val" ? stats.oneWayValPct : stats.oneWayQtyPct;

  // SVG Donut calculation
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const rgbStrokeDash = (activeMainPctRGB / 100) * circumference;
  const oneWayStrokeDash = (activeMainPctOW / 100) * circumference;

  return (
    <div className="bg-slate-900/90 border-2 border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl space-y-6 mt-8 no-print animate-fadeIn">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-600/30 to-emerald-600/30 border border-indigo-400/40 rounded-2xl text-indigo-300 shadow-inner">
            <PieIcon className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-black text-white tracking-wide uppercase font-mono flex items-center gap-2">
              <span>📊 ANÁLISE DE AVARIAS POR TIPO DE EMBALAGEM</span>
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">
              Comparativo volumétrico (HL), financeiro (R$) e quantitativo (Unid): 
              <strong className="text-emerald-400 ml-1">RGB (Retornável)</strong> vs 
              <strong className="text-amber-400 ml-1">One Way (Descartável)</strong>
            </p>
          </div>
        </div>

        {/* METRIC SELECTION TOGGLES */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveMetric("hl")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMetric === "hl"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950 border border-emerald-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Droplet className="w-3.5 h-3.5" />
            <span>Hectolitros (HL)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric("val")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMetric === "val"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-950 border border-indigo-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Valor (R$)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMetric("qty")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeMetric === "qty"
                ? "bg-amber-600 text-white shadow-md shadow-amber-950 border border-amber-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Unidades (Unid)</span>
          </button>
        </div>
      </div>

      {/* TOP SUMMARY CARDS (RGB VS ONE WAY) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* RGB CARD */}
        <div className="bg-gradient-to-br from-emerald-950/80 via-slate-950 to-slate-950 border-2 border-emerald-500/50 rounded-2xl p-4 md:p-5 shadow-xl relative overflow-hidden card-3d">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between border-b border-emerald-900/50 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-emerald-300">
                <RefreshCw className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-black font-mono text-emerald-300 uppercase tracking-wide">
                  RGB - GARRAFAS RETORNÁVEIS
                </h4>
                <p className="text-[10.5px] text-slate-400 font-mono">
                  600ml, 1L, Caçulinha 300ml, Cachaça 51 Retornável
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-500 text-slate-950 text-xs font-black font-mono rounded-full shadow-md">
              {activeMetric === "hl" 
                ? `${stats.rgbHlPct.toFixed(1)}% do HL` 
                : activeMetric === "val" 
                ? `${stats.rgbValPct.toFixed(1)}% do R$` 
                : `${stats.rgbQtyPct.toFixed(1)}% das Unid`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Droplet className="w-3 h-3 text-emerald-400" /> Volume HL
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-emerald-300 mt-1">
                {stats.rgb.hl.toFixed(4)} <span className="text-[10px] text-emerald-500">HL</span>
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.rgbHlPct.toFixed(1)}% do total
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-emerald-400" /> Valor Est.
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-white mt-1">
                R$ {stats.rgb.val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.rgbValPct.toFixed(1)}% do valor
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-emerald-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Boxes className="w-3 h-3 text-emerald-400" /> Quantidade
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-emerald-400 mt-1">
                {stats.rgb.qty.toLocaleString("pt-BR")} <span className="text-[10px] text-emerald-500">unid</span>
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.rgbQtyPct.toFixed(1)}% do físico
              </span>
            </div>
          </div>
        </div>

        {/* ONE WAY CARD */}
        <div className="bg-gradient-to-br from-amber-955/80 via-slate-950 to-slate-950 border-2 border-amber-500/50 rounded-2xl p-4 md:p-5 shadow-xl relative overflow-hidden card-3d">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between border-b border-amber-900/50 pb-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 border border-amber-400/40 rounded-xl text-amber-300">
                <Package className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-black font-mono text-amber-300 uppercase tracking-wide">
                  ONE WAY - DESCARTÁVEIS
                </h4>
                <p className="text-[10.5px] text-slate-400 font-mono">
                  Latas de Alumínio, PET, Long Neck & Barris Chopp
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-amber-500 text-slate-950 text-xs font-black font-mono rounded-full shadow-md">
              {activeMetric === "hl" 
                ? `${stats.oneWayHlPct.toFixed(1)}% do HL` 
                : activeMetric === "val" 
                ? `${stats.oneWayValPct.toFixed(1)}% do R$` 
                : `${stats.oneWayQtyPct.toFixed(1)}% das Unid`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Droplet className="w-3 h-3 text-amber-400" /> Volume HL
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-amber-300 mt-1">
                {stats.oneWay.hl.toFixed(4)} <span className="text-[10px] text-amber-500">HL</span>
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.oneWayHlPct.toFixed(1)}% do total
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-amber-400" /> Valor Est.
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-white mt-1">
                R$ {stats.oneWay.val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.oneWayValPct.toFixed(1)}% do valor
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-amber-900/40">
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                <Boxes className="w-3 h-3 text-amber-400" /> Quantidade
              </span>
              <p className="text-sm md:text-base font-extrabold font-mono text-amber-400 mt-1">
                {stats.oneWay.qty.toLocaleString("pt-BR")} <span className="text-[10px] text-amber-500">unid</span>
              </p>
              <span className="text-[9.5px] text-slate-400 font-mono block mt-0.5">
                {stats.oneWayQtyPct.toFixed(1)}% do físico
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* GRAPHICAL COMPARISON ROW (CUSTOM DONUT + GAUGES) */}
      <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG DONUT CHART */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-900/60 rounded-2xl border border-slate-850">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              {/* Background circle */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-slate-800"
                strokeWidth="18"
                fill="transparent"
              />
              {/* One Way Segment */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-amber-500 transition-all duration-1000 ease-out"
                strokeWidth="18"
                strokeDasharray={`${oneWayStrokeDash} ${circumference}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                fill="transparent"
              />
              {/* RGB Segment */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-emerald-400 transition-all duration-1000 ease-out"
                strokeWidth="18"
                strokeDasharray={`${rgbStrokeDash} ${circumference}`}
                strokeDashoffset={`-${oneWayStrokeDash}`}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* DONUT INNER CONTENT */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                {activeMetric === "hl" ? "VOLUME HL" : activeMetric === "val" ? "VALOR R$" : "UNIDADES"}
              </span>
              <span className="text-lg font-black font-mono text-white mt-0.5">
                {activeMetric === "hl" 
                  ? `${stats.totalHl.toFixed(2)} HL` 
                  : activeMetric === "val" 
                  ? `R$ ${stats.totalVal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` 
                  : `${stats.totalQty.toLocaleString("pt-BR")}`}
              </span>
              <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                {requests.length} ocorrências
              </span>
            </div>
          </div>

          {/* DONUT LEGEND */}
          <div className="flex items-center justify-center gap-6 mt-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 border border-emerald-300 shadow" />
              <span className="text-emerald-300 font-bold">RGB ({activeMainPctRGB.toFixed(1)}%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded-full bg-amber-500 border border-amber-300 shadow" />
              <span className="text-amber-300 font-bold">One Way ({activeMainPctOW.toFixed(1)}%)</span>
            </div>
          </div>
        </div>

        {/* PROGRESS METRIC GAUGES */}
        <div className="lg:col-span-7 space-y-4">
          <h4 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span>Distribuição Percentual por Dimensão Operational</span>
          </h4>

          {/* GAUGES 1: VOLUME HL */}
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-blue-400" /> Volume Hectolitros (HL)
              </span>
              <span className="text-slate-400 font-bold">
                Total: <strong className="text-white">{stats.totalHl.toFixed(4)} HL</strong>
              </span>
            </div>
            <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden p-0.5 flex border border-slate-800">
              <div 
                style={{ width: `${stats.rgbHlPct}%` }}
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`RGB: ${stats.rgb.hl.toFixed(4)} HL (${stats.rgbHlPct.toFixed(1)}%)`}
              >
                {stats.rgbHlPct > 15 && `${stats.rgbHlPct.toFixed(1)}% RGB`}
              </div>
              <div 
                style={{ width: `${stats.oneWayHlPct}%` }}
                className="bg-amber-500 h-full rounded-r-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`One Way: ${stats.oneWay.hl.toFixed(4)} HL (${stats.oneWayHlPct.toFixed(1)}%)`}
              >
                {stats.oneWayHlPct > 15 && `${stats.oneWayHlPct.toFixed(1)}% OW`}
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span className="text-emerald-400 font-semibold">🔄 RGB: {stats.rgb.hl.toFixed(4)} HL ({stats.rgbHlPct.toFixed(1)}%)</span>
              <span className="text-amber-400 font-semibold">📦 One Way: {stats.oneWay.hl.toFixed(4)} HL ({stats.oneWayHlPct.toFixed(1)}%)</span>
            </div>
          </div>

          {/* GAUGES 2: FINANCIAL VALUE */}
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Valor Financeiro (R$)
              </span>
              <span className="text-slate-400 font-bold">
                Total: <strong className="text-white">R$ {stats.totalVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>
            <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden p-0.5 flex border border-slate-800">
              <div 
                style={{ width: `${stats.rgbValPct}%` }}
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`RGB: R$ ${stats.rgb.val.toFixed(2)} (${stats.rgbValPct.toFixed(1)}%)`}
              >
                {stats.rgbValPct > 15 && `${stats.rgbValPct.toFixed(1)}% RGB`}
              </div>
              <div 
                style={{ width: `${stats.oneWayValPct}%` }}
                className="bg-amber-500 h-full rounded-r-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`One Way: R$ ${stats.oneWay.val.toFixed(2)} (${stats.oneWayValPct.toFixed(1)}%)`}
              >
                {stats.oneWayValPct > 15 && `${stats.oneWayValPct.toFixed(1)}% OW`}
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span className="text-emerald-400 font-semibold">🔄 RGB: R$ {stats.rgb.val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ({stats.rgbValPct.toFixed(1)}%)</span>
              <span className="text-amber-400 font-semibold">📦 One Way: R$ {stats.oneWay.val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ({stats.oneWayValPct.toFixed(1)}%)</span>
            </div>
          </div>

          {/* GAUGES 3: PHYSICAL QUANTITY */}
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 font-bold flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-amber-400" /> Quantidade Física (Unidades)
              </span>
              <span className="text-slate-400 font-bold">
                Total: <strong className="text-white">{stats.totalQty.toLocaleString("pt-BR")} unid</strong>
              </span>
            </div>
            <div className="w-full bg-slate-950 h-4 rounded-full overflow-hidden p-0.5 flex border border-slate-800">
              <div 
                style={{ width: `${stats.rgbQtyPct}%` }}
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`RGB: ${stats.rgb.qty} unid (${stats.rgbQtyPct.toFixed(1)}%)`}
              >
                {stats.rgbQtyPct > 15 && `${stats.rgbQtyPct.toFixed(1)}% RGB`}
              </div>
              <div 
                style={{ width: `${stats.oneWayQtyPct}%` }}
                className="bg-amber-500 h-full rounded-r-full transition-all duration-700 flex items-center justify-center text-[9px] font-extrabold text-slate-950 overflow-hidden"
                title={`One Way: ${stats.oneWay.qty} unid (${stats.oneWayQtyPct.toFixed(1)}%)`}
              >
                {stats.oneWayQtyPct > 15 && `${stats.oneWayQtyPct.toFixed(1)}% OW`}
              </div>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 pt-0.5">
              <span className="text-emerald-400 font-semibold">🔄 RGB: {stats.rgb.qty.toLocaleString("pt-BR")} unid ({stats.rgbQtyPct.toFixed(1)}%)</span>
              <span className="text-amber-400 font-semibold">📦 One Way: {stats.oneWay.qty.toLocaleString("pt-BR")} unid ({stats.oneWayQtyPct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED PRODUCTS BREAKDOWN ACCORDION */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowProductDetails(!showProductDetails)}
          className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-300 flex items-center justify-between transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Ver Detalhamento de Produtos por Categoria ({stats.sortedRgbProducts.length} RGB / {stats.sortedOneWayProducts.length} One Way)</span>
          </span>
          {showProductDetails ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showProductDetails && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
            {/* RGB PRODUCTS LIST */}
            <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/40 space-y-3">
              <h5 className="text-xs font-extrabold font-mono text-emerald-400 uppercase tracking-wide flex items-center justify-between border-b border-emerald-900/40 pb-2">
                <span>🔄 Top Produtos RGB (Retornáveis)</span>
                <span className="text-[10px] text-slate-400 font-normal">{stats.sortedRgbProducts.length} SKUs</span>
              </h5>
              {stats.sortedRgbProducts.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">Nenhum produto RGB registrado nas solicitações filtradas.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {stats.sortedRgbProducts.map((p, idx) => (
                    <div key={p.code + idx} className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs font-mono">
                      <div className="min-w-0">
                        <span className="text-emerald-300 font-bold block truncate">
                          {p.code} - {p.desc}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Qty: <strong className="text-white">{p.qty}</strong> | Valor: <strong className="text-emerald-400">R$ {p.val.toFixed(2)}</strong>
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-bold rounded-md shrink-0">
                        {p.hl.toFixed(4)} HL
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ONE WAY PRODUCTS LIST */}
            <div className="bg-slate-950 p-4 rounded-xl border border-amber-900/40 space-y-3">
              <h5 className="text-xs font-extrabold font-mono text-amber-400 uppercase tracking-wide flex items-center justify-between border-b border-amber-900/40 pb-2">
                <span>📦 Top Produtos One Way (Descartáveis)</span>
                <span className="text-[10px] text-slate-400 font-normal">{stats.sortedOneWayProducts.length} SKUs</span>
              </h5>
              {stats.sortedOneWayProducts.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-2">Nenhum produto One Way registrado nas solicitações filtradas.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {stats.sortedOneWayProducts.map((p, idx) => (
                    <div key={p.code + idx} className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-xs font-mono">
                      <div className="min-w-0">
                        <span className="text-amber-300 font-bold block truncate">
                          {p.code} - {p.desc}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Qty: <strong className="text-white">{p.qty}</strong> | Valor: <strong className="text-amber-400">R$ {p.val.toFixed(2)}</strong>
                        </span>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-955 border border-amber-800 text-amber-300 text-[10px] font-bold rounded-md shrink-0">
                        {p.hl.toFixed(4)} HL
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
