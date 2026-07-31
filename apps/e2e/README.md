# WDMBG e2e (Playwright)

Minimal **live** smoke tests for the home deployment (`http://wdmbg.lan`).

Does **not** start local servers — point at an already-running stack (docker.lan + NPM).

## Prerequisites

- Node 26+ and pnpm (repo root)
- Network/DNS that resolves `wdmbg.lan` (AdGuard rewrite → docker.lan), **or** override base URL
- Chromium browser binary (`pnpm exec playwright install chromium`)

## Run

From repo root:

```bash
pnpm install
pnpm --filter @wdmbg/e2e exec playwright install chromium
pnpm test:e2e
```

Or from this package:

```bash
cd apps/e2e
pnpm test:e2e
```

Live smoke is **not** part of `pnpm test` / turbo validate (needs a running deploy).

### Base URL

Default: `http://wdmbg.lan`

```bash
# local vite + api proxy
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm test:e2e

# explicit LAN
PLAYWRIGHT_BASE_URL=http://wdmbg.lan pnpm test:e2e
```

### When this machine cannot resolve `wdmbg.lan`

If NPM is already up (e.g. at `docker.lan` / `10.0.0.202`) but AdGuard has not published `wdmbg.lan` yet, map the hostname for Chromium and the API request helper:

```bash
# docker.lan currently resolves to the NPM IP on the lab LAN
PLAYWRIGHT_MAP_HOST=10.0.0.202 pnpm test:e2e
```

`PLAYWRIGHT_MAP_HOST` sets Chromium `--host-resolver-rules=MAP wdmbg.lan <ip>` and sends `Host: wdmbg.lan` for the Node-side health request. Do **not** commit hosts files or credentials.

## Smoke coverage

| Check | Notes |
| --- | --- |
| `GET /api/health` | `status === "ok"` |
| Dashboard | title + hero landmarks |
| Window toggle + tables | empty/zero traffic OK |

No auth, no probe traffic required for MVP.
