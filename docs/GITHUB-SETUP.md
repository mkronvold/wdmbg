# GitHub setup

Baseline: [`mkronvold/techstack` repo-setup.md](https://github.com/mkronvold/techstack/blob/main/repo-setup.md).

## Enable

1. GitHub Actions
2. Dependabot alerts + version updates (`.github/dependabot.yml`)
3. Packages (GHCR) when image publish lands
4. Code scanning when Trivy SARIF lands

## Branch protection (recommended on `main`)

Required check once green:

- `Validate`

Add image build/scan job names when those workflows exist.

## Permissions notes

Validate needs `contents: read` only. Future publish/scan workflows need the
packages / attestations / security-events permissions described in techstack.
