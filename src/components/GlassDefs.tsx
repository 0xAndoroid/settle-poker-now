import { useMemo } from 'react';
import { getGlassMapDataUrl } from '@/lib/glassMap';

/**
 * Inline SVG defining the liquid-glass displacement filters. Rendered
 * once at the app root; never unmounts.
 *
 * Two filters share one displacement map (a PNG data URL, the only
 * feImage reference form that works cross-browser per Smashing Magazine):
 *   #glass-lens-raised — gentle refraction (scale 5px) for large
 *     text-bearing surfaces (cards, panels).
 *   #glass-lens-float  — stronger refraction (scale 12px) for small
 *     accent controls (buttons, payment-icon deep-link targets).
 *
 * Coordinate system:
 *   - filterUnits="objectBoundingBox": filter region (x/y/w/h on
 *     <filter>) is 0–100% of the element's bounding box.
 *   - primitiveUnits="userSpaceOnUse": feDisplacementMap scale is in
 *     user-space pixels; feImage x/y/width/height percentages resolve
 *     to the filter region (= the element bounds), so the map stretches
 *     to fit each surface and the refraction rim sits at the edge.
 *   - The map is generated once and never mutated, so Safari's
 *     filter-ID cache cannot serve stale output — stable IDs are safe.
 */
export function GlassDefs() {
  const mapUrl = useMemo(() => getGlassMapDataUrl(), []);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <defs>
        <filter
          id="glass-lens-raised"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={mapUrl}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={5}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter
          id="glass-lens-float"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
          primitiveUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={mapUrl}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="map"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={12}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
