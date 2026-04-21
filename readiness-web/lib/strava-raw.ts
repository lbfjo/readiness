/**
 * Best-effort typings for fields that appear on Strava activity payloads. The
 * sync stores the **list** endpoint response — detailed lap splits and streams
 * are usually absent until we call the single-activity endpoint in a future
 * enhancement.
 */
export type StravaSplit = {
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  elevation_difference?: number;
  average_speed?: number;
  average_heartrate?: number;
  split?: number;
};

export type StravaActivityRaw = {
  id?: number;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  start_date_local?: string;
  map?: { summary_polyline?: string; id?: string };
  kilojoules?: number;
  device_name?: string;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  private?: boolean;
  max_speed?: number;
  kudos_count?: number;
  comment_count?: number;
  athlete_pr_count?: number;
  achievement_count?: number;
  splits_metric?: StravaSplit[];
  splits_standard?: StravaSplit[];
  laps?: unknown[];
  has_heartrate?: boolean;
  [key: string]: unknown;
};

export function parseStravaActivityRaw(rawJson: unknown): StravaActivityRaw {
  if (rawJson && typeof rawJson === "object") {
    return rawJson as StravaActivityRaw;
  }
  return {};
}
