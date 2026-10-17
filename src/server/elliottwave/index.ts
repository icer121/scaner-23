import z from 'zod';
import { Module } from 'modelence/server';
import { fetchOHLCV } from './moex';
import { scanMaCross, scanRange } from './scanners';
import { ElliottAnalyzer } from './elliott';
import { computeIndicators } from './indicators';

// Recursively replaces NaN/Infinity with null so JSON responses stay valid.
function cleanNaN<T>(obj: T): T {
  if (typeof obj === 'number') {
    return (Number.isFinite(obj) ? obj : null) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanNaN(item)) as unknown as T;
  }
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = cleanNaN(value);
    }
    return out as T;
  }
  return obj;
}

export default new Module('elliottwave', {
  queries: {
    getCandles: async (args: unknown) => {
      const { symbol, tf, limit } = z.object({
        symbol: z.string().min(1).max(20),
        tf: z.enum(['10m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M']),
        limit: z.number().int().positive().max(2000).optional(),
      }).parse(args);

      const ohlc = await fetchOHLCV(symbol, tf, limit ?? 500);

      return cleanNaN({
        symbol: symbol.toUpperCase(),
        tf,
        ohlc,
      });
    },

    scanMaCross: async (args: unknown) => {
      const { mode, days, tf } = z.object({
        mode: z.enum(['golden', 'death']),
        days: z.number().int().positive().max(500).default(60),
        tf: z.enum(['1h', '4h', '1d', '1w']).default('1d'),
      }).parse(args);

      const result = await scanMaCross(mode, days, tf);
      return cleanNaN(result);
    },

    scanRange: async (args: unknown) => {
      const { tf } = z.object({
        tf: z.enum(['1h', '4h', '1d', '1w']).default('1h'),
      }).parse(args);

      const result = await scanRange(tf);
      return cleanNaN(result);
    },

    getWaves: async (args: unknown) => {
      const { symbol, tf, limit } = z.object({
        symbol: z.string().min(1).max(20),
        tf: z.enum(['10m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M']),
        limit: z.number().int().positive().max(2000).optional(),
      }).parse(args);

      const candles = await fetchOHLCV(symbol, tf, limit ?? 500);
      const sym = symbol.toUpperCase();

      const times = candles.map((c) => c.time);
      const close = candles.map((c) => c.close);

      const analyzer = new ElliottAnalyzer(close, times);
      const waves = analyzer.analyze();

      // Use the latest 1h close as the forecast's "current price" anchor,
      // same as the Python handler (keeps forecasts fresh between daily bars).
      try {
        const hourly = await fetchOHLCV(sym, '1h', 10);
        if (hourly.length) {
          const uni = hourly[hourly.length - 1].close;
          if (analyzer.forecast) (analyzer.forecast as any).fromPrice = uni;
          if (analyzer.forecastAlt) (analyzer.forecastAlt as any).fromPrice = uni;
        }
      } catch {
        // non-fatal: keep the original forecast anchor
      }

      const indicators = computeIndicators(candles);
      const ohlc = candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));

      return cleanNaN({
        symbol: sym,
        tf,
        ohlc,
        waves: waves.map((w) => w.toDict(times)),
        forecast: analyzer.forecast ? analyzer.forecast.toDict(times) : null,
        forecast_alt: analyzer.forecastAlt ? analyzer.forecastAlt.toDict(times) : null,
        ...indicators,
      });
    },
  },
});
