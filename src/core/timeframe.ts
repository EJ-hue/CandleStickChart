import { Candle, Tick, Timeframe } from "../types";

const bucketMsByTf: Record<Timeframe, number> = {
  "1m": 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000
};

export function aggregateTicksToCandles(ticks: Tick[], timeframe: Timeframe): Candle[] {
  const bucketSize = bucketMsByTf[timeframe];
  const buckets = new Map<number, Candle>();

  for (const tick of ticks) {
    const bucketTime = Math.floor(tick.timestamp / bucketSize) * bucketSize;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume
      });
      continue;
    }
    existing.high = Math.max(existing.high, tick.price);
    existing.low = Math.min(existing.low, tick.price);
    existing.close = tick.price;
    existing.volume += tick.volume;
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}
