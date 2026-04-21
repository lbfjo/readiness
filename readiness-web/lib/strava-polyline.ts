/**
 * Decode a Google-encoded polyline (Strava `map.summary_polyline`) into
 * lat/lng pairs. Coordinate order is `[lat, lng]`.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = encoded.length;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}

type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

function boundsFor(coords: [number, number][]): Bounds | null {
  if (coords.length === 0) return null;
  let minLat = coords[0][0];
  let maxLat = coords[0][0];
  let minLng = coords[0][1];
  let maxLng = coords[0][1];
  for (const [lat, lng] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Project coordinates into [0, viewW] × [0, viewH] with padding. Y is flipped
 * so north is up in SVG coordinates.
 */
export function projectToSvgPath(
  coords: [number, number][],
  viewW: number,
  viewH: number,
  padding = 4,
): string {
  const b = boundsFor(coords);
  if (!b || coords.length === 0) return "";

  const spanLat = Math.max(1e-9, b.maxLat - b.minLat);
  const spanLng = Math.max(1e-9, b.maxLng - b.minLng);
  const innerW = viewW - padding * 2;
  const innerH = viewH - padding * 2;

  const toX = (lng: number) => padding + ((lng - b.minLng) / spanLng) * innerW;
  const toY = (lat: number) => padding + innerH - ((lat - b.minLat) / spanLat) * innerH;

  const first = coords[0];
  const parts = [`M ${toX(first[1]).toFixed(2)} ${toY(first[0]).toFixed(2)}`];
  for (let i = 1; i < coords.length; i += 1) {
    const [lat, lng] = coords[i];
    parts.push(`L ${toX(lng).toFixed(2)} ${toY(lat).toFixed(2)}`);
  }
  return parts.join(" ");
}
