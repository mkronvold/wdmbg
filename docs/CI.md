# CI

Baseline: [`mkronvold/techstack` ci.md](https://github.com/mkronvold/techstack/blob/main/ci.md).

## Phase 0

WDMBG ships a single **Validate** workflow (`.github/workflows/validate.yml`):

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm lint`
3. `corepack pnpm typecheck`
4. `corepack pnpm test`
5. `corepack pnpm build`

Node **26** via `.node-version` / `package.json` `engines`.

## Not yet (later phases)

Per techstack product-app baseline, still to add:

- Image build/publish matrix (`api`, `web`) to **GHCR** (home profile)
- Trivy / SBOM / provenance on publish
- Refresh + release-pin workflows
- Dependabot auto-merge helpers

Probe is **host-native** and is not part of the container publish matrix (see [PROBE.md](./PROBE.md)).

## Local equivalent

```bash
corepack pnpm validate
```
