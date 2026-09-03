import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 53000,
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
