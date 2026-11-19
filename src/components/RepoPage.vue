<script setup lang="ts">
// A repo's front page, homemade: github.com refuses to be framed, so Safari
// draws its own from the public API (github.ts) — name, description, the
// language bar, README first, then the files. Files and the header link out to the real site in a new tab.
//
// The README is GitHub's own rendered, sanitized HTML, shown in a sandboxed
// srcdoc frame without allow-scripts: nothing in it can ever run. Same-origin
// is allowed only so we can size the frame to its content.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchRepo, type Repo, type RepoError } from "../github";

const props = defineProps<{ owner: string; name: string; url: string }>();

const repo = ref<Repo | null>(null);
const error = ref<RepoError | null>(null);
let token = 0;

async function load() {
  const t = ++token;
  repo.value = null;
  error.value = null;
  try {
    const r = await fetchRepo(props.owner, props.name);
    if (t === token) repo.value = r;
  } catch (e) {
    if (t === token) error.value = (e as RepoError) ?? "offline";
  }
}
watch(() => props.url, load, { immediate: true });

const open = (url: string) => window.open(url, "_blank", "noopener");

// GitHub's linguist colours for what's likely to show up here
const LANG: Record<string, string> = {
  Go: "#00ADD8",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Python: "#3572A5",
  Nix: "#7e7eff",
  Shell: "#89e051",
  Rust: "#dea584",
  TeX: "#3D6117",
  HTML: "#e34c26",
  CSS: "#663399",
  Makefile: "#427819",
  "Monkey C": "#8D6747",
  Dockerfile: "#384d54",
  Lua: "#000080",
};
const langColor = (name: string) => LANG[name] ?? "var(--overlay)";
// GitHub's rounding: one decimal, but never a flat 0.0% for something present
const pct = (v: number) => (v < 0.1 ? "<0.1" : v.toFixed(1)) + "%";

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const steps: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [n, unit] of steps) {
    const v = Math.floor(s / n);
    if (v >= 1) return `${v} ${unit}${v === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

const errorText = computed(() =>
  error.value === "notfound"
    ? ["no such repo", "GitHub doesn't know it, or it's private"]
    : error.value === "ratelimit"
      ? ["GitHub needs a breather", "its API caps how often one browser may ask — try again in a bit"]
      : ["github.com isn't answering", "check your connection, or try again in a bit"],
);

// --- README frame: themed from the page's own tokens, re-themed on toggle ---
const theme = ref(document.documentElement.dataset.theme ?? "dark");
const themeObserver = new MutationObserver(() => {
  theme.value = document.documentElement.dataset.theme ?? "dark";
});
onMounted(() =>
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }),
);
onBeforeUnmount(() => {
  themeObserver.disconnect();
  sizer?.disconnect();
});

const readmeDoc = computed(() => {
  if (!repo.value?.readmeHtml) return "";
  void theme.value; // recompute on theme toggle
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  html { color-scheme: ${theme.value === "light" ? "light" : "dark"}; }
  body { margin: 0; font: 13.5px/1.6 -apple-system, system-ui, sans-serif; color: ${v("--text")}; background: transparent; overflow: hidden; }
  a { color: ${v("--blue")}; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .anchor { display: none; }
  h1, h2 { padding-bottom: .3em; border-bottom: 1px solid ${v("--surface0")}; }
  h1 { font-size: 1.6em; margin: 0 0 .6em; } h2 { font-size: 1.3em; margin: 1.4em 0 .6em; }
  h3 { font-size: 1.1em; margin: 1.2em 0 .5em; }
  p, ul, ol, pre, table, blockquote { margin: 0 0 1em; }
  code, pre { font-family: ${v("--mono")}; font-size: 12px; }
  code { background: ${v("--surface0")}; padding: .15em .35em; border-radius: 4px; }
  pre { background: ${v("--mantle")}; border: 1px solid ${v("--surface0")}; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid ${v("--surface1")}; color: ${v("--subtext")}; }
  table { border-collapse: collapse; } th, td { border: 1px solid ${v("--surface0")}; padding: 4px 10px; }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid ${v("--surface0")}; }
</style></head><body>${repo.value.readmeHtml}</body></html>`;
});

const frame = ref<HTMLIFrameElement | null>(null);
let sizer: ResizeObserver | null = null;
function fitFrame() {
  const f = frame.value;
  const body = f?.contentDocument?.body;
  if (!f || !body) return;
  const fit = () => (f.style.height = body.scrollHeight + "px");
  fit();
  sizer?.disconnect();
  sizer = new ResizeObserver(fit); // late images, theme reflow
  sizer.observe(body);
}
</script>

