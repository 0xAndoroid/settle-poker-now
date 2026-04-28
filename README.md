# settle.andrew.ee

> Minimum-payment settlement for PokerNow home games. Renders the plan as a
> printable receipt.

Paste a [PokerNow](https://www.pokernow.club/) game URL → fetch the ledger →
compute the optimized settlement plan → copy individual payments or share the
whole thing as a 4:5 receipt PNG. Pure client-side; no accounts, no DB.

Live at **[settle.andrew.ee](https://settle.andrew.ee)** (or the deployment
alias [settle-poker-now.pages.dev](https://settle-poker-now.pages.dev)).

## How it works

1. The browser hits a Cloudflare Pages Function at `/api/ledger?gameId=…` —
   the function proxies the PokerNow CSV (PokerNow does not send CORS
   headers, so a direct browser fetch fails).
2. Rows are aggregated by `player_id` (not nickname — players can rename
   mid-session). Net is summed in **integer cents** to avoid float drift.
3. **Isolation rules** are resolved first. Any player marked "settles only
   with X" is paired off via a forced transaction, with their net folded
   into the counterpart's net. Chains collapse transitively (A → B → C
   processes A first, then B carrying A's net into C). Cycles
   (A → B, B → A) are detected and rejected with a clear UI flag.
4. The greedy max-creditor↔max-debtor heuristic settles the remaining
   players. **At most N − 1** transactions for N participants — usually
   fewer.
5. Already-paid transfers are recorded as **adjustments** that re-balance
   nets before settlement. All local state — game id, adjustments,
   isolations — is base64url-encoded into the URL hash so links are
   shareable.
6. The settlement plan exports as a 4:5 receipt-style PNG via
   `html-to-image` — uses the Web Share API on mobile, clipboard on
   desktop, falls back to download.

## Stack

- **Vite** + **React 19** + **TypeScript** (strict mode)
- **Tailwind CSS** with a custom paper-receipt palette (no dark mode —
  receipts don't have dark mode)
- **Cloudflare Pages** for hosting + a Pages Function for the CSV proxy
- **Vitest** — 38 tests covering settlement, isolation chains + cycle
  detection, CSV parsing, URL parsing, money helpers, hash state
- **html-to-image** for the receipt export

## Algorithm notes

Minimum-transactions debt simplification is NP-hard in general
(subset-sum reduction). The greedy heuristic implemented here is the
standard approximation — provably optimal for the common cases at a poker
table (≤ 10 participants) and fully deterministic (ties broken by
`player_id` lexicographic ordering).

Isolation is resolved as a topological reduction on a directed graph
(child → counterpart). Leaves are processed first; each leaf settles
entirely with its parent and folds its net into the parent's, then is
removed. Any nodes that remain after the topological pass are members of
a cycle and surfaced as such — settlement is refused for them with a
clear "break the cycle" message.

## Development

```sh
npm install
npm run dev          # vite dev server on http://localhost:5173
npm run test         # vitest
npm run lint
npm run build        # tsc + vite build into ./dist
npm run worker:dev   # wrangler pages dev — exercises /api/ledger locally
```

## Deployment

Deploys are **manual** — no GitHub-Actions or git-connected auto-deploy.

```sh
npm run deploy
# alias for: npm run build && wrangler pages deploy dist --project-name=settle-poker-now
```

The Pages Function in `functions/api/ledger.ts` ships automatically with
the static assets; no separate worker config is required.

## Project layout

```
.
├── functions/
│   └── api/
│       └── ledger.ts        # CF Pages Function — proxies PokerNow CSV
├── src/
│   ├── components/          # Receipt-aesthetic React UI
│   ├── hooks/               # useLedger, useToast
│   ├── lib/
│   │   ├── csv.ts           # PokerNow CSV → ParsedLedger
│   │   ├── settle.ts        # Greedy + isolation + cycle detection
│   │   ├── pokernow.ts      # URL → gameId
│   │   ├── hashState.ts     # base64url state in window.location.hash
│   │   ├── shareImage.ts    # html-to-image + Web Share API + clipboard
│   │   ├── money.ts         # Cent-integer money helpers
│   │   ├── clipboard.ts     # Cross-browser copy text/image
│   │   ├── id.ts
│   │   ├── cn.ts
│   │   ├── types.ts
│   │   └── *.test.ts        # 38 unit tests
│   ├── styles/globals.css
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── favicon.svg
│   └── demo-ledger.csv      # bundled demo session
├── index.html
├── wrangler.toml
└── package.json
```
