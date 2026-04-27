from __future__ import annotations

import json
import unittest

from health_readiness.daily_inputs import build_daily_inputs, scoring_rows_from_inputs


class DailyInputsTest(unittest.TestCase):
    def test_maps_intervals_load_fields_to_scoring_shape(self) -> None:
        inputs = build_daily_inputs(
            [
                {
                    "date": "20260425",
                    "avg_sleep_hrv": None,
                    "baseline": None,
                    "rhr": 58,
                    "total_duration_minutes": 500,
                    "awake_minutes": None,
                    "training_load": 61,
                    "training_load_ratio": None,
                    "tired_rate": None,
                    "ati": 55,
                    "cti": 50,
                    "raw_json": json.dumps({"atl": 55, "ctl": 50, "sleepSecs": 30000}),
                }
            ]
        )

        self.assertEqual(inputs[0].source, "intervals")
        row = scoring_rows_from_inputs(inputs)[0]
        self.assertEqual(row["rhr"], 58)
        self.assertEqual(row["total_duration_minutes"], 500)
        self.assertEqual(row["tired_rate"], 5)
        self.assertEqual(row["training_load_ratio"], 1.1)

    def test_uses_recent_hrv_median_when_provider_baseline_missing(self) -> None:
        inputs = build_daily_inputs(
            [
                {"date": "20260420", "avg_sleep_hrv": 70, "baseline": None},
                {"date": "20260421", "avg_sleep_hrv": 74, "baseline": None},
                {"date": "20260422", "avg_sleep_hrv": 80, "baseline": None},
            ]
        )

        rows = scoring_rows_from_inputs(inputs)
        self.assertIsNone(rows[0]["baseline"])
        self.assertEqual(rows[1]["baseline"], 70)
        self.assertEqual(rows[2]["baseline"], 72)

    def test_explicit_provider_baseline_wins(self) -> None:
        inputs = build_daily_inputs(
            [
                {"date": "20260420", "avg_sleep_hrv": 70, "baseline": None},
                {"date": "20260421", "avg_sleep_hrv": 74, "baseline": 68},
            ]
        )

        self.assertEqual(scoring_rows_from_inputs(inputs)[1]["baseline"], 68)


if __name__ == "__main__":
    unittest.main()
