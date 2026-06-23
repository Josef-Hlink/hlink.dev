import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Static SPA. `vite build` -> dist/ of plain files you can serve from anywhere
// (Caddy/nginx on the nix box, or Cloudflare Pages). No server runtime needed.
//
// In prod the `mail` command POSTs to the same-origin /api/contact, which Caddy
// reverse-proxies to the contact service. For local dev, forward /api to that
// service running on :8788 so the flow works against `npm run dev`.
export default defineConfig({
  plugins: [vue()],
  server: {
    // 14 Aug — my birthday. Pinned so it never collides with another Vite app.
    port: 1408,
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
