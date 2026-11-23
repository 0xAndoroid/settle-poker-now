## Contributing flow

branch → PR → CI green (`.github/workflows/ci.yml`) → merge; no direct pushes to main.

CI runs `npm ci`, `npm run lint`, and `npm run build` on Node 22. Pull requests
that change more than Markdown also run `npm run test:smoke` against the bundled
demo in local Cloudflare Pages. At 08:43 UTC daily, `nightly.yml` runs the full
Vitest suite (`npm run test`) unless the previous completed scheduled run covered
the same commit. Manual dispatch always runs the full suite.
