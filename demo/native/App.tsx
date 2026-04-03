import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import {
  aggregateTicksToCandles,
  TradingChartNative,
  exchangeQuoteToTick,
  ExchangeQuoteTick,
  MockMarketSocket,
  RiskLine,
  Tick,
  Timeframe,
  TradeMarker
} from "../../src";
import seedQuote from "../../data.json";

export default function App(): JSX.Element {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [timeframe] = useState<Timeframe>("1m");
  const [riskLines, setRiskLines] = useState<RiskLine[]>([
    { id: "limit-1", type: "limit", price: 151000, editable: true, label: "Limit" },
    { id: "sl-1", type: "stopLoss", price: 149200, editable: true, label: "StopLoss" }
  ]);
  const [markers] = useState<TradeMarker[]>([
    { id: "m1", side: "buy", time: Date.now() - 18 * 60_000, price: 149900, label: "BUY" },
    { id: "m2", side: "sell", time: Date.now() - 8 * 60_000, price: 150850, label: "SELL" }
  ]);
  const [tooltip, setTooltip] = useState<string>("Tap or drag on chart");

  useEffect(() => {
    const normalizedSeed = exchangeQuoteToTick(seedQuote as ExchangeQuoteTick);
    setTicks([normalizedSeed]);
    const ws = new MockMarketSocket(150000);
    const off = ws.onTick((tick) => {
      setTicks((prev) => {
        const next = [...prev, tick];
        return next.length > 8000 ? next.slice(next.length - 8000) : next;
      });
    });
    ws.connect(150);
    return () => {
      off();
      ws.disconnect();
    };
  }, []);

  const candles = useMemo(() => aggregateTicksToCandles(ticks, timeframe), [ticks, timeframe]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b1220" }}>
      <View style={{ padding: 12 }}>
        <Text style={{ color: "#c6d8ff", fontSize: 18, marginBottom: 8 }}>Native Candlestick Demo</Text>
        <Text style={{ color: "#9ab0d0", marginBottom: 8 }}>{tooltip}</Text>
        <TradingChartNative
          width={360}
          height={560}
          candles={candles}
          timeframe={timeframe}
          tradeMarkers={markers}
          riskLines={riskLines}
          onRiskLineChange={(id, price) => {
            setRiskLines((prev) => prev.map((r) => (r.id === id ? { ...r, price } : r)));
          }}
          onTooltipChange={(payload) => {
            if (!payload) return;
            const c = payload.candle;
            setTooltip(`${new Date(c.time).toLocaleTimeString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`);
          }}
          onCandlePress={(c) => setTooltip(`Candle pressed ${new Date(c.time).toLocaleTimeString()}`)}
          onMarkerPress={(m) => setTooltip(`Marker pressed: ${m.side.toUpperCase()} @ ${m.price}`)}
          onOrderAction={(payload) => setTooltip(`Action ${payload.kind}:${payload.action} @ ${payload.price.toFixed(2)}`)}
          onPlaceOrder={(payload) => setTooltip(`Place ${payload.side.toUpperCase()} @ ${payload.price.toFixed(2)}`)}
          onEditLimit={(payload) => setTooltip(`Limit edited -> ${payload.price.toFixed(2)}`)}
          onEditStopLoss={(payload) => setTooltip(`StopLoss edited -> ${payload.price.toFixed(2)}`)}
        />
      </View>
    </SafeAreaView>
  );
}
