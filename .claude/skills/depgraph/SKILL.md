# depgraph (project override for HearingManager)

This project extends the global `depgraph` skill with one repo-specific
rule. Everything else — when to build/update the map, how to query it
narrowly, the anti-patterns — is unchanged; see the global skill for that
guidance.

## Project-specific rule: always commit `.claude/depgraph.json`

`.claude/depgraph.json` stays listed in `.gitignore` (so ordinary
`git add .`/IDE "add all" actions don't sweep it in as noise on unrelated
commits), but it must still be **explicitly committed and pushed** to this
repo every time it's rebuilt or updated — it is not treated as a disposable
local cache here, unlike the global skill's default assumption.

After every `--update`/`--rebuild` run:

```bash
git add -f .claude/depgraph.json
git commit -m "Update dependency map"
git push
```

`-f` is required precisely because the path is gitignored — that's
intentional, not a mistake to route around by editing `.gitignore`. Do NOT
remove the `.gitignore` entry to make plain `git add` work; force-add this
one path instead, every time.
