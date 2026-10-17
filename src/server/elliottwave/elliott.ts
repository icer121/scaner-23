// Elliott Wave detection engine — ported from the original Python `engine.py`
// (ZigZag pivot detection + impulse/diagonal/zigzag/flat/triangle detectors +
// Fibonacci-ratio scoring + Forecast generation). Logic kept 1:1 with the
// Python source; only syntax is translated to TypeScript.

export type Pivot = {
  idx: number;
  price: number;
  kind: 'H' | 'L';
  degree: number;
};

export type WaveSubtype =
  | 'impulse'
  | 'diagonal'
  | 'zigzag'
  | 'flat'
  | 'contracting_triangle'
  | 'expanding_triangle';

export type WaveKind = 'impulse' | 'diagonal' | 'correction' | 'triangle';

export type WavePoint = { time: number; value: number; kind: 'H' | 'L' };

export type WaveDict = {
  kind: WaveKind;
  subtype: WaveSubtype;
  degree: number;
  score: number;
  labels: string[];
  color_key: string;
  fib: { name: string; value: number }[];
  channel: { p2: number; p3: number; p4: number; p5: number; slope: number; offset: number } | null;
  points: WavePoint[];
};

class Wave {
  kind: WaveKind;
  subtype: WaveSubtype;
  pivots: Pivot[];
  degree: number;
  score: number;
  fib: { name: string; value: number }[] = [];
  meta: { labels?: string[]; color_key?: string; channel?: any } = {};

  constructor(kind: WaveKind, subtype: WaveSubtype, pivots: Pivot[], degree: number, score = 0) {
    this.kind = kind;
    this.subtype = subtype;
    this.pivots = pivots;
    this.degree = degree;
    this.score = score;
  }

