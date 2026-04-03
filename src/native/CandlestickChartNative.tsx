import React, { useMemo, useRef, useState, useEffect } from "react";
import { PanResponder, Text as RNText, View } from "react-native";
import Svg, { Circle, Line, Rect, Text } from "react-native-svg";
import { clampViewport, initialViewport, visibleCandles, yDomain } from "../core/viewport";
import { defaultTheme } from "../core/theme";
import { Candle, CandlestickChartProps, Viewport } from "../types";

const PRICE_AREA_RATIO = 0.78;

export function CandlestickChartNative(props: CandlestickChartProps): JSX.Element {
  const {
    width = 360,
    height = 560,
    symbol = "",
    candles,
    tradeMarkers = [],
    riskLines = [],
    onCandlePress,
    onMarkerPress,
    onRiskLineChange,
    onTooltipChange,
    onOrderAction,
    onViewportChange,
    theme
  } = props;
  const mergedTheme = { ...defaultTheme, ...theme };
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport(candles.length));
  const [dragRiskId, setDragRiskId] = useState<string | null>(null);
  const lastPanX = useRef(0);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartSpan = useRef<number | null>(null);

  const visible = useMemo(() => visibleCandles(candles, viewport), [candles, viewport]);
  const { min, max } = useMemo(() => yDomain(visible), [visible]);
  const priceHeight = height * PRICE_AREA_RATIO;
  const cw = visible.length > 0 ? width / visible.length : width;
  const volumeMax = useMemo(() => Math.max(...visible.map((c) => c.volume), 1), [visible]);
  const toY = (p: number) => priceHeight - ((p - min) / (max - min)) * (priceHeight - 14) - 6;
  const yToPrice = (y: number) => max - (y / priceHeight) * (max - min);

  const setNextViewport = (next: Viewport) => {
    const clamped = clampViewport(next, candles.length);
    setViewport(clamped);
    onViewportChange?.(clamped);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          lastPanX.current = evt.nativeEvent.locationX;
          const y = evt.nativeEvent.locationY;
          const hit = riskLines.find((r) => Math.abs(toY(r.price) - y) < 12 && r.editable);
          if (hit) {
            setDragRiskId(hit.id);
            onOrderAction?.({
              kind: "riskLine",
              action: "select",
              price: hit.price,
              riskLineId: hit.id
            });
          }
        },
        onPanResponderMove: (evt, gesture) => {
          const x = evt.nativeEvent.locationX;
          const y = evt.nativeEvent.locationY;
          const idx = Math.max(0, Math.min(visible.length - 1, Math.floor((x / width) * visible.length)));
          const candle = visible[idx];
          if (candle) {
            onTooltipChange?.({ candle, index: viewport.start + idx, x, y });
          }

          if (dragRiskId) {
            const price = yToPrice(y);
            onRiskLineChange?.(dragRiskId, price);
            onOrderAction?.({
              kind: "riskLine",
              action: "edit",
              price,
              riskLineId: dragRiskId
            });
            return;
          }

          const touches = evt.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            const [a, b] = touches;
            const dx = b.pageX - a.pageX;
            const dy = b.pageY - a.pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (pinchStartDistance.current === null || pinchStartSpan.current === null) {
              pinchStartDistance.current = distance;
              pinchStartSpan.current = viewport.end - viewport.start;
              return;
            }
            const scale = distance / Math.max(1, pinchStartDistance.current);
            const startSpan = pinchStartSpan.current;
            const nextSpan = Math.max(20, Math.min(candles.length, Math.round(startSpan / Math.max(0.5, Math.min(2.5, scale)))));
            const centerTouchX = (a.locationX + b.locationX) / 2;
            const centerRatio = Math.max(0, Math.min(1, centerTouchX / width));
            const centerIndex = viewport.start + centerRatio * (viewport.end - viewport.start);
            setNextViewport({ start: centerIndex - nextSpan / 2, end: centerIndex + nextSpan / 2 });
            return;
          }

          pinchStartDistance.current = null;
          pinchStartSpan.current = null;

          // one-finger pan for scroll
          const dx = x - lastPanX.current;
          if (Math.abs(dx) > 4) {
            const move = Math.round((dx / width) * visible.length);
            if (move !== 0) {
              setNextViewport({ start: viewport.start - move, end: viewport.end - move });
              lastPanX.current = x;
            }
          }
        },
        onPanResponderRelease: (evt) => {
          const x = evt.nativeEvent.locationX;
          const y = evt.nativeEvent.locationY;
          const idx = Math.max(0, Math.min(visible.length - 1, Math.floor((x / width) * visible.length)));
          const candle = visible[idx];
          if (candle) {
            onCandlePress?.(candle, viewport.start + idx);
            onOrderAction?.({
              kind: "candle",
              action: "select",
              price: candle.close,
              time: candle.time
            });
          }

          setDragRiskId(null);
          pinchStartDistance.current = null;
          pinchStartSpan.current = null;
          onTooltipChange?.(null);
        }
      }),
    [candles.length, dragRiskId, max, min, onCandlePress, onMarkerPress, onRiskLineChange, onTooltipChange, onViewportChange, riskLines, viewport, visible.length]
  );

  useEffect(() => {
    setViewport((prev) => {
      const span = prev.end - prev.start;
      return { start: Math.max(0, candles.length - span), end: candles.length };
    });
  }, [candles]);

  return (
    <View {...panResponder.panHandlers}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={mergedTheme.background} />

        {visible.map((c, i) => {
          const x = i * cw + cw * 0.5;
          const openY = toY(c.open);
          const closeY = toY(c.close);
          const highY = toY(c.high);
          const lowY = toY(c.low);
          const color = c.close >= c.open ? mergedTheme.upCandle : mergedTheme.downCandle;
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(1, Math.abs(closeY - openY));
          const volH = (c.volume / volumeMax) * (height - priceHeight - 8);

          return (
            <React.Fragment key={`${c.time}-${i}`}>
              <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={mergedTheme.wick} strokeWidth={1} />
              <Rect x={x - Math.max(1, cw * 0.3)} y={bodyY} width={Math.max(1, cw * 0.6)} height={bodyH} fill={color} />
            </React.Fragment>
          );
        })}

        {riskLines.map((line) => {
          const y = toY(line.price);
          const color = line.type === "limit" ? mergedTheme.limit : mergedTheme.stopLoss;
          return (
            <React.Fragment key={line.id}>
              <Line x1={0} y1={y} x2={width} y2={y} stroke={color} strokeWidth={1.3} strokeDasharray={[6, 3]} />
              <Text x={8} y={y - 4} fill={mergedTheme.text} fontSize="11">
                {(line.label ?? line.type) + " " + line.price.toFixed(2)}
              </Text>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
