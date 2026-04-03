import { ExchangeQuoteTick, Tick } from "../types";

function parseDdMmYyyyHhMmSs(value: string): number {
  const [date, time] = value.split(" ");
  if (!date || !time) return Date.now();
  const [dd, mm, yyyy] = date.split("-").map(Number);
  const [hh, min, ss] = time.split(":").map(Number);
  return new Date(yyyy, (mm ?? 1) - 1, dd ?? 1, hh ?? 0, min ?? 0, ss ?? 0).getTime();
}

export function exchangeQuoteToTick(raw: ExchangeQuoteTick): Tick {
  return {
    timestamp: parseDdMmYyyyHhMmSs(raw.Timestamp),
    price: raw.LTP,
    volume: raw.TickVolume ?? 0
  };
}
