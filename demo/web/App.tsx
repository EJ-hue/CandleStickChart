import React, { useEffect, useRef, useState } from "react";
import { CandlestickChartWeb } from "../../src/web/CandlestickChartWeb";
import { Candle } from "../../src/types";

const INTERVAL_MS: Record<string, number> = {
  "1":    60_000,
  "60":   3_600_000,
  "1440": 86_400_000,
};

function generateSeedCandles(count: number, intervalMs: number, basePrice = 67_000): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * intervalMs;
    const change = (Math.random() - 0.48) * price * 0.003;
    const open = price;
    const close = Math.max(1, price + change);
    const high = Math.max(open, close) + Math.random() * price * 0.001;
    const low = Math.min(open, close) - Math.random() * price * 0.001;
    const volume = Math.floor(Math.random() * 800 + 100);
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

export default function App(): JSX.Element {
  const [interval, setIntervalState] = useState("1");
  const [candles, setCandles] = useState<Candle[]>(() =>
    generateSeedCandles(2000, 60_000)
  );
  const currentCandleOpenTime = useRef<number>(0);

  const handleIntervalChange = (iv: string) => {
    setIntervalState(iv);
    const ivMs = INTERVAL_MS[iv] ?? 60_000;
    setCandles(generateSeedCandles(2000, ivMs));
    currentCandleOpenTime.current = 0;
  };

  useEffect(() => {
    const ivMs = INTERVAL_MS[interval] ?? 60_000;
    let price = candles[candles.length - 1]?.close ?? 67_000;
    let alive = true;
    let pending: { ltp: number; high: number; low: number; vol: number } | null = null;

    const tickLoop = () => {
      if (!alive) return;
      const drift = (Math.random() - 0.495) * price * 0.00035;
      price = Math.max(1, price + drift);
      const p = Math.round(price * 100) / 100;
      const spread = p * 0.0001;

      pending = {
        ltp: p,
        high: p + Math.random() * spread * 3,
        low: p - Math.random() * spread * 3,
        vol: Math.ceil(Math.random() * 20),
      };
    };

    const flushLoop = () => {
      if (!alive) return;
      if (pending) {
        const tick = pending;
        pending = null;
        setCandles((prev) => {
          const last = prev[prev.length - 1];
          const now = Date.now();
          if (now - last.time < ivMs) {
            const updated: Candle = {
              ...last,
              close: tick.ltp,
              high: Math.max(last.high, tick.ltp),
              low: Math.min(last.low, tick.ltp),
              volume: last.volume + tick.vol,
            };
            prev[prev.length - 1] = updated;
            return [...prev];
          } else {
            const newCandle: Candle = {
              time: now,
              open: tick.ltp,
              high: tick.high,
              low: tick.low,
              close: tick.ltp,
              volume: tick.vol,
            };
            prev.push(newCandle);
            return [...prev];
          }
        });
      }
      flushRaf = requestAnimationFrame(flushLoop);
    };

    const tickInterval = setInterval(tickLoop, 42);
    let flushRaf = requestAnimationFrame(flushLoop);

    return () => {
      alive = false;
      clearInterval(tickInterval);
      cancelAnimationFrame(flushRaf);
    };
  }, [interval]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#0b0e17",
        padding: 16,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CandlestickChartWeb
        candles={candles}
        symbol="Bitcoin / U.S. Dollar"
        interval={interval}
        onIntervalChange={handleIntervalChange}
        onCandleClick={(e) => {
          console.log("Candle clicked:", e.candle, "at price", e.price);
        }}
      />
    </div>
  );
}
