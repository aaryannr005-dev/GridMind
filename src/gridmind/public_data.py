"""Offline, provenance-preserving imports for selected OpenDOSM statistics.

These monthly national statistics are for context and analysis only. They are
not household measurements and are not converted to simulation inputs.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from enum import Enum
import math
from types import MappingProxyType
from typing import TextIO


_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
_METADATA_CHECKED_ON = date(2026, 11, 25)
_DATA_AS_OF = date(2026, 6, 30)
_LAST_UPDATED = date(2026, 10, 8)


@dataclass(frozen=True, slots=True)
class DatasetMetadata:
    """Source and interpretation details verified from an OpenDOSM page."""

    dataset_id: str
    title: str
    description: str
    publisher: str
    data_sources: tuple[str, ...]
    dataset_url: str
    csv_url: str
    license_name: str
    license_url: str
    geographic_coverage: str
    frequency: str
    unit: str
    date_column: str
    category_column: str
    value_column: str
    categories: frozenset[str]
    data_as_of: date
    last_updated: date
    next_update: str
    metadata_checked_on: date
    provisional_months: int
    caveat: str

    def __post_init__(self) -> None:
        text_fields = (
            self.dataset_id, self.title, self.description, self.publisher,
            self.dataset_url, self.csv_url, self.license_name, self.license_url,
            self.geographic_coverage, self.frequency, self.unit,
            self.date_column, self.category_column, self.value_column,
            self.next_update, self.caveat,
        )
        if any(not isinstance(value, str) or not value.strip() for value in text_fields):
            raise ValueError("dataset metadata text fields must be non-empty strings")
        if not isinstance(self.data_sources, tuple) or not self.data_sources or any(
            not isinstance(source, str) or not source.strip() for source in self.data_sources
        ):
            raise ValueError("data_sources must be a non-empty tuple of names")
        if not isinstance(self.categories, frozenset) or not self.categories or any(
            not isinstance(category, str) or not category.strip() for category in self.categories
        ):
            raise ValueError("categories must be a non-empty frozenset of names")
        for name in ("data_as_of", "last_updated", "metadata_checked_on"):
            if type(getattr(self, name)) is not date:
                raise ValueError(f"{name} must be a date")
        if isinstance(self.provisional_months, bool) or not isinstance(self.provisional_months, int) or self.provisional_months <= 0:
            raise ValueError("provisional_months must be a positive integer")


@dataclass(frozen=True, slots=True)
class OpenDosmDataset:
    """A dataset's verified metadata and its known categorical values."""

    metadata: DatasetMetadata

    def __post_init__(self) -> None:
        if not isinstance(self.metadata, DatasetMetadata):
            raise ValueError("metadata must be DatasetMetadata")


_DATA_SOURCES = (
    "Tenaga Nasional Berhad",
    "Sabah Electricity Sdn. Bhd.",
    "Sarawak Energy Berhad",
    "Energy Commission of Malaysia",
    "Department of Statistics Malaysia",
)

ELECTRICITY_CONSUMPTION = OpenDosmDataset(
    DatasetMetadata(
        dataset_id="electricity_consumption",
        title="Monthly Electricity Consumption",
        description="Monthly electricity consumption in Malaysia by sector.",
        publisher="OpenDOSM, Department of Statistics Malaysia",
        data_sources=_DATA_SOURCES,
        dataset_url="https://open.dosm.gov.my/data-catalogue/electricity_consumption",
        csv_url="https://storage.data.gov.my/energy/electricity_consumption.csv",
        license_name="Creative Commons Attribution 4.0 International (CC BY 4.0)",
        license_url=_LICENSE_URL,
        geographic_coverage="Malaysia (national aggregate)",
        frequency="Monthly",
        unit="million kWh",
        date_column="date",
        category_column="sector",
        value_column="consumption",
        categories=frozenset({"total", "local", "local_commercial", "local_domestic", "exports", "losses"}),
        data_as_of=_DATA_AS_OF,
        last_updated=_LAST_UPDATED,
        next_update="Not stated (OpenDOSM page lists N/A)",
        metadata_checked_on=_METADATA_CHECKED_ON,
        provisional_months=6,
        caveat=(
            "The most recent six months are provisional and may be revised. "
            "Domestic consumption includes public lighting; commercial use includes "
            "industrial and mining sectors."
        ),
    )
)

