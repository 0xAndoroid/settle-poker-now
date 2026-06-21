/**
 * Liquid-glass displacement-map generator.
 *
 * Produces a 128×128 PNG data URL encoding a rounded-rect refraction
 * lens. Red channel = horizontal displacement, green = vertical.
 * Neutral mid-gray (128) = no displacement. The rim ramps the channels
 * inward, producing edge refraction ("fish-eye at the edge") while the
 * interior stays undistorted for legibility.
 *
 * The field is computed for the top-left quadrant and mirrored to the
 * other three with sign-flips on the displacement components —
 * four-fold symmetry quarters the per-pixel cost.
 *
 * The map is generated once and cached. It never needs regeneration
 * because the map is resolution-independent (stretched to each
 * element's bounding box via feImage preserveAspectRatio="none").
 */

const MAP_SIZE = 128;
const CENTER = (MAP_SIZE - 1) / 2;
const LENS_W = CENTER;
const LENS_H = CENTER;
const CORNER_R = 12;
const DEPTH = 10;
const MAGNITUDE = 0.9;

let cachedDataUrl: string | null = null;

function roundedRectSdf(px: number, py: number): number {
  const qx = Math.abs(px - CENTER) - (LENS_W - CORNER_R);
  const qy = Math.abs(py - CENTER) - (LENS_H - CORNER_R);
  const outside = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) - CORNER_R;
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside;
}

export function getGlassMapDataUrl(): string {
  if (cachedDataUrl) return cachedDataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.createImageData(MAP_SIZE, MAP_SIZE);
  const data = imageData.data;

  for (let py = 0; py < MAP_SIZE; py++) {
    for (let px = 0; px < MAP_SIZE; px++) {
      const qpx = px <= CENTER ? px : MAP_SIZE - 1 - px;
      const qpy = py <= CENTER ? py : MAP_SIZE - 1 - py;

      const sdf = roundedRectSdf(qpx, qpy);

      let dx = 0;
      let dy = 0;

      if (sdf < 0 && sdf > -DEPTH) {
        const sdfX = roundedRectSdf(qpx + 1, qpy) - sdf;
        const sdfY = roundedRectSdf(qpx, qpy + 1) - sdf;
        const len = Math.hypot(sdfX, sdfY);
        if (len > 0) {
          const fade = 1 - Math.abs(sdf) / DEPTH;
          // SDF gradient points toward the shape interior (toward
          // center). Displacement along the gradient pulls edge
          // content inward, creating the magnifying "fish-eye" rim.
          dx = (sdfX / len) * fade * MAGNITUDE;
          dy = (sdfY / len) * fade * MAGNITUDE;
        }
      }

      const xSign = px <= CENTER ? 1 : -1;
      const ySign = py <= CENTER ? 1 : -1;

      const idx = (py * MAP_SIZE + px) * 4;
      data[idx] = Math.round(128 + dx * xSign * 127);
      data[idx + 1] = Math.round(128 + dy * ySign * 127);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  cachedDataUrl = canvas.toDataURL('image/png');
  return cachedDataUrl;
}
