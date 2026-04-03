import React from "react";
import { CandlestickChartWeb } from "../web/CandlestickChartWeb";
import { RiskLine, TradingChartProps } from "../types";

function findRiskLine(riskLines: RiskLine[] | undefined, lineId: string): RiskLine | undefined {
  return riskLines?.find((line) => line.id === lineId);
}

export function TradingChartWeb(props: TradingChartProps): JSX.Element {
  const {
    onEditLimit,
    onEditStopLoss,
    onRiskLineChange,
    riskLines,
    ...rest
  } = props;

  return (
    <CandlestickChartWeb
      {...rest}
      riskLines={riskLines}
      onRiskLineChange={(lineId, price) => {
        onRiskLineChange?.(lineId, price);
        const line = findRiskLine(riskLines, lineId);
        if (!line) return;
        if (line.type === "limit") onEditLimit?.({ lineId, price });
        if (line.type === "stopLoss") onEditStopLoss?.({ lineId, price });
      }}
    />
  );
}
