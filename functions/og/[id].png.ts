/**
 * GET /og/:id.png
 *
 * Renders a 1200×630 PNG preview of a persistent game's settlement plan
 * for chat-app unfurls. Hand-written SVG rasterized via
 * @resvg/resvg-wasm. JetBrains Mono throughout.
 *
 * Layout — by user request, the OG strips ALL chrome (no header, no
 * brand wordmark, no spotlight) and lets the ledger rows breathe:
 *   - ≤ 8 payments  → single centered column, generous vertical spacing
 *   - 9-15 payments → two columns side by side, slightly tighter dy
 * A faint "settle.andrew.ee" tag sits in the bottom-right corner. That
 * is the only thing on the canvas besides payments.
 *
 * Caching: keyed in `caches.default` by the full URL including
 * `?v=<updated_at>`, so middleware's cache-bust query parameter forces
 * a fresh render whenever the snapshot changes.
 *
 * Font: JetBrains Mono Regular, fetched from the static-asset binding
 * once per cold start and cached in module scope.
 */

import { initWasm, Resvg } from '@resvg/resvg-wasm';
// @ts-expect-error — wrangler/Pages bundles `.wasm` imports as
// WebAssembly.Module objects at runtime; the type isn't shipped.
import resvgWasm from '../../node_modules/@resvg/resvg-wasm/index_bg.wasm';
import { orderPaymentsBySenderTotal } from '../../src/lib/paymentOrdering';
import { loadGame, type DbGameSnapshot, type DbPayment } from '../lib/db';
import { CORS_HEADERS, errorResponse } from '../lib/responses';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const W = 1200;
const H = 630;
const ID_PATTERN = /^[0-9a-z]{6,16}$/i;
const MAX_DISPLAYED_PAYMENTS = 15;
const SINGLE_COLUMN_LIMIT = 8;
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

  // Debug knob — `?fakeN=15` swaps the snapshot's payments for N
  // synthetic ones so we can verify the two-column layout visually
  // before any real 15-payment game exists. Bypasses the cache check
  // above (the URL changes with the query param) so re-renders
  // freshly each time. NOT a security concern: read-only, idempotent,
  // and the synthetic payments don't touch D1.
  const fakeN = parseInt(
    new URL(ctx.request.url).searchParams.get('fakeN') ?? '0',
    10
  );
  const renderable = fakeN > 0 ? withSyntheticPayments(snapshot, fakeN) : snapshot;

  let pngBytes: Uint8Array;
  try {
    await ensureResvgInitialized();
    const fontBytes = await loadFontBytes(ctx.env.ASSETS, ctx.request);
    const svg = renderSvg(renderable);
    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [fontBytes],
        defaultFontFamily: 'JetBrains Mono',
        loadSystemFonts: false,
      },
      fitTo: { mode: 'width', value: W },
      background: '#0d0f16',
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

interface ColumnLayout {
  /** Left edge x in user units. */
  x: number;
  /** Width of the column. */
  width: number;
  /** First row's baseline y. */
  y0: number;
  /** Vertical step between rows. */
  dy: number;
  /** Font size for nicknames + arrow + amount. */
  fontSize: number;
  /** Max nickname char count (used for column anchoring). */
  nameChars: number;
}

interface PaymentRowParams {
  layout: ColumnLayout;
  index: number;
  fromName: string;
  toName: string;
  amount: string;
  completed: boolean;
}

/**
 * Render one ledger row inside the given column. Layout:
 *   [from-name]    →   [to-name]              [amount]
 *   ⇡ left-anchored                ⇡ right-anchored
 * `from-name` is in red (#fc5d7c), `to-name` in green (#9ed072),
 * arrow muted, amount in off-white. Completed rows render
 * everything in low-opacity grey with a strikethrough effect via a
 * thin line crossing the row.
 */
