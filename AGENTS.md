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

<!-- BEGIN: unified-screenshot-review -->
## Screenshot review for new work

Use `python3 scripts/review_screenshots.py` and read `SCREENSHOT_REVIEW.md` before new
native or delivered screenshot review. Keep the coordinator text-only.
New input is prepared as WebP quality 80, longest edge at most 1280 pixels;
originals stay unchanged. Unreadable detail requires a source-bound crop.
Each packet uses one fresh, explicitly pinned non-Astra review process;
never resume/fork an image-bearing chat or load the next packet into it.
Do not start new review jobs through historical per-language CLI queues.
Preserve active jobs, their helpers, captures and ledgers. Migrate only
future work after the old owner has reconciled its output. No game launch,
new review/model request, publication or deployment is authorized by this rule.
<!-- END: unified-screenshot-review -->
