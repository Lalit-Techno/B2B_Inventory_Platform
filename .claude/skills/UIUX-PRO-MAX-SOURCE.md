# UI UX Pro Max — source

- Repo: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT, see UIUX-PRO-MAX-LICENSE)
- Version: 2.15.0, commit 8db36338810d0942567b97ce439affd1619fcf31
- Installed: only `.claude/skills/ui-ux-pro-max/` (core skill: SKILL.md, data CSVs, references, Python search scripts).
- Not installed: brand, design (logo/CIP generation, calls external APIs), design-system, slides, ui-styling, banner-design, the npm CLI.
- Local change: `${CLAUDE_PLUGIN_ROOT}/` removed from script paths in SKILL.md (project install, run from the project root).
- Reviewed: core scripts only read local CSV/JSON and write files; no network calls or subprocesses (preview.py output links Google Fonts).
- Needs Python 3 on PATH (not installed on this machine at install time).
- Update: re-clone the repo and copy `.claude/skills/ui-ux-pro-max/` again.
- Removed `scripts/tests/` (repo dev tests; one asserts the plugin path variable we removed).
