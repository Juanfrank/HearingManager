# Teams app manifest

`manifest.json` currently has two placeholder values that make it
**schema-valid and packageable, but not a real app** — Teams will accept
the upload and then fail to actually load the tab or authenticate the bot
until both are replaced with real values:

- `00000000-0000-0000-0000-000000000000` (a nil GUID, appears 3 places:
  `id`, `bots[0].botId`, `webApplicationInfo.id`) — replace with the real
  App ID from the Entra ID app registration (see `docs/README.md`, "Azure
  / Entra ID prerequisites"). All three should be the same App ID.
- `changeme.example.com` (appears 3 places: `staticTabs[0].contentUrl`/
  `.websiteUrl`, `validDomains[0]`, `webApplicationInfo.resource`) —
  replace with wherever `tab/` is actually deployed (a devtunnel/ngrok host
  for a quick test, a real domain otherwise).

Find every occurrence to replace with:

```
grep -n '00000000-0000-0000-0000-000000000000\|changeme.example.com' manifest.json
```

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

## RSC permission: MeetingStage.Write.Chat

`authorization.permissions.resourceSpecific` declares
`MeetingStage.Write.Chat` (Delegated), required to call the Teams JS SDK's
`meeting.shareAppContentToStage` API — e.g. for a "put this hearing on
stage for everyone" action from the tab. **Not yet called anywhere in
`tab/src`** — the permission is declared but unused until that UI/call is
added. Resource-specific consent (RSC) permissions are granted per meeting
by the meeting organizer at install time, not by a tenant-wide admin
consent flow, but sideloading still needs the tenant admin approval in
`docs/README.md` §3 regardless.

## Packaging

Zip `manifest.json` + the two icon PNGs (flat, no subfolder) into
`hearing-manager.zip`:

```
cd manifest && zip hearing-manager.zip manifest.json outline.png color.png
```

Tenant admin approval to sideload/publish is a manual prerequisite — see
`docs/README.md` §3 (Azure / Entra ID prerequisites).
