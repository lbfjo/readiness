from __future__ import annotations

import json
import statistics
from typing import Any


MODEL_VERSION = "v2"


def clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def recent_median(rows: list[dict[str, Any]], key: str, index: int, window: int = 14) -> float | None:
    values = [
        num(row.get(key))
        for row in rows[max(0, index - window):index]
        if num(row.get(key)) is not None
    ]
    if not values:
        values = [
            num(row.get(key))
            for row in rows[: index + 1]
            if num(row.get(key)) is not None
        ]
    if not values:
        return None
    return float(statistics.median(values))


def status_for_score(score: int) -> str:
    if score >= 85:
        return "high"
    if score >= 70:
        return "moderate-high"
    if score >= 55:
        return "moderate"
    if score >= 40:
        return "low"
    return "very-low"


def recommendation_for(score: int, caution_drivers: list[str]) -> str:
    joined = " ".join(caution_drivers).lower()
    if score >= 85:
        return "Hard training is reasonable if the plan calls for it."
    if score >= 70:
        if "resting hr" in joined:
            return "Normal training is reasonable; avoid forcing intensity if fatigue feels high."
        return "Normal training is reasonable."
    if score >= 55:
        return "Prefer easy aerobic work, technique, or strength maintenance."
    if score >= 40:
        return "Keep training light and prioritize recovery."
    return "Rest or active recovery is the better choice today."


def confidence_for(component_count: int, has_sleep: bool, has_hrv: bool) -> str:
    if component_count >= 4 and has_sleep and has_hrv:
        return "high"
    if component_count >= 3:
        return "medium"
    return "low"


def score_rows(sqlite_rows: list[Any]) -> list[dict[str, Any]]:
    rows = [dict(row) for row in sqlite_rows]
    scored = []

    for index, row in enumerate(rows):
        component_scores: dict[str, int] = {}
        positive: list[str] = []
        caution: list[str] = []

        hrv = num(row.get("avg_sleep_hrv"))
        hrv_baseline = num(row.get("baseline"))
        if hrv is not None and hrv_baseline and hrv_baseline > 0:
            delta_pct = (hrv - hrv_baseline) / hrv_baseline
            score = int(round(clamp(50 + (delta_pct * 250))))
            component_scores["hrv"] = score
            if delta_pct >= 0.08:
                positive.append(f"HRV is {round(delta_pct * 100)}% above baseline.")
            elif delta_pct <= -0.08:
                caution.append(f"HRV is {abs(round(delta_pct * 100))}% below baseline.")

        rhr = num(row.get("rhr"))
        rhr_baseline = recent_median(rows, "rhr", index)
        if rhr is not None and rhr_baseline is not None:
            diff = rhr - rhr_baseline
            score = int(round(clamp(72 - (diff * 4), 25, 95)))
            component_scores["resting_hr"] = score
            if diff <= -4:
                positive.append(f"Resting HR is {abs(round(diff))} bpm below recent baseline.")
            elif diff >= 5:
                caution.append(f"Resting HR is {round(diff)} bpm above recent baseline.")

        sleep_minutes = num(row.get("total_duration_minutes"))
        awake_minutes = num(row.get("awake_minutes")) or 0
        if sleep_minutes is not None and sleep_minutes > 0:
            duration_score = 95 if sleep_minutes >= 480 else (sleep_minutes / 480) * 85
            awake_penalty = max(0, awake_minutes - 30) * 0.8
            score = int(round(clamp(duration_score - awake_penalty)))
            component_scores["sleep"] = score
            if sleep_minutes >= 480 and awake_minutes <= 20:
                positive.append("Sleep duration and continuity were strong.")
            elif sleep_minutes < 390:
                caution.append(f"Sleep was short at {round(sleep_minutes / 60, 1)} hours.")
            elif awake_minutes > 45:
                caution.append(f"Awake time was elevated at {round(awake_minutes)} minutes.")

        load_ratio = num(row.get("training_load_ratio"))
        tired_rate = num(row.get("tired_rate"))
        if load_ratio is not None or tired_rate is not None:
            score = 78.0
            if load_ratio is not None:
                if load_ratio > 1.0:
                    score -= (load_ratio - 1.0) * 70
                elif load_ratio < 0.7:
                    score -= (0.7 - load_ratio) * 20
                else:
                    score += 5
            if tired_rate is not None:
                if tired_rate > 0:
                    score -= tired_rate * 0.45
                else:
                    score += min(10, abs(tired_rate) * 0.25)
            component_scores["training_load"] = int(round(clamp(score)))
            if load_ratio is not None and load_ratio > 1.35:
                caution.append(f"Training load ratio is high at {load_ratio:.2f}.")
            elif tired_rate is not None and tired_rate >= 40:
                caution.append(f"Tired rate is elevated at {round(tired_rate)}.")
            elif load_ratio is not None and tired_rate is not None and load_ratio <= 1.0 and tired_rate <= 0:
                positive.append("Training load is controlled today.")

        subjective = subjective_score(row)
        if subjective is not None:
            component_scores["subjective"] = subjective
            if subjective >= 80:
                positive.append("Subjective check-in is positive.")
            elif subjective <= 45:
                caution.append("Subjective check-in suggests fatigue or stress.")

        weights = {
            "hrv": 0.30,
            "resting_hr": 0.20,
            "sleep": 0.20,
            "training_load": 0.20,
            "subjective": 0.10,
        }
        active_weight = sum(weights[name] for name in component_scores)
        if active_weight == 0:
            final_score = 0
        else:
            weighted = sum(component_scores[name] * weights[name] for name in component_scores)
            final_score = int(round(weighted / active_weight))

        status = status_for_score(final_score)
        scored.append({
            "date": row["date"],
            "model_version": MODEL_VERSION,
            "score": final_score,
            "status": status,
            "recommendation": recommendation_for(final_score, caution),
            "confidence": confidence_for(
                len(component_scores),
                "sleep" in component_scores,
                "hrv" in component_scores,
            ),
            "component_scores": component_scores,
            "positive_drivers": positive[:4],
            "caution_drivers": caution[:4],
        })

    return scored


def subjective_score(row: dict[str, Any]) -> int | None:
    values = {
        "energy": num(row.get("energy")),
        "mood": num(row.get("mood")),
        "soreness": num(row.get("soreness")),
        "stress": num(row.get("stress")),
        "illness": num(row.get("illness")),
    }
    if all(value is None for value in values.values()):
        return None

    score = 70.0
    if values["energy"] is not None:
        score += (values["energy"] - 3) * 8
    if values["mood"] is not None:
        score += (values["mood"] - 3) * 5
    if values["soreness"] is not None:
        score -= (values["soreness"] - 3) * 7
    if values["stress"] is not None:
        score -= (values["stress"] - 3) * 6
    if values["illness"]:
        score -= 35
    return int(round(clamp(score)))


def decode_json_list(value: str) -> list[str]:
    parsed = json.loads(value)
    return parsed if isinstance(parsed, list) else []