function renderRow({ layout, index, fromName, toName, amount, completed }: PaymentRowParams): string {
  const y = layout.y0 + index * layout.dy;
  const fromColor = completed ? '#6e738a' : '#fc5d7c';
  const toColor = completed ? '#6e738a' : '#9ed072';
  const arrowColor = completed ? '#3a4054' : '#6e738a';
  const amountColor = completed ? '#6e738a' : '#eceef6';

  // Monospace char width is roughly fontSize * 0.6 for JetBrains Mono.
  const charW = layout.fontSize * 0.6;
  const nameWidth = layout.nameChars * charW;

  const fromX = layout.x;
  const arrowX = fromX + nameWidth + charW * 1.5;
  const toX = arrowX + charW * 2.0;
  const amountX = layout.x + layout.width;

  const truncatedFrom = truncate(escapeXml(fromName), layout.nameChars);
  const truncatedTo = truncate(escapeXml(toName), layout.nameChars);

  const lines = [
    `<text x="${fromX}" y="${y}" font-family="JetBrains Mono" font-size="${layout.fontSize}" font-weight="700" fill="${fromColor}">${truncatedFrom}</text>`,
    `<text x="${arrowX}" y="${y}" font-family="JetBrains Mono" font-size="${layout.fontSize}" fill="${arrowColor}">→</text>`,
    `<text x="${toX}" y="${y}" font-family="JetBrains Mono" font-size="${layout.fontSize}" font-weight="700" fill="${toColor}">${truncatedTo}</text>`,
    `<text x="${amountX}" y="${y}" font-family="JetBrains Mono" font-size="${layout.fontSize}" font-weight="700" fill="${amountColor}" text-anchor="end">${escapeXml(amount)}</text>`,
  ];

  if (completed) {
    // Strikethrough rule a few px above baseline.
    const strikeY = y - layout.fontSize * 0.32;
    lines.push(
      `<line x1="${fromX}" y1="${strikeY}" x2="${amountX}" y2="${strikeY}" stroke="#6e738a" stroke-width="1.5" stroke-opacity="0.6" />`
    );
  }
  return lines.join('');
}

function renderSvg(snap: DbGameSnapshot): string {
  const { players, payments } = snap;
  const nameById = new Map(players.map((p) => [p.playerId, p.nickname]));
  const orderedPayments = orderPaymentsBySenderTotal(
    payments.map((payment) => ({
      ...payment,
      fromId: payment.fromPlayerId,
      toId: payment.toPlayerId,
    }))
  ).map(({ payment }) => payment);
  const visiblePayments = orderedPayments.slice(0, MAX_DISPLAYED_PAYMENTS);
  const overflow = payments.length - visiblePayments.length;

  const rowsSvg = renderPaymentRows(visiblePayments, nameById);

  const overflowText =
    overflow > 0
      ? `<text x="${W / 2}" y="${H - 64}" font-family="JetBrains Mono" font-size="20" font-weight="600" fill="#6e738a" text-anchor="middle">+${overflow} more payment${overflow === 1 ? '' : 's'}</text>`
      : '';

  const emptyMessage =
    visiblePayments.length === 0
      ? `<text x="${W / 2}" y="${H / 2}" font-family="JetBrains Mono" font-size="44" font-weight="800" fill="#6e738a" text-anchor="middle" letter-spacing="6">already settled.</text>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d0f16" />
  ${rowsSvg}
  ${overflowText}
  ${emptyMessage}
  <text x="${W - 36}" y="${H - 28}" font-family="JetBrains Mono" font-size="16" font-weight="500" fill="#eceef6" fill-opacity="0.32" text-anchor="end" letter-spacing="1">settle.andrew.ee</text>
</svg>`;
}

/**
 * Distribute the visible payments into either a single centered column
 * (≤ 8 rows) or two columns (9-15 rows). Computes per-column geometry
 * and emits the row SVG fragments.
 */
