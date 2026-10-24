"""Native desktop interface for running GridMind scenarios."""

from __future__ import annotations

import sys
from datetime import date
from typing import Any

from PySide6.QtCore import QByteArray, Qt, QDate
from PySide6.QtSvgWidgets import QSvgWidget
from PySide6.QtWidgets import (
    QApplication,
    QDateEdit,
    QDoubleSpinBox,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .dashboard import (
    PROFILE_FIELDS,
    HOURLY_PERIODS,
    metric_rows,
    profile_rows_to_records,
    run_hourly_scenario,
    synthetic_demo_profile,
)
from .models import BatteryConfig


PROFILE_COLUMNS = (
    "Hour (MYT)",
    "Demand (kWh)",
    "Solar generation (kWh)",
    "Import tariff (per kWh)",
    "Export credit (per kWh)",
)


def _number(value: Any) -> str:
    return "—" if value is None else f"{value:.3f}"


def _spinbox(
    minimum: float,
    maximum: float,
    value: float,
    step: float,
    *,
    decimals: int = 3,
) -> QDoubleSpinBox:
    field = QDoubleSpinBox()
    field.setRange(minimum, maximum)
    field.setDecimals(decimals)
    field.setSingleStep(step)
    field.setValue(value)
    return field


class GridMindWindow(QMainWindow):
    """Editable scenario form with simulation and report results in one window."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("GridMind Energy Scenario")
        self.resize(1180, 850)
        self.last_run = None

        root = QWidget()
        root_layout = QVBoxLayout(root)
        heading = QLabel("GridMind energy scenario")
        heading.setStyleSheet("font-size: 24px; font-weight: 600;")
        root_layout.addWidget(heading)
        root_layout.addWidget(QLabel(
            "Enter one day of demand, solar, tariffs and battery settings. "
            "GridMind compares its existing baseline with the approximate cost optimizer."
        ))
        notice = QLabel(
            "Results are modeled estimates, not measured bills or guaranteed savings. "
            "The prefilled values are synthetic demonstration data."
        )
        notice.setWordWrap(True)
        notice.setStyleSheet("background: #fff4d1; padding: 8px;")
        root_layout.addWidget(notice)

        self.tabs = QTabWidget()
        self.scenario_page = self._build_scenario_page()
        self.results_page = self._build_results_page()
        self.tabs.addTab(self.scenario_page, "Scenario inputs")
        self.tabs.addTab(self.results_page, "Results")
        root_layout.addWidget(self.tabs, 1)
        self.status = QLabel("All scenario values stay in this app's memory while it is open.")
        self.status.setWordWrap(True)
        root_layout.addWidget(self.status)
        self.setCentralWidget(root)

    def _build_scenario_page(self) -> QWidget:
        content = QWidget()
        layout = QVBoxLayout(content)

        scenario_group = QGroupBox("Scenario settings")
        scenario_form = QFormLayout(scenario_group)
        self.currency = QLineEdit("MYR")
        self.currency.setMaxLength(3)
        self.start_date = QDateEdit(QDate.currentDate())
        self.start_date.setCalendarPopup(True)
        self.start_date.setDisplayFormat("yyyy-MM-dd")
        scenario_form.addRow("Currency code", self.currency)
        scenario_form.addRow("Simulation date (MYT)", self.start_date)
        scenario_form.addRow(
            "Units",
            QLabel("Energy: kWh per hourly interval · Tariffs: currency per kWh · Time: MYT (UTC+08:00)"),
        )
        layout.addWidget(scenario_group)

        profile_group = QGroupBox("Hourly demand, solar and tariffs")
        profile_layout = QVBoxLayout(profile_group)
        profile_layout.addWidget(QLabel(
            "Edit all 24 hours. Enter 0 for an interval with no demand, generation, or export credit. "
            "Negative tariffs are accepted by the model."
        ))
        self.profile_table = QTableWidget(HOURLY_PERIODS, len(PROFILE_COLUMNS))
        self.profile_table.setHorizontalHeaderLabels(PROFILE_COLUMNS)
        self.profile_table.setAlternatingRowColors(True)
        self.profile_table.verticalHeader().setVisible(False)
        self.profile_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        for row_index, row in enumerate(synthetic_demo_profile()):
            for column_index, column in enumerate(PROFILE_COLUMNS):
                value = row[column]
                item = QTableWidgetItem(str(value))
                if column_index == 0:
                    item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsEditable)
                self.profile_table.setItem(row_index, column_index, item)
        self.profile_table.setMinimumHeight(480)
        profile_layout.addWidget(self.profile_table)
        layout.addWidget(profile_group)

        battery_group = QGroupBox("Battery parameters")
        battery_layout = QGridLayout(battery_group)
        self.battery_fields: dict[str, QDoubleSpinBox] = {
            "capacity": _spinbox(0.01, 1_000_000, 10.0, 0.5),
            "initial_soc": _spinbox(0, 1_000_000, 5.0, 0.1),
            "min_soc": _spinbox(0, 1_000_000, 0.0, 0.1),
            "max_soc": _spinbox(0, 1_000_000, 10.0, 0.1),
            "charge_power": _spinbox(0, 1_000_000, 3.0, 0.1),
            "discharge_power": _spinbox(0, 1_000_000, 3.0, 0.1),
            "charge_efficiency": _spinbox(1, 100, 95, 1, decimals=0),
            "discharge_efficiency": _spinbox(1, 100, 95, 1, decimals=0),
        }
        battery_rows = (
            ("Capacity (kWh)", "capacity"),
            ("Starting charge (kWh)", "initial_soc"),
            ("Minimum charge (kWh)", "min_soc"),
            ("Maximum charge (kWh)", "max_soc"),
            ("Maximum charging power (kW)", "charge_power"),
            ("Maximum discharging power (kW)", "discharge_power"),
            ("Charging efficiency (%)", "charge_efficiency"),
            ("Discharging efficiency (%)", "discharge_efficiency"),
        )
        for index, (label, key) in enumerate(battery_rows):
            grid_row, grid_column = divmod(index, 2)
            battery_layout.addWidget(QLabel(label), grid_row, grid_column * 2)
            battery_layout.addWidget(self.battery_fields[key], grid_row, grid_column * 2 + 1)
        layout.addWidget(battery_group)

        self.run_button = QPushButton("Run scenario")
        self.run_button.setDefault(True)
        self.run_button.clicked.connect(self.run_scenario)
        layout.addWidget(self.run_button)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(content)
        page_layout = QVBoxLayout()
        page_layout.setContentsMargins(0, 0, 0, 0)
        page_layout.addWidget(scroll)
        page = QWidget()
        page.setLayout(page_layout)
        return page

    def _build_results_page(self) -> QWidget:
        self.results_tabs = QTabWidget()
        self.summary_content = QWidget()
        self.summary_layout = QVBoxLayout(self.summary_content)
        self.result_heading = QLabel("Run a scenario to see results.")
        self.result_heading.setStyleSheet("font-size: 18px; font-weight: 600;")
        self.summary_layout.addWidget(self.result_heading)
        self.topline = QLabel("")
        self.topline.setWordWrap(True)
        self.summary_layout.addWidget(self.topline)

        self.metrics_table = QTableWidget(0, 4)
        self.metrics_table.setHorizontalHeaderLabels(("Metric", "Baseline", "GridMind", "Unit"))
        self.metrics_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.metrics_table.verticalHeader().setVisible(False)
        self.summary_layout.addWidget(self.metrics_table)

        self.comparison_table = QTableWidget(0, 6)
        self.comparison_table.setHorizontalHeaderLabels(("Metric", "Baseline", "GridMind", "Change", "Change (%)", "Interpretation"))
        self.comparison_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.comparison_table.verticalHeader().setVisible(False)
        self.summary_layout.addWidget(QLabel("Savings, changes and trade-offs"))
        self.summary_layout.addWidget(self.comparison_table)

        self.chart_widgets: list[QSvgWidget] = []
        self.chart_labels: list[QLabel] = []
        self.assumptions = QLabel("")
        self.assumptions.setWordWrap(True)
        self.summary_layout.addWidget(self.assumptions)
        summary_scroll = QScrollArea()
        summary_scroll.setWidgetResizable(True)
        summary_scroll.setWidget(self.summary_content)
        self.results_tabs.addTab(summary_scroll, "Summary and charts")

        self.baseline_table = QTableWidget(0, 10)
        self.gridmind_table = QTableWidget(0, 10)
        interval_headers = (
            "Hour (MYT)", "Demand (kWh)", "Solar (kWh)", "Direct solar (kWh)",
            "Grid import (kWh)", "Grid export (kWh)", "Battery charge (kWh)",
            "Battery discharge (kWh)", "State of charge (%)", "Estimated net cost",
        )
        for table in (self.baseline_table, self.gridmind_table):
            table.setHorizontalHeaderLabels(interval_headers)
            table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)
            table.verticalHeader().setVisible(False)
        interval_tabs = QTabWidget()
        interval_tabs.addTab(self.baseline_table, "Baseline intervals")
        interval_tabs.addTab(self.gridmind_table, "GridMind intervals")
        self.results_tabs.addTab(interval_tabs, "Hourly results")
        result_layout = QVBoxLayout()
        result_layout.addWidget(self.results_tabs)
        result_page = QWidget()
        result_page.setLayout(result_layout)
        return result_page

    def _profile_records(self) -> tuple[dict[str, Any], ...]:
        rows: list[dict[str, Any]] = []
        for row_index in range(self.profile_table.rowCount()):
            row: dict[str, Any] = {"Hour (MYT)": f"{row_index:02d}:00"}
            for offset, field in enumerate(PROFILE_FIELDS, start=1):
                cell = self.profile_table.item(row_index, offset)
                text = "" if cell is None else cell.text().strip()
                if not text:
                    raise ValueError(f"hour {row_index:02d}:00 {field} is required")
                try:
                    row[field] = float(text)
                except ValueError as exc:
                    raise ValueError(f"hour {row_index:02d}:00 {field} must be a number") from exc
            rows.append(row)
        return profile_rows_to_records(rows)

    def _battery_config(self) -> BatteryConfig:
        field = self.battery_fields
        return BatteryConfig(
            capacity_kwh=field["capacity"].value(),
            max_charge_power_kw=field["charge_power"].value(),
            max_discharge_power_kw=field["discharge_power"].value(),
            charge_efficiency=field["charge_efficiency"].value() / 100,
            discharge_efficiency=field["discharge_efficiency"].value() / 100,
            initial_soc_kwh=field["initial_soc"].value(),
            min_soc_kwh=field["min_soc"].value(),
            max_soc_kwh=field["max_soc"].value(),
        )

    def run_scenario(self) -> None:
        self.last_run = None
        self._clear_results()
        try:
            records = self._profile_records()
            qdate = self.start_date.date()
            selected_date = date(qdate.year(), qdate.month(), qdate.day())
            run = run_hourly_scenario(
                [row["Demand (kWh)"] for row in records],
                [row["Solar generation (kWh)"] for row in records],
                [row["Import tariff (per kWh)"] for row in records],
                [row["Export credit (per kWh)"] for row in records],
                start_date=selected_date,
                battery=self._battery_config(),
                currency=self.currency.text(),
            )
        except ValueError as exc:
            self.status.setText(f"Input error: {exc}")
            self.status.setStyleSheet("color: #a00000;")
            return
        self.last_run = run
        self._show_results(run)
        self.status.setText("Scenario complete. Results are modeled estimates for the inputs shown.")
        self.status.setStyleSheet("color: #176b36;")
        self.tabs.setCurrentIndex(1)

    def _clear_results(self) -> None:
        self.result_heading.setText("Run a scenario to see results.")
        self.topline.clear()
        self.metrics_table.setRowCount(0)
        self.comparison_table.setRowCount(0)
        self.baseline_table.setRowCount(0)
        self.gridmind_table.setRowCount(0)
        self.assumptions.clear()
        for chart in self.chart_widgets:
            self.summary_layout.removeWidget(chart)
            chart.deleteLater()
        self.chart_widgets.clear()
        for label in self.chart_labels:
            self.summary_layout.removeWidget(label)
            label.deleteLater()
        self.chart_labels.clear()

    def _show_results(self, run: Any) -> None:
        report = run.report
        comparison = report.comparison
        self.result_heading.setText(
            f"{report.period_start:%d %b %Y} · {report.interval_count} hourly intervals · {report.currency}"
        )
        if comparison is None:
            self.topline.setText("No strategy comparison is available for this report.")
        else:
            cost_label = "Estimated cost saving" if comparison.cost_savings >= 0 else "Estimated cost increase"
            import_label = "Grid import reduction" if comparison.grid_import_reduction_kwh >= 0 else "Grid import increase"
            self.topline.setText(
                f"{cost_label}: {abs(comparison.cost_savings):.3f} {report.currency} · "
                f"{import_label}: {abs(comparison.grid_import_reduction_kwh):.3f} kWh · "
                "these values are scenario estimates, not guarantees."
            )

        rows = metric_rows(run)
        self.metrics_table.setRowCount(len(rows))
        for row_index, row in enumerate(rows):
            values = (row["Metric"], _number(row["Baseline"]), _number(row["GridMind"]), row["Unit"])
            for column_index, value in enumerate(values):
                self.metrics_table.setItem(row_index, column_index, QTableWidgetItem(str(value)))

        comparison_rows = report.comparison_rows
        self.comparison_table.setRowCount(len(comparison_rows))
        for row_index, row in enumerate(comparison_rows):
            values = (
                row.metric,
                _number(row.baseline),
                _number(row.gridmind),
                _number(row.change),
                _number(row.change_percent),
                row.favorable_direction,
            )
            for column_index, value in enumerate(values):
                self.comparison_table.setItem(row_index, column_index, QTableWidgetItem(str(value)))

        self._fill_interval_table(self.baseline_table, report.baseline_intervals, report.currency)
        self._fill_interval_table(self.gridmind_table, report.gridmind_intervals or (), report.currency)
        for chart in report.charts:
            label = QLabel(f"{chart.title} — {chart.description}")
            label.setWordWrap(True)
            self.summary_layout.insertWidget(self.summary_layout.count() - 1, label)
            self.chart_labels.append(label)
            widget = QSvgWidget()
            widget.load(QByteArray(chart.svg.encode("utf-8")))
            widget.setMinimumHeight(240)
            self.chart_widgets.append(widget)
            self.summary_layout.insertWidget(self.summary_layout.count() - 1, widget)

        checks = (
            f"Baseline checks — energy balance: {report.baseline.energy_balance_valid}; "
            f"battery limits: {report.baseline.battery_constraints_valid}; "
            f"tariff calculations: {report.baseline.tariff_costs_valid}.\n"
        )
        if report.gridmind is not None:
            checks += (
                f"GridMind checks — energy balance: {report.gridmind.energy_balance_valid}; "
                f"battery limits: {report.gridmind.battery_constraints_valid}; "
                f"tariff calculations: {report.gridmind.tariff_costs_valid}.\n"
            )
        checks += "\nAssumptions:\n" + "\n".join(f"• {item}" for item in report.assumptions)
        checks += "\n\nLimitations:\n" + "\n".join(f"• {item}" for item in report.limitations)
        self.assumptions.setText(checks)

    @staticmethod
    def _fill_interval_table(table: QTableWidget, rows: Any, currency: str) -> None:
        table.setRowCount(len(rows))
        for index, row in enumerate(rows):
            values = (
                row.timestamp.strftime("%Y-%m-%d %H:%M %z"),
                row.demand_kwh,
                row.solar_generation_kwh,
                row.direct_solar_kwh,
                row.grid_import_kwh,
                row.grid_export_kwh,
                row.battery_charge_kwh,
                row.battery_discharge_kwh,
                row.state_of_charge_percent,
                row.net_cost,
            )
            for column, value in enumerate(values):
                displayed = f"{value:.3f}" if isinstance(value, (int, float)) else str(value)
                if column == 9:
                    displayed = f"{displayed} {currency}"
                table.setItem(index, column, QTableWidgetItem(displayed))


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("GridMind")
    window = GridMindWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
