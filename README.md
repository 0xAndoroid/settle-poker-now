# settle-poker-now

> Minimum-payment settlement for PokerNow home games.

Paste a [PokerNow](https://www.pokernow.club/) game URL → fetch the ledger →
compute the optimized settlement plan → copy/share rows for Venmo, Zelle, or
group chat. Constrained settlement groups, already-paid adjustments, and a
shareable PNG export are all built-in. Pure client-side state; no accounts,
no database.

Live at **[settle-poker-now.pages.dev](https://settle-poker-now.pages.dev)**.

## How it works

1. The browser hits a Cloudflare Pages Function at `/api/ledger?gameId=…` —
   the function proxies the PokerNow CSV (PokerNow does not send CORS
   headers, so a direct browser fetch fails).
2. Rows are aggregated by `player_id` (not nickname — players can rename
   mid-session). Net is summed in **integer cents** to avoid float drift.
3. The greedy max-creditor-meets-max-debtor heuristic produces an
   **at-most-N-1**-transaction settlement plan, run independently per
   user-defined group.
4. Already-paid transfers are recorded as **adjustments** that re-balance
   nets before settlement. All local state — game id, adjustments, groups —
   is base64url-encoded into the URL hash so links are shareable.
5. The settlement plan can be exported as a 4:5 PNG card via `html-to-image`
   — uses the Web Share API on mobile, clipboard on desktop, and falls back
   to a download.

## Stack

- **Vite** + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS** (custom palette)
- **Cloudflare Pages** for hosting + a Pages Function for the CSV proxy
- **Vitest** for unit tests (38 tests covering settlement, CSV parsing, URL
  parsing, money helpers, and hash state)
- **html-to-image** for the share card

## Algorithm notes

Minimum-transactions debt simplification is NP-hard in general (subset-sum
reduction). The greedy heuristic implemented here is the standard
approximation used by every "split the bill" app — provably optimal for the
common cases encountered at a poker table (≤ 10 participants) and fully
deterministic (ties broken by `player_id` lexicographic ordering).

Group constraints partition the player pool into independent sub-graphs and
run the heuristic inside each. A group whose members do not net to zero is
flagged as **imbalanced** and surfaced in the UI, since no internal
settlement can clear it.

## Development

```sh
npm install
npm run dev          # vite dev server on http://localhost:5173
npm run test         # vitest unit tests
npm run lint         # eslint
npm run build        # type-check + vite build into ./dist
npm run worker:dev   # wrangler pages dev — exercises the /api/ledger function
```

## Deployment

Deploys are **manual** — there is no GitHub-Actions or git-connected
auto-deploy. This matches the existing `andrew.ee` pattern.

```sh
npm run deploy
# alias for: npm run build && wrangler pages deploy dist --project-name=settle-poker-now
```

The Pages Function in `functions/api/ledger.ts` ships automatically with the
static assets; no separate worker config is required.

## Project layout

```
.
├── functions/
│   └── api/
│       └── ledger.ts        # CF Pages Function — proxies PokerNow CSV
├── src/
│   ├── components/          # React UI (panels, share card, toast, header)
│   ├── hooks/               # useTheme, useLedger, useToast
│   ├── lib/
│   │   ├── csv.ts           # PokerNow CSV → ParsedLedger
│   │   ├── settle.ts        # Greedy debt-simplification algorithm
│   │   ├── pokernow.ts      # URL → gameId
│   │   ├── hashState.ts     # base64url state encoded in window.location.hash
│   │   ├── shareImage.ts    # html-to-image + Web Share API + clipboard
│   │   ├── money.ts         # Cent-integer money helpers
│   │   ├── clipboard.ts     # Cross-browser copy text/image
│   │   ├── id.ts            # crypto.randomUUID() with fallback
│   │   ├── cn.ts            # className concatenator
│   │   ├── types.ts         # Shared domain types
│   │   └── *.test.ts        # 38 unit tests
│   ├── styles/globals.css
│   ├── App.tsx
│   └── main.tsx
├── public/favicon.svg
├── index.html
├── wrangler.toml
└── package.json
```