<template>
  <div v-if="error" class="safari-errpage">
    <svg class="safari-err-compass" viewBox="0 0 34 34" aria-hidden="true">
      <circle cx="17" cy="17" r="14" fill="var(--dki-safari-dial)" />
      <circle cx="17" cy="17" r="12.4" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.8" />
      <path d="M25.3 8.7 L19.8 19.8 L14.2 14.2 Z" fill="#ff5b50" />
      <path d="M8.7 25.3 L14.2 14.2 L19.8 19.8 Z" fill="#f2f4f8" />
    </svg>
    <div class="safari-err-title">{{ errorText[0] }}</div>
    <p>{{ errorText[1] }}</p>
    <div class="repo-err-btns">
      <button v-if="error !== 'notfound'" class="safari-err-btn" @click="load">try again</button>
      <button class="safari-err-btn" @click="open(url)">open on GitHub</button>
    </div>
  </div>

  <div v-else-if="!repo" class="safari-veil">loading…</div>

  <div v-else class="repo">
    <header class="repo-head">
      <div class="repo-title">
        <span class="repo-owner">{{ owner }}</span>
        <span class="repo-slash">/</span>
        <span class="repo-name">{{ name }}</span>
        <span class="repo-pill">Public</span>
      </div>
      <button class="safari-err-btn repo-gh" @click="open(repo.htmlUrl)">
        <!-- GitHub's mark (octicon mark-github) -->
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
        GitHub
      </button>
    </header>
    <p v-if="repo.description" class="repo-desc">{{ repo.description }}</p>
    <div class="repo-meta">
      <span>★ {{ repo.stars }}</span>
      <span>updated {{ ago(repo.pushedAt) }}</span>
      <a v-if="repo.homepage" :href="repo.homepage" target="_blank" rel="noopener noreferrer">{{
        repo.homepage.replace(/^https?:\/\//, "")
      }}</a>
      <span v-for="t in repo.topics" :key="t" class="repo-topic">{{ t }}</span>
    </div>

    <div v-if="repo.languages.length" class="repo-langs">
      <div class="repo-langbar" aria-hidden="true">
        <span
          v-for="l in repo.languages"
          :key="l.name"
          :style="{ width: l.pct + '%', background: langColor(l.name) }"
        ></span>
      </div>
      <ul class="repo-langlist">
        <li v-for="l in repo.languages" :key="l.name">
          <i :style="{ background: langColor(l.name) }"></i>{{ l.name }}
          <span>{{ pct(l.pct) }}</span>
        </li>
      </ul>
    </div>

    <section v-if="readmeDoc" class="repo-readme">
      <div class="repo-readme-head">README</div>
      <iframe
        ref="frame"
        :srcdoc="readmeDoc"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title="README"
        @load="fitFrame"
      ></iframe>
    </section>

    <ul class="repo-files">
      <li v-for="e in repo.entries" :key="e.name">
        <a :href="e.url" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              v-if="e.dir"
              d="M1.75 3h4.1l1.5 1.5h6.9c.41 0 .75.34.75.75v7c0 .41-.34.75-.75.75H1.75A.75.75 0 0 1 1 12.25v-8.5C1 3.34 1.34 3 1.75 3Z"
              fill="var(--blue)"
            />
            <path
              v-else
              d="M3.75 1.5h5.5L12.5 4.75v9a.75.75 0 0 1-.75.75h-8a.75.75 0 0 1-.75-.75V2.25c0-.41.34-.75.75-.75Z"
              fill="none"
              stroke="var(--overlay)"
              stroke-width="1.2"
            />
          </svg>
          {{ e.name }}
        </a>
      </li>
    </ul>

  </div>
</template>

<style scoped>
.repo {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 28px 32px;
  background: var(--base);
  color: var(--text);
}
.repo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.repo-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 17px;
  min-width: 0;
}
.repo-owner {
  color: var(--subtext);
}
.repo-slash {
  color: var(--overlay);
}
.repo-name {
  font-weight: 700;
  color: var(--blue);
}
.repo-pill {
  align-self: center;
  margin-left: 4px;
  padding: 1px 8px;
  border: 1px solid var(--surface1);
  border-radius: 999px;
  font-size: 11px;
  color: var(--subtext);
}
.repo-gh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 0;
  flex: none;
}
.repo-gh svg {
  width: 14px;
  height: 14px;
}
.repo-desc {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--text);
}
.repo-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--overlay);
}
.repo-meta a {
  color: var(--blue);
  text-decoration: none;
}
.repo-meta a:hover {
  text-decoration: underline;
}
.repo-langs {
  margin-top: 16px;
}
.repo-langbar {
  display: flex;
  gap: 2px;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}
.repo-langbar span {
  min-width: 2px;
}
.repo-langlist {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--text);
}
.repo-langlist i {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: -0.5px;
}
.repo-langlist span {
  margin-left: 4px;
  color: var(--overlay);
}
.repo-topic {
  padding: 0 8px;
  border-radius: 999px;
  background: var(--surface0);
  color: var(--blue);
}
.repo-files {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  border: 1px solid var(--surface0);
  border-radius: 8px;
  overflow: hidden;
  font-size: 12.5px;
}
.repo-files li + li {
  border-top: 1px solid var(--surface0);
}
.repo-files a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  color: var(--text);
  text-decoration: none;
}
.repo-files a:hover {
  background: var(--surface0);
  color: var(--blue);
}
.repo-files svg {
  flex: none;
  width: 14px;
  height: 14px;
}
.repo-readme {
  margin-top: 18px;
  border: 1px solid var(--surface0);
  border-radius: 8px;
}
.repo-readme-head {
  padding: 8px 14px;
  border-bottom: 1px solid var(--surface0);
  font-size: 12px;
  font-weight: 700;
  color: var(--subtext);
}
.repo-readme iframe {
  display: block;
  width: calc(100% - 40px);
  margin: 16px 20px;
  border: 0;
  height: 0;
}
.repo-err-btns {
  display: flex;
  gap: 8px;
}
</style>
