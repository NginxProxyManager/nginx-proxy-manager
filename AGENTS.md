# Agent Instructions

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, Gemini, etc.)
working in this repository. Humans are welcome to read it too.

## Project goal

Nginx Proxy Manager exists to make HTTP proxying and SSL termination easy for the
end user. Changes that drift from that goal are unlikely to be merged.

Every change should either fix a real bug or add a feature that many users have
asked for. Speculative features, drive-by refactors and "improvements" nobody
asked for are easy to spot as AI slop and will be closed.

## Before you start: research

- Read the git history (`git log`, `git log -p <path>`) for the files you are
  touching, and look at merged PRs on GitHub
  (https://github.com/NginxProxyManager/nginx-proxy-manager/pulls?q=is%3Apr+is%3Amerged)
  to understand why the code is the way it is before you plan a change.
- Check for existing issues and open PRs that already cover the same work.
- A code review bot reviews every PR, so get the change right the first time:
  plan carefully, follow these rules, and test before submitting.

## Project overview

| Path | What it is |
| --- | --- |
| `backend/` | Node.js (ESM) Express API. Knex for DB (SQLite, MySQL/MariaDB, Postgres). |
| `backend/internal/` | Business logic per entity (proxy-host, certificate, user, ...). |
| `backend/routes/` | Express routes. |
| `backend/schema/` | OpenAPI schema. Requests and responses are validated against it. |
| `backend/templates/` | Liquid templates that render nginx config files. |
| `backend/migrations/` | Knex migrations. |
| `frontend/` | React + TypeScript + Vite UI (Tabler, TanStack Query, react-intl). |
| `docker/` | Dockerfile, rootfs (nginx/s6 config), dev and CI compose files. |
| `test/` | Cypress API/UI tests. |
| `docs/` | Public documentation site. |
| `scripts/` | Dev stack and CI helper scripts. |

## Working rules

- **Stay on topic.** One change per commit and per PR. Don't bundle unrelated
  fixes, reformatting or refactoring together.
- **Don't bump dependencies** unless your change specifically requires it.
  GitHub's Dependabot is responsible for keeping the stack up to date and safe.
- **Security first.** This app writes nginx config and runs as root in most
  installs. Any user-supplied value that reaches a template or a shell command
  must be validated and escaped. Non-admin users must never be able to inject
  nginx directives, read other users' data, or touch files outside their scope.
  Check permission logic in `backend/internal/` and `backend/lib/access` when
  changing anything that loads or saves an entity.
- **Database portability.** Every query and migration must work on SQLite,
  MySQL/MariaDB and Postgres. Don't use engine-specific SQL without a fallback.
- **Migrations are append-only.** Never edit an existing migration; add a new one
  named `YYYYMMDDHHMMSS_description.js`, and implement `down` where feasible.
- **API changes need schema changes.** If you change a request or response shape,
  update `backend/schema/` to match and run `yarn validate-schema` in `backend/`.
  Call out breaking API changes explicitly.
- **nginx templates** (`backend/templates/`) must produce valid config for every
  combination of options (SSL on/off, HTTP/2, HSTS, custom locations, access
  lists, streams). Existing users' hosts are regenerated on upgrade, so a bad
  template breaks live sites.
- **Nginx config baked into the image** (`docker/rootfs/etc/nginx/`) must be
  changed with care. Users reference these files and variables from their own
  custom configurations, so renaming or removing a variable, include or file can
  break their setups. When that is unavoidable, provide a migration plan or a
  fallback (e.g. keep the old name working) and call it out in the PR.
- **Frontend strings** go through react-intl. Add new keys to
  `frontend/src/locale/src/en.json` (see `frontend/src/locale/README.md`).
  Don't hardcode user-visible English in components.
- **No secrets.** Never commit or paste real API keys, DNS provider credentials,
  certificates, private keys or passwords, including in tests and fixtures.

## Docker image and system packages

- The image is built on `nginxproxymanager/nginx-full:certbot-node`, from
  https://github.com/NginxProxyManager/docker-nginx-full.
- Don't add `apt` packages (or other OS packages) in this project's Dockerfile.
  If something can be handled in the upstream base image, change it there first.
- Never install Python packages in this project's Dockerfile. That is handled
  upstream.

## Code style

- Formatting and linting are done by Biome (`biome.json` in `backend/` and
  `frontend/`): tabs, 120 character lines, organised imports.
- Run lint before finishing:

  ```bash
  cd backend && yarn lint
  cd frontend && yarn lint
  ```

- Match the conventions of surrounding code rather than introducing new patterns
  or libraries.

## Testing

Tests must be written in the language and framework of the folder they belong to:

| Folder | Framework | Command |
| --- | --- | --- |
| `frontend/` | React + Vitest | `cd frontend && yarn test --run` (plain `yarn test` starts watch mode) |
| `backend/` | Node.js built-in test runner (`node --test`) | `cd backend && yarn test` |
| `test/` | Cypress | `./scripts/cypress-dev` (needs the dev stack running) |

- Don't add test files in any other language or framework (e.g. Python scripts).
- Add or update tests for bug fixes and new behaviour.
- Other useful checks:
  - `cd frontend && yarn build` for the type check and production build.
  - `cd backend && yarn validate-schema` for the API schema.
  - `./scripts/start-dev` / `./scripts/stop-dev` for the full Docker dev stack
    (UI on port 3081).
- If you could not run a test (e.g. no Docker available), say so plainly rather
  than implying it passed.

## CI

- GitHub Actions are **not** used in this project. Don't add workflows.
- CI runs on Jenkins at https://ci.nginxproxymanager.com.
- Every submitted PR gets the full Jenkins test suite. If it passes, a Docker
  image built from the PR is commented on the PR.
- The submitter is expected to test that image themselves. Commenting on the PR
  with what you tested and found is highly recommended and speeds up review.

## Commits and pull requests

- Default branch is `develop`. Branch from it and target it in PRs.
- Commit message format:

  ```
  Short imperative summary of the change

  Any further information, focused on WHY the change is being made.
  ```

  The summary line is followed by a blank line, then the body. Ask the user what
  they want in the body, and steer them to explain *why* the change is needed,
  not *what* changed. Reviewers can read the code to see what changed.
- Fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`, including the
  **AI Usage** checkboxes. PRs without a description are closed.
- Don't bump the version in `.version`; maintainers do that at release time.
