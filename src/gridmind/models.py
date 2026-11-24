"""Typed configuration and time-series input models for GridMind.

These models validate data and configuration only. Simulation behavior lives
in :mod:`gridmind.simulation`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math
from typing import Iterable


def _finite_number(value: float, name: str, *, minimum: float | None = None) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{name} must be finite")
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be at least {minimum}")


@dataclass(frozen=True, slots=True)
class TimeSeriesPoint:
    """A value observed at the start of a timezone-aware interval."""

    timestamp: datetime
    value: float

    def __post_init__(self) -> None:
        if not isinstance(self.timestamp, datetime) or self.timestamp.tzinfo is None or self.timestamp.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        _finite_number(self.value, "value")


def _validate_points(points: Iterable[TimeSeriesPoint], label: str, *, allow_negative: bool = False) -> tuple[TimeSeriesPoint, ...]:
    try:
        result = tuple(points)
    except TypeError as exc:
        raise ValueError(f"{label} must be an iterable of TimeSeriesPoint instances") from exc
    if not result:
        raise ValueError(f"{label} must contain at least one point")
    previous: datetime | None = None
    for point in result:
        if not isinstance(point, TimeSeriesPoint):
            raise ValueError(f"{label} entries must be TimeSeriesPoint instances")
        if not allow_negative and point.value < 0:
            raise ValueError(f"{label} values must be nonnegative")
        instant = point.timestamp.astimezone(timezone.utc)
        if previous is not None and instant <= previous:
            raise ValueError(f"{label} timestamps must be strictly increasing")
        previous = instant
    return result


@dataclass(frozen=True, slots=True)
class DemandSeries:
    """Electricity demand in kWh per interval."""

    points: tuple[TimeSeriesPoint, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "points", _validate_points(self.points, "demand"))


@dataclass(frozen=True, slots=True)
class SolarSeries:
    """Solar generation in kWh per interval."""

    points: tuple[TimeSeriesPoint, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "points", _validate_points(self.points, "solar generation"))


@dataclass(frozen=True, slots=True)
class TariffSeries:
    """Import and export prices in currency per kWh for each interval."""

    import_rates: tuple[TimeSeriesPoint, ...]
    export_rates: tuple[TimeSeriesPoint, ...] | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "import_rates", _validate_points(self.import_rates, "import tariff", allow_negative=True))
        if self.export_rates is not None:
            object.__setattr__(self, "export_rates", _validate_points(self.export_rates, "export tariff", allow_negative=True))
            if tuple(p.timestamp.astimezone(timezone.utc) for p in self.export_rates) != tuple(
                p.timestamp.astimezone(timezone.utc) for p in self.import_rates
            ):
                raise ValueError("import and export tariff timestamps must match")


@dataclass(frozen=True, slots=True)
class InputData:
    """Aligned demand, solar, and tariff series for a future simulation."""

    demand: DemandSeries
    solar: SolarSeries
    tariffs: TariffSeries

    def __post_init__(self) -> None:
        if not isinstance(self.demand, DemandSeries):
            raise ValueError("demand must be a DemandSeries")
        if not isinstance(self.solar, SolarSeries):
            raise ValueError("solar must be a SolarSeries")
        if not isinstance(self.tariffs, TariffSeries):
            raise ValueError("tariffs must be a TariffSeries")
        series = [self.demand.points, self.solar.points, self.tariffs.import_rates]
        if self.tariffs.export_rates is not None:
            series.append(self.tariffs.export_rates)
        expected = tuple(point.timestamp.astimezone(timezone.utc) for point in series[0])
        if any(
            tuple(point.timestamp.astimezone(timezone.utc) for point in values) != expected
            for values in series[1:]
        ):
            raise ValueError("demand, solar, and tariff timestamps must match exactly")


@dataclass(frozen=True, slots=True)
class BatteryConfig:
    """Battery limits and starting state; efficiencies are fractions in (0, 1].

    ``state_of_health`` is a fraction in (0, 1] that scales the usable energy
    capacity. A value below 1 reduces the default maximum state of charge; an
    explicit ``max_soc_kwh`` may not exceed the resulting usable capacity.
    """

    capacity_kwh: float
    max_charge_power_kw: float
    max_discharge_power_kw: float
    charge_efficiency: float = 1.0
    discharge_efficiency: float = 1.0
    initial_soc_kwh: float = 0.0
    min_soc_kwh: float = 0.0
    max_soc_kwh: float | None = None
    state_of_health: float = 1.0

    @property
    def usable_capacity_kwh(self) -> float:
        """Nominal capacity reduced by the configured state of health."""
        return self.capacity_kwh * self.state_of_health

    def __post_init__(self) -> None:
        _finite_number(self.capacity_kwh, "capacity_kwh", minimum=0)
        if self.capacity_kwh == 0:
            raise ValueError("capacity_kwh must be greater than zero")
        _finite_number(self.max_charge_power_kw, "max_charge_power_kw", minimum=0)
        _finite_number(self.max_discharge_power_kw, "max_discharge_power_kw", minimum=0)
        _finite_number(self.state_of_health, "state_of_health", minimum=0)
        if self.state_of_health == 0 or self.state_of_health > 1:
            raise ValueError("state_of_health must be in the interval (0, 1]")
        usable_capacity = self.usable_capacity_kwh
        max_soc = usable_capacity if self.max_soc_kwh is None else self.max_soc_kwh
        _finite_number(self.min_soc_kwh, "min_soc_kwh", minimum=0)
        _finite_number(max_soc, "max_soc_kwh", minimum=0)
        if self.min_soc_kwh > max_soc:
            raise ValueError("min_soc_kwh cannot exceed max_soc_kwh")
        if max_soc > usable_capacity:
            raise ValueError("max_soc_kwh cannot exceed capacity_kwh after state_of_health")
        object.__setattr__(self, "max_soc_kwh", max_soc)
        for name in ("charge_efficiency", "discharge_efficiency"):
            value = getattr(self, name)
            _finite_number(value, name, minimum=0)
            if value == 0 or value > 1:
                raise ValueError(f"{name} must be in the interval (0, 1]")
        _finite_number(self.initial_soc_kwh, "initial_soc_kwh", minimum=0)
        if self.initial_soc_kwh < self.min_soc_kwh:
            raise ValueError("initial_soc_kwh must be at least min_soc_kwh")
        if self.initial_soc_kwh > max_soc:
            raise ValueError("initial_soc_kwh cannot exceed max_soc_kwh")


@dataclass(frozen=True, slots=True)
class GridConfig:
    """Per-interval grid connection power limits in kW; ``None`` is unlimited."""

    max_import_power_kw: float | None = None
    max_export_power_kw: float | None = None

    def __post_init__(self) -> None:
        for name in ("max_import_power_kw", "max_export_power_kw"):
            value = getattr(self, name)
            if value is not None:
                _finite_number(value, name, minimum=0)


@dataclass(frozen=True, slots=True)
class PvConfig:
    """First-order PV cell-temperature derating parameters (NOCT model).

    Solar input is treated as generation at ``reference_temperature_c``.
    Cell temperature is estimated from ambient temperature and irradiance with
    the nominal operating cell temperature (``noct_c``) at 800 W/m² and 20 °C.
    """

    reference_temperature_c: float = 25.0
    noct_c: float = 45.0
    temperature_coefficient_per_c: float = -0.004

    def __post_init__(self) -> None:
        _finite_number(self.reference_temperature_c, "reference_temperature_c")
        _finite_number(self.noct_c, "noct_c")
        _finite_number(
            self.temperature_coefficient_per_c, "temperature_coefficient_per_c"
        )
        if self.temperature_coefficient_per_c > 0:
            raise ValueError("temperature_coefficient_per_c must be zero or negative")


@dataclass(frozen=True, slots=True)
class GridMindConfig:
    """Top-level inputs for a simulation run, without simulation behavior."""

    battery: BatteryConfig
    interval_minutes: int = 60
    currency: str = "MYR"
    grid: GridConfig | None = None
    pv: PvConfig | None = None

    def __post_init__(self) -> None:
        if isinstance(self.interval_minutes, bool) or not isinstance(self.interval_minutes, int) or self.interval_minutes <= 0:
            raise ValueError("interval_minutes must be a positive integer")
        try:
            timedelta(minutes=self.interval_minutes)
        except OverflowError as exc:
            raise ValueError("interval_minutes exceeds the supported datetime range") from exc
        if not isinstance(self.battery, BatteryConfig):
            raise ValueError("battery must be a BatteryConfig")
        grid = GridConfig() if self.grid is None else self.grid
        if not isinstance(grid, GridConfig):
            raise ValueError("grid must be a GridConfig")
        object.__setattr__(self, "grid", grid)
        if self.pv is not None and not isinstance(self.pv, PvConfig):
            raise ValueError("pv must be a PvConfig")
        if (
            not isinstance(self.currency, str)
            or len(self.currency.strip()) != 3
            or not self.currency.strip().isascii()
            or not self.currency.strip().isalpha()
        ):
            raise ValueError("currency must be a three-letter ASCII code")
        object.__setattr__(self, "currency", self.currency.strip().upper())

