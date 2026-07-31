# CI

Baseline: [`mkronvold/techstack` ci.md](https://github.com/mkronvold/techstack/blob/main/ci.md).

## Validate

`.github/workflows/validate.yml`:

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm lint`
3. `corepack pnpm typecheck`
4. `corepack pnpm test`
5. `corepack pnpm build`
6. `corepack pnpm format:check`
7. Go probe `go test ./...` + linux build (libpcap-dev)

Node **26** via `.node-version` / `package.json` `engines`.

## Images

`.github/workflows/images.yml` — build `wdmbg-api` / `wdmbg-web` and push to GHCR on `main`.
Trivy Lane B is a non-blocking skeleton until packages exist; see `.trivyignore.yaml`.

Probe remains **host-native** (not in the container matrix). See [PROBE.md](./PROBE.md).

## Local equivalent

```bash
corepack pnpm validate
cd apps/probe && go test ./...
```