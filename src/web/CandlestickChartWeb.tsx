import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { initialViewport, yDomain } from "../core/viewport";
import { Candle, CandlestickChartProps, RiskLine, Viewport } from "../types";

// ─── Layout ────────────────────────────────────────────────────────────────────
const AXIS_W      = 98;
const TOP_BAR_H   = 30;
const TIME_ROW_H  = 22;
const TF_ROW_H    = 26;
const MIN_SPAN    = 8;
const TOOLTIP_W   = 190;
const TOOLTIP_H   = 126;

// ─── Timeframe resolution ──────────────────────────────────────────────────────
type TFResolution = "minute" | "hour" | "day";
function resolutionOf(interval: string): TFResolution {
  const n = parseInt(interval, 10);
  if (interval.endsWith("d") || interval.endsWith("D") || n >= 1440) return "day";
  if (interval.endsWith("h") || interval.endsWith("H") || n >= 60)   return "hour";
  return "minute";
}

// ─── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:          "#131722",
  axisPanel:   "#131722",
  border:      "#2a2e39",
  grid:        "rgba(42,46,57,0.6)",
  textPrimary: "#d1d4dc",
  textMuted:   "#787b86",
  up:          "#26a69a",
  down:        "#ef5350",
  crosshair:   "#758696",
  priceTagUp:  "#26a69a",
  priceTagDn:  "#ef5350",
  crossTag:    "#363a45",
  timeTag:     "#363a45",
  // maLine:      "#2962ff",
  tooltipBg:   "#1e222d",
  tooltipBdr:  "#2a2e39",
  font10:      "10px 'Helvetica Neue',Arial,sans-serif",
  font11:      "11px 'Helvetica Neue',Arial,sans-serif",
  font12:      "12px 'Helvetica Neue',Arial,sans-serif",
  font12b:     "bold 12px 'Helvetica Neue',Arial,sans-serif",
};

// ─── Utilities ─────────────────────────────────────────────────────────────────
function fmtPrice(p: number): string {
  return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVolume(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000)     return (v / 1_000).toFixed(2) + "K";
  return v.toLocaleString();
}
function fmtHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function fmtHHMMSS(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}
function fmtDateLabel(ts: number): string {
  const d   = new Date(ts);
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const dd  = String(d.getDate()).padStart(2,"0");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const yy  = String(d.getFullYear()).slice(2);
  return `${day} ${dd} ${mon} '${yy}`;
}
function fmtFull(ts: number, res: TFResolution): string {
  const d   = new Date(ts);
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
  const dd  = String(d.getDate()).padStart(2,"0");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const yyyy = d.getFullYear();
  if (res === "day") return `${day}, ${dd} ${mon} ${yyyy}`;
  return `${dd} ${mon} ${yyyy}  ${fmtHHMM(ts)}`;
}
function fmtAxisTime(ts: number, res: TFResolution): string {
  if (res === "day") {
    const d   = new Date(ts);
    const dd  = String(d.getDate()).padStart(2,"0");
    const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
    return `${dd} ${mon}`;
  }
  return fmtHHMM(ts);
}
function niceStep(range: number, target: number): number {
  const raw  = range / target;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}
function movingAverage(vals: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(vals.length).fill(null);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// ─── Viewport clamp — allows scrolling to full history and half-span future ──
function clampViewportFull(vp: { start: number; end: number }, total: number): Viewport {
  const span       = vp.end - vp.start;
  const minStart   = 0;
  const maxEnd     = total + Math.floor(span / 2);
  let end          = Math.min(maxEnd, vp.end);
  let start        = end - span;
  if (start < minStart) {
    start = minStart;
    end   = start + span;
  }
  return { start: Math.round(start), end: Math.round(end) };
}

// ─── Canvas primitives ─────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function pillRight(
  ctx: CanvasRenderingContext2D, plotW: number, cy: number,
  bg: string, fg: string, text: string, font: string, icon?: string,
) {
  const h = 20; const pad = 6;
  ctx.font = font;
  const tw    = ctx.measureText(text).width;
  const iconW = icon ? ctx.measureText(icon).width + 4 : 0;
  const w     = Math.max(AXIS_W - 2, tw + iconW + pad * 2);
  const x     = plotW + 1; const y = cy - h / 2;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  if (icon) { ctx.fillText(icon, x + pad, cy); ctx.fillText(text, x + pad + iconW, cy); }
  else       { ctx.fillText(text, x + pad, cy); }
  ctx.textBaseline = "alphabetic";
}

