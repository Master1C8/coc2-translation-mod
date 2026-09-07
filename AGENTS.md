# CoC2 Translator development guide

This repository contains only the realtime DOM translator for Corruption of
Champions II. It does not contain game assets, a static translation pack, or a
production deployment workflow.

## Start here

- Read `docs/DEVELOPMENT.md` for the task-to-file map and focused test commands.
- Read `docs/ARCHITECTURE.md` only for cross-layer or runtime architecture work.
- Read `docs/ADAPTER_CONTRACT.md` only for manifests or game adapters.
- Read `docs/USER_GUIDE.md` only when user-visible behavior or wording changes.
- Do not load `docs/QA_REPORT.md` as implementation context; it is a release
  verification record.

## Required invariants

- Preserve the configured repository remote and the repository-local Git
  identity. Completed changes must be committed and integrated into `main`.
- Never deploy, publish, or create a release unless the owner explicitly asks
  for that exact action.
- Keep Electron CDP and the credential helper on loopback.
- Never expose or print API keys, vault contents, launch tokens, or private
  paths containing secrets.
- Keep game identity in `src/games/coc2/game.json` and DOM rules in its adapter;
  shared runtime files must remain game-neutral.
- Preserve Text nodes and context markers. Do not replace game `innerHTML`.
- Keep Windows packages compatible with the embeddable Python standard library.
- Before integration, run `./scripts/test-coc2.sh --quiet`; use the verbose form
  when diagnosing a failure.
