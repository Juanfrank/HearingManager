# Teams app manifest

`manifest.json` is a scaffold — before packaging/sideloading, replace:

- `id` and `webApplicationInfo.id` / `.resource` — the App ID from the Entra
  ID app registration (see `docs/README.md`, "Azure / Entra ID prerequisites").
- `bots[0].botId` — same App ID, once the bot is registered in Azure Bot
  Service against it.
- `<TAB_HOSTNAME>` — wherever the `tab/` app is actually deployed.

## Icons

`outline.png` (32×32, transparent) and `color.png` (192×192) are
programmatically generated **placeholders** (see `scripts/generate-
placeholder-icons.js`, zero-dependency PNG writer) — a crude gavel glyph
and a ring, just enough to satisfy Teams' upload validation. Replace both
with real branded artwork before publishing. Regenerate the placeholders
any time with:

```
node scripts/generate-placeholder-icons.js
```

## Tabs: staticTabs vs. the config page

The manifest uses `staticTabs` pointing straight at `tab/index.html` —
this app manages a single meeting (docs §1), so there's no real
per-instance configuration to collect, and `staticTabs` skips the extra
config-page round trip entirely.

`tab/config.html` / `tab/src/config.tsx` still exist as a ready-to-use
`configurableTabs` alternative, in case a future deployment needs to
collect anything per install (e.g. a distinct backend URL per court). To
switch: replace the `staticTabs` block in `manifest.json` with:

```json
"configurableTabs": [
  {
    "configurationUrl": "https://<TAB_HOSTNAME>/config.html",
    "canUpdateConfiguration": false,
    "scopes": ["groupChat", "team"],
    "context": ["meetingSidePanel", "meetingStage"]
  }
]
```

## Packaging

Zip `manifest.json` + the two icon PNGs (flat, no subfolder) into
`hearing-manager.zip`:

```
cd manifest && zip hearing-manager.zip manifest.json outline.png color.png
```

Tenant admin approval to sideload/publish is a manual prerequisite — see
`docs/README.md` §3 (Azure / Entra ID prerequisites).
