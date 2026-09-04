import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 53000,
    // Lets api.ts/socket.ts default to relative, same-origin paths ("/api",
    // same-origin socket) everywhere — in production that's genuinely
    // same-origin (backend/src/index.ts serves this build as static
    // files), and here in dev it's proxied to the backend dev server
    // instead, so neither path needs env-var overrides or CORS.
    proxy: {
      "/api": { target: "http://localhost:3978", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3978", ws: true, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      // Two entry points: the meeting-side-panel tab (index.html) and the
      // configurableTabs config page (config.html, see docs/README.md for
      // when to use it vs. the simpler staticTabs manifest entry).
      input: {
        main: resolve(__dirname, "index.html"),
        config: resolve(__dirname, "config.html"),
      },
    },
  },
});
