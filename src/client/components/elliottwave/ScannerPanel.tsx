import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { modelenceQuery } from '@modelence/react-query';
import { Search, TrendingUp, TrendingDown, RotateCw } from 'lucide-react';
import { cn } from '@/client/lib/utils';

type MaCrossResult = {
  ticker: string;
  days_ago: number;
  date: string;
  price: number;
  ma50: number;
  ma200: number;
  spread_pct: number;
  change_since_pct: number;
  strength: string;
};

type MaCrossResponse = {
  count: number;
  elapsed: number;
  results: MaCrossResult[];
};

type RangeResult = {
  ticker: string;
  window_bars: number;
  high: number;
  low: number;
  width_pct: number;
  current: number;
  pos_in_range: number;
  direction: string;
  stop: number;
  target: number;
  rr: number;
  strength: string;
};

type RangeResponse = {
  count: number;
  elapsed: number;
  results: RangeResult[];
};

const MA_CROSS_STRENGTH_COLOR: Record<string, string> = {
  GOLD: 'text-[#00ffa3]',
  SILVER: 'text-slate-300',
  WEAK: 'text-slate-500',
  DEAD: 'text-[#ff4a5a]',
  REVERSED: 'text-slate-500',
};

const RANGE_STRENGTH_BADGE: Record<string, string> = {
  STRONG: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  MEDIUM: 'bg-slate-700/40 text-slate-300 border-white/10',
  WEAK: 'bg-slate-800/40 text-slate-500 border-white/5',
};

type ScannerMode = 'golden' | 'death' | 'range';

