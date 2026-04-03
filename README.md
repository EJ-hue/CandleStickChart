# Cross-Platform Candlestick Chart Kit

Reusable TypeScript candlestick module for **React web** and **React Native**, designed for live streaming market data with BUY/SELL markers and editable Limit/StopLoss lines.

## What is included

- Shared chart contract in `src/types.ts`
- Tick -> candle aggregation for `1m`, `1h`, `1d` in `src/core/timeframe.ts`
- Exchange feed adapter (`data.json` shape -> `Tick`) in `src/core/adapters.ts`
- High-performance web renderer (Canvas) in `src/web/CandlestickChartWeb.tsx`
- Native renderer (`react-native-svg`) in `src/native/CandlestickChartNative.tsx`
- Mock WebSocket market stream in `src/mock/MockMarketSocket.ts`
- Demo screens:
  - `demo/web/App.tsx`
  - `demo/native/App.tsx`

## Install

```bash
npm install
```

## Run demo (web)

```bash
npm run web:dev
```

Open the local URL shown by Vite. The web demo includes an **Acceptance panel** that displays:
- total candles (target 2,000+)
- approximate FPS
- whether tooltip/candle click/marker click/risk-line edit were exercised

## Data contract

The chart consumes pre-aggregated candles, but helper aggregation is included for live ticks.

```ts
type Tick = {
  timestamp: number; // unix ms
  price: number;
  volume: number;
};

type Candle = {
  time: number; // bucket start time, unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
```

Usage:

```ts
import { aggregateTicksToCandles } from "./src";

const candles = aggregateTicksToCandles(ticks, "1m");
```

If your incoming payload matches your current schema (`Timestamp`, `LTP`, `TickVolume`, etc.), normalize first:

```ts
import { exchangeQuoteToTick } from "./src";

const tick = exchangeQuoteToTick(rawExchangeMessage);
```

## Web usage

```tsx
<CandlestickChartWeb
  width={1120}
  height={620}
  candles={candles}
  timeframe="1m"
  tradeMarkers={[
    { id: "b1", side: "buy", time: 1712050200000, price: 150250, label: "BUY" },
    { id: "s1", side: "sell", time: 1712050800000, price: 151120, label: "SELL" }
  ]}
  riskLines={[
    { id: "limit-1", type: "limit", price: 151000, editable: true, label: "Limit" },
    { id: "sl-1", type: "stopLoss", price: 149200, editable: true, label: "StopLoss" }
  ]}
  onRiskLineChange={(lineId, price) => {
    // persist edited limit/SL values
  }}
/>
```

## Native usage

```tsx
<CandlestickChartNative
  width={360}
  height={560}
  candles={candles}
  timeframe="1m"
  tradeMarkers={tradeMarkers}
  riskLines={riskLines}
  onRiskLineChange={(lineId, price) => {}}
/>
```

## Interactions implemented

- Live updates from streaming ticks
- Timeframes: minute, hourly, daily
- Web: wheel zoom + drag pan + hover tooltip
- Native: one-finger pan + two-finger pinch zoom + touch tooltip
- Candle click/touch callback for order-entry and annotations
- BUY/SELL marker clicks
- Editable Limit and StopLoss horizontal lines
- Unified `onOrderAction` callback payload for direct order-entry wiring
- Production-style callbacks via wrappers:
  - `onPlaceOrder`
  - `onEditLimit`
  - `onEditStopLoss`

## Extending intervals

Edit `bucketMsByTf` in `src/core/timeframe.ts`:

```ts
const bucketMsByTf = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000
};
```

Then add the new key to `Timeframe` in `src/types.ts`.

## Performance notes

- Web renderer uses Canvas batching for smooth 2,000+ candle rendering.
- Native renderer uses `react-native-svg`; if you need stricter 60fps under heavy overlays, migrate draw path to **Skia/WebGL** while keeping this same props interface.
- For production profiling:
  - React Profiler: ensure stable props and memoized derived arrays
  - Xcode Instruments / Android profiler: verify no timer/listener leaks on screen unmount

## Walkthrough / hand-off

