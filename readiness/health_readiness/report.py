from __future__ import annotations

import html
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from health_readiness import db


def safe(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value))


def fmt_sleep(minutes: Any) -> str:
    if minutes is None:
        return "N/A"
    minutes = int(minutes)
    return f"{minutes // 60}h{minutes % 60:02d}m"


def fmt_number(value: Any, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
    else:
        text = str(value)
    return f"{text}{suffix}"


def fmt_signed(value: Any, suffix: str = "") -> str:
    if value is None:
        return "N/A"
    number = float(value)
    if number.is_integer():
        text = f"{int(number):+d}"
    else:
        text = f"{number:+.1f}".rstrip("0").rstrip(".")
    return f"{text}{suffix}"


def fmt_day(day: str | None) -> str:
    if not day:
        return "N/A"
    try:
        parsed = datetime.strptime(day, "%Y%m%d")
    except ValueError:
        return day
    return parsed.strftime("%a %d %b")


def fmt_delta_label(value: int | float | None, neutral: str = "flat") -> str:
    if value is None:
        return "N/A"
    number = float(value)
    if abs(number) < 0.5:
        return neutral
    if number > 0:
        return f"+{int(round(number))}"
    return str(int(round(number)))


def status_class(status: str) -> str:
    return {
        "high": "high",
        "moderate-high": "good",
        "moderate": "moderate",
        "low": "low",
        "very-low": "very-low",
    }.get(status, "moderate")


def status_color(status: str) -> str:
    return {
        "high": "#69f04a",
        "moderate-high": "#69f04a",
        "moderate": "#f0d552",
        "low": "#ff8a4a",
        "very-low": "#ff5d5d",
    }.get(status, "#f0d552")


def percent(value: int | None) -> str:
    return "N/A" if value is None else f"{int(value)}%"


def ring(label: str, value: int | float | None, accent: str, subtext: str) -> str:
    if value is None:
        score = 0
        center = "N/A"
    else:
        score = max(0, min(100, int(round(float(value)))))
        center = f"{score}%"
    return f"""
    <div class="ring-card">
      <div class="ring" style="--score:{score}; --accent:{accent};">
        <div class="ring-inner">{safe(center)}</div>
      </div>
      <div class="ring-label">{safe(label)}</div>
      <div class="ring-subtext">{safe(subtext)}</div>
    </div>
    """


def section_card(title: str, body: str, tone: str = "") -> str:
    class_name = f"card {tone}".strip()
    return f"""
    <section class="{class_name}">
      <div class="card-header">
        <h2>{safe(title)}</h2>
      </div>
      {body}
    </section>
    """


def metric_row(label: str, value: str, detail: str = "") -> str:
    detail_html = f'<span class="metric-detail">{safe(detail)}</span>' if detail else ""
    return f"""
    <div class="metric-row">
      <span>{safe(label)}</span>
      <strong>{safe(value)}</strong>
      {detail_html}
    </div>
    """


def generate_report(conn, output: Path) -> Path:
    rows = db.readiness_history(conn, limit=30)
    latest = rows[0] if rows else None
    output.parent.mkdir(parents=True, exist_ok=True)

    latest_html = "<section class='empty-state'><p>No readiness scores found.</p></section>"
    if latest:
        latest = dict(latest)
        baselines = db.latest_baselines(conn, latest["date"])
        positives = json.loads(latest["positive_drivers_json"])
        cautions = json.loads(latest["caution_drivers_json"])
        component_scores = json.loads(latest["component_scores_json"])
        planned_sessions = db.planned_sessions_for_day(conn, latest["date"])
        previous = dict(rows[1]) if len(rows) > 1 else None

        score = int(latest["score"])
        recovery_color = status_color(latest["status"])
        sleep_score = component_scores.get("sleep")
        recovery_score = score
        strain_score = component_scores.get("training_load")
        hrv_delta = None
        if latest["avg_sleep_hrv"] is not None and latest["baseline"] is not None:
            hrv_delta = float(latest["avg_sleep_hrv"]) - float(latest["baseline"])
        rhr_delta = None
        if latest["rhr"] is not None and baselines["rhr_median"] is not None:
            rhr_delta = float(latest["rhr"]) - float(baselines["rhr_median"])
        sleep_delta = None
        if latest["total_duration_minutes"] is not None and baselines["sleep_avg"] is not None:
            sleep_delta = float(latest["total_duration_minutes"]) - float(baselines["sleep_avg"])
        score_delta = None
        if previous and previous.get("score") is not None:
            score_delta = int(latest["score"]) - int(previous["score"])

        trend_html = "".join(
            f"""
            <div class="trend-day {'is-today' if index == 0 else ''}">
              <span class="trend-label">{safe(fmt_day(row['date']).split()[0])}</span>
              <div class="trend-bar-wrap">
                <div class="trend-bar {status_class(row['status'])}" style="height:{max(18, int(row['score']))}px;"></div>
              </div>
              <strong>{safe(row['score'])}</strong>
            </div>
            """
            for index, row in enumerate(rows[:5])
        )

        health_items = []
        if hrv_delta is not None:
            health_items.append(("HRV vs base", fmt_signed(hrv_delta, " ms")))
        else:
            health_items.append(("HRV vs base", "N/A"))
        if rhr_delta is not None:
            health_items.append(("Resting HR vs 14d", fmt_signed(rhr_delta, " bpm")))
        else:
            health_items.append(("Resting HR vs 14d", "N/A"))
        if latest["awake_minutes"] is not None:
            health_items.append(("Awake time", fmt_number(latest["awake_minutes"], " min")))
        else:
            health_items.append(("Awake time", "N/A"))
        if latest["strava_count"] is not None:
            health_items.append(("Strava today", f"{fmt_number(latest['strava_count'])} / {fmt_number(latest['strava_km'], ' km')}"))
        else:
            health_items.append(("Strava today", "N/A"))

        planned_html = "".join(
            f"""
            <li>
              <strong>{safe(session["name"])}</strong>
              <span>{safe(session["type"] or "Session")}</span>
              <small>{safe(((session["description"] or "").strip().splitlines() or ["No description"])[0])}</small>
            </li>
            """
            for session in planned_sessions
        ) or """
            <li>
              <strong>No planned session</strong>
              <span>Rest or unstructured day</span>
              <small>No Intervals event stored for this date.</small>
            </li>
        """

        outlook_points = positives + cautions
        if not outlook_points:
            outlook_points = ["No notable readiness drivers were recorded."]

        top_area = f"""
        <section class="day-strip">
          <div class="day-strip-main">
            <span class="day-nav-btn" aria-hidden="true">‹</span>
            <div class="day-pill">
              <small>Today</small>
              <strong>{safe(fmt_day(latest["date"]))}</strong>
            </div>
            <span class="day-nav-btn" aria-hidden="true">›</span>
          </div>
          <div class="day-strip-stats">
            <div class="day-stat">
              <span>Recovery</span>
              <strong>{score}%</strong>
            </div>
            <div class="day-stat">
              <span>vs yesterday</span>
              <strong>{safe(fmt_delta_label(score_delta))}</strong>
            </div>
            <div class="day-stat">
              <span>Planned</span>
              <strong>{fmt_number(latest["planned_count"])}</strong>
            </div>
          </div>
        </section>
        <section class="topbar">
          <div>
            <p class="eyebrow">Today</p>
            <h1>Daily Readiness</h1>
            <p class="headline-copy">{safe(latest["recommendation"])}</p>
          </div>
          <div class="topbar-meta">
            <span class="meta-chip">{safe(latest["date"])}</span>
            <span class="meta-chip {status_class(latest["status"])}">{safe(latest["status"])}</span>
            <span class="meta-chip">Confidence {safe(latest["confidence"])}</span>
            <span class="meta-chip">Model {safe(latest["model_version"])}</span>
          </div>
        </section>
        <section class="trend-strip">
          <div class="trend-strip-head">
            <div>
              <p class="eyebrow">Trend</p>
              <h2>Last 5 Days</h2>
            </div>
            <p>Recovery score trend with today highlighted.</p>
          </div>
          <div class="trend-grid">{trend_html}</div>
        </section>
        <section class="rings-grid">
          {ring("Sleep", sleep_score, "#8ebaff", fmt_sleep(latest["total_duration_minutes"]))}
          {ring("Recovery", recovery_score, recovery_color, safe(latest["status"]))}
          {ring("Strain", strain_score, "#41a3ff", f"Load ratio {fmt_number(latest['training_load_ratio'])}")}
        </section>
        """

        dashboard_cards = "".join([
            section_card(
                "Sleep",
                f"""
                <div class="metrics-stack">
                  {metric_row("Duration", fmt_sleep(latest["total_duration_minutes"]), f"{fmt_signed(sleep_delta, ' min')} vs 14d" if sleep_delta is not None else "No baseline")}
                  {metric_row("Awake", fmt_number(latest["awake_minutes"], " min"))}
                  {metric_row("HRV", fmt_number(latest["avg_sleep_hrv"], " ms"), f"Base {fmt_number(latest['baseline'], ' ms')}")}
                </div>
                """,
            ),
            section_card(
                "Recovery",
                f"""
                <div class="score-band">
                  <strong>{score}/100</strong>
                  <span>{safe(latest["recommendation"])}</span>
                </div>
                <div class="metrics-stack">
                  {metric_row("Status", safe(latest["status"]))}
                  {metric_row("Confidence", safe(latest["confidence"]))}
                  {metric_row("Positive drivers", str(len(positives)))}
                </div>
                """,
                tone=status_class(latest["status"]),
            ),
            section_card(
                "Strain",
                f"""
                <div class="metrics-stack">
                  {metric_row("Training load", fmt_number(latest["training_load"]))}
                  {metric_row("Load ratio", fmt_number(latest["training_load_ratio"]))}
                  {metric_row("Tired rate", fmt_number(latest["tired_rate"]))}
                </div>
                """,
            ),
            section_card(
                "Health Monitor",
                '<div class="metrics-stack">' + "".join(metric_row(label, value) for label, value in health_items) + "</div>",
            ),
            section_card(
                "Planned Today",
                f"""
                <div class="plan-count">{fmt_number(latest["planned_count"])} session{'s' if (latest['planned_count'] or 0) != 1 else ''}</div>
                <ul class="planned-list">{planned_html}</ul>
                """,
            ),
            section_card(
                "Daily Outlook",
                f"""
                <ul class="outlook-list">
                  {''.join(f'<li>{safe(item)}</li>' for item in outlook_points)}
                </ul>
                """,
            ),
        ])

        latest_html = top_area + f'<section class="dashboard-grid">{dashboard_cards}</section>'

    table_rows = "\n".join(
        f"""
        <tr>
          <td>{safe(row["date"])}</td>
          <td><strong>{safe(row["score"])}</strong></td>
          <td><span class="pill {status_class(row["status"])}">{safe(row["status"])}</span></td>
          <td>{safe(row["avg_sleep_hrv"])}</td>
          <td>{safe(row["baseline"])}</td>
          <td>{safe(row["rhr"])}</td>
          <td>{fmt_sleep(row["total_duration_minutes"])}</td>
          <td>{safe(row["strava_count"])}</td>
          <td>{safe(row["strava_km"])}</td>
          <td>{safe(row["planned_count"])}</td>
          <td>{safe(row["training_load_ratio"])}</td>
          <td>{safe(row["tired_rate"])}</td>
        </tr>
        """
        for row in rows
    )

    output.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Readiness Dashboard</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111418;
      --panel: #1d2128;
      --panel-2: #252a33;
      --panel-3: #2d333d;
      --line: #343b47;
      --ink: #f5f7fb;
      --muted: #9fa8b6;
      --green: #69f04a;
      --blue: #53a5ff;
      --sleep: #8ebaff;
      --yellow: #f0d552;
      --orange: #ff8a4a;
      --red: #ff5d5d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top center, rgba(83, 165, 255, 0.08), transparent 26%),
        linear-gradient(180deg, #151920 0%, var(--bg) 100%);
      color: var(--ink);
    }}
    main {{
      width: min(1180px, calc(100vw - 28px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }}
    h1, h2, p {{
      margin: 0;
    }}
    .eyebrow {{
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
      margin-bottom: 8px;
    }}
    h1 {{
      font-size: clamp(30px, 5vw, 54px);
      line-height: 1;
    }}
    h2 {{
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .headline-copy {{
      margin-top: 12px;
      color: #d9e0ea;
      font-size: 16px;
      line-height: 1.45;
      max-width: 720px;
    }}
    .day-strip,
    .trend-strip {{
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
    }}
    .day-strip {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 14px 16px;
      margin-bottom: 16px;
    }}
    .day-strip-main,
    .day-strip-stats {{
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .day-nav-btn,
    .day-pill,
    .day-stat {{
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
    }}
    .day-nav-btn {{
      width: 38px;
      height: 38px;
      display: inline-grid;
      place-items: center;
      color: #dfe5ee;
      font-size: 24px;
      line-height: 1;
    }}
    .day-pill {{
      min-width: 170px;
      padding: 8px 14px;
      text-align: center;
    }}
    .day-pill small,
    .day-stat span {{
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .day-pill strong,
    .day-stat strong {{
      display: block;
      margin-top: 3px;
      font-size: 18px;
      font-weight: 800;
      color: var(--ink);
    }}
    .day-stat {{
      min-width: 104px;
      padding: 8px 12px;
      text-align: center;
    }}
    .topbar {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 22px;
    }}
    .trend-strip {{
      padding: 16px;
      margin-bottom: 18px;
    }}
    .trend-strip-head {{
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }}
    .trend-strip-head p {{
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }}
    .trend-grid {{
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      align-items: end;
    }}
    .trend-day {{
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 10px 8px;
      background: rgba(255, 255, 255, 0.02);
      text-align: center;
    }}
    .trend-day.is-today {{
      border-color: rgba(83, 165, 255, 0.45);
      background: rgba(83, 165, 255, 0.08);
    }}
    .trend-label {{
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .trend-bar-wrap {{
      height: 96px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      margin-bottom: 8px;
    }}
    .trend-bar {{
      width: 24px;
      min-height: 18px;
      border-radius: 6px 6px 4px 4px;
      background: var(--yellow);
    }}
    .trend-bar.high,
    .trend-bar.good {{
      background: var(--green);
    }}
    .trend-bar.moderate {{
      background: var(--yellow);
    }}
    .trend-bar.low {{
      background: var(--orange);
    }}
    .trend-bar.very-low {{
      background: var(--red);
    }}
    .trend-day strong {{
      font-size: 14px;
    }}
    .topbar-meta {{
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }}
    .meta-chip, .pill {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }}
    .pill {{
      padding: 6px 10px;
      background: transparent;
    }}
    .high, .good {{
      color: var(--green);
      border-color: rgba(105, 240, 74, 0.35);
    }}
    .moderate {{
      color: var(--yellow);
      border-color: rgba(240, 213, 82, 0.35);
    }}
    .low {{
      color: var(--orange);
      border-color: rgba(255, 138, 74, 0.35);
    }}
    .very-low {{
      color: var(--red);
      border-color: rgba(255, 93, 93, 0.35);
    }}
    .rings-grid {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 18px;
    }}
    .ring-card, .card, .history-card, .empty-state {{
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.24);
    }}
    .ring-card {{
      padding: 22px 18px 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      min-height: 260px;
      justify-content: center;
    }}
    .ring {{
      width: min(210px, 42vw);
      aspect-ratio: 1;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle, #161a21 0 62%, transparent 63%),
        conic-gradient(var(--accent) calc(var(--score) * 1%), #3a404c 0);
    }}
    .ring-inner {{
      width: 70%;
      aspect-ratio: 1;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: #171b22;
      border: 1px solid var(--line);
      font-size: 40px;
      font-weight: 800;
    }}
    .ring-label {{
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }}
    .ring-subtext {{
      color: var(--muted);
      font-size: 13px;
      text-align: center;
    }}
    .dashboard-grid {{
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }}
    .card {{
      padding: 18px;
      min-height: 220px;
    }}
    .card-header {{
      margin-bottom: 14px;
    }}
    .metrics-stack {{
      display: grid;
      gap: 12px;
    }}
    .metric-row {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 10px;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }}
    .metric-row:last-child {{
      border-bottom: 0;
    }}
    .metric-row span {{
      color: var(--muted);
      font-size: 13px;
    }}
    .metric-row strong {{
      font-size: 16px;
      font-weight: 800;
      text-align: right;
    }}
    .metric-detail {{
      grid-column: 1 / -1;
      color: #c7d0db;
      font-size: 12px;
    }}
    .score-band {{
      padding: 14px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      margin-bottom: 10px;
    }}
    .score-band strong {{
      display: block;
      font-size: 30px;
      margin-bottom: 6px;
    }}
    .score-band span {{
      color: #d9e0ea;
      line-height: 1.45;
      font-size: 14px;
    }}
    .plan-count {{
      margin-bottom: 14px;
      color: #d9e0ea;
      font-size: 16px;
      font-weight: 700;
    }}
    .planned-list, .outlook-list {{
      margin: 0;
      padding-left: 18px;
      color: #dde5ef;
    }}
    .planned-list {{
      list-style: none;
      padding-left: 0;
    }}
    .planned-list li {{
      padding: 12px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }}
    .planned-list li:last-child {{
      border-bottom: 0;
    }}
    .planned-list strong, .planned-list span, .planned-list small {{
      display: block;
    }}
    .planned-list span, .planned-list small {{
      color: var(--muted);
      margin-top: 4px;
      line-height: 1.45;
    }}
    .outlook-list li {{
      margin: 10px 0;
      line-height: 1.45;
    }}
    .history-card {{
      padding: 18px;
    }}
    .history-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }}
    .history-head p {{
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }}
    table {{
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
    }}
    th, td {{
      text-align: left;
      padding: 14px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      white-space: nowrap;
    }}
    th {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      background: rgba(255, 255, 255, 0.02);
    }}
    tbody tr:hover {{
      background: rgba(255, 255, 255, 0.03);
    }}
    tbody tr:last-child td {{
      border-bottom: 0;
    }}
    .table-wrap {{
      overflow-x: auto;
    }}
    .empty-state {{
      padding: 24px;
    }}
    @media (max-width: 900px) {{
      .rings-grid,
      .dashboard-grid {{
        grid-template-columns: 1fr;
      }}
      .trend-grid {{
        grid-template-columns: repeat(5, minmax(52px, 1fr));
        overflow-x: auto;
      }}
      .day-strip,
      .topbar {{
        flex-direction: column;
      }}
      .trend-strip-head,
      .day-strip-stats {{
        align-items: flex-start;
      }}
      .topbar-meta {{
        justify-content: flex-start;
      }}
    }}
  </style>
</head>
<body>
  <main>
    {latest_html}
    <section class="history-card">
      <div class="history-head">
        <div>
          <p class="eyebrow">History</p>
          <h2>Recent Readiness</h2>
        </div>
        <p>Last 30 scored days with Coros, sleep, Strava, and planned-session context.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Score</th>
              <th>Status</th>
              <th>HRV</th>
              <th>HRV base</th>
              <th>RHR</th>
              <th>Sleep</th>
              <th>Strava</th>
              <th>Strava km</th>
              <th>Plan</th>
              <th>Load ratio</th>
              <th>Tired</th>
            </tr>
          </thead>
          <tbody>{table_rows}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>
""",
        encoding="utf-8",
    )
    return output