export default function ScannerPanel() {
  const [mode, setMode] = useState<ScannerMode>('golden');
  const [tf, setTf] = useState('1d');

  const maCrossQuery = useQuery({
    ...modelenceQuery<MaCrossResponse>('elliottwave.scanMaCross', {
      mode: mode === 'death' ? 'death' : 'golden',
      days: 60,
      tf,
    }),
    enabled: mode !== 'range',
  });

  const rangeQuery = useQuery({
    ...modelenceQuery<RangeResponse>('elliottwave.scanRange', { tf }),
    enabled: mode === 'range',
  });

  const isRange = mode === 'range';
  const activeQuery = isRange ? rangeQuery : maCrossQuery;
  const tfOptions = isRange ? ['1h', '4h', '1d', '1w'] : ['1h', '4h', '1d', '1w'];

  return (
    <div className="glass-card p-5 animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-indigo-400" />
          <h2 className="font-display text-sm uppercase tracking-widest text-slate-300">
            Scanners
          </h2>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/40">
          {([
            { value: 'golden', label: 'Golden Cross' },
            { value: 'death', label: 'Death Cross' },
            { value: 'range', label: 'Range' },
          ] as const).map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all duration-200',
                mode === m.value
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-md shadow-indigo-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/40">
          {tfOptions.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={cn(
                'px-2.5 py-1 text-xs font-mono-tabular rounded-md transition-all duration-200',
                tf === t
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          onClick={() => activeQuery.refetch()}
          className={cn(
            'p-2 rounded-lg text-orange-400 hover:text-orange-300 hover:bg-slate-800/60 transition duration-200 hover:scale-110',
            activeQuery.isFetching && 'animate-spin'
          )}
          aria-label="Refresh scanner"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {activeQuery.error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-[#ff4a5a]/10 border border-[#ff4a5a]/30 text-[#ff4a5a] text-sm">
          Scanner failed: {(activeQuery.error as Error).message}
        </div>
      )}

      {activeQuery.isLoading ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          Scanning {isRange ? 95 : 95} tickers on {tf}… this can take a moment.
        </div>
      ) : isRange ? (
        <RangeTable results={rangeQuery.data?.results ?? []} elapsed={rangeQuery.data?.elapsed} />
      ) : (
        <MaCrossTable results={maCrossQuery.data?.results ?? []} mode={mode as 'golden' | 'death'} elapsed={maCrossQuery.data?.elapsed} />
      )}
    </div>
  );
}

function MaCrossTable({ results, mode, elapsed }: { results: MaCrossResult[]; mode: 'golden' | 'death'; elapsed?: number }) {
  if (results.length === 0) {
    return <div className="py-16 text-center text-slate-500 text-sm">No {mode} crosses found in this window.</div>;
  }

  return (
    <div className="overflow-x-auto">
      {elapsed != null && (
        <div className="text-xs text-slate-600 mb-2 font-mono-tabular">{results.length} matches · {elapsed}s</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-white/5">
            <th className="py-2 pr-4">Ticker</th>
            <th className="py-2 pr-4">Days Ago</th>
            <th className="py-2 pr-4">Price</th>
            <th className="py-2 pr-4">MA50</th>
            <th className="py-2 pr-4">MA200</th>
            <th className="py-2 pr-4">Spread</th>
            <th className="py-2 pr-4">Since Cross</th>
            <th className="py-2 pr-4">Strength</th>
          </tr>
        </thead>
        <tbody className="font-mono-tabular">
          {results.map((r) => (
            <tr key={r.ticker} className="border-b border-white/5 hover:bg-slate-800/40 transition">
              <td className="py-2 pr-4 font-semibold text-indigo-300">{r.ticker}</td>
              <td className="py-2 pr-4 text-slate-400">{r.days_ago}d</td>
              <td className="py-2 pr-4 text-slate-300">₽{r.price}</td>
              <td className="py-2 pr-4 text-slate-400">{r.ma50}</td>
              <td className="py-2 pr-4 text-slate-400">{r.ma200}</td>
              <td className="py-2 pr-4 text-slate-400">{r.spread_pct}%</td>
              <td className={cn('py-2 pr-4', r.change_since_pct >= 0 ? 'text-[#00ffa3]' : 'text-[#ff4a5a]')}>
                {r.change_since_pct >= 0 ? '+' : ''}{r.change_since_pct}%
              </td>
              <td className={cn('py-2 pr-4 font-semibold', MA_CROSS_STRENGTH_COLOR[r.strength] ?? 'text-slate-400')}>
                {r.strength}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RangeTable({ results, elapsed }: { results: RangeResult[]; elapsed?: number }) {
  if (results.length === 0) {
    return <div className="py-16 text-center text-slate-500 text-sm">No range setups found on this timeframe.</div>;
  }

  return (
    <div className="overflow-x-auto">
      {elapsed != null && (
        <div className="text-xs text-slate-600 mb-2 font-mono-tabular">{results.length} matches · {elapsed}s</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs uppercase tracking-wider border-b border-white/5">
            <th className="py-2 pr-4">Ticker</th>
            <th className="py-2 pr-4">Window</th>
            <th className="py-2 pr-4">Range</th>
            <th className="py-2 pr-4">Width</th>
            <th className="py-2 pr-4">Direction</th>
            <th className="py-2 pr-4">Entry/Stop/TP</th>
            <th className="py-2 pr-4">R:R</th>
            <th className="py-2 pr-4">Strength</th>
          </tr>
        </thead>
        <tbody className="font-mono-tabular">
          {results.map((r) => (
            <tr key={r.ticker + r.window_bars} className="border-b border-white/5 hover:bg-slate-800/40 transition">
              <td className="py-2 pr-4 font-semibold text-indigo-300">{r.ticker}</td>
              <td className="py-2 pr-4 text-slate-400">{r.window_bars}</td>
              <td className="py-2 pr-4 text-slate-400">{r.low}–{r.high}</td>
              <td className="py-2 pr-4 text-slate-400">{r.width_pct}%</td>
              <td className="py-2 pr-4">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-semibold',
                    r.direction === 'BREAK_UP' ? 'text-[#00ffa3]' : 'text-[#ff4a5a]'
                  )}
                >
                  {r.direction === 'BREAK_UP' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {r.direction === 'BREAK_UP' ? 'LONG' : 'SHORT'}
                </span>
              </td>
              <td className="py-2 pr-4 text-slate-400">
                {r.current} / {r.stop} / {r.target}
              </td>
              <td className="py-2 pr-4 text-[#ffc53d] font-semibold">{r.rr}</td>
              <td className="py-2 pr-4">
                <span className={cn('px-2 py-0.5 rounded-md text-xs font-semibold border', RANGE_STRENGTH_BADGE[r.strength])}>
                  {r.strength}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