I cannot join a live call from this environment, but this package includes a short hand-off checklist you can record in under 10 minutes:

1. Explain data contract (`Tick`, `Candle`, `TradeMarker`, `RiskLine`)
2. Show live feed pipeline (`MockMarketSocket` -> `aggregateTicksToCandles` -> chart props)
3. Demonstrate marker click and risk-line editing callbacks
4. Switch timeframe and confirm aggregation behavior
5. Show where to add custom overlays (entry zones, drawings, alerts)
6. Run profiler once and verify no leak after repeated mount/unmount

## Requirement verification checklist

Use this exact checklist to confirm client acceptance:

1. **Timeframes**: click `1m`, `1h`, `1d` in web demo and verify candles regroup live.
2. **Zoom / pan / scroll**:
   - Web: mouse wheel zoom + drag pan.
   - Native: one-finger pan + two-finger pinch.
3. **Tooltip**: hover/touch any candle and verify OHLCV + timestamp readout.
4. **Clickable chart entities**:
   - click candle -> `onCandlePress`
   - click BUY/SELL marker -> `onMarkerPress`
   - drag Limit/StopLoss -> `onRiskLineChange`
   - verify unified payload on `onOrderAction`
5. **Look/feel**: dark trading theme + wick/body/volume layering similar to TV/MT style.
6. **Performance (web)**:
   - confirm `candles >= 2000` in Acceptance panel.
   - confirm FPS stays near 60 on recent Chrome.
7. **Memory / leaks**:
   - React Profiler: repeatedly mount/unmount demo and inspect commit/memory growth.
   - iOS: Xcode Instruments (Allocations + Leaks) with repeated screen open/close.
   - Android: Android Studio Profiler memory timeline under same flow.

## Mobile test guide (detailed)

This repo provides `demo/native/App.tsx`, but does not include a full RN app bootstrap.  
To test in your current mobile app immediately:

1. **Install deps in your RN app**
   - `react-native-svg`
   - copy `src/` folder into your app (or publish this package internally)
2. **Create a test screen**
   - copy code from `demo/native/App.tsx` into a temporary screen in your RN app
   - register that screen in your navigator
3. **Run on device/simulator**
   - Android: `npx react-native run-android`
   - iOS: `npx react-native run-ios`
4. **Functional test cases**
   - Verify live ticks continue updating candles.
   - Pan with one finger: chart should scroll horizontally.
   - Pinch with two fingers: zoom in/out should change candle density.
   - Tap/drag on candle: tooltip should show OHLCV + timestamp.
   - Tap BUY/SELL marker: `onPlaceOrder` should fire with side/price/time.
   - Drag `Limit` line: `onEditLimit` should fire with new price.
   - Drag `StopLoss` line: `onEditStopLoss` should fire with new price.
5. **Performance test for 2,000+ candles**
   - seed at least ~2500 ticks before screen render (already shown in web demo strategy)
   - open the native screen and do 60 seconds of pan/pinch/drag interaction
   - confirm no visible frame stutter on recent test device
6. **Memory leak test**
   - Open/close the chart screen 20-30 times.
   - iOS: Xcode Instruments -> Leaks + Allocations.
   - Android: Android Studio Profiler -> Memory.
   - Pass criteria: memory stabilizes, no continuous upward trend from orphan listeners/timers.

### Minimal wrapper usage in production

Use `TradingChartNative` and map callbacks directly:

```tsx
<TradingChartNative
  width={360}
  height={560}
  candles={candles}
  timeframe="1m"
  tradeMarkers={markers}
  riskLines={riskLines}
  onPlaceOrder={(p) => orderApi.place(p)}
  onEditLimit={(p) => orderApi.updateLimit(p)}
  onEditStopLoss={(p) => orderApi.updateStopLoss(p)}
/>
```

## Prior-tech note for bid text

If you want client-facing proposal wording, use:

"Implementation uses a D3-style scaling model with Canvas acceleration on web and `react-native-svg` renderer on mobile, plus optional upgrade path to Skia/WebGL for dense overlays and low-latency interactions."
