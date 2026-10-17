import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type SeriesMarker,
  type Time,
  type MouseEventParams,
} from 'lightweight-charts';
import { Minus, MoveUpRight, Percent, Ruler as RulerIcon, Trash2 } from 'lucide-react';
import { cn } from '@/client/lib/utils';

type DrawTool = 'line' | 'ray' | 'fib' | 'ruler';

type DrawPoint = { time: number; price: number };

type Drawing = {
  id: number;
  type: DrawTool;
  p1: DrawPoint;
  p2: DrawPoint;
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618];

const TOOLS: { id: DrawTool; label: string; icon: typeof Minus }[] = [
  { id: 'line', label: 'Trend line', icon: Minus },
  { id: 'ray', label: 'Ray', icon: MoveUpRight },
  { id: 'fib', label: 'Fibonacci retracement', icon: Percent },
  { id: 'ruler', label: 'Ruler', icon: RulerIcon },
];

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type IndicatorPoint = { time: number; value: number };

export type WavePoint = { time: number; value: number; kind: 'H' | 'L' };

export type WaveData = {
  kind: string;
  subtype: string;
  degree: number;
  score: number;
  labels: string[];
  color_key: string;
  points: WavePoint[];
};

export type ForecastSignal = {
  side: 'LONG' | 'SHORT';
  entry: number;
  stop: number;
  tp: number;
  rr: number;
  confidence: number;
};

export type ForecastData = {
  direction: 'up' | 'down';
  context: string;
  signal: ForecastSignal;
};

interface ChartProps {
  candles: ChartCandle[];
  ma50?: IndicatorPoint[];
  ma200?: IndicatorPoint[];
  bbUpper?: IndicatorPoint[];
  bbLower?: IndicatorPoint[];
  rsi?: IndicatorPoint[];
  macdLine?: IndicatorPoint[];
  macdSignal?: IndicatorPoint[];
  macdHist?: IndicatorPoint[];
  waves?: WaveData[];
  levels?: { price: number; strength: number }[];
  forecast?: ForecastData | null;
  showWaves?: boolean;
  showIndicators?: boolean;
}

// Degree -1=Cycle, 0=Primary, 1=Intermediate, 2=Minor
const DEGREE_COLOR: Record<number, string> = {
  [-1]: '#a78bfa',
  0: '#6366f1',
  1: '#22d3ee',
  2: '#ffc53d',
};

