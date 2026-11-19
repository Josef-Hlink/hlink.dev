import { execSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

// The box "boots" at each release: fastfetch's Uptime and who's login time for
// josef count from the latest tag's commit time, injected here at build time.
// The nix build has no .git, so the flake passes that time in as
// HLINK_RELEASE_TIME (unix seconds); otherwise git is asked. Fresh clone
// without tags (or no git at all) falls back to the build moment.
function releaseTime(): string {
  const fromNix = Number(process.env.HLINK_RELEASE_TIME);
  if (fromNix > 0) return new Date(fromNix * 1000).toISOString();
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
//
// In a zone on maria the dev server sits behind caddy
// (https://hlink.<zone>.dev.hlink.dev -> <zone>:1408): `zone env` writes
// HLINK_WEB_HOST / _WEB_ALLOWED_HOSTS / _HMR_CLIENT_PORT into .env so it
// listens past loopback, accepts the zone's hostnames and sends HMR back
// through 443. Unset (lucy, prod builds) it all stays vite's default. Each
// zone has its own loopback, so the relay's :8788 never collides.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "HLINK_");
  const hmrClientPort = Number(env.HLINK_HMR_CLIENT_PORT);
  return {
    define: { __RELEASE_TIME__: JSON.stringify(releaseTime()) },
    plugins: [vue()],
    server: {
      host: env.HLINK_WEB_HOST,
      // 14 Aug — my birthday. Pinned so it never collides with another Vite
      // app, and strict because caddy routes to this port and no other.
      port: 1408,
      strictPort: true,
      allowedHosts: env.HLINK_WEB_ALLOWED_HOSTS?.split(","),
      hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
      proxy: {
        "/api": "http://localhost:8788",
      },
    },
  };
});
