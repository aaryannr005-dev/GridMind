"""Run the optional local GridMind Streamlit dashboard."""

from __future__ import annotations

from datetime import date

import streamlit as st

from gridmind.dashboard import (
    metric_rows,
    profile_rows_to_records,
    run_hourly_scenario,
    synthetic_demo_profile,
)
from gridmind.models import BatteryConfig


st.set_page_config(page_title="GridMind | Energy scenario", page_icon="⚡", layout="wide")
st.title("GridMind energy scenario")
st.write(
    "Enter a one-day household or facility scenario, then compare the existing "
    "self-consumption-first baseline with GridMind's approximate cost optimizer."
)
st.info(
    "Results are modeled estimates, not measured bills or guaranteed savings. "
    "The prefilled profile is synthetic demonstration data, not a measured home or facility."
)

with st.form("scenario"):
    st.subheader("1. Daily energy profile")
    currency = st.text_input(
        "Currency code for tariffs and costs",
        value="MYR",
        max_chars=3,
        help="Use a three-letter currency code, such as MYR. Both tariff columns use this currency.",
    )
    currency_label = currency.strip().upper() or "currency"
    import_column = "Import tariff (per kWh)"
    export_column = "Export credit (per kWh)"
    st.caption(
        f"Enter energy per hourly interval in kWh and prices in {currency_label} per kWh. "
        "Use 0 when an interval has no demand, generation, or export credit. "
        "All timestamps use Malaysia Time (MYT, UTC+08:00)."
    )
    selected_date = st.date_input("Simulation date (MYT)", value=date.today())
    profile = st.data_editor(
        synthetic_demo_profile(),
        hide_index=True,
        num_rows="fixed",
        width="stretch",
        column_config={
            "Hour (MYT)": st.column_config.TextColumn("Hour (MYT)", disabled=True),
            "Demand (kWh)": st.column_config.NumberColumn("Demand (kWh)", min_value=0.0, step=0.1, format="%.2f"),
            "Solar generation (kWh)": st.column_config.NumberColumn("Solar generation (kWh)", min_value=0.0, step=0.1, format="%.2f"),
            import_column: st.column_config.NumberColumn(f"Import tariff ({currency_label}/kWh)", step=0.01, format="%.3f"),
            export_column: st.column_config.NumberColumn(f"Export credit ({currency_label}/kWh)", step=0.01, format="%.3f"),
        },
        key="energy_profile",
    )

    st.subheader("2. Battery and scenario settings")
    battery_col_a, battery_col_b, battery_col_c = st.columns(3)
    with battery_col_a:
        capacity = st.number_input("Battery capacity (kWh)", min_value=0.01, value=10.0, step=0.5)
        initial_soc = st.number_input("Starting charge (kWh)", min_value=0.0, value=5.0, step=0.1)
        min_soc = st.number_input("Minimum charge (kWh)", min_value=0.0, value=0.0, step=0.1)
    with battery_col_b:
        max_soc = st.number_input("Maximum charge (kWh)", min_value=0.0, value=10.0, step=0.1)
        max_charge_power = st.number_input("Maximum charging power (kW)", min_value=0.0, value=3.0, step=0.1)
        max_discharge_power = st.number_input("Maximum discharging power (kW)", min_value=0.0, value=3.0, step=0.1)
    with battery_col_c:
        charge_efficiency_percent = st.number_input("Charging efficiency (%)", min_value=1, max_value=100, value=95, step=1)
        discharge_efficiency_percent = st.number_input("Discharging efficiency (%)", min_value=1, max_value=100, value=95, step=1)

    submitted = st.form_submit_button("Run scenario", type="primary", width="stretch")

if submitted:
    st.session_state.pop("gridmind_run", None)
    try:
        battery = BatteryConfig(
            capacity_kwh=capacity,
            max_charge_power_kw=max_charge_power,
            max_discharge_power_kw=max_discharge_power,
            charge_efficiency=charge_efficiency_percent / 100,
            discharge_efficiency=discharge_efficiency_percent / 100,
            initial_soc_kwh=initial_soc,
            min_soc_kwh=min_soc,
            max_soc_kwh=max_soc,
        )
        records = profile_rows_to_records(profile)
        run = run_hourly_scenario(
            [row["Demand (kWh)"] for row in records],
            [row["Solar generation (kWh)"] for row in records],
            [row[import_column] for row in records],
            [row[export_column] for row in records],
            start_date=selected_date,
            battery=battery,
            currency=currency,
        )
    except ValueError as exc:
        st.error(f"Please correct the scenario inputs: {exc}")
        st.caption("No results are shown for invalid inputs. Review the units and battery limits, then run the scenario again.")
    else:
        st.session_state["gridmind_run"] = run

