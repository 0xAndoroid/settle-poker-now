/**
 * Pages Functions middleware.
 *
 * Runs on every request before static asset serving and route-specific
 * functions. We use it for one job: when the path matches `/g/:id`, we
 * rewrite the SPA's `index.html` response to inject per-game OG meta tags
 * so chat unfurls (Twitter/X, iMessage, Telegram, Slack, Discord) show a
 * preview specific to that game's settlement.
 *
 * Anything else → fall through to default routing.
 */

import { loadGame, type DbGameSnapshot } from './lib/db';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const GAME_PATH = /^\/g\/([0-9a-z]{6,16})\/?$/i;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const match = url.pathname.match(GAME_PATH);
  if (!match) {
    return ctx.next();
  }
  // Only HTML requests need the rewrite. Asset requests (CSS, JS) still
  // get the standard handling — they're served by the static asset binding,
  // which the middleware shouldn't touch.
  const accept = ctx.request.headers.get('Accept') ?? '';
  if (!accept.includes('text/html') && !accept.includes('*/*') && accept !== '') {
    return ctx.next();
  }

  const gameId = match[1]!;
  const snapshot = await loadGame(ctx.env.DB, gameId).catch(() => null);

  // Always serve the same SPA shell — rewrite is purely additive metadata.
  const response = await ctx.next();
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
    return response;
  }

  const meta = buildMeta(gameId, snapshot, url.origin);
  return new HTMLRewriter()
    .on('head', new HeadInjector(meta))
    .on('title', new TitleSetter(meta.title))
    .on('meta[property^="og:"]', new RemoveExistingOg())
    .on('meta[name^="twitter:"]', new RemoveExistingOg())
    .on('meta[name="description"]', new RemoveExistingOg())
    .transform(response);
};

/* ──────── Meta builder ──────── */

interface PageMeta {
  title: string;
  description: string;
  ogUrl: string;
}

function buildMeta(
  gameId: string,
  snapshot: DbGameSnapshot | null,
  origin: string
): PageMeta {
  const ogUrl = `${origin}/g/${gameId}`;
  if (!snapshot) {
    return {
      title: 'settle.andrew.ee · poker night settlement',
      description: 'A persistent settlement plan for a PokerNow game.',
      ogUrl,
    };
  }
  const { players, payments } = snapshot;
  const settled = payments.filter((p) => p.completedAt !== null).length;
  const outstanding = payments.length - settled;
  const total = payments.reduce((acc, p) => acc + p.amountCents, 0);
  const totalUsd = `$${(total / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

  const title =
    outstanding === 0 && payments.length > 0
      ? `Settled · ${players.length} players · ${totalUsd} moved`
      : `Settlement · ${players.length} players · ${payments.length} payments`;

  const description =
    outstanding === 0 && payments.length > 0
      ? `All settled. ${totalUsd} moved across ${players.length} players. settle.andrew.ee`
      : `${settled}/${payments.length} payments settled · ${totalUsd} moved · settle.andrew.ee`;

  return { title, description, ogUrl };
}

/* ──────── HTMLRewriter handlers ──────── */

class TitleSetter {
  constructor(private title: string) {}
  text(text: Text) {
    if (text.lastInTextNode) {
      text.replace(this.title);
    } else {
      text.remove();
    }
  }
}

class RemoveExistingOg {
  element(el: Element) {
    el.remove();
  }
}

class HeadInjector {
  constructor(private meta: PageMeta) {}
  element(el: Element) {
    const tags = [
      `<meta name="description" content="${escapeHtml(this.meta.description)}">`,
      `<meta property="og:title" content="${escapeHtml(this.meta.title)}">`,
      `<meta property="og:description" content="${escapeHtml(this.meta.description)}">`,
      `<meta property="og:url" content="${escapeHtml(this.meta.ogUrl)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="settle.andrew.ee">`,
      `<meta name="twitter:card" content="summary">`,
      `<meta name="twitter:title" content="${escapeHtml(this.meta.title)}">`,
      `<meta name="twitter:description" content="${escapeHtml(this.meta.description)}">`,
    ];
    for (const tag of tags) el.append(tag, { html: true });
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
