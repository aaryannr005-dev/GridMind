"""First-order PV temperature derating using a NOCT cell-temperature model.

The supplied solar series is treated as generation at the configured reference
cell temperature. Ambient temperature and irradiance estimate the operating
cell temperature; the resulting derate factor is capped at 1.0 so this
preprocessing step never creates generation beyond the user-supplied solar
input. It is not a full thermal, shading, or soiling model.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

from .models import PvConfig

STANDARD_IRRADIANCE_W_M2 = 800.0
NOCT_STANDARD_AMBIENT_C = 20.0


def _finite(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def cell_temperature_c(
    ambient_temperature_c: float,
    irradiance_w_m2: float,
    pv: PvConfig,
) -> float:
    """Estimate PV cell temperature from ambient temperature and irradiance."""
    ambient = _finite(ambient_temperature_c, "ambient temperature")
    irradiance = _finite(irradiance_w_m2, "solar irradiance")
    if irradiance < 0:
        raise ValueError("solar irradiance must be nonnegative")
    return ambient + (pv.noct_c - NOCT_STANDARD_AMBIENT_C) * (
        irradiance / STANDARD_IRRADIANCE_W_M2
    )


def temperature_derate_factor(
    ambient_temperature_c: float,
    irradiance_w_m2: float,
    pv: PvConfig,
) -> float:
    """Return the capped PV output factor for the given conditions."""
    cell = cell_temperature_c(ambient_temperature_c, irradiance_w_m2, pv)
    factor = 1.0 + pv.temperature_coefficient_per_c * (
        cell - pv.reference_temperature_c
    )
    if not math.isfinite(factor):
        raise ValueError("temperature derate factor exceeds the finite numeric range")
    return min(1.0, max(0.0, factor))


def apply_temperature_derating(
    solar_kwh: Sequence[float],
    ambient_temperature_c: Sequence[float],
    solar_irradiance_w_m2: Sequence[float],
    pv: PvConfig,
) -> tuple[float, ...]:
    """Derate a solar energy series with aligned ambient and irradiance series."""
    if not isinstance(pv, PvConfig):
        raise ValueError("pv must be a PvConfig")
    try:
        solar = tuple(solar_kwh)
        ambient = tuple(ambient_temperature_c)
        irradiance = tuple(solar_irradiance_w_m2)
    except TypeError as exc:
        raise ValueError("solar, ambient temperature, and irradiance must be sequences") from exc
    if not solar:
        raise ValueError("solar series must contain at least one value")
    if len(ambient) != len(solar) or len(irradiance) != len(solar):
        raise ValueError(
            "solar, ambient temperature, and irradiance series must have equal lengths"
        )
    derated: list[float] = []
    for index, (energy, ambient_value, irradiance_value) in enumerate(
        zip(solar, ambient, irradiance)
    ):
        solar_value = _finite(energy, f"solar value at index {index}")
        if solar_value < 0:
            raise ValueError(f"solar value at index {index} must be nonnegative")
        factor = temperature_derate_factor(ambient_value, irradiance_value, pv)
        adjusted = solar_value * factor
        if not math.isfinite(adjusted):
            raise ValueError("derated solar value exceeds the finite numeric range")
        derated.append(adjusted)
    return tuple(derated)
