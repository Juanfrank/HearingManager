#!/usr/bin/env node
// Copies tab/dist (vite build output) into backend/public, so a plain
// `backend/` deployment — the unit Azure App Service actually receives,
// see docs/README.md's "Deploying to Azure App Service" — is a
// self-contained artifact that doesn't need the sibling tab/ folder to
// exist at runtime. Run via `npm run build` (backend/package.json), after
// tab/'s own build has produced tab/dist. Zero-dependency on purpose,
// same reasoning as scripts/generate-placeholder-icons.js in manifest/.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "..", "tab", "dist");
const DEST = path.join(__dirname, "..", "public");

if (!fs.existsSync(SRC)) {
  console.error(`[copy-tab-dist] ${SRC} does not exist — run \`npm run build\` in tab/ first (backend's own \`npm run build\` does this automatically via the build:tab script).`);
  process.exit(1);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, { recursive: true });
console.log(`[copy-tab-dist] copied ${SRC} -> ${DEST}`);
