import type { EngineInterval } from "../../../shared/protocol";

/**
 * Power flow view derived ONLY from engine interval output. A null index means
 * "summary mode": period-average power plus the final battery state.
 */
export interface FlowView {
  solarKw: number;
  loadKw: number;
  /** Signed battery power; positive means charging. */
  batteryKw: number;
  /** Signed grid power; positive means importing. */
  gridKw: number;
  soc: number;
  modeLabel: string;
  clockLabel: string | null;
}

export function computeFlowView(
  intervals: EngineInterval[],
  intervalMinutes: number,
  index: number | null,
): FlowView | null {
  if (intervals.length === 0 || intervalMinutes <= 0) return null;
  const hoursPerInterval = intervalMinutes / 60;
  if (index !== null) {
    const clamped = Math.min(intervals.length - 1, Math.max(0, Math.round(index)));
    const interval = intervals[clamped];
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(interval.timestamp);
    return {
      solarKw: interval.solar_generation_kwh / hoursPerInterval,
      loadKw: interval.demand_kwh / hoursPerInterval,
      batteryKw: (interval.battery_charge_kwh - interval.battery_discharge_kwh) / hoursPerInterval,
      gridKw: (interval.grid_import_kwh - interval.grid_export_kwh) / hoursPerInterval,
      soc: interval.state_of_charge_percent,
      modeLabel: "INTERVAL",
      clockLabel: match ? `${match[2]}:${match[3]}` : null,
    };
  }
  const totalHours = hoursPerInterval * intervals.length;
  const sum = (pick: (interval: EngineInterval) => number) =>
    intervals.reduce((total, interval) => total + pick(interval), 0) / totalHours;
  return {
    solarKw: sum((interval) => interval.solar_generation_kwh),
    loadKw: sum((interval) => interval.demand_kwh),
    batteryKw: sum((interval) => interval.battery_charge_kwh - interval.battery_discharge_kwh),
    gridKw: sum((interval) => interval.grid_import_kwh - interval.grid_export_kwh),
    soc: intervals[intervals.length - 1].state_of_charge_percent,
    modeLabel: "PERIOD AVERAGE",
    clockLabel: null,
  };
}

const fmt = (value: number): string => value.toFixed(2);

function batteryState(value: number): string {
  if (Math.abs(value) < 0.001) return "IDLE";
  return value > 0 ? "CHARGING" : "DISCHARGING";
}

const colors = {
  solar: "var(--chart-solar)",
  load: "var(--chart-demand)",
  battery: "var(--chart-battery)",
  import: "var(--chart-import)",
  export: "var(--chart-export)",
} as const;

interface Point { x: number; y: number }

