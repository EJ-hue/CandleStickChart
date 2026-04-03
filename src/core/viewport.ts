import { Candle, Viewport } from "../types";

const MIN_CANDLES = 20;

export function clampViewport(next: Viewport, total: number): Viewport {
  const span = Math.max(MIN_CANDLES, Math.round(next.end - next.start));
  let start = Math.max(0, Math.round(next.start));
  let end = start + span;
  if (end > total) {
    end = total;
    start = Math.max(0, end - span);
  }
  return { start, end };
}

export function initialViewport(totalCandles: number): Viewport {
  const end = totalCandles;
  const start = Math.max(0, end - 180);
  return { start, end };
}

export function visibleCandles(candles: Candle[], viewport: Viewport): Candle[] {
  return candles.slice(viewport.start, viewport.end);
}

export function yDomain(candles: Candle[]): { min: number; max: number } {
  if (candles.length === 0) return { min: 0, max: 1 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const c of candles) {
    min = Math.min(min, c.low);
    max = Math.max(max, c.high);
  }
  const pad = Math.max((max - min) * 0.05, 1);
  return { min: min - pad, max: max + pad };
}