function pillTime(ctx: CanvasRenderingContext2D, cx: number, plotH: number, plotY0: number, text: string) {
  ctx.font = C.font11;
  const tw  = ctx.measureText(text).width;
  const h   = 18; const pad = 6;
  const w   = tw + pad * 2; const x = cx - w / 2;
  const y   = plotY0 + plotH + 1;
  ctx.fillStyle = C.timeTag;
  roundRect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = C.textPrimary; ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text, cx, y + h / 2);
  ctx.textBaseline = "alphabetic";
}

function drawTooltipCard(
  ctx: CanvasRenderingContext2D, canvasX: number, canvasY: number,
  plotW: number, plotH: number, plotY0: number, c: Candle, res: TFResolution,
) {
  const w = TOOLTIP_W; const h = TOOLTIP_H; const pad = 10; const lineH = 17;
  let tx = canvasX + 16;
  if (tx + w > plotW - 4) tx = canvasX - w - 16;
  let ty = canvasY - h / 2;
  if (ty < plotY0 + 4)            ty = plotY0 + 4;
  if (ty + h > plotY0 + plotH - 4) ty = plotY0 + plotH - h - 4;

  ctx.fillStyle = C.tooltipBg; roundRect(ctx, tx, ty, w, h, 5); ctx.fill();
  ctx.strokeStyle = C.tooltipBdr; ctx.lineWidth = 1; ctx.setLineDash([]);
  roundRect(ctx, tx, ty, w, h, 5); ctx.stroke();

  const isUp   = c.close >= c.open; const valCol = isUp ? C.up : C.down;
  const change = c.close - c.open;  const pct    = ((change / c.open) * 100).toFixed(2);

  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillStyle = C.textMuted; ctx.font = C.font10;
  ctx.fillText(fmtFull(c.time, res), tx + pad, ty + pad + 6);
  ctx.strokeStyle = C.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx + pad, ty + pad + 14); ctx.lineTo(tx + w - pad, ty + pad + 14); ctx.stroke();

  const rows: [string, string, string][] = [
    ["Open",   fmtPrice(c.open),   C.textPrimary],
    ["High",   fmtPrice(c.high),   C.up],
    ["Low",    fmtPrice(c.low),    C.down],
    ["Close",  fmtPrice(c.close),  valCol],
    ["Volume", fmtVolume(c.volume),C.textMuted],
  ];
  rows.forEach(([label, value, col], i) => {
    const rowY = ty + pad + 22 + i * lineH;
    ctx.fillStyle = C.textMuted; ctx.font = C.font11; ctx.textAlign = "left";
    ctx.fillText(label, tx + pad, rowY);
    ctx.fillStyle = col; ctx.textAlign = "right";
    ctx.fillText(value, tx + w - pad, rowY);
  });
  const changeStr = `${change >= 0 ? "+" : ""}${change.toFixed(2)}  (${change >= 0 ? "+" : ""}${pct}%)`;
  ctx.fillStyle = valCol; ctx.font = C.font10; ctx.textAlign = "center";
  ctx.fillText(changeStr, tx + w / 2, ty + h - 8);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
}

// ─── Overlay click region ──────────────────────────────────────────────────────
export interface CandleClickEvent {
  candle:   Candle;
  absIndex: number;
  screenX:  number;
  screenY:  number;
  price:    number;
}

