import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Static SPA. `vite build` -> dist/ of plain files you can serve from anywhere
// (Caddy/nginx on the nix box, or Cloudflare Pages). No server runtime needed.
export default defineConfig({
  plugins: [vue()],
});
