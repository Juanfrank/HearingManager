# Teams app manifest

`manifest.json` is a scaffold — before packaging/sideloading, replace:

- `id` and `webApplicationInfo.id` / `.resource` — the App ID from the Entra
  ID app registration (see `docs/README.md`, "Azure / Entra ID prerequisites").
- `bots[0].botId` — same App ID, once the bot is registered in Azure Bot
  Service against it.
- `<TAB_HOSTNAME>` — wherever the `tab/` app is actually deployed.
- `icons/outline.png` (32×32, transparent) and `icons/color.png` (192×192) —
  not included here; add real icon assets before packaging.

Package for sideload/publish: zip `manifest.json` + the two icon PNGs
(flat, no subfolder) into `hearing-manager.zip`. Tenant admin approval to
sideload/publish is a manual prerequisite — see `docs/README.md` §3.