ELECTRICITY_SUPPLY = OpenDosmDataset(
    DatasetMetadata(
        dataset_id="electricity_supply",
        title="Monthly Electricity Supply",
        description="Monthly electricity supply in Malaysia by sector.",
        publisher="OpenDOSM, Department of Statistics Malaysia",
        data_sources=_DATA_SOURCES,
        dataset_url="https://open.dosm.gov.my/data-catalogue/electricity_supply",
        csv_url="https://storage.data.gov.my/energy/electricity_supply.csv",
        license_name="Creative Commons Attribution 4.0 International (CC BY 4.0)",
        license_url=_LICENSE_URL,
        geographic_coverage="Malaysia (national aggregate)",
        frequency="Monthly",
        unit="million kWh",
        date_column="date",
        category_column="sector",
        value_column="supply",
        categories=frozenset({"total", "local", "local_public", "local_private", "imports", "distribution"}),
        data_as_of=_DATA_AS_OF,
        last_updated=_LAST_UPDATED,
        next_update="Not stated (OpenDOSM page lists N/A)",
        metadata_checked_on=_METADATA_CHECKED_ON,
        provisional_months=6,
        caveat="The most recent six months are provisional and may be revised.",
    )
)

OPEN_DOSM_DATASETS = MappingProxyType({
    ELECTRICITY_CONSUMPTION.metadata.dataset_id: ELECTRICITY_CONSUMPTION,
    ELECTRICITY_SUPPLY.metadata.dataset_id: ELECTRICITY_SUPPLY,
})


class ObservationStatus(str, Enum):
    """Publication status inferred only from the verified six-month caveat."""

    FINAL = "final"
    PROVISIONAL = "provisional"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class MonthlyObservation:
    """A monthly source row; a blank source value is retained as ``None``."""

    period: date
    category: str
    value: float | None
    status: ObservationStatus


@dataclass(frozen=True, slots=True)
class MissingPeriod:
    """A month absent between the first and last row for a category."""

    period: date
    category: str


@dataclass(frozen=True, slots=True)
class OpenDosmSeries:
    """Imported rows plus provenance and explicitly detected data gaps."""

    metadata: DatasetMetadata
    observations: tuple[MonthlyObservation, ...]
    missing_periods: tuple[MissingPeriod, ...]

    @property
    def period_start(self) -> date:
        """First month represented in the imported file."""

        return self.observations[0].period

    @property
    def period_end(self) -> date:
        """Last month represented in the imported file."""

        return self.observations[-1].period

    @property
    def missing_value_count(self) -> int:
        """Number of rows present in the CSV whose numeric value was blank."""

        return sum(observation.value is None for observation in self.observations)


def _month_index(period: date) -> int:
    return period.year * 12 + period.month - 1


def _month_from_index(index: int) -> date:
    year, month_zero_based = divmod(index, 12)
    return date(year, month_zero_based + 1, 1)


def _status_for(period: date, metadata: DatasetMetadata) -> ObservationStatus:
    period_index = _month_index(period)
    as_of_index = _month_index(metadata.data_as_of)
    if period_index > as_of_index:
        return ObservationStatus.UNKNOWN
    provisional_start = as_of_index - metadata.provisional_months + 1
    if period_index >= provisional_start:
        return ObservationStatus.PROVISIONAL
    return ObservationStatus.FINAL


def _missing_periods(observations: tuple[MonthlyObservation, ...]) -> tuple[MissingPeriod, ...]:
    by_category: dict[str, set[int]] = {}
    for observation in observations:
        by_category.setdefault(observation.category, set()).add(_month_index(observation.period))

    gaps: list[MissingPeriod] = []
    for category, month_indexes in by_category.items():
        first, last = min(month_indexes), max(month_indexes)
        for index in range(first, last + 1):
            if index not in month_indexes:
                gaps.append(MissingPeriod(_month_from_index(index), category))
    return tuple(sorted(gaps, key=lambda gap: (gap.period, gap.category)))


