# Security exceptions

Track temporary deviations from the [techstack](https://github.com/mkronvold/techstack) baseline here.

| ID | Surface | Reason | Owner | Remove by |
| --- | --- | --- | --- | --- |
| THEMES-001 | `@mkronvold/themes` | Package not yet installable for this scaffold; web uses interim CSS variables | platform | when `@mkronvold/themes` is published and wired |
| NODE-LOCAL-001 | Local Node major | Dev hosts may lag Node 26; CI and `.node-version` remain on 26 | platform | when local toolchains pin Node 26 |

Container scan suppressions live in [`.trivyignore.yaml`](../.trivyignore.yaml) with CVE id, owner statement, and `expired_at`.
