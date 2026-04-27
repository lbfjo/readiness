"""Provider-neutral daily readiness inputs.

The scoring model should not care whether a day came from Coros, Intervals,
or a future source. This module is the narrow adapter from storage rows into
the small normalized shape used by `scoring.score_rows`.
"""

from __future__ import annotations

import json
import statistics
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DailyInput:
    date: str
    hrv: float | None = None
    hrv_baseline: float | None = None
    resting_hr: float | None = None
    sleep_minutes: float | None = None
    awake_minutes: float | None = None
    training_load: float | None = None
    training_load_ratio: float | None = None
    fatigue: float | None = None
    fitness: float | None = None
    form: float | None = None
    energy: int | None = None
    mood: int | None = None
    soreness: int | None = None
    stress: int | None = None
    illness: int | None = None
    notes: str | None = None
    source: str = "unknown"

    def as_scoring_row(self) -> dict[str, Any]:
        """Return the legacy keys expected by the current scoring model."""
        row = asdict(self)
        row.update(
            {
                "avg_sleep_hrv": self.hrv,
                "baseline": self.hrv_baseline,
                "rhr": self.resting_hr,
                "total_duration_minutes": self.sleep_minutes,
                "tired_rate": self.form,
                "ati": self.fatigue,
                "cti": self.fitness,
            }
        )
        return row


def build_daily_inputs(rows: list[Any], baseline_window: int = 14) -> list[DailyInput]:
    raw_rows = [dict(row) for row in rows]
    inputs: list[DailyInput] = []

    for index, row in enumerate(raw_rows):
        hrv = _num(row.get("avg_sleep_hrv"))
        explicit_baseline = _num(row.get("baseline"))
        hrv_baseline = explicit_baseline or _recent_median(
            raw_rows,
            "avg_sleep_hrv",
            index,
            baseline_window,
        )

        fatigue = _num(row.get("ati"))
        fitness = _num(row.get("cti"))
        form = _num(row.get("tired_rate"))
        if form is None and fatigue is not None and fitness is not None:
            form = fatigue - fitness

        load_ratio = _num(row.get("training_load_ratio"))
        if load_ratio is None and fatigue is not None and fitness:
            load_ratio = fatigue / fitness

        inputs.append(
            DailyInput(
                date=str(row["date"]),
                hrv=hrv,
                hrv_baseline=hrv_baseline,
                resting_hr=_num(row.get("rhr")),
                sleep_minutes=_num(row.get("total_duration_minutes")),
                awake_minutes=_num(row.get("awake_minutes")),
                training_load=_num(row.get("training_load")),
                training_load_ratio=load_ratio,
                fatigue=fatigue,
                fitness=fitness,
                form=form,
                energy=_int(row.get("energy")),
                mood=_int(row.get("mood")),
                soreness=_int(row.get("soreness")),
                stress=_int(row.get("stress")),
                illness=_int(row.get("illness")),
                notes=row.get("notes"),
                source=_source_for(row),
            )
        )

    return inputs


def scoring_rows_from_inputs(inputs: list[DailyInput]) -> list[dict[str, Any]]:
    return [item.as_scoring_row() for item in inputs]


def _num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    num = _num(value)
    return int(round(num)) if num is not None else None


def _recent_median(
    rows: list[dict[str, Any]],
    key: str,
    index: int,
    window: int,
) -> float | None:
    values = [
        _num(row.get(key))
        for row in rows[max(0, index - window):index]
        if _num(row.get(key)) is not None
    ]
    if not values:
        return None
    return float(statistics.median(values))


def _source_for(row: dict[str, Any]) -> str:
    raw = row.get("raw_json")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = None
    if isinstance(raw, dict):
        if "atl" in raw or "ctl" in raw or "sleepSecs" in raw:
            return "intervals"
        if "avg_sleep_hrv" in raw or "tired_rate" in raw:
            return "coros"
    return "unknown"