function renderPaymentRows(
  payments: ReadonlyArray<DbPayment>,
  nameById: ReadonlyMap<string, string>
): string {
  const N = payments.length;
  if (N === 0) return '';

  const oneRow = (
    layout: ColumnLayout,
    indexInColumn: number,
    p: DbPayment
  ): string =>
    renderRow({
      layout,
      index: indexInColumn,
      fromName: nameById.get(p.fromPlayerId) ?? p.fromPlayerId,
      toName: nameById.get(p.toPlayerId) ?? p.toPlayerId,
      amount: formatUSD(p.amountCents),
      completed: p.completedAt !== null,
    });

  if (N <= SINGLE_COLUMN_LIMIT) {
    // Single centered column. Larger font, generous dy.
    const fontSize = N <= 5 ? 44 : 36;
    const dy = N <= 5 ? 76 : 64;
    const nameChars = 11;
    const colWidth = 760;
    const x = (W - colWidth) / 2;
    const totalH = N * dy;
    // Top padding leaves room for both top/bottom margins; baseline of
    // first row is one font-size below y0 reference so we add fontSize.
    const y0 = (H - totalH) / 2 + fontSize;
    const layout: ColumnLayout = { x, width: colWidth, y0, dy, fontSize, nameChars };
    return payments.map((p, i) => oneRow(layout, i, p)).join('');
  }

  // Two-column. Distribute roughly evenly: left=ceil(N/2), right=N-left.
  // Column geometry: nameChars=8 + 7-char amount + ~5 chars of gap/arrow
  // = 28 chars per row. At 28px charW=16.8 → 470 px row → 510 col with
  // 40 px right padding for tasteful breathing.
  const leftCount = Math.ceil(N / 2);
  const fontSize = 28;
  const dy = 50;
  const nameChars = 8;
  const colWidth = 510;
  const gutter = 50;
  // leftCount = ceil(N/2) ≥ rightCount, so the left column dictates the
  // vertical span we need to fit.
  const totalRowsPerCol = leftCount;
  const totalH = totalRowsPerCol * dy;
  const y0 = (H - totalH) / 2 + fontSize;
  const xLeft = (W - (colWidth * 2 + gutter)) / 2;
  const xRight = xLeft + colWidth + gutter;

  const left: ColumnLayout = {
    x: xLeft,
    width: colWidth,
    y0,
    dy,
    fontSize,
    nameChars,
  };
  const right: ColumnLayout = {
    x: xRight,
    width: colWidth,
    y0,
    dy,
    fontSize,
    nameChars,
  };

  const leftRows = payments
    .slice(0, leftCount)
    .map((p, i) => oneRow(left, i, p))
    .join('');
  const rightRows = payments
    .slice(leftCount)
    .map((p, i) => oneRow(right, i, p))
    .join('');
  return leftRows + rightRows;
}

/**
 * Debug-only: replace `snap.payments` (and minimally `snap.players`)
 * with N synthetic rows so we can verify the two-column layout against
 * the real worker, even before any organic 15-payment game exists. The
 * synthetic players are named `Plyr01`..`PlyrNN` to give the layout a
 * realistic length distribution. The first half are creditors, the
 * second half are debtors, and amounts step linearly.
 */
function withSyntheticPayments(snap: DbGameSnapshot, n: number): DbGameSnapshot {
  const cap = Math.min(n, MAX_DISPLAYED_PAYMENTS);
  const payments: DbPayment[] = [];
  const players = snap.players.slice();
  const haveByName = new Map(players.map((p) => [p.playerId, p]));
  for (let i = 0; i < cap; i++) {
    const fromId = `synth_from_${String(i).padStart(2, '0')}`;
    const toId = `synth_to_${String(i).padStart(2, '0')}`;
    const fromName = `LoserMcGee${String(i + 1).padStart(2, '0')}`;
    const toName = `Winner${String(i + 1).padStart(2, '0')}`;
    if (!haveByName.has(fromId)) {
      players.push({ playerId: fromId, nickname: fromName, netCents: 0 });
    }
    if (!haveByName.has(toId)) {
      players.push({ playerId: toId, nickname: toName, netCents: 0 });
    }
    payments.push({
      id: `synth_p_${i}`,
      fromPlayerId: fromId,
      toPlayerId: toId,
      amountCents: 1500 + i * 250,
      forced: false,
      position: i,
      // Mark every fourth as completed so we exercise the strikethrough.
      completedAt: i % 4 === 3 ? Date.now() : null,
      completedBy: i % 4 === 3 ? 'tester' : null,
    });
  }
  return { ...snap, players, payments };
}
