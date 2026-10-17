// Technical indicators — ported from the original Python `/api/waves` handler
// (pandas rolling/ewm operations rewritten as plain TS loops).

import type { Candle } from './moex';

export type IndicatorPoint = { time: number; value: number };
export type VolumeSpike = { time: number; value: number; ratio: number };
export type Level = { price: number; strength: number };

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

function rollingStd(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    const m = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - m) ** 2, 0) / period;
    out[i] = Math.sqrt(variance);
  }
  return out;
}

function ema(values: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out: number[] = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function toPoints(times: number[], values: (number | null)[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: times[i], value: v });
  }
  return out;
}

export function computeMA(times: number[], close: number[], period: number): IndicatorPoint[] {
  return toPoints(times, rollingMean(close, period));
}

export function computeRSI(times: number[], close: number[], period = 14): IndicatorPoint[] {
  const n = close.length;
  const delta: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) delta[i] = close[i] - close[i - 1];
  const gains = delta.map((d) => (d > 0 ? d : 0));
  const losses = delta.map((d) => (d < 0 ? -d : 0));
  const avgGain = rollingMean(gains, period);
  const avgLoss = rollingMean(losses, period);
  const rsi: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g === null || l === null) continue;
    const safeLoss = l === 0 ? 1e-9 : l;
    const rs = g / safeLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }
  return toPoints(times, rsi);
}

export type BollingerBands = { upper: IndicatorPoint[]; lower: IndicatorPoint[]; mid: IndicatorPoint[] };

export function computeBollinger(times: number[], close: number[], period = 20, mult = 2): BollingerBands {
  const ma = rollingMean(close, period);
  const sd = rollingStd(close, period);
  const upper: (number | null)[] = ma.map((m, i) => (m !== null && sd[i] !== null ? m + mult * (sd[i] as number) : null));
  const lower: (number | null)[] = ma.map((m, i) => (m !== null && sd[i] !== null ? m - mult * (sd[i] as number) : null));
  return {
    upper: toPoints(times, upper),
    lower: toPoints(times, lower),
    mid: toPoints(times, ma),
  };
}

export type MACDResult = { line: IndicatorPoint[]; signal: IndicatorPoint[]; hist: IndicatorPoint[] };

export function computeMACD(times: number[], close: number[], fast = 12, slow = 26, signalPeriod = 9): MACDResult {
  const emaFast = ema(close, fast);
  const emaSlow = ema(close, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const macdSignal = ema(macdLine, signalPeriod);
  const macdHist = macdLine.map((v, i) => v - macdSignal[i]);
  return {
    line: toPoints(times, macdLine),
    signal: toPoints(times, macdSignal),
    hist: toPoints(times, macdHist),
  };
}

export function computeVolumeSpikes(times: number[], volume: number[], period = 20, threshold = 2.5): VolumeSpike[] {
  const volMa = rollingMean(volume, period);
  const out: VolumeSpike[] = [];
  for (let i = 0; i < volume.length; i++) {
    const m = volMa[i];
    if (m === null) continue;
    const ratio = volume[i] / (m || 1);
    if (Number.isFinite(ratio) && ratio > threshold) {
      out.push({ time: times[i], value: volume[i], ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return out;
}

export function computeLevels(close: number[]): Level[] {
  if (close.length < 11) return [];
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = 5; i < close.length - 5; i++) {
    const window = close.slice(i - 5, i + 6);
    const max = Math.max(...window);
    const min = Math.min(...window);
    if (close[i] === max) peaks.push(close[i]);
    if (close[i] === min) troughs.push(close[i]);
  }
  const allPoints = Array.from(new Set([...peaks, ...troughs].map((p) => Math.round(p)))).sort((a, b) => a - b);
  const used = new Set<number>();
  const clusters: Level[] = [];
  for (const p of allPoints) {
    if (used.has(p)) continue;
    const cluster = allPoints.filter((x) => Math.abs(x - p) < p * 0.01);
    const avg = cluster.reduce((a, b) => a + b, 0) / cluster.length;
    clusters.push({ price: Math.round(avg * 100) / 100, strength: cluster.length });
    for (const c of cluster) used.add(c);
  }
  clusters.sort((a, b) => b.strength - a.strength);
  return clusters.slice(0, 10);
}

export type Indicators = {
  ma50: IndicatorPoint[];
  ma200: IndicatorPoint[];
  rsi: IndicatorPoint[];
  bb_upper: IndicatorPoint[];
  bb_lower: IndicatorPoint[];
  bb_mid: IndicatorPoint[];
  macd_line: IndicatorPoint[];
  macd_signal: IndicatorPoint[];
  macd_hist: IndicatorPoint[];
  vol_spikes: VolumeSpike[];
  levels: Level[];
};

export function computeIndicators(candles: Candle[]): Indicators {
  const times = candles.map((c) => c.time);
  const close = candles.map((c) => c.close);
  const volume = candles.map((c) => c.volume);
  const bb = computeBollinger(times, close, 20, 2);
  const macd = computeMACD(times, close, 12, 26, 9);
  return {
    ma50: computeMA(times, close, 50),
    ma200: computeMA(times, close, 200),
    rsi: computeRSI(times, close, 14),
    bb_upper: bb.upper,
    bb_lower: bb.lower,
    bb_mid: bb.mid,
    macd_line: macd.line,
    macd_signal: macd.signal,
    macd_hist: macd.hist,
    vol_spikes: computeVolumeSpikes(times, volume, 20, 2.5),
    levels: computeLevels(close),
  };
}