export default function Chart({
  candles,
  ma50,
  ma200,
  bbUpper,
  bbLower,
  rsi,
  macdLine,
  macdSignal,
  macdHist,
  waves,
  levels,
  forecast,
  showWaves = true,
  showIndicators = true,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaysRef = useRef<ISeriesApi<any>[]>([]);
  const markerPluginsRef = useRef<ISeriesMarkersPluginApi<Time>[]>([]);
  const priceLinesRef = useRef<any[]>([]);

  // Drawing tools (Fibonacci / Ray / Trend line / Ruler).
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<DrawTool | null>(null);
  const activeToolRef = useRef<DrawTool | null>(null);
  const pendingPointRef = useRef<DrawPoint | null>(null);
  const hoverRef = useRef<DrawPoint | null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const candlesRef = useRef<ChartCandle[]>([]);
  const [drawingsCount, setDrawingsCount] = useState(0);

  const setActiveToolBoth = useCallback((tool: DrawTool | null) => {
    activeToolRef.current = tool;
    pendingPointRef.current = null;
    setActiveTool(tool);
  }, []);

  const redrawRef = useRef<() => void>(() => {});

  const clearDrawings = useCallback(() => {
    drawingsRef.current = [];
    pendingPointRef.current = null;
    setDrawingsCount(0);
    redrawRef.current?.();
  }, []);

  // Init chart once.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0e1117' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#30363d',
      },
      rightPriceScale: {
        borderColor: '#30363d',
      },
      autoSize: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00ffa3',
      downColor: '#ff4a5a',
      wickUpColor: '#00ffa3',
      wickDownColor: '#ff4a5a',
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // --- Drawing tools overlay (canvas drawn on top of the chart) ---
    const canvas = canvasRef.current;
    const container = containerRef.current;

    function resizeCanvas() {
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function timeToX(time: number): number | null {
      const x = chart.timeScale().timeToCoordinate(time as UTCTimestamp);
      return x == null ? null : x;
    }

    function priceToY(price: number): number | null {
      const y = series.priceToCoordinate(price);
      return y == null ? null : y;
    }

    function indexForTime(time: number): number {
      return candlesRef.current.findIndex((c) => c.time === time);
    }

    function drawSegment(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, dashed = false) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    function drawOne(ctx: CanvasRenderingContext2D, width: number, d: { type: DrawTool; p1: DrawPoint; p2: DrawPoint }) {
      const x1 = timeToX(d.p1.time);
      const y1 = priceToY(d.p1.price);
      const x2 = timeToX(d.p2.time);
      const y2 = priceToY(d.p2.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return;

      if (d.type === 'line') {
        drawSegment(ctx, x1, y1, x2, y2, '#22d3ee');
      } else if (d.type === 'ray') {
        let xEnd = width;
        let yEnd: number;
        if (x2 === x1) {
          yEnd = y2;
          xEnd = x1;
        } else {
          const slope = (y2 - y1) / (x2 - x1);
          xEnd = x2 >= x1 ? width : 0;
          yEnd = y1 + slope * (xEnd - x1);
        }
        drawSegment(ctx, x1, y1, xEnd, yEnd, '#ffc53d');
      } else if (d.type === 'fib') {
        const xLeft = Math.min(x1, x2);
        ctx.font = '11px monospace';
        for (const level of FIB_LEVELS) {
          const price = d.p1.price + (d.p2.price - d.p1.price) * level;
          const y = priceToY(price);
          if (y == null) continue;
          const alpha = level === 0 || level === 1 ? 0.8 : 0.4;
          ctx.save();
          ctx.strokeStyle = `rgba(167,139,250,${alpha})`;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(xLeft, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = `rgba(167,139,250,${Math.min(1, alpha + 0.2)})`;
          ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`, xLeft + 4, y - 3);
        }
      } else if (d.type === 'ruler') {
        drawSegment(ctx, x1, y1, x2, y2, '#00ffa3', true);
        const priceDelta = d.p2.price - d.p1.price;
        const pct = d.p1.price !== 0 ? (priceDelta / d.p1.price) * 100 : 0;
        const i1 = indexForTime(d.p1.time);
        const i2 = indexForTime(d.p2.time);
        const bars = i1 >= 0 && i2 >= 0 ? Math.abs(i2 - i1) : null;
        const label = `${priceDelta >= 0 ? '+' : ''}${priceDelta.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)${bars != null ? ` · ${bars} bars` : ''}`;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        ctx.save();
        ctx.font = 'bold 11px monospace';
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = priceDelta >= 0 ? 'rgba(0,255,163,0.9)' : 'rgba(255,74,90,0.9)';
        ctx.fillRect(midX - textW / 2 - 4, midY - 16, textW + 8, 16);
        ctx.fillStyle = '#0b0f19';
        ctx.fillText(label, midX - textW / 2, midY - 4);
        ctx.restore();
      }
    }

    function redraw() {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = 'alphabetic';

      for (const d of drawingsRef.current) {
        drawOne(ctx, width, d);
      }

      if (pendingPointRef.current && hoverRef.current) {
        drawOne(ctx, width, { type: activeToolRef.current ?? 'line', p1: pendingPointRef.current, p2: hoverRef.current });
      }
    }
    redrawRef.current = redraw;

    resizeCanvas();
    redraw();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      redraw();
    });
    if (container) resizeObserver.observe(container);

    const handleClick = (param: MouseEventParams) => {
      if (!activeToolRef.current || !param.point || param.time == null) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      const point: DrawPoint = { time: param.time as number, price };

      if (!pendingPointRef.current) {
        pendingPointRef.current = point;
        hoverRef.current = point;
      } else {
        const drawing: Drawing = {
          id: Date.now(),
          type: activeToolRef.current,
          p1: pendingPointRef.current,
          p2: point,
        };
        drawingsRef.current = [...drawingsRef.current, drawing];
        pendingPointRef.current = null;
        activeToolRef.current = null;
        setActiveTool(null);
        setDrawingsCount(drawingsRef.current.length);
      }
      redraw();
    };

    const handleCrosshairMove = (param: MouseEventParams) => {
      if (!pendingPointRef.current || !param.point || param.time == null) return;
      const price = series.coordinateToPrice(param.point.y);
      if (price == null) return;
      hoverRef.current = { time: param.time as number, price };
      redraw();
    };

    chart.subscribeClick(handleClick);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw);

    return () => {
      resizeObserver.disconnect();
      chart.unsubscribeClick(handleClick);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(redraw);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlaysRef.current = [];
      markerPluginsRef.current = [];
      priceLinesRef.current = [];
    };
  }, []);

  // Update candle data without resetting the visible range on every refresh.
  useEffect(() => {
    if (!seriesRef.current) return;

    candlesRef.current = candles;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    redrawRef.current?.();
  }, [candles]);

  // Redraw overlays (MA/BB/waves/levels) whenever inputs change.
  useEffect(() => {
    const chart = chartRef.current;
    const mainSeries = seriesRef.current;
    if (!chart || !mainSeries) return;

    // Clear previous overlays.
    for (const s of overlaysRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        // series may already be gone on unmount race
      }
    }
    overlaysRef.current = [];
    markerPluginsRef.current = [];
    for (const pl of priceLinesRef.current) {
      try {
        mainSeries.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    if (showIndicators) {
      if (ma50 && ma50.length) {
        const s = chart.addSeries(LineSeries, { color: '#ffc53d', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MA50' });
        s.setData(ma50.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(s);
      }
      if (ma200 && ma200.length) {
        const s = chart.addSeries(LineSeries, { color: '#6366f1', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MA200' });
        s.setData(ma200.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(s);
      }
      if (bbUpper && bbUpper.length) {
        const s = chart.addSeries(LineSeries, { color: 'rgba(148,163,184,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'BB Upper' });
        s.setData(bbUpper.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(s);
      }
      if (bbLower && bbLower.length) {
        const s = chart.addSeries(LineSeries, { color: 'rgba(148,163,184,0.5)', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, title: 'BB Lower' });
        s.setData(bbLower.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(s);
      }
      if (levels && levels.length) {
        for (const lvl of levels.slice(0, 5)) {
          const pl = mainSeries.createPriceLine({
            price: lvl.price,
            color: 'rgba(148,163,184,0.5)',
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: `S/R ×${lvl.strength}`,
          });
          priceLinesRef.current.push(pl);
        }
      }
    }

    if (showWaves && waves && waves.length) {
      for (const w of waves) {
        if (w.points.length < 2) continue;
        const color = DEGREE_COLOR[w.degree] ?? '#6366f1';
        const s = chart.addSeries(LineSeries, {
          color,
          lineWidth: w.degree <= 0 ? 2 : 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(w.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(s);

        const markers: SeriesMarker<Time>[] = w.points.map((p, i) => ({
          time: p.time as UTCTimestamp,
          position: p.kind === 'H' ? 'aboveBar' : 'belowBar',
          color,
          shape: 'circle',
          text: w.labels[i] ?? '',
          size: 0.6,
        }));
        const plugin = createSeriesMarkers(s, markers);
        markerPluginsRef.current.push(plugin);
      }
    }

    if (showIndicators && forecast?.signal) {
      const { signal } = forecast;
      const tpLine = mainSeries.createPriceLine({
        price: signal.tp,
        color: '#00ffa3',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TP ${signal.tp}`,
      });
      const stopLine = mainSeries.createPriceLine({
        price: signal.stop,
        color: '#ff4a5a',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SL ${signal.stop}`,
      });
      priceLinesRef.current.push(tpLine, stopLine);
    }

    // RSI sub-pane (pane 1).
    if (showIndicators && rsi && rsi.length) {
      const s = chart.addSeries(
        LineSeries,
        { color: '#a78bfa', lineWidth: 1, title: 'RSI' },
        1
      );
      s.setData(rsi.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      s.createPriceLine({ price: 70, color: 'rgba(255,74,90,0.4)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
      s.createPriceLine({ price: 30, color: 'rgba(0,255,163,0.4)', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
      overlaysRef.current.push(s);
      const pane = chart.panes()[1];
      if (pane) pane.setHeight(90);
    }

    // MACD sub-pane (pane 2).
    if (showIndicators && macdHist && macdHist.length) {
      const hist = chart.addSeries(
        HistogramSeries,
        { color: '#6366f1', title: 'MACD Hist' },
        2
      );
      hist.setData(
        macdHist.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
          color: p.value >= 0 ? 'rgba(0,255,163,0.6)' : 'rgba(255,74,90,0.6)',
        }))
      );
      overlaysRef.current.push(hist);

      if (macdLine && macdLine.length) {
        const line = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 1, title: 'MACD' }, 2);
        line.setData(macdLine.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(line);
      }
      if (macdSignal && macdSignal.length) {
        const sig = chart.addSeries(LineSeries, { color: '#ffc53d', lineWidth: 1, title: 'Signal' }, 2);
        sig.setData(macdSignal.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        overlaysRef.current.push(sig);
      }
      const pane = chart.panes()[2];
      if (pane) pane.setHeight(100);
    }

    redrawRef.current?.();
  }, [ma50, ma200, bbUpper, bbLower, rsi, macdLine, macdSignal, macdHist, waves, levels, forecast, showWaves, showIndicators]);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div ref={containerRef} className="w-full h-full" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />
      <div className="absolute top-2 left-2 flex items-center gap-1 p-1 rounded-lg bg-slate-900/70 backdrop-blur-sm border border-white/5 shadow-lg">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              onClick={() => setActiveToolBoth(active ? null : t.id)}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-md transition-all duration-200',
                active
                  ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 shadow-md shadow-indigo-500/20'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
        <div className="w-px h-5 bg-white/10 mx-0.5" />
        <button
          type="button"
          title="Clear drawings"
          onClick={clearDrawings}
          disabled={drawingsCount === 0}
          className="flex items-center justify-center w-7 h-7 rounded-md text-slate-500 hover:text-[#ff4a5a] hover:bg-slate-800/60 transition-all duration-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {activeTool && (
        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-[11px] text-indigo-300 font-mono-tabular animate-fade-in">
          Click two points on the chart to draw
        </div>
      )}
    </div>
  );
}
