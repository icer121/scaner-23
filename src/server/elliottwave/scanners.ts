// MA Cross and Range breakout scanners across the MOEX watchlist, ported
// from the original Python implementation (backend/scanners.py).

import { fetchOHLCV, type Candle } from './moex';

export const SCAN_TICKERS = [
  'SBER', 'GAZP', 'LKOH', 'ROSN', 'NVTK', 'TATN', 'SNGS', 'SNGSP', 'SIBN', 'TRNFP',
  'SBERP', 'GAZAP', 'TATNP', 'VTBR', 'TCSG', 'MOEX', 'AFKS', 'BSPB', 'CBOM', 'SVCB',
  'MBNK', 'SPBE', 'ZAYM', 'RENI', 'SFIN', 'LEAS', 'GMKN', 'NLMK', 'MAGN', 'CHMF',
  'ALRS', 'PLZL', 'RUAL', 'MTLR', 'MTLRP', 'ENPG', 'RASP', 'VSMO', 'KMAZ', 'KZOS',
  'NKNC', 'AMEZ', 'HYDR', 'FEES', 'IRAO', 'UPRO', 'MSNG', 'TGKA', 'OGKB', 'LSNG',
  'MTSS', 'RTKM', 'RTKMP', 'YDEX', 'VKCO', 'POSI', 'ASTR', 'DIAS', 'SOFL', 'WUSH',
  'HEAD', 'VSEH', 'MGNT', 'FIXP', 'LENT', 'OKEY', 'GCHE', 'RAGR', 'BELU', 'OZON',
  'MVID', 'SVAV', 'ABRD', 'DIOD', 'PHOR', 'AKRN', 'APTK', 'ABIO', 'ISKJ', 'RAPT',
  'FLOT', 'AFLT', 'NMTP', 'UNAC', 'FESH', 'LSRG', 'PIKK', 'SMLT', 'ETLN', 'SGZH',
  'DELI', 'EUTR', 'AGRO',
];

type RangeTf = '1h' | '4h' | '1d' | '1w';

const TF_CONFIG_RANGE: Record<RangeTf, {
  days_back: number;
  min_width: number;
  max_width: number;
  windows: number[];
}> = {
  '1h': { days_back: 60, min_width: 2.0, max_width: 8.0, windows: [30, 50, 80, 120, 160] },
  '4h': { days_back: 250, min_width: 2.5, max_width: 10.0, windows: [20, 35, 50, 70, 100] },
  '1d': { days_back: 500, min_width: 3.0, max_width: 15.0, windows: [20, 40, 60, 100, 150] },
  '1w': { days_back: 1500, min_width: 4.0, max_width: 25.0, windows: [15, 30, 50, 80, 100] },
};

const MA_CROSS_LIMIT: Record<string, number> = {
  '1h': 500,
  '4h': 500,
  '1d': 500,
  '1w': 500,
};

// Runs async tasks with a bounded concurrency, matching the Python
// ThreadPoolExecutor(max_workers=N) pattern.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function rollingMean(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export type MaCrossResult = {
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

export async function scanMaCross(mode: 'golden' | 'death', days: number, tf: string): Promise<{
  count: number;
  elapsed: number;
  results: MaCrossResult[];
  mode: string;
  tf: string;
  days: number;
}> {
  const t0 = Date.now();
  const limit = MA_CROSS_LIMIT[tf] ?? 500;

  const perTicker = await mapWithConcurrency(SCAN_TICKERS, 8, async (ticker): Promise<MaCrossResult | null> => {
    try {
      const candles = await fetchOHLCV(ticker, tf, limit);
      if (candles.length < 210) return null;

      const close = candles.map((c) => c.close);
      const ma50 = rollingMean(close, 50);
      const ma200 = rollingMean(close, 200);

      let crossDays: number | null = null;
      const n = candles.length;
      for (let i = Math.max(0, n - days); i < n; i++) {
        if (i < 200 || i < 1) continue;
        const p50 = ma50[i - 1], p200 = ma200[i - 1], c50 = ma50[i], c200 = ma200[i];
        if (p50 == null || p200 == null || c50 == null || c200 == null) continue;

        if (mode === 'golden') {
          if (p50 <= p200 && c50 > c200) { crossDays = n - 1 - i; break; }
        } else {
          if (p50 >= p200 && c50 < c200) { crossDays = n - 1 - i; break; }
        }
      }
      if (crossDays == null) return null;

      const last = close[n - 1];
      const lma50 = ma50[n - 1]!;
      const lma200 = ma200[n - 1]!;
      const sigIdx = n - 1 - crossDays;
      const pSig = close[sigIdx];
      const chg = ((last - pSig) / pSig) * 100;

      let spread: number;
      let strength: string;
      if (mode === 'golden') {
        spread = ((lma50 - lma200) / lma200) * 100;
        const still = lma50 > lma200;
        const above = last > lma50;
        strength = still && above ? 'GOLD' : still ? 'SILVER' : 'WEAK';
      } else {
        spread = ((lma200 - lma50) / lma200) * 100;
        const still = lma50 < lma200;
        const below = last < lma50;
        strength = still && below ? 'DEAD' : still ? 'WEAK' : 'REVERSED';
      }

      return {
        ticker,
        days_ago: crossDays,
        date: new Date(candles[sigIdx].time * 1000).toISOString().slice(0, 10),
        price: round2(last),
        ma50: round2(lma50),
        ma200: round2(lma200),
        spread_pct: round2(spread),
        change_since_pct: round2(chg),
        strength,
      };
    } catch {
      return null;
    }
  });

  const results = perTicker.filter((r): r is MaCrossResult => r !== null);
  results.sort((a, b) => a.days_ago - b.days_ago);

  return {
    count: results.length,
    elapsed: Math.round((Date.now() - t0) / 100) / 10,
    results,
    mode,
    tf,
    days,
  };
}

