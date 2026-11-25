"""Explicit quality assessment and inclusion policies for public monthly data.

Quality reports describe source completeness and publication status. They do not
repair, interpolate, reconcile, or promote national aggregates into scenarios.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .public_data import MonthlyObservation, ObservationStatus, OpenDosmSeries


@dataclass(frozen=True, slots=True)
class DataQualityPolicy:
    """Explicitly opt in to observations that may still be revised."""

    include_provisional: bool = False
    include_unknown: bool = False

    def __post_init__(self) -> None:
        if type(self.include_provisional) is not bool:
            raise ValueError("include_provisional must be a boolean")
        if type(self.include_unknown) is not bool:
            raise ValueError("include_unknown must be a boolean")


@dataclass(frozen=True, slots=True)
class CategoryQuality:
    """Completeness and status counts for one source category."""

    category: str
    first_period: date
    last_period: date
    expected_periods: int
    observed_rows: int
    numeric_values: int
    blank_values: int
    missing_periods: int
    final_values: int
    provisional_values: int
    unknown_values: int

    @property
    def row_completeness(self) -> float:
        return self.observed_rows / self.expected_periods

    @property
    def value_completeness(self) -> float:
        return self.numeric_values / self.expected_periods


@dataclass(frozen=True, slots=True)
class DataQualityReport:
    """Immutable quality summary tied to one imported source series."""

    dataset_id: str
    categories: tuple[CategoryQuality, ...]
    observation_count: int
    numeric_value_count: int
    blank_value_count: int
    missing_period_count: int
    final_count: int
    provisional_count: int
    unknown_count: int
    warnings: tuple[str, ...]

    def usable_observations(
        self,
        series: OpenDosmSeries,
        policy: DataQualityPolicy = DataQualityPolicy(),
    ) -> tuple[MonthlyObservation, ...]:
        """Return numeric observations permitted by an explicit status policy."""
        if not isinstance(series, OpenDosmSeries):
            raise ValueError("series must be an OpenDosmSeries")
        if series.metadata.dataset_id != self.dataset_id:
            raise ValueError("quality report belongs to a different dataset")
        if not isinstance(policy, DataQualityPolicy):
            raise ValueError("policy must be a DataQualityPolicy")

        allowed = {ObservationStatus.FINAL}
        if policy.include_provisional:
            allowed.add(ObservationStatus.PROVISIONAL)
        if policy.include_unknown:
            allowed.add(ObservationStatus.UNKNOWN)
        return tuple(
            item for item in series.observations
            if item.value is not None and item.status in allowed
        )


def evaluate_data_quality(series: OpenDosmSeries) -> DataQualityReport:
    """Assess monthly row/value completeness and publication status.

    Completeness is measured from each category's first through last observed
    month. Months outside that observed span are not assumed to be expected.
    """
    if not isinstance(series, OpenDosmSeries):
        raise ValueError("series must be an OpenDosmSeries")
    if not series.observations:
        raise ValueError("series must contain observations")

    grouped: dict[str, list[MonthlyObservation]] = {}
    for observation in series.observations:
        grouped.setdefault(observation.category, []).append(observation)

    gaps_by_category: dict[str, int] = {}
    for gap in series.missing_periods:
        gaps_by_category[gap.category] = gaps_by_category.get(gap.category, 0) + 1

    category_reports: list[CategoryQuality] = []
    for category, observations in sorted(grouped.items()):
        indexes = [item.period.year * 12 + item.period.month - 1 for item in observations]
        expected = max(indexes) - min(indexes) + 1
        numeric = sum(item.value is not None for item in observations)
        category_reports.append(CategoryQuality(
            category=category,
            first_period=min(item.period for item in observations),
            last_period=max(item.period for item in observations),
            expected_periods=expected,
            observed_rows=len(observations),
            numeric_values=numeric,
            blank_values=len(observations) - numeric,
            missing_periods=gaps_by_category.get(category, 0),
            final_values=sum(item.status is ObservationStatus.FINAL for item in observations),
            provisional_values=sum(item.status is ObservationStatus.PROVISIONAL for item in observations),
            unknown_values=sum(item.status is ObservationStatus.UNKNOWN for item in observations),
        ))

    observations = series.observations
    blanks = sum(item.value is None for item in observations)
    provisional = sum(item.status is ObservationStatus.PROVISIONAL for item in observations)
    unknown = sum(item.status is ObservationStatus.UNKNOWN for item in observations)
    missing = len(series.missing_periods)
    warnings: list[str] = []
    if missing:
        warnings.append(f"{missing} expected month/category row(s) are absent within observed ranges.")
    if blanks:
        warnings.append(f"{blanks} source row(s) contain blank numeric values.")
    if provisional:
        warnings.append(f"{provisional} observation(s) are provisional and may be revised.")
    if unknown:
        warnings.append(f"{unknown} observation(s) have unknown publication status.")
    if not warnings:
        warnings.append("No gaps, blank values, or non-final publication statuses were detected within the observed ranges.")

    return DataQualityReport(
        dataset_id=series.metadata.dataset_id,
        categories=tuple(category_reports),
        observation_count=len(observations),
        numeric_value_count=len(observations) - blanks,
        blank_value_count=blanks,
        missing_period_count=missing,
        final_count=sum(item.status is ObservationStatus.FINAL for item in observations),
        provisional_count=provisional,
        unknown_count=unknown,
        warnings=tuple(warnings),
    )