// ─── Extended props ────────────────────────────────────────────────────────────
interface ExtendedChartProps extends CandlestickChartProps {
  onIntervalChange?: (interval: string) => void;
  onCandleClick?:   (e: CandleClickEvent) => void;
}

// ─── Adaptive FPS tracker ──────────────────────────────────────────────────────
class AdaptiveFPS {
  private frameTimes: number[] = [];
  private maxSamples = 30;
  targetInterval = 16.67; // ~60fps baseline

  recordFrame(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > this.maxSamples) this.frameTimes.shift();
  }

  get avgFrameTime(): number {
    if (this.frameTimes.length === 0) return 16.67;
    let sum = 0;
    for (let i = 0; i < this.frameTimes.length; i++) sum += this.frameTimes[i];
    return sum / this.frameTimes.length;
  }

  get currentFPS(): number {
    return 1000 / this.avgFrameTime;
  }

  shouldSkipFrame(): boolean {
    return this.avgFrameTime > 20 && this.frameTimes.length > 5;
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function CandlestickChartWeb(props: ExtendedChartProps): JSX.Element {
  const {
    candles,
    symbol        = "BTC/USD",
    interval      = "1",
    riskLines     = [],
    onRiskLineChange,
    onCandlePress,
    onTooltipChange,
    onOrderAction,
    onViewportChange,
    onIntervalChange,
    onCandleClick,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 400 });
  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width: Math.max(100, width), height: Math.max(100, height) });
      dirtyRef.current = true;
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ width: Math.max(100, r.width), height: Math.max(100, r.height) });
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;
  const res = useMemo(() => resolutionOf(interval), [interval]);

  // Canvas area = total height minus TF_ROW_H (the HTML bar at the bottom)
  const canvasH = Math.max(60, height - TF_ROW_H);
  const plotY0  = TOP_BAR_H;
  const plotH   = Math.max(20, canvasH - TOP_BAR_H - TIME_ROW_H);
  const plotW   = Math.max(20, width - AXIS_W);

  const [viewport,   setViewport]   = useState<Viewport>(() => initialViewport(candles.length));
  const [clickedCandle, setClickedCandle] = useState<{ candle: Candle; x: number; y: number; idx: number } | null>(null);
  const [crosshair,  setCrosshair]  = useState<{ x: number; y: number; idx: number } | null>(null);
  const [dragRisk,   setDragRisk]   = useState<RiskLine | null>(null);
  const [nowStr,     setNowStr]     = useState(() => fmtHHMMSS(Date.now()));

  const userScrolledRef    = useRef(false);
  const prevCandleLenRef   = useRef(candles.length);

  const live = useRef({
    viewport,
    crosshair,
    dragRisk,
    clickedCandle,
    dragStartX: null as number | null,
    dragStartVp: null as Viewport | null,
  });
  live.current.viewport      = viewport;
  live.current.crosshair     = crosshair;
  live.current.dragRisk      = dragRisk;
  live.current.clickedCandle = clickedCandle;

  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const rafRef     = useRef<number>(0);
  const dirtyRef   = useRef(true);
  const fpsTracker = useRef(new AdaptiveFPS());

  // ── Live clock (1 s) ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setNowStr(fmtHHMMSS(Date.now()));
      dirtyRef.current = true;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Pin viewport on new candle (respect user scroll) ─────────────────────
  useEffect(() => {
    const newLen = candles.length;
    const oldLen = prevCandleLenRef.current;
    prevCandleLenRef.current = newLen;
    if (newLen === oldLen) { dirtyRef.current = true; return; }
    if (!userScrolledRef.current) {
      setViewport((prev) => {
        const span = prev.end - prev.start;
        return clampViewportFull({ start: newLen - span, end: newLen }, newLen);
      });
    }
    dirtyRef.current = true;
  }, [candles.length]);

  useEffect(() => { dirtyRef.current = true; },
    [width, height, candles, riskLines, crosshair, viewport, clickedCandle]);

  const visible = useMemo(() => {
    const start = Math.max(0, Math.floor(viewport.start));
    const end   = Math.min(candles.length, Math.ceil(viewport.end));
    return candles.slice(start, end);
  }, [candles, viewport]);

  const { min: rawMin, max: rawMax } = useMemo(
    () => yDomain(visible.length ? visible : candles.slice(-20)),
    [visible, candles],
  );
  const priceRange = rawMax - rawMin || 1;
  const padV  = priceRange * 0.07;
  const pMin  = rawMin - padV;
  const pMax  = rawMax + padV;

  const coords = useMemo(() => {
    const span      = viewport.end - viewport.start;
    const cw        = span > 0 ? plotW / span : plotW;
    const toCanvasY = (p: number) => plotY0 + plotH - ((p - pMin) / (pMax - pMin)) * plotH;
    const toPrice   = (cy: number) => pMax - ((cy - plotY0) / plotH) * (pMax - pMin);
    const toCanvasX = (i: number) => i * cw + cw / 2;
    return { cw, toCanvasY, toPrice, toCanvasX, span };
  }, [viewport, plotW, plotH, plotY0, pMin, pMax]);

  const { cw, toCanvasY, toPrice, toCanvasX, span } = coords;

  // ── drawAxes ──────────────────────────────────────────────────────────────
  const drawAxes = useCallback((ctx: CanvasRenderingContext2D, vis: Candle[]) => {
    const toY = (p: number) => plotY0 + plotH - ((p - pMin) / (pMax - pMin)) * plotH;

    ctx.fillStyle = C.axisPanel;
    ctx.fillRect(plotW, 0, width - plotW, canvasH);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(plotW, 0); ctx.lineTo(plotW, canvasH); ctx.stroke();

    const step      = niceStep(pMax - pMin, 7);
    const firstTick = Math.ceil(pMin / step) * step;
    ctx.font = C.font11; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (let p = firstTick; p <= pMax; p += step) {
      const y = toY(p);
      if (y < plotY0 + 6 || y > plotY0 + plotH - 6) continue;
      ctx.strokeStyle = C.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(plotW, y); ctx.lineTo(plotW + 4, y); ctx.stroke();
      ctx.fillStyle = C.textMuted;
      ctx.fillText(fmtPrice(p), plotW + 8, y);
    }
    ctx.textBaseline = "alphabetic";

    const timeRowY = plotY0 + plotH;
    ctx.fillStyle = C.axisPanel;
    ctx.fillRect(0, timeRowY, plotW, TIME_ROW_H);
    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(0, timeRowY); ctx.lineTo(plotW, timeRowY); ctx.stroke();

    if (!vis.length) return;
    const every  = Math.max(1, Math.floor(span / 6));
    const startI = Math.max(0, Math.floor(viewport.start));
    ctx.font = C.font11; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let absI = startI; absI < Math.min(candles.length, Math.ceil(viewport.end)); absI++) {
      const slotI = absI - viewport.start;
      if (Math.round(absI - startI) % every !== 0) continue;
      const cx = toCanvasX(slotI);
      if (cx < 30 || cx > plotW - 30) continue;
      ctx.strokeStyle = C.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, timeRowY); ctx.lineTo(cx, timeRowY + 4); ctx.stroke();
      ctx.fillStyle = C.textMuted;
      ctx.fillText(fmtAxisTime(candles[absI].time, res), cx, timeRowY + TIME_ROW_H / 2);
    }
    ctx.textBaseline = "alphabetic";
  }, [plotW, plotH, plotY0, pMin, pMax, width, canvasH, cw, res, viewport, span, toCanvasX, candles]);

  // ── drawTopBar ────────────────────────────────────────────────────────────
  const drawTopBar = useCallback((ctx: CanvasRenderingContext2D, c: Candle, isUp: boolean) => {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, plotW, TOP_BAR_H);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, TOP_BAR_H); ctx.lineTo(plotW, TOP_BAR_H); ctx.stroke();

    const valCol = isUp ? C.up : C.down;
    let cursor   = 10;
    const midY   = TOP_BAR_H / 2;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";

    ctx.fillStyle = valCol;
    ctx.beginPath(); ctx.arc(cursor + 4, midY, 4, 0, Math.PI * 2); ctx.fill();
    cursor += 14;

    const symLabel = `${symbol} · ${interval} · CRYPTO  `;
    ctx.fillStyle = C.textPrimary; ctx.font = C.font12b;
    ctx.fillText(symLabel, cursor, midY);
    cursor += ctx.measureText(symLabel).width + 6;

    const parts: [string, string][] = [
      ["O", fmtPrice(c.open)], ["H", fmtPrice(c.high)],
      ["L", fmtPrice(c.low)],  ["C", fmtPrice(c.close)],
    ];
    for (const [lbl, val] of parts) {
      ctx.fillStyle = C.textMuted; ctx.font = C.font11;
      ctx.fillText(lbl, cursor, midY); cursor += ctx.measureText(lbl).width + 3;
      ctx.fillStyle = valCol; ctx.font = C.font11;
      ctx.fillText(val + "  ", cursor, midY); cursor += ctx.measureText(val + "  ").width;
    }
    const change    = c.close - c.open;
    const changePct = ((change / c.open) * 100).toFixed(2);
    ctx.fillStyle = valCol; ctx.font = C.font11;
    ctx.fillText(
      `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${change >= 0 ? "+" : ""}${changePct}%)`,
      cursor, midY,
    );
    ctx.textBaseline = "alphabetic";
  }, [plotW, symbol, interval]);

  // ── Main draw (adaptive rAF) ─────────────────────────────────────────────
  const draw = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx    = canvas.getContext("2d"); if (!ctx) return;

    ctx.clearRect(0, 0, width, canvasH);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, width, canvasH);

    if (candles.length > 0) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.setLineDash([]);
      const step      = niceStep(pMax - pMin, 7);
      const firstTick = Math.ceil(pMin / step) * step;
      for (let p = firstTick; p <= pMax; p += step) {
        const y = toCanvasY(p);
        if (y < plotY0 || y > plotY0 + plotH) continue;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
      }
      for (let i = 1; i < 6; i++) {
        const x = (plotW / 6) * i;
        ctx.beginPath(); ctx.moveTo(x, plotY0); ctx.lineTo(x, plotY0 + plotH); ctx.stroke();
      }
    }

    if (candles.length === 0) { drawAxes(ctx, []); return; }

    const viStart = Math.max(0, Math.floor(viewport.start));
    const viEnd   = Math.min(candles.length, Math.ceil(viewport.end));

    ctx.setLineDash([]);
    for (let absI = viStart; absI < viEnd; absI++) {
      const c      = candles[absI];
      const slotI  = absI - viewport.start;
      const cx     = toCanvasX(slotI);
      if (cx < -cw || cx > plotW + cw) continue;
      const isUp   = c.close >= c.open;
      const col    = isUp ? C.up : C.down;
      const bodyW  = Math.max(1, cw * 0.65);
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, toCanvasY(c.high)); ctx.lineTo(cx, toCanvasY(c.low)); ctx.stroke();
      const y1 = toCanvasY(Math.max(c.open, c.close));
      const y2 = toCanvasY(Math.min(c.open, c.close));
      ctx.fillStyle = col;
      ctx.fillRect(cx - bodyW / 2, y1, bodyW, Math.max(1, y2 - y1));
    }

    // MA20
    // if (visible.length > 20) {
    //   const maPts = movingAverage(visible.map((c) => c.close), 20);
    //   ctx.strokeStyle = C.maLine; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.beginPath();
    //   let maStarted = false;
    //   for (let i = 0; i < maPts.length; i++) {
    //     const v    = maPts[i]; if (v === null) continue;
    //     const absI = viStart + i;
    //     const x    = toCanvasX(absI - viewport.start);
    //     const y    = toCanvasY(v);
    //     if (!maStarted) { ctx.moveTo(x, y); maStarted = true; } else ctx.lineTo(x, y);
    //   }
    //   ctx.stroke();
    // }

    for (const line of riskLines) {
      const ly   = toCanvasY(line.price);
      const lCol = line.type === "limit" ? "#2962ff" : "#f23645";
      ctx.strokeStyle = lCol; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(plotW, ly); ctx.stroke();
      ctx.setLineDash([]);
      pillRight(ctx, plotW, ly, lCol, "#fff", `${line.label ?? line.type}  ${fmtPrice(line.price)}`, C.font11);
    }

    const last      = candles[candles.length - 1];
    const curPx     = last.close;
    const curIsUp   = last.close >= last.open;
    const curCol    = curIsUp ? C.priceTagUp : C.priceTagDn;
    const curY      = toCanvasY(curPx);
    ctx.strokeStyle = curCol; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(0, curY); ctx.lineTo(plotW, curY); ctx.stroke();
    ctx.setLineDash([]);

    drawAxes(ctx, visible);
    pillRight(ctx, plotW, curY, curCol, "#fff", fmtPrice(curPx), C.font12b);

    const ch = live.current.crosshair;
    if (ch !== null) {
      const cx = toCanvasX(ch.idx);
      const cy = ch.y;
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(cx - cw / 2, plotY0, cw, plotH);
      ctx.strokeStyle = C.crosshair; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(cx, plotY0); ctx.lineTo(cx, plotY0 + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(plotW, cy); ctx.stroke();
      ctx.setLineDash([]);
      pillRight(ctx, plotW, cy, C.crossTag, C.textPrimary, fmtPrice(toPrice(cy)), C.font11, "⊕ ");
    }

    const clicked = live.current.clickedCandle;
    if (clicked !== null) {
      const c  = clicked.candle;
      const cx = toCanvasX(clicked.idx);
      const cy = clicked.y;
      pillTime(ctx, cx, plotH, plotY0, `${fmtDateLabel(c.time)}  ${fmtHHMM(c.time)}`);
      drawTooltipCard(ctx, cx, cy, plotW, plotH, plotY0, c, res);
      drawTopBar(ctx, c, c.close >= c.open);
    } else {
      drawTopBar(ctx, last, curIsUp);
    }
  }, [
    visible, candles, pMin, pMax, cw, span,
    plotW, plotH, plotY0, width, canvasH,
    riskLines, toCanvasX, toCanvasY, toPrice,
    drawAxes, drawTopBar, res, viewport,
  ]);

  // ── Adaptive rAF loop ─────────────────────────────────────────────────────
  useLayoutEffect(() => {
    let alive = true;
    let lastTs = 0;
    const tracker = fpsTracker.current;

    const loop = (ts: number) => {
      if (!alive) return;
      if (lastTs > 0) {
        const dt = ts - lastTs;
        tracker.recordFrame(dt);
        if (tracker.shouldSkipFrame() && !dirtyRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          lastTs = ts;
          return;
        }
      }
      lastTs = ts;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ── Canvas resize (HiDPI) ─────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr    = window.devicePixelRatio || 1;
    const newW   = Math.round(width  * dpr);
    const newH   = Math.round(canvasH * dpr);
    if (canvas.width === newW && canvas.height === newH) return;
    canvas.width  = newW; canvas.height = newH;
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${canvasH}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
    dirtyRef.current = true;
  }, [width, canvasH]);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const ratio  = Math.max(0, Math.min(1, (e.clientX - rect.left) / plotW));
      const vp     = live.current.viewport;
      const s      = vp.end - vp.start;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const nSpan  = Math.round(Math.max(MIN_SPAN, Math.min(candles.length, s * factor)));
      const center = vp.start + s * ratio;
      const next   = clampViewportFull({ start: center - nSpan * ratio, end: center + nSpan * (1 - ratio) }, candles.length);
      userScrolledRef.current = next.end < candles.length - 1;
      setViewport(next); onViewportChange?.(next); dirtyRef.current = true;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [candles.length, plotW, onViewportChange]);

  // ── Touch pinch ───────────────────────────────────────────────────────────
  const lastPinchDist = useRef<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2)
        lastPinchDist.current = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || lastPinchDist.current === null) return;
      e.preventDefault();
      const dist   = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const factor = lastPinchDist.current / dist; lastPinchDist.current = dist;
      const vp     = live.current.viewport; const s = vp.end - vp.start;
      const nSpan  = Math.round(Math.max(MIN_SPAN, Math.min(candles.length, s * factor)));
      const center = (vp.start + vp.end) / 2;
      const next   = clampViewportFull({ start: center - nSpan / 2, end: center + nSpan / 2 }, candles.length);
      userScrolledRef.current = next.end < candles.length - 1;
      setViewport(next); onViewportChange?.(next); dirtyRef.current = true;
    };
    const onTouchEnd = () => { lastPinchDist.current = null; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  }, [candles.length, onViewportChange]);

  // ── Pointer helpers ───────────────────────────────────────────────────────
  const local = useCallback((e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const hitSlot = useCallback((x: number): number | null => {
    if (x < 0 || x > plotW) return null;
    return Math.min(Math.floor(span) - 1, Math.max(0, Math.floor(x / cw)));
  }, [plotW, cw, span]);

  const slotToCandle = useCallback((slotI: number): Candle | null => {
    const absI = Math.floor(viewport.start) + slotI;
    if (absI < 0 || absI >= candles.length) return null;
    return candles[absI];
  }, [viewport.start, candles]);

  // ── Pointer down ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e); if (x > plotW) return;
    const rl = riskLines.find((l) => Math.abs(toCanvasY(l.price) - y) < 8);
    if (rl?.editable) {
      setDragRisk(rl); live.current.dragRisk = rl;
      onOrderAction?.({ kind: "riskLine", action: "select", price: rl.price, riskLineId: rl.id });
      return;
    }
    live.current.dragStartX = x;
    live.current.dragStartVp = { ...live.current.viewport };
  }, [local, plotW, riskLines, toCanvasY, onOrderAction]);

  const onPointerUp = useCallback(() => {
    live.current.dragStartX = null;
    live.current.dragStartVp = null;
    setDragRisk(null); live.current.dragRisk = null;
  }, []);

  // ── Pointer move — crosshair + panning ─────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e);
    const { dragRisk: dr, dragStartX: dsx, dragStartVp: dsVp, viewport: vp } = live.current;

    if (dr) {
      const price = toPrice(y);
      onRiskLineChange?.(dr.id, price);
      onOrderAction?.({ kind: "riskLine", action: "edit", price, riskLineId: dr.id });
      dirtyRef.current = true; return;
    }
    if (dsx !== null && dsVp !== null) {
      const pixelDelta = x - dsx;
      const candleDelta = (pixelDelta / plotW) * span;
      const next = clampViewportFull(
        { start: dsVp.start - candleDelta, end: dsVp.end - candleDelta },
        candles.length,
      );
      userScrolledRef.current = next.end < candles.length;
      if (next.end >= candles.length) userScrolledRef.current = false;
      setViewport(next); onViewportChange?.(next);
      dirtyRef.current = true;
      return;
    }

    const inPlot = x >= 0 && x <= plotW && y >= plotY0 && y <= plotY0 + plotH;
    if (inPlot) {
      const slotI = hitSlot(x);
      if (slotI !== null) {
        const next = { x, y, idx: slotI };
        setCrosshair(next); live.current.crosshair = next;
        dirtyRef.current = true; return;
      }
    }
    if (live.current.crosshair !== null) {
      setCrosshair(null); live.current.crosshair = null;
      dirtyRef.current = true;
    }
  }, [local, plotW, plotH, plotY0, span, candles.length, toPrice, hitSlot,
      onRiskLineChange, onOrderAction, onViewportChange]);

  // ── Click — show tooltip for clicked candle ───────────────────────────────
  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e);
    const slotI = hitSlot(x); if (slotI === null) return;
    const c = slotToCandle(slotI); if (!c) return;
    const absI = Math.floor(viewport.start) + slotI;

    const prev = live.current.clickedCandle;
    if (prev !== null && prev.candle.time === c.time) {
      setClickedCandle(null); live.current.clickedCandle = null;
    } else {
      const next = { candle: c, x, y, idx: slotI };
      setClickedCandle(next); live.current.clickedCandle = next;
    }

    const clickEvt: CandleClickEvent = { candle: c, absIndex: absI, screenX: x, screenY: y, price: toPrice(y) };
    onCandleClick?.(clickEvt);
    onCandlePress?.(c, absI);
    onOrderAction?.({ kind: "candle", action: "select", price: toPrice(y), time: c.time });
    dirtyRef.current = true;
  }, [local, hitSlot, slotToCandle, viewport.start, toPrice, onOrderAction, onCandleClick, onCandlePress]);

  // ── Clear clicked tooltip when dragging ───────────────────────────────────
  useEffect(() => {
    if (clickedCandle !== null) {
      setClickedCandle(null);
      live.current.clickedCandle = null;
      dirtyRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  const TF_OPTIONS = [
    { label: "1m",  value: "1"    },
    { label: "1h",  value: "60"   },
    { label: "1d",  value: "1440" },
  ];

  // const last    = candles.length ? candles[candles.length - 1] : null;
  // const curIsUp = last ? last.close >= last.open : true;
  // const curCol  = curIsUp ? C.up : C.down;

  return (
    <div
      ref={wrapRef}
      style={{
        position:        "relative",
        width:           "100%",
        height:          "100%",
        display:         "flex",
        flexDirection:   "column",
        background:      C.bg,
        borderRadius:    4,
        overflow:        "hidden",
        border:          `1px solid ${C.border}`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display:    "block",
          cursor:     "crosshair",
          touchAction:"none",
          flex:       "1 1 auto",
          minHeight:  0,
          width:      "100%",
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCrosshair(null); live.current.crosshair = null; dirtyRef.current = true;
          onPointerUp();
        }}
        onPointerMove={onPointerMove}
        onClick={onClick}
      />

      <div
        style={{
          height:          TF_ROW_H,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
          padding:         "0 12px",
          background:      "#0e1117",
          borderTop:       `1px solid ${C.border}`,
          flexShrink:      0,
        }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {TF_OPTIONS.map((tf) => {
            const isActive = tf.value === interval;
            return (
              <button
                key={tf.value}
                onClick={() => onIntervalChange?.(tf.value)}
                style={{
                  background:    isActive ? "rgba(38,166,154,0.18)" : "transparent",
                  color:         isActive ? C.up : C.textMuted,
                  border:        isActive ? `1px solid rgba(38,166,154,0.45)` : "1px solid transparent",
                  borderRadius:  4,
                  padding:       "2px 9px",
                  fontSize:      11,
                  cursor:        "pointer",
                  fontFamily:    "'Helvetica Neue',Arial,sans-serif",
                  lineHeight:    "18px",
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            color:         C.priceTagUp,
            fontSize:      11,
            fontFamily:    "'Helvetica Neue',Arial,sans-serif",
            fontWeight:    600,
            letterSpacing: "0.05em",
          }}
        >
          {nowStr}
        </div>
      </div>
    </div>
  );
}