function linkEnd(from: Point, to: Point, backoff: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const t = (length - backoff) / length;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function degrees(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

interface FlowLinkProps {
  from: Point;
  to: Point;
  /** Positive value flows from → to; negative flows to → from. */
  value: number;
  positiveColor: string;
  negativeColor?: string;
  playing: boolean;
  labelOffsetY?: number;
}

function FlowLink({ from, to, value, positiveColor, negativeColor, playing, labelOffsetY = 0 }: FlowLinkProps) {
  if (Math.abs(value) < 0.001) {
    return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="flow-link flow-idle" />;
  }
  const forward = value > 0;
  const direction = forward ? { a: from, b: to } : { a: to, b: from };
  const tail = direction.a;
  const head = linkEnd(tail, direction.b, 14);
  const color = forward ? positiveColor : negativeColor ?? positiveColor;
  const angle = degrees(tail, head);
  const midX = (tail.x + head.x) / 2;
  const midY = (tail.y + head.y) / 2 + labelOffsetY;
  return (
    <g>
      <line
        x1={tail.x} y1={tail.y} x2={head.x} y2={head.y}
        className={`flow-link${playing ? " flow-anim" : ""}`}
        style={{ stroke: color }}
      />
      <polygon
        points="0,-3.5 7,0 0,3.5"
        transform={`translate(${head.x},${head.y}) rotate(${angle})`}
        style={{ fill: color }}
      />
      <text x={midX} y={midY} className="flow-link-value" textAnchor="middle">
        {fmt(Math.abs(value))} kW
      </text>
    </g>
  );
}

interface PowerFlowDiagramProps {
  intervals: EngineInterval[];
  intervalMinutes: number;
  playhead: number | null;
  playing: boolean;
}

export function PowerFlowDiagram({ intervals, intervalMinutes, playhead, playing }: PowerFlowDiagramProps) {
  const view = computeFlowView(intervals, intervalMinutes, playhead);
  if (!view) {
    return <p className="flow-missing">No engine intervals available for the flow diagram.</p>;
  }
  const surplusKw = view.solarKw - view.loadKw;
  const aria =
    `Power ${view.modeLabel === "INTERVAL" ? `at interval ${view.clockLabel ?? ""}` : "summary"}: ` +
    `solar ${fmt(view.solarKw)} kW, load ${fmt(view.loadKw)} kW, ` +
    `battery ${batteryState(view.batteryKw).toLowerCase()} ${fmt(Math.abs(view.batteryKw))} kW, ` +
    `battery state of charge ${view.soc.toFixed(1)} percent, ` +
    (view.gridKw >= 0 ? `grid importing ${fmt(view.gridKw)} kW` : `grid exporting ${fmt(-view.gridKw)} kW`);

  const nodes = {
    solar: { x: 20, y: 34, w: 152, h: 66 },
    bus: { x: 264, y: 130, w: 152, h: 70 },
    load: { x: 508, y: 34, w: 152, h: 66 },
    battery: { x: 20, y: 226, w: 152, h: 66 },
    grid: { x: 508, y: 226, w: 152, h: 66 },
  };

  return (
    <figure className="flow-figure">
      <svg viewBox="0 0 680 316" role="img" aria-label={aria}>
        {/* Links (drawn first so nodes overlay their ends) */}
        <FlowLink from={{ x: nodes.solar.x + nodes.solar.w, y: nodes.solar.y + 33 }} to={{ x: nodes.bus.x, y: nodes.bus.y + 22 }} value={view.solarKw} positiveColor={colors.solar} playing={playing} labelOffsetY={-9} />
        <FlowLink from={{ x: nodes.bus.x + nodes.bus.w, y: nodes.bus.y + 22 }} to={{ x: nodes.load.x, y: nodes.load.y + 33 }} value={view.loadKw} positiveColor={colors.load} playing={playing} labelOffsetY={-9} />
        <FlowLink
          from={{ x: nodes.bus.x, y: nodes.bus.y + nodes.bus.h - 20 }}
          to={{ x: nodes.battery.x + nodes.battery.w, y: nodes.battery.y + 33 }}
          value={view.batteryKw}
          positiveColor={colors.battery}
          playing={playing}
          labelOffsetY={11}
        />
        <FlowLink
          from={{ x: nodes.grid.x, y: nodes.grid.y + 33 }}
          to={{ x: nodes.bus.x + nodes.bus.w, y: nodes.bus.y + nodes.bus.h - 20 }}
          value={view.gridKw}
          positiveColor={colors.import}
          negativeColor={colors.export}
          playing={playing}
          labelOffsetY={11}
        />

        {/* Nodes */}
        <g className="flow-node" transform={`translate(${nodes.solar.x},${nodes.solar.y})`}>
          <rect width={nodes.solar.w} height={nodes.solar.h} rx="6" className="flow-node-box" />
          <text x="12" y="18" className="flow-node-title">SOLAR PV</text>
          <text x="12" y="40" className="flow-node-value">{fmt(view.solarKw)} kW</text>
          <text x="12" y="56" className="flow-node-sub">GENERATION</text>
        </g>
        <g className="flow-node" transform={`translate(${nodes.bus.x},${nodes.bus.y})`}>
          <rect width={nodes.bus.w} height={nodes.bus.h} rx="6" className="flow-node-box flow-node-bus" />
          <text x="13" y="18" className="flow-node-title">POWER BUS</text>
          <text x="13" y="40" className="flow-node-value">{fmt(view.solarKw)} kW</text>
          <text x="13" y="58" className="flow-node-sub">
            {surplusKw >= 0 ? "SURPLUS" : "DEFICIT"} {fmt(Math.abs(surplusKw))} kW
          </text>
        </g>
        <g className="flow-node" transform={`translate(${nodes.load.x},${nodes.load.y})`}>
          <rect width={nodes.load.w} height={nodes.load.h} rx="6" className="flow-node-box" />
          <text x="12" y="18" className="flow-node-title">HOUSEHOLD LOAD</text>
          <text x="12" y="40" className="flow-node-value">{fmt(view.loadKw)} kW</text>
          <text x="12" y="56" className="flow-node-sub">DEMAND</text>
        </g>
        <g className="flow-node" transform={`translate(${nodes.battery.x},${nodes.battery.y})`}>
          <rect width={nodes.battery.w} height={nodes.battery.h} rx="6" className="flow-node-box" />
          <text x="12" y="18" className="flow-node-title">BATTERY</text>
          <text x="12" y="40" className="flow-node-value">
            {(view.batteryKw >= 0 ? "+" : "−") + fmt(Math.abs(view.batteryKw))} kW
          </text>
          <text x="12" y="56" className="flow-node-sub">SOC {view.soc.toFixed(1)}% · {batteryState(view.batteryKw)}</text>
        </g>
        <g className="flow-node" transform={`translate(${nodes.grid.x},${nodes.grid.y})`}>
          <rect width={nodes.grid.w} height={nodes.grid.h} rx="6" className="flow-node-box" />
          <text x="12" y="18" className="flow-node-title">GRID</text>
          <text x="12" y="40" className="flow-node-value">
            {(view.gridKw >= 0 ? "+" : "−") + fmt(Math.abs(view.gridKw))} kW
          </text>
          <text x="12" y="56" className="flow-node-sub">
            {Math.abs(view.gridKw) < 0.001 ? "IDLE" : view.gridKw > 0 ? "IMPORTING" : "EXPORTING"}
          </text>
        </g>
      </svg>
      <figcaption className="flow-caption">
        <span className="flow-mode">{view.modeLabel}</span>
        {view.clockLabel && <span className="flow-clock">{view.clockLabel} MYT</span>}
        <span className="flow-note">
          {view.modeLabel === "INTERVAL"
            ? "Interval power from engine output (interval energy ÷ interval hours)."
            : "Average power across all engine intervals; battery shows the final state of charge."}
        </span>
      </figcaption>
    </figure>
  );
}
