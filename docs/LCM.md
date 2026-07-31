# Lifecycle management (LCM)

Baseline: [`mkronvold/techstack` lcm.md](https://github.com/mkronvold/techstack/blob/main/lcm.md).

## Registry profile

**Home / GHCR** (primary):

| Service | Intended image (later) |
| --- | --- |
| API | `ghcr.io/mkronvold/wdmbg-api` |
| Web | `ghcr.io/mkronvold/wdmbg-web` |

No worker in MVP. Probe is **not** containerized in MVP.

## Phase 0

No published images, Compose prod pins, or K8s manifests yet. Lifecycle automation
lands with Dockerfiles and publish workflows in a later phase.

## Channels (planned)

| Channel | Use |
| --- | --- |
| Immutable `tag@sha256:digest` | Reviewed production / K8s pins |
| Mutable `latest` + host auto-refresh | Trusted home Docker hosts only |

See techstack LCM for promotion, refresh, and rollback rules.