export type RangeResult = {
  ticker: string;
  tf: string;
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
  touches_upper: number;
  touches_lower: number;
  strength: string;
};

function detectRange(candles: Candle[], ticker: string, tf: string, cfg: typeof TF_CONFIG_RANGE[RangeTf]): RangeResult[] {
  if (!candles || candles.length < 30) return [];
  const results: RangeResult[] = [];
  const n = candles.length;

  for (const window of cfg.windows) {
    if (n < window + 5) continue;
    const sub = candles.slice(n - window);
    const high = Math.max(...sub.map((c) => c.high));
    const low = Math.min(...sub.map((c) => c.low));
    if (low <= 0) continue;

    const widthPct = ((high - low) / low) * 100;
    if (widthPct < cfg.min_width || widthPct > cfg.max_width) continue;

    const tu = sub.filter((c) => c.high >= high * 0.98).length;
    const tl = sub.filter((c) => c.low <= low * 1.02).length;
    if (tu < 2 || tl < 2) continue;

    const current = candles[n - 1].close;
    const pos = ((current - low) / (high - low)) * 100;
    if (pos > 25 && pos < 75) continue;

    let direction: string, entry: number, stop: number, target: number;
    if (pos <= 25) {
      direction = 'BREAK_DOWN';
      entry = current;
      stop = low * 0.985;
      target = low - (high - low);
    } else {
      direction = 'BREAK_UP';
      entry = current;
      stop = high * 1.015;
      target = high + (high - low);
    }

    const risk = Math.abs(entry - stop);
    const reward = Math.abs(target - entry);
    const rr = risk > 0 ? reward / risk : 0;
    if (rr < 1.2) continue;

    const touches = tu + tl;
    let strength: string;
    if (window >= 80 && touches >= 6 && widthPct >= 3) strength = 'STRONG';
    else if (window >= 50 && touches >= 4) strength = 'MEDIUM';
    else strength = 'WEAK';

    results.push({
      ticker,
      tf,
      window_bars: window,
      high: round2(high),
      low: round2(low),
      width_pct: round2(widthPct),
      current: round2(current),
      pos_in_range: Math.round(pos * 10) / 10,
      direction,
      stop: round2(stop),
      target: round2(target),
      rr: round2(rr),
      touches_upper: tu,
      touches_lower: tl,
      strength,
    });
    break;
  }

  return results;
}

export async function scanRange(tf: string): Promise<{
  count: number;
  elapsed: number;
  results: RangeResult[];
  tf: string;
}> {
  const cfg = TF_CONFIG_RANGE[tf as RangeTf];
  if (!cfg) {
    throw new Error(`Unsupported range scanner timeframe: ${tf}`);
  }

  const t0 = Date.now();

  const perTicker = await mapWithConcurrency(SCAN_TICKERS, 6, async (ticker) => {
    try {
      const candles = await fetchOHLCV(ticker, tf, 500);
      return detectRange(candles, ticker, tf, cfg);
    } catch {
      return [];
    }
  });

  const results = perTicker.flat();
  const strengthRank: Record<string, number> = { STRONG: 3, MEDIUM: 2, WEAK: 1 };
  results.sort((a, b) => {
    const sr = strengthRank[b.strength] - strengthRank[a.strength];
    if (sr !== 0) return sr;
    const wb = b.window_bars - a.window_bars;
    if (wb !== 0) return wb;
    return b.rr - a.rr;
  });

  return {
    count: results.length,
    elapsed: Math.round((Date.now() - t0) / 100) / 10,
    results,
    tf,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
