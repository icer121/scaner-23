import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { modelenceQuery } from '@modelence/react-query';
import { RotateCw, TrendingUp, ChevronDown, LineChart, Search, Waves, Target } from 'lucide-react';
import Page from '@/client/components/Page';
import Chart, {
  type ChartCandle,
  type IndicatorPoint,
  type WaveData,
  type ForecastData,
} from '@/client/components/elliottwave/Chart';
import ScannerPanel from '@/client/components/elliottwave/ScannerPanel';
import { IconButton } from '@/client/components/ui/IconButton';
import { cn } from '@/client/lib/utils';

const SYMBOLS = ['SBER', 'GAZP', 'LKOH', 'ROSN', 'GMKN', 'YDEX'];
const TIMEFRAMES: { value: string; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
  { value: '1w', label: '1w' },
];

type WavesResponse = {
  symbol: string;
  tf: string;
  ohlc: ChartCandle[];
  waves: WaveData[];
  forecast: ForecastData | null;
  forecast_alt: ForecastData | null;
  ma50: IndicatorPoint[];
  ma200: IndicatorPoint[];
  rsi: IndicatorPoint[];
  bb_upper: IndicatorPoint[];
  bb_lower: IndicatorPoint[];
  bb_mid: IndicatorPoint[];
  macd_line: IndicatorPoint[];
  macd_signal: IndicatorPoint[];
  macd_hist: IndicatorPoint[];
  levels: { price: number; strength: number }[];
};

type Tab = 'chart' | 'scanners';

export default function HomePage() {
  const [tab, setTab] = useState<Tab>('chart');
  const [symbol, setSymbol] = useState('SBER');
  const [tf, setTf] = useState('1d');
  const [showWaves, setShowWaves] = useState(true);
  const [showIndicators, setShowIndicators] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    ...modelenceQuery<WavesResponse>('elliottwave.getWaves', { symbol, tf, limit: 500 }),
    refetchInterval: 30_000,
    enabled: tab === 'chart',
  });

  const handleReload = useCallback(() => {
    refetch();
  }, [refetch]);

  const lastPrice = data?.ohlc?.length ? data.ohlc[data.ohlc.length - 1].close : null;
  const firstPrice = data?.ohlc?.length ? data.ohlc[0].close : null;
  const changePct =
    lastPrice != null && firstPrice != null && firstPrice !== 0
      ? ((lastPrice - firstPrice) / firstPrice) * 100
      : null;

  return (
    <Page className="bg-[#0b0f19]">
      <div className="max-w-[1400px] w-full mx-auto space-y-4 animate-fade-in">
        {/* Header */}
        <div className="glass-card flex flex-wrap items-center gap-4 px-5 py-4">
          <h1 className="font-display text-lg font-bold tracking-widest uppercase text-white">
            Elliott<span className="text-indigo-400">Wave</span>
          </h1>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/40">
            <button
              onClick={() => setTab('chart')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                tab === 'chart'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <LineChart className="w-3.5 h-3.5" />
              Chart
            </button>
            <button
              onClick={() => setTab('scanners')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                tab === 'scanners'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              <Search className="w-3.5 h-3.5" />
              Scanners
            </button>
          </div>

          {tab === 'chart' && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div className="relative">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-sm font-mono-tabular rounded-lg bg-slate-800/40 border border-white/5 text-slate-200 cursor-pointer hover:bg-slate-800/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/40">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTf(t.value)}
                  className={cn(
                    'px-3 py-1 text-xs font-mono-tabular rounded-md transition-all duration-200',
                    tf === t.value
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/40">
              <button
                onClick={() => setShowWaves((v) => !v)}
                title="Toggle Elliott Waves"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200',
                  showWaves ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                <Waves className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowIndicators((v) => !v)}
                title="Toggle indicators (MA/RSI/BB/MACD/levels)"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200',
                  showIndicators ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                <Target className="w-3.5 h-3.5" />
              </button>
            </div>
            <IconButton
              aria-label="Reload"
              size="sm"
              variant="ghost"
              onClick={handleReload}
              className={cn(
                'text-orange-400 hover:text-orange-300 hover:bg-slate-800/60 transition duration-200',
                isFetching && 'animate-spin'
              )}
            >
              <RotateCw className="w-4 h-4" />
            </IconButton>
          </div>
          )}
        </div>

        {tab === 'chart' ? (
          <div className="glass-card p-5 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono-tabular text-2xl font-semibold text-white">
                  {symbol}
                </span>
                {lastPrice != null && (
                  <span className="font-mono-tabular text-xl text-slate-300">
                    ₽{lastPrice.toFixed(2)}
                  </span>
                )}
                {changePct != null && (
                  <span
                    className={cn(
                      'font-mono-tabular text-sm font-medium px-2 py-0.5 rounded-md',
                      changePct >= 0
                        ? 'text-[#00ffa3] bg-[#00ffa3]/10 drop-shadow-[0_0_8px_rgba(0,255,163,0.25)]'
                        : 'text-[#ff4a5a] bg-[#ff4a5a]/10'
                    )}
                  >
                    {changePct >= 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-widest">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                MOEX ISS · live
              </div>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-[#ff4a5a]/10 border border-[#ff4a5a]/30 text-[#ff4a5a] text-sm">
                Failed to load data: {(error as Error).message}
              </div>
            )}

            {data?.forecast?.signal && (
              <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/30 border border-white/5">
                <span
                  className={cn(
                    'font-mono-tabular text-xs font-bold px-2 py-1 rounded-md',
                    data.forecast.signal.side === 'LONG'
                      ? 'text-[#00ffa3] bg-[#00ffa3]/10'
                      : 'text-[#ff4a5a] bg-[#ff4a5a]/10'
                  )}
                >
                  {data.forecast.signal.side}
                </span>
                <span className="text-xs text-slate-500">{data.forecast.context}</span>
                <span className="font-mono-tabular text-xs text-slate-300 ml-auto">
                  Entry <span className="text-white">{data.forecast.signal.entry}</span>
                  {'  '}· SL <span className="text-[#ff4a5a]">{data.forecast.signal.stop}</span>
                  {'  '}· TP <span className="text-[#00ffa3]">{data.forecast.signal.tp}</span>
                  {'  '}· R:R <span className="text-[#ffc53d]">{data.forecast.signal.rr}</span>
                </span>
              </div>
            )}

            <div className="h-[560px]">
              {isLoading ? (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                  Loading {symbol} / {tf}…
                </div>
              ) : (
                <Chart
                  candles={data?.ohlc ?? []}
                  ma50={data?.ma50}
                  ma200={data?.ma200}
                  bbUpper={data?.bb_upper}
                  bbLower={data?.bb_lower}
                  rsi={data?.rsi}
                  macdLine={data?.macd_line}
                  macdSignal={data?.macd_signal}
                  macdHist={data?.macd_hist}
                  waves={data?.waves}
                  levels={data?.levels}
                  forecast={data?.forecast}
                  showWaves={showWaves}
                  showIndicators={showIndicators}
                />
              )}
            </div>
          </div>
        ) : (
          <ScannerPanel />
        )}
      </div>
    </Page>
  );
}
