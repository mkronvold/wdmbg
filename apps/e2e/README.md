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

### When this machine cannot resolve `.lan`

Run from a host on the lab network (e.g. `docker.lan`):

```bash
ssh mkronvold@docker.lan
cd ~/src/wdmbg   # or clone/checkout the PR branch
pnpm install --filter @wdmbg/e2e...
pnpm --filter @wdmbg/e2e exec playwright install --with-deps chromium
pnpm test:e2e
```

If AdGuard has not published `wdmbg.lan` yet but the web container is up, you can still hit the stack via host/`--add-host` or temporary `/etc/hosts` on the runner — do **not** commit hosts/credentials.

## Smoke coverage

| Check | Notes |
| --- | --- |
| `GET /api/health` | `status === "ok"` |
| Dashboard | title + hero landmarks |
| Window toggle + tables | empty/zero traffic OK |

No auth, no probe traffic required for MVP.
