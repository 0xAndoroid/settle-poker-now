## Contributing flow

branch → PR → CI green (`.github/workflows/ci.yml`) → merge; no direct pushes to main.

CI runs `npm ci`, `npm run lint`, `npm run build` (tsc -b + vite build) and `npm run test` on Node 22.
