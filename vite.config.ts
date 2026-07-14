import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The box "boots" at each release: fastfetch's Uptime and who's login time for
// josef count from the latest tag's commit time, injected here at build time.
// Fresh clone without tags (or no git at all) falls back to the build moment.
function releaseTime(): string {
  try {
    const tag = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
    return execSync(`git log -1 --format=%cI ${tag}`, { encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString();
  }
}

// Static SPA. `vite build` -> dist/ of plain files you can serve from anywhere
// (Caddy/nginx on the nix box, or Cloudflare Pages). No server runtime needed.
//
// In prod the `mail` command POSTs to the same-origin /api/contact, which Caddy
// reverse-proxies to the contact service. For local dev, forward /api to that
// service running on :8788 so the flow works against `npm run dev`.
export default defineConfig({
  define: { __RELEASE_TIME__: JSON.stringify(releaseTime()) },
  plugins: [vue()],
  server: {
    // 14 Aug — my birthday. Pinned so it never collides with another Vite app.
    port: 1408,
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
