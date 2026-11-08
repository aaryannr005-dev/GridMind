import { useState } from "react";
import type { EngineInterval } from "../../../shared/protocol";
import { LineChart, formatHourLabels, type ChartSeries } from "./ScenarioCharts";

type ChartTab = "power" | "tariffs" | "cumulative";

const tabs: { id: ChartTab; label: string }[] = [
  { id: "power", label: "Power flows" },
  { id: "tariffs", label: "Tariffs" },
  { id: "cumulative", label: "Cumulative energy" },
];

interface ChartWorkspaceProps {
  intervals: EngineInterval[];
  intervalMinutes: number;
  currency: string;
  /** Tariff inputs from the scenario form; engine reports do not carry rates. */
  importRates: number[] | null;
  exportRates: number[] | null;
}

function cumulative(values: number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

export function ChartWorkspace({ intervals, intervalMinutes, currency, importRates, exportRates }: ChartWorkspaceProps) {
  const [tab, setTab] = useState<ChartTab>("power");
  const hours = formatHourLabels(intervals, intervalMinutes);
  const ratesAvailable =
    importRates !== null && exportRates !== null
    && importRates.length === intervals.length && exportRates.length === intervals.length
    && importRates.every(Number.isFinite) && exportRates.every(Number.isFinite);

  let series: ChartSeries[] = [];
  let unit = "kWh / interval";
  let description = "";
  let title = "";
  let note: string | null = null;

  if (tab === "power") {
    title = "Battery and grid power";
    unit = "kWh / interval";
    description = "Signed flows from engine output: battery charge minus discharge (charging is positive) and grid import minus export (importing is positive). Interval energy, not instantaneous power.";
    series = [
      {
        label: "Battery power (charge +)",
        color: "var(--chart-battery)",
        values: intervals.map((row) => row.battery_charge_kwh - row.battery_discharge_kwh),
      },
      {
        label: "Grid power (import +)",
        color: "var(--chart-import)",
        values: intervals.map((row) => row.grid_import_kwh - row.grid_export_kwh),
      },
    ];
  } else if (tab === "tariffs") {
    title = "Import and export tariffs";
    unit = `${currency}/kWh`;
    description = "Tariff rates from the scenario configuration for this run; the engine charges each interval at these rates.";
    if (ratesAvailable) {
      series = [
        { label: "Import tariff", color: "var(--chart-import)", values: importRates! },
        { label: "Export tariff", color: "var(--chart-export)", values: exportRates! },
      ];
    } else {
      series = [];
      note = "Tariff rates are not recorded for this scenario. Re-run a scenario from the workspace to plot its configured rates.";
    }
  } else {
    title = "Cumulative generation and demand";
    unit = "kWh (cumulative)";
    description = "Running totals of solar generation and household demand across the modeled period, summed from engine interval output.";
    series = [
      {
        label: "Cumulative solar generation",
        color: "var(--chart-solar)",
        values: cumulative(intervals.map((row) => row.solar_generation_kwh)),
      },
      {
        label: "Cumulative demand",
        color: "var(--chart-demand)",
        values: cumulative(intervals.map((row) => row.demand_kwh)),
      },
    ];
  }

  return (
    <section className="chart-workspace" aria-label="Detailed interval charts">
      <div className="chart-tabs" role="tablist" aria-label="Chart categories">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`chart-tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="chart-tabpanel" role="tabpanel" aria-label={tabs.find((item) => item.id === tab)!.label}>
        {series.length > 0
          ? <LineChart title={title} description={description} unit={unit} series={series} hours={hours} signed={tab === "power"} />
          : <p className="chart-tab-empty">{note}</p>}
      </div>
    </section>
  );
}