def load_open_dosm_csv(dataset: OpenDosmDataset, stream: TextIO) -> OpenDosmSeries:
    """Parse one official-format OpenDOSM CSV without network access.

    The caller downloads or obtains the CSV separately and opens it as UTF-8
    text with ``newline=""``. Blank numeric cells are retained as missing
    observations, while absent months are exposed in ``missing_periods``.
    Values remain in the source unit (million kWh); no rescaling or imputation
    is performed.
    """

    if not isinstance(dataset, OpenDosmDataset):
        raise ValueError("dataset must be an OpenDosmDataset")
    if not callable(getattr(stream, "read", None)) or not hasattr(stream, "__iter__"):
        raise ValueError("stream must be a readable text stream")

    metadata = dataset.metadata
    try:
        reader = csv.DictReader(stream, strict=True)
        headers = reader.fieldnames
    except (csv.Error, UnicodeError, TypeError) as exc:
        raise ValueError("CSV header could not be read from a text stream") from exc
    if not headers:
        raise ValueError("CSV must include a header row")
    if len(headers) != len(set(headers)):
        raise ValueError("CSV header names must be unique")
    required = {metadata.date_column, metadata.category_column, metadata.value_column}
    missing_headers = required.difference(headers)
    if missing_headers:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing_headers))}")

    observations: list[MonthlyObservation] = []
    seen: set[tuple[date, str]] = set()
    try:
        rows = enumerate(reader, start=2)
        for row_number, row in rows:
            if None in row:
                raise ValueError(f"CSV row {row_number} has more fields than the header")
            if not any((value or "").strip() for value in row.values()):
                continue
            missing_fields = [name for name in required if row.get(name) is None]
            if missing_fields:
                raise ValueError(
                    f"CSV row {row_number} is missing fields: {', '.join(sorted(missing_fields))}"
                )

            raw_period = (row.get(metadata.date_column) or "").strip()
            raw_category = (row.get(metadata.category_column) or "").strip()
            raw_value = (row.get(metadata.value_column) or "").strip()
            try:
                period = date.fromisoformat(raw_period)
            except ValueError as exc:
                raise ValueError(f"CSV row {row_number} has an invalid ISO date") from exc
            if period.isoformat() != raw_period or period.day != 1:
                raise ValueError(f"CSV row {row_number} date must be YYYY-MM-01 for a monthly period")
            if raw_category not in metadata.categories:
                raise ValueError(f"CSV row {row_number} has an unknown sector: {raw_category!r}")
            key = (period, raw_category)
            if key in seen:
                raise ValueError(f"CSV row {row_number} duplicates {period.isoformat()} / {raw_category}")
            seen.add(key)

            value: float | None
            if not raw_value:
                value = None
            else:
                try:
                    decimal_value = Decimal(raw_value)
                except InvalidOperation as exc:
                    raise ValueError(f"CSV row {row_number} has a non-numeric {metadata.value_column}") from exc
                if not decimal_value.is_finite():
                    raise ValueError(f"CSV row {row_number} {metadata.value_column} must be finite")
                if decimal_value < 0:
                    raise ValueError(f"CSV row {row_number} {metadata.value_column} must be nonnegative")
                try:
                    value = float(decimal_value)
                except OverflowError as exc:
                    raise ValueError(
                        f"CSV row {row_number} {metadata.value_column} must be within the supported numeric range"
                    ) from exc
                if not math.isfinite(value):
                    raise ValueError(f"CSV row {row_number} {metadata.value_column} must be within the supported numeric range")
                if decimal_value != 0 and value == 0:
                    raise ValueError(f"CSV row {row_number} {metadata.value_column} is too small to represent")

            observations.append(MonthlyObservation(period, raw_category, value, _status_for(period, metadata)))
    except (csv.Error, UnicodeError, TypeError) as exc:
        raise ValueError(f"CSV row {reader.line_num} could not be parsed") from exc

    if not observations:
        raise ValueError("CSV must contain at least one data row")
    ordered = tuple(sorted(observations, key=lambda item: (item.period, item.category)))
    return OpenDosmSeries(metadata, ordered, _missing_periods(ordered))
