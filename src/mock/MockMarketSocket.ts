import { Tick } from "../types";

type Listener = (tick: Tick) => void;

export class MockMarketSocket {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPrice: number;
  private now: number;

  constructor(seedPrice = 150000, startTs = Date.now()) {
    this.lastPrice = seedPrice;
    this.now = startTs;
  }

  connect(intervalMs = 250): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const drift = (Math.random() - 0.5) * 220;
      this.lastPrice = Math.max(1, this.lastPrice + drift);
      this.now += intervalMs;
      const tick: Tick = {
        timestamp: this.now,
        price: Math.round(this.lastPrice),
        volume: Math.ceil(Math.random() * 12)
      };
      this.listeners.forEach((cb) => cb(tick));
    }, intervalMs);
  }

  onTick(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