  toDict(ts: number[]): WaveDict {
    const n = ts ? ts.length : null;
    const t = (p: Pivot) => {
      if (ts && n !== null && p.idx >= 0 && p.idx < n) return ts[p.idx];
      return p.idx;
    };
    return {
      kind: this.kind,
      subtype: this.subtype,
      degree: this.degree,
      score: Math.round(this.score * 1000) / 1000,
      labels: this.meta.labels ?? [],
      color_key: this.meta.color_key ?? 'minor_impulse',
      fib: this.fib,
      channel: this.meta.channel ?? null,
      points: this.pivots.map((p) => ({ time: t(p), value: p.price, kind: p.kind })),
    };
  }
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function atr(prices: number[], period = 14): number {
  if (prices.length < period + 1) return std(prices);
  const diffs: number[] = [];
  for (let i = 1; i < prices.length; i++) diffs.push(Math.abs(prices[i] - prices[i - 1]));
  const tail = diffs.slice(-period);
  const m = mean(tail);
  return m || std(prices);
}

export function zigzag(prices: number[], depth: number, atrMult: number): Pivot[] {
  const n = prices.length;
  if (n < 3) return [];
  let a = atr(prices, 14);
  if (a <= 0) a = std(prices) || 1e-6;
  const dev = (a * atrMult) / Math.max(mean(prices), 1e-9);

  const piv: Pivot[] = [];
  let d = 0;
  let le = prices[0];
  let lei = 0;
  let lpi = -depth;

  for (let i = 1; i < n; i++) {
    const p = prices[i];
    if (d >= 0) {
      if (p > le) {
        le = p;
        lei = i;
      } else if (p < le * (1 - dev) && i - lpi >= depth) {
        piv.push({ idx: lei, price: le, kind: 'H', degree: 0 });
        d = -1;
        le = p;
        lei = i;
        lpi = i;
      }
    }
    if (d <= 0) {
      if (p < le) {
        le = p;
        lei = i;
      } else if (p > le * (1 + dev) && i - lpi >= depth) {
        piv.push({ idx: lei, price: le, kind: 'L', degree: 0 });
        d = 1;
        le = p;
        lei = i;
        lpi = i;
      }
    }
  }
  if (d === 1) piv.push({ idx: lei, price: le, kind: 'H', degree: 0 });
  else if (d === -1) piv.push({ idx: lei, price: le, kind: 'L', degree: 0 });

  const out: Pivot[] = [];
  for (const x of piv) {
    if (out.length && out[out.length - 1].kind === x.kind) {
      const last = out[out.length - 1];
      if ((x.kind === 'H' && x.price > last.price) || (x.kind === 'L' && x.price < last.price)) {
        out[out.length - 1] = x;
      }
    } else {
      out.push(x);
    }
  }
  return out;
}

// degree -1 = Cycle, 0 = Primary, 1 = Intermediate, 2 = Minor
export const DEGREE_CONFIG: Record<number, [number, number]> = {
  [-1]: [8, 6.0],
  0: [5, 3.0],
  1: [3, 1.5],
  2: [2, 0.8],
};

const LABELS_IMP: Record<number, string[]> = {
  [-1]: ['0', '[I]', '[II]', '[III]', '[IV]', '[V]'],
  0: ['0', '(I)', '(II)', '(III)', '(IV)', '(V)'],
  1: ['0', 'I', 'II', 'III', 'IV', 'V'],
  2: ['0', '(1)', '(2)', '(3)', '(4)', '(5)'],
};
const LABELS_COR: Record<number, string[]> = {
  [-1]: ['0', '[A]', '[B]', '[C]'],
  0: ['0', '(A)', '(B)', '(C)'],
  1: ['0', 'A', 'B', 'C'],
  2: ['0', '(A)', '(B)', '(C)'],
};
const LABELS_TRI: Record<number, string[]> = {
  [-1]: ['0', '[A]', '[B]', '[C]', '[D]', '[E]'],
  0: ['0', '(A)', '(B)', '(C)', '(D)', '(E)'],
  1: ['0', 'A', 'B', 'C', 'D', 'E'],
  2: ['0', '(A)', '(B)', '(C)', '(D)', '(E)'],
};
const COLORS: Record<number, string> = { [-1]: 'cycle_impulse', 0: 'primary_impulse', 1: 'sub_impulse', 2: 'minor_impulse' };
const COLORS_COR: Record<number, string> = { [-1]: 'cycle_correction', 0: 'primary_correction', 1: 'sub_correction', 2: 'minor_correction' };
const COLORS_TRI: Record<number, string> = { [-1]: 'cycle_triangle', 0: 'primary_triangle', 1: 'sub_triangle', 2: 'minor_triangle' };

function legs(pv: Pivot[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pv.length - 1; i++) out.push(Math.abs(pv[i + 1].price - pv[i].price));
  return out;
}
function alters(pv: Pivot[]): boolean {
  for (let i = 0; i < pv.length - 1; i++) if (pv[i].kind === pv[i + 1].kind) return false;
  return true;
}
function legsOk(pv: Pivot[], b = 3): boolean {
  for (let i = 0; i < pv.length - 1; i++) if (pv[i + 1].idx - pv[i].idx < b) return false;
  return true;
}
function near(v: number, targets: number[], tol: number): number {
  return targets.some((t) => Math.abs(v - t) <= tol) ? 1.0 : 0.0;
}

type CheckResult = [number, WaveSubtype, Record<string, any>] | null;

function checkImpulse(pv: Pivot[], n: number): CheckResult {
  if (pv.length !== 6 || !alters(pv) || !legsOk(pv)) return null;
  const pr = pv.map((x) => x.price);
  const up = pr[5] > pr[0];
  const [w1, w2, w3, w4, w5] = legs(pv);
  if (w1 === 0 || w3 === 0) return null;
  if (w2 >= w1) return null;
  if (w3 <= w1 && w3 <= w5) return null;
  if (up && (pr[3] <= pr[1] || pr[4] <= pr[1])) return null;
  if (!up && (pr[3] >= pr[1] || pr[4] >= pr[1])) return null;
  const span = pv[pv.length - 1].idx - pv[0].idx;
  if (n > 0 && span < n * 0.03) return null;
  const r2 = w2 / w1;
  const r3 = w3 / w1;
  const r4 = w4 / w3;
  const r5 = w5 / w1;
  const alt = (r2 > 0.5) !== (r4 > 0.5) ? 1.0 : 0.0;
  const s =
    (near(r2, [0.382, 0.5, 0.618, 0.786], 0.15) +
      near(r3, [1.618, 2.618], 0.2) +
      near(r4, [0.236, 0.382, 0.5], 0.15) +
      near(r5, [0.618, 1.0, 1.618], 0.2) +
      alt) /
    5.0;
  if (s < 0.3) return null;
  return [
    s,
    'impulse',
    { up, fib: { w2: round3(r2), w3: round3(r3), w4: round3(r4), w5: round3(r5) } },
  ];
}

function checkDiagonal(pv: Pivot[], n: number): CheckResult {
  if (pv.length !== 6 || !alters(pv) || !legsOk(pv)) return null;
  const pr = pv.map((x) => x.price);
  const up = pr[5] > pr[0];
  const [w1, w2, w3] = legs(pv);
  const w5 = legs(pv)[4];
  if (w1 === 0 || w3 === 0) return null;
  if (w2 >= w1) return null;
  if (w3 <= w1 && w3 <= w5) return null;
  if (up) {
    if (!(pr[4] < pr[1])) return null;
    if (!(pr[3] > pr[1])) return null;
  } else {
    if (!(pr[4] > pr[1])) return null;
    if (!(pr[3] < pr[1])) return null;
  }
  const span = pv[pv.length - 1].idx - pv[0].idx;
  if (n > 0 && span < n * 0.05) return null;
  return [0.75, 'diagonal', { up }];
}

function checkZigzag(pv: Pivot[], n: number): CheckResult {
  if (pv.length !== 4 || !alters(pv) || !legsOk(pv)) return null;
  const pr = pv.map((x) => x.price);
  const [a, b, c] = legs(pv);
  if (a === 0 || b >= a * 1.02) return null;
  const upFirst = pr[1] > pr[0];
  if (upFirst && pr[3] <= pr[0]) return null;
  if (!upFirst && pr[3] >= pr[0]) return null;
  const r = c / a;
  if (!(r >= 0.5 && r <= 2.5)) return null;
  const span = pv[pv.length - 1].idx - pv[0].idx;
  if (n > 0 && span < n * 0.03) return null;
  const s = near(r, [0.618, 1.0, 1.272, 1.618], 0.3);
  return [s, 'zigzag', {}];
}

function checkFlat(pv: Pivot[], n: number): CheckResult {
  if (pv.length !== 4 || !alters(pv) || !legsOk(pv)) return null;
  const [a, b, c] = legs(pv);
  if (a === 0) return null;
  const rB = b / a;
  const rC = c / a;
  if (!(rB >= 0.85 && rB <= 1.15 && rC >= 0.8 && rC <= 1.2)) return null;
  const span = pv[pv.length - 1].idx - pv[0].idx;
  if (n > 0 && span < n * 0.03) return null;
  return [0.7, 'flat', {}];
}

function checkTriangle(pv: Pivot[], _n: number): CheckResult {
  if (pv.length !== 6 || !alters(pv) || !legsOk(pv)) return null;
  const l = legs(pv);
  if (Math.min(...l) === 0) return null;
  const [a, b, c, d, e] = l;
  if (a > b && b > c && c > d && d > e && e / a < 0.75) return [0.75, 'contracting_triangle', {}];
  if (a < b && b < c && c < d && d < e && e / a > 1.35) return [0.75, 'expanding_triangle', {}];
  return null;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const MOVE_6 = [checkImpulse, checkDiagonal, checkTriangle];
const CORR_4 = [checkZigzag, checkFlat];

function buildWave(pv: Pivot[], deg: number, subtype: WaveSubtype, score: number, _extra: Record<string, any>): Wave {
  let kind: WaveKind;
  let labels: string[];
  let color: string;
  if (subtype === 'impulse' || subtype === 'diagonal') {
    kind = subtype === 'impulse' ? 'impulse' : 'diagonal';
    labels = LABELS_IMP[deg].slice(0, pv.length);
    color = COLORS[deg];
  } else if (subtype === 'zigzag' || subtype === 'flat') {
    kind = 'correction';
    labels = LABELS_COR[deg].slice(0, pv.length);
    color = COLORS_COR[deg];
  } else {
    kind = 'triangle';
    labels = LABELS_TRI[deg].slice(0, pv.length);
    color = COLORS_TRI[deg];
  }
  const w = new Wave(kind, subtype, pv, deg, score);
  w.meta.labels = labels;
  w.meta.color_key = color;

  if ((subtype === 'impulse' || subtype === 'diagonal') && pv.length === 6) {
    const p2 = pv[2];
    const p3 = pv[3];
    const p4 = pv[4];
    if (p4.idx !== p2.idx) {
      const slope = (p4.price - p2.price) / (p4.idx - p2.idx);
      const off = p3.price - (p2.price + slope * (p3.idx - p2.idx));
      w.meta.channel = { p2: p2.idx, p3: p3.idx, p4: p4.idx, p5: pv[pv.length - 1].idx, slope, offset: off };
    }
    const [w1, w2, w3, w4, w5] = legs(pv);
    if (w1 > 0 && w3 > 0) {
      w.fib = [
        { name: '2', value: round3(w2 / w1) },
        { name: '3', value: round3(w3 / w1) },
        { name: '4', value: round3(w4 / w3) },
        { name: '5', value: round3(w5 / w1) },
      ];
    }
  }
  return w;
}

function walkChain(pivots: Pivot[], deg: number, n: number, minScore: number): Wave[] {
  if (pivots.length < 4) return [];
  const waves: Wave[] = [];
  let i = 0;
  while (i <= pivots.length - 4) {
    const cands: [number, Wave, number][] = [];
    if (i + 6 <= pivots.length) {
      const pv = pivots.slice(i, i + 6);
      for (const fn of MOVE_6) {
        const res = fn(pv, n);
        if (!res) continue;
        const [s, sub, extra] = res;
        if (s >= minScore) cands.push([s, buildWave(pv, deg, sub, s, extra), 6]);
      }
    }
    if (i + 4 <= pivots.length) {
      const pv = pivots.slice(i, i + 4);
      for (const fn of CORR_4) {
        const res = fn(pv, n);
        if (!res) continue;
        const [s, sub, extra] = res;
        if (s >= minScore) cands.push([s, buildWave(pv, deg, sub, s, extra), 4]);
      }
    }
    if (cands.length === 0) {
      i += 1;
      continue;
    }
    cands.sort((x, y) => (y[0] - x[0]) || (y[2] - x[2]));
    const [, w, span] = cands[0];
    waves.push(w);
    i += span;
  }
  return waves;
}

function walkChainSoft(pivots: Pivot[], deg: number, _n: number, _minScore: number): Wave[] {
  if (pivots.length < 6) return [];
  const waves: Wave[] = [];
  let i = 0;
  while (i <= pivots.length - 6) {
    const pv = pivots.slice(i, i + 6);
    let alt = true;
    for (let j = 0; j < 5; j++) if (pv[j].kind === pv[j + 1].kind) alt = false;
    if (alt) {
      const w = buildWave(pv, deg, 'impulse', 0.35, { up: pv[5].price > pv[0].price });
      waves.push(w);
      i += 6;
    } else {
      i += 1;
    }
  }
  return waves;
}

export type ForecastTarget = { price: number; prob: number; label: string; desc: string };

class Forecast {
  fromIdx: number;
  fromPrice: number;
  direction: 'up' | 'down';
  nextLabel: string;
  targets: ForecastTarget[];
  barsAhead: number;
  context: string;
  stopPrice: number;

  constructor(
    fromIdx: number,
    fromPrice: number,
    direction: 'up' | 'down',
    nextLabel: string,
    targets: ForecastTarget[],
    barsAhead: number,
    context: string,
    stopPrice = 0
  ) {
    this.fromIdx = fromIdx;
    this.fromPrice = fromPrice;
    this.direction = direction;
    this.nextLabel = nextLabel;
    this.targets = targets;
    this.barsAhead = barsAhead;
    this.context = context;
    this.stopPrice = stopPrice;
  }

  toDict(ts: number[]) {
    const t = (i: number) => (ts && i >= 0 && i < ts.length ? ts[i] : i);
    const entry = this.fromPrice;
    const lo = entry * 0.7;
    const hi = entry * 1.3;
    const clamped = this.targets.map((x) => ({
      price: Math.max(lo, Math.min(hi, x.price)),
      prob: x.prob,
      label: x.label,
      desc: x.desc,
    }));
    const strongest = clamped.length ? clamped.reduce((a, b) => (b.prob > a.prob ? b : a)) : null;
    let tp = strongest ? strongest.price : entry;
    if (Math.abs(tp - entry) < entry * 0.005) {
      tp = this.direction === 'up' ? entry * 1.02 : entry * 0.98;
    }
    const side = this.direction === 'up' ? 'LONG' : 'SHORT';
    let stop = this.stopPrice > 0 ? this.stopPrice : this.direction === 'up' ? entry * 0.97 : entry * 1.03;
    const minD = entry * 0.03;
    const maxD = entry * 0.08;
    if (this.direction === 'up') {
      stop = Math.max(entry - maxD, Math.min(entry - minD, stop));
    } else {
      stop = Math.min(entry + maxD, Math.max(entry + minD, stop));
    }
    const risk = Math.abs(entry - stop);
    const reward = Math.abs(tp - entry);
    const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
    return {
      from_time: t(this.fromIdx),
      from_price: entry,
      direction: this.direction,
      next_label: this.nextLabel,
      bars_ahead: this.barsAhead,
      context: this.context,
      targets: clamped,
      signal: {
        side,
        entry: Math.round(entry * 100) / 100,
        stop: Math.round(stop * 100) / 100,
        tp: Math.round(tp * 100) / 100,
        rr,
        confidence: 50,
      },
    };
  }
}

export class ElliottAnalyzer {
  prices: number[];
  ts: number[];
  n: number;
  forecast: Forecast | null = null;
  forecastAlt: Forecast | null = null;

  constructor(prices: number[], timestamps: number[]) {
    this.prices = prices;
    this.ts = timestamps;
    this.n = prices.length;
  }

  analyze(): Wave[] {
    if (this.n < 40) return [];
    const allWaves: Wave[] = [];

    for (const [degStr, [depth, atrMult]] of Object.entries(DEGREE_CONFIG)) {
      const deg = Number(degStr);
      if (deg === -1 && this.n < 400) continue;

      if (deg <= 0) {
        let found = false;
        for (const depth2 of [depth, depth - 1, depth - 2, depth + 1]) {
          if (depth2 < 2) continue;
          const piv = zigzag(this.prices, depth2, atrMult);
          for (const p of piv) p.degree = deg;
          if (piv.length < 4) continue;
          const minS = deg <= 0 ? 0.45 : deg === 1 ? 0.4 : 0.35;
          const w1 = walkChain(piv, deg, this.n, minS);
          if (w1.length) {
            allWaves.push(...w1);
            found = true;
            break;
          }
        }
        if (!found) {
          const piv = zigzag(this.prices, Math.max(3, depth - 2), atrMult);
          for (const p of piv) p.degree = deg;
          if (piv.length >= 6) {
            allWaves.push(...walkChainSoft(piv, deg, this.n, 0.3));
          }
        }
      } else {
        const piv = zigzag(this.prices, depth, atrMult);
        for (const p of piv) p.degree = deg;
        if (piv.length < 4) continue;
        const minS = deg === 1 ? 0.4 : 0.35;
        allWaves.push(...walkChain(piv, deg, this.n, minS));
      }
    }

    allWaves.sort((a, b) => a.degree - b.degree || a.pivots[0].idx - b.pivots[0].idx);

    this.forecast = null;
    this.forecastAlt = null;
    let cands = allWaves.filter((w) => w.degree <= 1 && w.kind === 'impulse');
    if (!cands.length) cands = allWaves.filter((w) => w.kind === 'impulse');
    if (!cands.length && allWaves.length > 0) cands = allWaves.filter((w) => w.kind === 'correction');
    if (cands.length) {
      const last = cands.reduce((a, b) => (b.pivots[b.pivots.length - 1].idx > a.pivots[a.pivots.length - 1].idx ? b : a));
      this.forecast = this.fcMain(last);
      this.forecastAlt = this.fcAlt(last);
    }
    return allWaves;
  }

  private fcMain(last: Wave): Forecast {
    const p = last.pivots;
    const cp = this.prices[this.prices.length - 1];
    const total = Math.abs(p[p.length - 1].price - p[0].price);
    const up = p[p.length - 1].price > p[0].price;
    const direction: 'up' | 'down' = up ? 'down' : 'up';
    const targets: ForecastTarget[] = [];
    for (const [r, prob] of [[0.382, 0.32], [0.5, 0.3], [0.618, 0.26], [0.786, 0.12]] as [number, number][]) {
      const tgt = up ? cp - total * r : cp + total * r;
      targets.push({ price: tgt, prob, label: 'A', desc: `A = ${Math.round(r * 100)}% retrace` });
    }
    return new Forecast(
      this.n - 1,
      cp,
      direction,
      'A',
      targets,
      Math.max(10, Math.floor(0.4 * (p[p.length - 1].idx - p[0].idx))),
      'After impulse -> ABC',
      p[p.length - 1].price
    );
  }

  private fcAlt(last: Wave): Forecast {
    const p = last.pivots;
    const cp = this.prices[this.prices.length - 1];
    const up = p[p.length - 1].price > p[0].price;
    const total = Math.abs(p[p.length - 1].price - p[0].price);
    const direction: 'up' | 'down' = up ? 'up' : 'down';
    const targets: ForecastTarget[] = [];
    for (const [r, prob] of [[0.5, 0.35], [1.0, 0.4], [1.618, 0.25]] as [number, number][]) {
      const tgt = up ? cp + total * r : cp - total * r;
      targets.push({ price: tgt, prob, label: 'alt', desc: `Alt ${Math.round(r * 100)}%` });
    }
    const tot = targets.reduce((s, x) => s + x.prob, 0);
    for (const x of targets) x.prob = Math.round((x.prob / tot) * 0.35 * 1000) / 1000;
    return new Forecast(
      this.n - 1,
      cp,
      direction,
      'alt',
      targets,
      Math.max(10, Math.floor(0.4 * (p[p.length - 1].idx - p[0].idx))),
      'Alternative count',
      p[p.length - 1].price
    );
  }
}