run = st.session_state.get("gridmind_run")
if run is not None:
    report = run.report
    st.divider()
    st.subheader("Scenario results")
    st.caption(
        f"{report.period_start:%d %b %Y} · 24 hourly intervals · {report.currency} · "
        f"fingerprint `{report.scenario_fingerprint[:16]}`"
    )
    comparison = report.comparison
    if comparison is not None:
        cost_label = "Estimated cost saving" if comparison.cost_savings >= 0 else "Estimated cost increase"
        import_label = "Grid import reduction" if comparison.grid_import_reduction_kwh >= 0 else "Grid import increase"
        col_cost, col_import, col_solar = st.columns(3)
        col_cost.metric(cost_label, f"{abs(comparison.cost_savings):.2f} {report.currency}")
        col_import.metric(import_label, f"{abs(comparison.grid_import_reduction_kwh):.2f} kWh")
        col_solar.metric("Solar self-consumption", f"{report.gridmind.solar_self_consumption_kwh:.2f} kWh")
        st.caption(
            "A saving or reduction is calculated from these inputs only. A negative result means "
            "the optimizer did not improve that metric for this scenario."
        )

    st.markdown("#### Baseline and GridMind comparison")
    st.dataframe(metric_rows(run), hide_index=True, width="stretch")
    if comparison is not None:
        st.markdown("#### Savings, changes, and trade-offs")
        st.dataframe(
            [
                {
                    "Metric": row.metric,
                    "Baseline": row.baseline,
                    "GridMind": row.gridmind,
                    "Savings / change": row.change,
                    "Change (%)": row.change_percent,
                    "Unit": row.unit,
                    "Interpretation": row.favorable_direction,
                }
                for row in report.comparison_rows
            ],
            hide_index=True,
            width="stretch",
        )
    st.markdown("#### Energy and battery charts")
    for chart in report.charts:
        st.markdown(f"**{chart.title}**")
        st.caption(chart.description)
        st.markdown(chart.svg, unsafe_allow_html=True)
    with st.expander("Hourly results"):
        baseline_tab, gridmind_tab = st.tabs(["Baseline", "GridMind"])
        for tab, rows in (
            (baseline_tab, report.baseline_intervals),
            (gridmind_tab, report.gridmind_intervals or ()),
        ):
            with tab:
                st.dataframe(
                    [
                        {
                            "Hour (MYT)": row.timestamp.strftime("%Y-%m-%d %H:%M %z"),
                            "Demand (kWh)": row.demand_kwh,
                            "Solar (kWh)": row.solar_generation_kwh,
                            "Direct solar (kWh)": row.direct_solar_kwh,
                            "Grid import (kWh)": row.grid_import_kwh,
                            "Grid export (kWh)": row.grid_export_kwh,
                            "Battery charge (kWh)": row.battery_charge_kwh,
                            "Battery discharge (kWh)": row.battery_discharge_kwh,
                            "Battery state of charge (%)": row.state_of_charge_percent,
                            "Estimated net cost ({})".format(report.currency): row.net_cost,
                        }
                        for row in rows
                    ],
                    hide_index=True,
                    width="stretch",
                )
    with st.expander("Assumptions, checks, and limitations"):
        st.write("**Validation checks**")
        st.write(
            f"Baseline: energy balance {report.baseline.energy_balance_valid}; "
            f"battery limits {report.baseline.battery_constraints_valid}; "
            f"tariff calculations {report.baseline.tariff_costs_valid}."
        )
        if report.gridmind is not None:
            st.write(
                f"GridMind: energy balance {report.gridmind.energy_balance_valid}; "
                f"battery limits {report.gridmind.battery_constraints_valid}; "
                f"tariff calculations {report.gridmind.tariff_costs_valid}."
            )
        st.write("**Assumptions**")
        for item in report.assumptions:
            st.write(f"- {item}")
        st.write("**Limitations**")
        for item in report.limitations:
            st.write(f"- {item}")

st.divider()
st.caption(
    "Local dashboard: the app does not create accounts, store scenarios in a database, "
    "send inputs to a cloud service, or fetch public datasets. OpenDOSM statistics are "
    "not used as household values."
)
