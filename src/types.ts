export type Timeframe = "1m" | "1h" | "1d";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Tick = {
  timestamp: number;
  price: number;
  volume: number;
};

export type ExchangeQuoteTick = {
  symbol_id: number;
  Timestamp: string;
  Open: number;
  High: number;
  Low: number;
  LTP: number;
  TickVolume: number;
  TotalVolume?: number;
};

export type TradeSide = "buy" | "sell";

export type TradeMarker = {
  id: string;
  time: number;
  price: number;
  side: TradeSide;
  quantity?: number;
  label?: string;
};

export type RiskLineType = "limit" | "stopLoss";

export type RiskLine = {
  id: string;
  type: RiskLineType;
  price: number;
  color?: string;
  editable?: boolean;
  label?: string;
};

export type Viewport = {
  start: number;
  end: number;
};

export type ChartTheme = {
  background: string;
  grid: string;
  text: string;
  upCandle: string;
  downCandle: string;
  wick: string;
  limit: string;
  stopLoss: string;
};

export type CandlestickChartProps = {
  width?: number;
  height?: number;
  candles: Candle[];
  symbol: string;
  interval: string;
  riskLines?: RiskLine[];
  onCandlePress?: (candle: Candle, index: number) => void;
  onMarkerPress?: (marker: TradeMarker) => void;
  onRiskLineChange?: (lineId: string, price: number) => void;
  onViewportChange?: (viewport: Viewport) => void;
  onTooltipChange?: (payload: {
    candle: Candle;
    index: number;
    x: number;
    y: number;
  } | null) => void;
  onOrderAction?: (payload: {
    kind: "candle" | "marker" | "riskLine";
    action: "select" | "edit";
    price: number;
    time?: number;
    markerId?: string;
    riskLineId?: string;
  }) => void;
  theme?: Partial<ChartTheme>;
};

export type TradingChartOrderCallbacks = {
  onPlaceOrder?: (payload: {
    side: TradeSide;
    price: number;
    time: number;
    markerId?: string;
  }) => void;
  onEditLimit?: (payload: { lineId: string; price: number }) => void;
  onEditStopLoss?: (payload: { lineId: string; price: number }) => void;
};

export type TradingChartProps = CandlestickChartProps &
  TradingChartOrderCallbacks & {
    defaultOrderSide?: TradeSide;
  };
