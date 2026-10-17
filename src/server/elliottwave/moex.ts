// MOEX ISS API client: fetches OHLCV candles for shares and indices, with
// in-memory caching, resampling, and a bad-tick filter.

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// Supported timeframes. Native MOEX intervals cover 10m/1h/1d/1w/1M; the
// others (2h/4h/6h/12h) are resampled client-side from 1h candles.
export type Timeframe = '10m' | '30m' | '1h' | '2h' | '4h' | '6h' | '12h' | '1d' | '1w' | '1M';

const NATIVE_INTERVAL: Record<string, number> = {
  '10m': 10,
  '1h': 60,
  '1d': 24,
  '1w': 7,
  '1M': 31,
};

// Timeframes that must be resampled from a native interval's candles.
const RESAMPLE_FROM: Record<string, { base: '10m' | '1h'; minutes: number }> = {
  '30m': { base: '10m', minutes: 30 },
  '2h': { base: '1h', minutes: 120 },
  '4h': { base: '1h', minutes: 240 },
  '6h': { base: '1h', minutes: 360 },
  '12h': { base: '1h', minutes: 720 },
};

// How many days of history to request based on timeframe, to keep payloads
// reasonable while still giving the wave engine enough context.
const LOOKBACK_DAYS: Record<string, number> = {
  '10m': 20,
  '30m': 40,
  '1h': 60,
  '2h': 120,
  '4h': 180,
  '6h': 240,
  '12h': 365,
  '1d': 900,
  '1w': 365 * 5,
  '1M': 365 * 15,
};

const INDEX_SYMBOLS = new Set(['IMOEX', 'RTSI']);

const cache = new Map<string, { data: Candle[]; ts: number }>();
const CACHE_TTL_MS = 60_000;

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`MOEX ISS request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function parseIssTable(block: { columns: string[]; data: any[][] }, colMap: Record<string, string>): Candle[] {
  const idx: Record<string, number> = {};
  for (const [key, col] of Object.entries(colMap)) {
    idx[key] = block.columns.indexOf(col);
  }

  const candles: Candle[] = [];
  for (const row of block.data) {
    const dateStr = row[idx.time];
    if (!dateStr) continue;
    const time = Math.floor(new Date(dateStr.replace(' ', 'T') + 'Z').getTime() / 1000);
    const open = Number(row[idx.open]);
    const high = Number(row[idx.high]);
    const low = Number(row[idx.low]);
    const close = Number(row[idx.close]);
    const volume = idx.volume >= 0 ? Number(row[idx.volume]) || 0 : 0;

    if (![open, high, low, close].every((v) => Number.isFinite(v))) continue;

    candles.push({ time, open, high, low, close, volume });
  }
  return candles;
}

async function fetchShareCandles(symbol: string, interval: number, from: string, till: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let start = 0;
  const limit = 500;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${encodeURIComponent(symbol)}/candles.json?interval=${interval}&from=${from}&till=${till}&start=${start}&limit=${limit}`;
    const json = await fetchJson(url);
    const block = json.candles;
    if (!block || !block.data || block.data.length === 0) break;

    const candles = parseIssTable(block, {
      time: 'begin',
      open: 'open',
      high: 'high',
      low: 'low',
      close: 'close',
      volume: 'volume',
    });
    all.push(...candles);

    if (block.data.length < limit) break;
    start += limit;
    if (start > 20000) break; // safety cap
  }

  return all;
}

async function fetchIndexCandles(symbol: string, interval: number, from: string, till: string): Promise<Candle[]> {
  const all: Candle[] = [];
  let start = 0;
  const limit = 500;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `https://iss.moex.com/iss/history/engines/stock/markets/index/securities/${encodeURIComponent(symbol)}.json?interval=${interval}&from=${from}&till=${till}&start=${start}&limit=${limit}`;
    const json = await fetchJson(url);
    const block = json.history;
    if (!block || !block.data || block.data.length === 0) break;

    const candles = parseIssTable(block, {
      time: 'TRADEDATE',
      open: 'OPEN',
      high: 'HIGH',
      low: 'LOW',
      close: 'CLOSE',
      volume: 'VOLUME',
    });
    all.push(...candles);

    if (block.data.length < limit) break;
    start += limit;
    if (start > 20000) break;
  }

  return all;
}

// Remove obviously bad ticks: compares each bar's close against the median
// of its neighbors, and flags excessively wide high/low ranges.
function filterBadTicks(candles: Candle[]): Candle[] {
  if (candles.length < 5) return candles;

  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];

    if (bar.close > 0 && (bar.high - bar.low) / bar.close > 0.3) {
      continue;
    }

    const neighbors: number[] = [];
    for (let j = Math.max(0, i - 2); j <= Math.min(candles.length - 1, i + 2); j++) {
      if (j !== i) neighbors.push(candles[j].close);
    }
    if (neighbors.length > 0) {
      const sorted = [...neighbors].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > 0) {
        const ratio = bar.close / median;
        if (ratio > 1.2 || ratio < 0.8) continue;
      }
    }

    result.push(bar);
  }
  return result;
}

// Aggregates smaller candles into larger buckets, anchored to the MOEX
// session open (10:00 MSK).
function resample(candles: Candle[], minutes: number): Candle[] {
  if (candles.length === 0) return [];

  const bucketSeconds = minutes * 60;
  const buckets = new Map<number, Candle[]>();

  for (const c of candles) {
    const bucketStart = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
    buckets.get(bucketStart)!.push(c);
  }

  const result: Candle[] = [];
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  for (const key of sortedKeys) {
    const bars = buckets.get(key)!.sort((a, b) => a.time - b.time);
    result.push({
      time: key,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((sum, b) => sum + b.volume, 0),
    });
  }
  return result;
}

export async function fetchOHLCV(symbol: string, timeframe: string, limit: number = 500): Promise<Candle[]> {
  const sym = symbol.toUpperCase();
  const cacheKey = `${sym}:${timeframe}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const lookbackDays = LOOKBACK_DAYS[timeframe] ?? 365;
  const till = formatDate(new Date());
  const from = formatDate(new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000));

  let candles: Candle[];

  const resampleCfg = RESAMPLE_FROM[timeframe];
  if (resampleCfg) {
    const baseInterval = NATIVE_INTERVAL[resampleCfg.base];
    const base = INDEX_SYMBOLS.has(sym)
      ? await fetchIndexCandles(sym, baseInterval, from, till)
      : await fetchShareCandles(sym, baseInterval, from, till);
    candles = resample(base, resampleCfg.minutes);
  } else {
    const interval = NATIVE_INTERVAL[timeframe] ?? 24;
    candles = INDEX_SYMBOLS.has(sym)
      ? await fetchIndexCandles(sym, interval, from, till)
      : await fetchShareCandles(sym, interval, from, till);
  }

  candles = filterBadTicks(candles);
  candles.sort((a, b) => a.time - b.time);

  if (candles.length > limit) {
    candles = candles.slice(candles.length - limit);
  }

  cache.set(cacheKey, { data: candles, ts: Date.now() });
  return candles;
}
