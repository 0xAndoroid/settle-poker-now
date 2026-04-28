/**
 * GET /og/:id.png
 *
 * Renders a 1200×630 PNG preview of a persistent game's settlement plan
 * for chat-app unfurls. Path C (per the brief): hand-written SVG → PNG
 * via @resvg/resvg-wasm. No satori, no DOM tree quirks — just an SVG
 * string with `<text>` elements, fed through a WASM rasterizer.
 *
 * Caching: the OG response is keyed in `caches.default` by the full URL
 * including `?v=<updated_at>`, so the middleware's cache-bust query
 * parameter forces a fresh render whenever the snapshot changes.
 *
 * Font: JetBrains Mono Regular, fetched from the static-asset binding
 * once per cold start and cached in module scope.
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm';
// @ts-expect-error — wrangler/Pages bundles `.wasm` imports as
// WebAssembly.Module objects at runtime; the type isn't shipped.
import resvgWasm from '../../node_modules/@resvg/resvg-wasm/index_bg.wasm';
import { loadGame, type DbGameSnapshot } from '../lib/db';
import { CORS_HEADERS, errorResponse } from '../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const W = 1200;
const H = 630;
const ID_PATTERN = /^[0-9a-z]{6,16}$/i;
const MAX_DISPLAYED_PAYMENTS = 5;
const FONT_PATH = '/og/JetBrainsMono-Regular.ttf';

let resvgInitialized: Promise<void> | null = null;
let cachedFontBytes: Uint8Array | null = null;

async function ensureResvgInitialized(): Promise<void> {
  if (resvgInitialized === null) {
    resvgInitialized = initWasm(resvgWasm as WebAssembly.Module);
  }
  await resvgInitialized;
}

async function loadFontBytes(assets: Fetcher, request: Request): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  const fontUrl = new URL(FONT_PATH, request.url);
  const res = await assets.fetch(fontUrl);
  if (!res.ok) {
    throw new Error(`Font fetch failed: HTTP ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  cachedFontBytes = new Uint8Array(buffer);
  return cachedFontBytes;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = (ctx.params.id as string | undefined)?.trim() ?? '';
  if (!ID_PATTERN.test(id)) {
    return errorResponse(400, 'Invalid game id.');
  }

  const cache = caches.default;
  const cacheKey = new Request(ctx.request.url, ctx.request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const snapshot = await loadGame(ctx.env.DB, id);
  if (!snapshot) {
    return errorResponse(404, `No persistent game with id "${id}".`);
  }

  let pngBytes: Uint8Array;
  try {
    await ensureResvgInitialized();
    const fontBytes = await loadFontBytes(ctx.env.ASSETS, ctx.request);
    const svg = renderSvg(snapshot);
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [fontBytes],
        defaultFontFamily: 'JetBrains Mono',
        loadSystemFonts: false,
      },
      fitTo: { mode: 'width', value: W },
      background: '#0a0a0c',
    });
    pngBytes = resvg.render().asPng();
  } catch (err) {
    return errorResponse(500, `OG render failed: ${(err as Error).message}`);
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v as string);
  headers.set('Content-Type', 'image/png');
  headers.set('Content-Length', String(pngBytes.byteLength));
  headers.set(
    'Cache-Control',
    'public, max-age=300, s-maxage=86400, immutable'
  );

  // Slice into a fresh ArrayBuffer so the Response body is a clean Uint8Array.
  const body = new Uint8Array(pngBytes);
  const response = new Response(body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};

/* ──────── SVG template ──────── */

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatUSD(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function renderSvg(snap: DbGameSnapshot): string {
  const { game, players, payments } = snap;
  const totalMoved = payments.reduce((acc, p) => acc + p.amountCents, 0);
  const settled = payments.filter((p) => p.completedAt !== null).length;
  const outstanding = payments.length - settled;
  const allSettled = outstanding === 0 && payments.length > 0;

  const nameById = new Map(players.map((p) => [p.playerId, p.nickname]));

  // Pick top winner / top loser for the spotlight rows.
  const sortedByNet = players.slice().sort((a, b) => b.netCents - a.netCents);
  const topWinner = sortedByNet.find((p) => p.netCents > 0);
  const topLoser = sortedByNet.slice().reverse().find((p) => p.netCents < 0);

  const visiblePayments = payments.slice(0, MAX_DISPLAYED_PAYMENTS);
  const overflow = payments.length - visiblePayments.length;

  const date = game.startedAt
    ? new Date(game.startedAt)
        .toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        .toLowerCase()
    : '';

  const accent = allSettled ? '#00d4a8' : '#d946ef';
  const headlineText = allSettled
    ? `Settled · ${players.length} players · ${formatUSD(totalMoved)} moved`
    : `Settlement · ${players.length} players · ${payments.length} payments`;
  const subtext = allSettled
    ? `All settled · ${date || 'recent game'}`
    : `${settled}/${payments.length} settled · ${formatUSD(totalMoved)} moved${date ? ` · ${date}` : ''}`;

  // Layout constants (px, in SVG userSpace units).
  const PAD_X = 64;
  const PAD_TOP = 56;
  const ROW_Y0 = 360;
  const ROW_DY = 44;

  const paymentLines = visiblePayments
    .map((p, i) => {
      const from = truncate(escapeXml(nameById.get(p.fromPlayerId) ?? p.fromPlayerId), 14);
      const to = truncate(escapeXml(nameById.get(p.toPlayerId) ?? p.toPlayerId), 14);
      const amount = formatUSD(p.amountCents);
      const completed = p.completedAt !== null;
      const fromColor = completed ? '#5a5a6c' : '#ff3645';
      const toColor = completed ? '#5a5a6c' : '#00d4a8';
      const amountColor = completed ? '#5a5a6c' : '#ededf2';
      const numColor = '#5a5a6c';
      const checkmark = completed ? '✓' : ' ';
      const y = ROW_Y0 + i * ROW_DY;

      return [
        `<text x="${PAD_X}" y="${y}" font-family="JetBrains Mono" font-size="20" font-weight="700" fill="${numColor}">${String(
          i + 1
        ).padStart(2, '0')}</text>`,
        `<text x="${PAD_X + 44}" y="${y}" font-family="JetBrains Mono" font-size="22" font-weight="700" fill="${accent}">${checkmark}</text>`,
        `<text x="${PAD_X + 80}" y="${y}" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${fromColor}">${from}</text>`,
        `<text x="${PAD_X + 80 + (from.length + 1) * 14.5}" y="${y}" font-family="JetBrains Mono" font-size="26" fill="#5a5a6c">↦</text>`,
        `<text x="${PAD_X + 80 + (from.length + 3) * 14.5}" y="${y}" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${toColor}">${to}</text>`,
        `<text x="${W - PAD_X}" y="${y}" font-family="JetBrains Mono" font-size="26" font-weight="700" fill="${amountColor}" text-anchor="end">${amount}</text>`,
      ].join('');
    })
    .join('');

  const overflowLine =
    overflow > 0
      ? `<text x="${PAD_X}" y="${ROW_Y0 + visiblePayments.length * ROW_DY + 24}" font-family="JetBrains Mono" font-size="18" fill="#5a5a6c">+${overflow} more payment${overflow === 1 ? '' : 's'}</text>`
      : '';

  const emptyMessage =
    payments.length === 0
      ? `<text x="${W / 2}" y="${ROW_Y0 + 60}" font-family="JetBrains Mono" font-size="32" font-weight="700" fill="#9595a8" text-anchor="middle">already settled.</text>`
      : '';

  // Spotlight row at the bottom: top winner / top loser.
  const spotlight = [];
  if (topWinner) {
    spotlight.push(
      `<text x="${PAD_X}" y="${H - 96}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#9595a8">TOP WINNER</text>`,
      `<text x="${PAD_X}" y="${H - 70}" font-family="JetBrains Mono" font-size="22" font-weight="700" fill="#00d4a8">${escapeXml(topWinner.nickname)}  +${formatUSD(topWinner.netCents).replace('$', '$')}</text>`
    );
  }
  if (topLoser) {
    spotlight.push(
      `<text x="${W / 2 + 40}" y="${H - 96}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#9595a8">TOP LOSER</text>`,
      `<text x="${W / 2 + 40}" y="${H - 70}" font-family="JetBrains Mono" font-size="22" font-weight="700" fill="#ff3645">${escapeXml(topLoser.nickname)}  ${formatUSD(topLoser.netCents)}</text>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#1f1f2a" />
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#0a0a0c" />
  <rect width="${W}" height="${H}" fill="url(#dots)" />

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${W}" height="6" fill="${accent}" />

  <!-- Brand -->
  <text x="${PAD_X}" y="${PAD_TOP + 36}" font-family="JetBrains Mono" font-size="34" font-weight="800" fill="#ededf2">settle.andrew.ee</text>
  <text x="${PAD_X}" y="${PAD_TOP + 64}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#9595a8" letter-spacing="2">POKER NIGHT SETTLEMENT</text>

  <!-- Status pill (top right) -->
  <rect x="${W - PAD_X - 220}" y="${PAD_TOP + 8}" width="220" height="48" fill="${accent}" fill-opacity="0.12" stroke="${accent}" stroke-opacity="0.45" />
  <circle cx="${W - PAD_X - 198}" cy="${PAD_TOP + 32}" r="5" fill="${accent}" />
  <text x="${W - PAD_X - 184}" y="${PAD_TOP + 38}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="${accent}" letter-spacing="2">${
    allSettled ? 'ALL SETTLED' : `${settled}/${payments.length} SETTLED`
  }</text>

  <!-- Headline -->
  <text x="${PAD_X}" y="${PAD_TOP + 156}" font-family="JetBrains Mono" font-size="44" font-weight="800" fill="#ededf2">${escapeXml(headlineText)}</text>
  <text x="${PAD_X}" y="${PAD_TOP + 200}" font-family="JetBrains Mono" font-size="22" font-weight="700" fill="#9595a8">${escapeXml(subtext)}</text>

  <!-- Divider -->
  <line x1="${PAD_X}" y1="${ROW_Y0 - 50}" x2="${W - PAD_X}" y2="${ROW_Y0 - 50}" stroke="#25252f" stroke-width="1" />
  <text x="${PAD_X}" y="${ROW_Y0 - 22}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#9595a8" letter-spacing="2">PAYMENTS DUE</text>

  <!-- Payment rows -->
  ${paymentLines}
  ${overflowLine}
  ${emptyMessage}

  <!-- Spotlight -->
  <line x1="${PAD_X}" y1="${H - 130}" x2="${W - PAD_X}" y2="${H - 130}" stroke="#25252f" stroke-width="1" />
  ${spotlight.join('')}

  <!-- Footer -->
  <text x="${PAD_X}" y="${H - 28}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="#5a5a6c" letter-spacing="2">SETTLE.ANDREW.EE/G/${escapeXml(game.id.toUpperCase())}</text>
  <text x="${W - PAD_X}" y="${H - 28}" font-family="JetBrains Mono" font-size="14" font-weight="700" fill="${accent}" letter-spacing="2" text-anchor="end">● LIVE</text>
</svg>`;
}
