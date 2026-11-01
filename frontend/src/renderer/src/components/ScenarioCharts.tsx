import type { EngineInterval } from "../../../shared/protocol";

interface ChartSeries {
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  title: string;
  description: string;
  unit: string;
  series: ChartSeries[];
  hours: string[];
}

function tickDecimals(maximum: number): number {
  if (maximum >= 100) return 0;
  if (maximum >= 10) return 1;
  return 2;
}

function LineChart({ title, description, unit, series, hours }: LineChartProps) {
  const width = 760;
  const height = 260;
  const left = 52;
  const right = 14;
  const top = 18;
  const bottom = 37;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...series.flatMap((item) => item.values));
  const decimals = tickDecimals(maximum);
  const x = (index: number) => left + (hours.length <= 1 ? 0 : index * plotWidth / (hours.length - 1));
  const y = (value: number) => top + plotHeight - value / maximum * plotHeight;
  const format = (value: number) => `${value.toFixed(2)} ${unit}`;
  const tickLabel = (value: number) => value.toFixed(decimals);

  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-heading"><div><span className="eyebrow">SCENARIO OUTPUT</span><h3>{title}</h3></div><span className="chart-unit">{unit}</span></div>
      <p className="chart-description">{description}</p>
      <div className="chart-legend" aria-label={`${title} legend`}>
        {series.map((item) => <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
      <div className="chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${description}`}>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = maximum * fraction;
            const lineY = y(value);
            return <g key={fraction}>
              <line x1={left} x2={width - right} y1={lineY} y2={lineY} className={fraction === 0 ? "chart-axisline" : "chart-gridline"} />
              <text x={left - 8} y={lineY + 4} className="chart-axis-label" textAnchor="end">{tickLabel(value)}</text>
            </g>;
          })}
          <text x={left - 46} y={top - 4} className="chart-axis-title">{unit}</text>
          {series.map((item) => {
            const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
            return <g key={item.label}>
              <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
              {item.values.map((value, index) => <circle key={`${item.label}-${index}`} cx={x(index)} cy={y(value)} r="2.7" fill={item.color}>
                <title>{`${hours[index]} · ${item.label}: ${format(value)}`}</title>
              </circle>)}
            </g>;
          })}
          {[0, 4, 8, 12, 16, 20, hours.length - 1].filter((value, index, all) => all.indexOf(value) === index && value < hours.length).map((index) => (
            <text key={index} x={x(index)} y={height - 10} className="chart-axis-label" textAnchor="middle">{hours[index]}</text>
          ))}
        </svg>
      </div>
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="table-scroll"><table><caption>{title}; values in {unit}</caption><thead><tr><th scope="col">Hour (MYT)</th>{series.map((item) => <th key={item.label} scope="col">{item.label}</th>)}</tr></thead>
          <tbody>{hours.map((hour, index) => <tr key={hour}><th scope="row">{hour}</th>{series.map((item) => <td key={item.label}>{item.values[index].toFixed(2)}</td>)}</tr>)}</tbody>
        </table></div>
      </details>
    </section>
  );
}

function ImportComparison({ baseline, optimized }: { baseline: EngineInterval[]; optimized: EngineInterval[] | null }) {
  const values = [
    { label: "Baseline", value: baseline.reduce((total, row) => total + row.grid_import_kwh, 0), color: "var(--chart-baseline)" },
    ...(optimized ? [{ label: "GridMind", value: optimized.reduce((total, row) => total + row.grid_import_kwh, 0), color: "var(--chart-optimized)" }] : []),
  ];
  const maximum = Math.max(0, ...values.map((item) => item.value));
  const width = 760;
  const left = 96;
  const right = 84;
  const plotWidth = width - left - right;

  return <section className="chart-card comparison-chart" aria-label="Grid import comparison">
    <div className="chart-heading"><div><span className="eyebrow">STRATEGY COMPARISON</span><h3>Grid imports by strategy</h3></div><span className="chart-unit">kWh</span></div>
    <p className="chart-description">Total grid energy imported across the modeled day, summed from engine interval outputs.</p>
    <div className="chart-legend">{values.map((item) => <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    <div className="chart-plot">
      <svg viewBox="0 0 760 128" role="img" aria-label={"Grid imports by strategy, in kilowatt-hours. " + values.map((item) => item.label + ": " + item.value.toFixed(2)).join("; ")}>
        {values.map((item, index) => {
          const barWidth = maximum > 0 ? Math.max(item.value > 0 ? 2 : 0, item.value / maximum * plotWidth) : 0;
          const y = 24 + index * 48;
          return <g key={item.label}><text x={left - 12} y={y + 15} className="chart-axis-label" textAnchor="end">{item.label}</text><rect x={left} y={y} width={barWidth} height="23" rx="4" fill={item.color} /><text x={left + barWidth + 9} y={y + 15} className="comparison-bar-value">{item.value.toFixed(2)}</text></g>;
        })}
        <line x1={left} x2={left} y1="17" y2="112" className="chart-gridline" />
      </svg>
    </div>
    <div className="table-scroll"><table><caption>Total grid imports for this scenario in kWh.</caption><thead><tr><th scope="col">Strategy</th><th scope="col">Grid imports (kWh)</th></tr></thead><tbody>{values.map((item) => <tr key={item.label}><th scope="row">{item.label}</th><td>{item.value.toFixed(2)}</td></tr>)}</tbody></table></div>
  </section>;
}

interface ScenarioChartsProps {
  baseline: EngineInterval[];
  optimized: EngineInterval[] | null;
  intervalMinutes: number;
}

function formatHour(row: EngineInterval, index: number, intervalMinutes: number): string {
  if (intervalMinutes !== 60) return `${index + 1}`;
  const match = row.timestamp.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : `${index.toString().padStart(2, "0")}:00`;
}

export function ScenarioCharts({ baseline, optimized, intervalMinutes }: ScenarioChartsProps) {
  const hours = baseline.map((row, index) => formatHour(row, index, intervalMinutes));
  const optimizedByTimestamp = new Map((optimized ?? []).map((row) => [row.timestamp, row]));
  const alignedOptimized = baseline.map((row) => optimizedByTimestamp.get(row.timestamp));
  const demandSolar = [
    { label: "Demand", color: "var(--chart-demand)", values: baseline.map((row) => row.demand_kwh) },
    { label: "Solar generation", color: "var(--chart-solar)", values: baseline.map((row) => row.solar_generation_kwh) },
  ];
  const batterySeries: ChartSeries[] = [
    { label: "Baseline", color: "var(--chart-baseline)", values: baseline.map((row) => row.state_of_charge_percent) },
  ];
  if (optimized && alignedOptimized.every((row) => row !== undefined)) {
    batterySeries.push({ label: "GridMind", color: "var(--chart-optimized)", values: alignedOptimized.map((row) => row!.state_of_charge_percent) });
  }

  return <div className="charts-grid">
    <LineChart title="Demand and solar generation" description="Engine results for each interval; energy per interval, not instantaneous power." unit="kWh / interval" series={demandSolar} hours={hours} />
    <LineChart title="Battery state of charge" description="End-of-interval charge as a percentage of nominal battery capacity." unit="%" series={batterySeries} hours={hours} />
    <ImportComparison baseline={baseline} optimized={optimized} />
  </div>;
}
