<script setup lang="ts">
// Safari: a toy browser over the tiny fake internet in browser.ts. The klym
// showcase loads live in an iframe; other favorites are real links that open
// new tabs. Owns its navigation state (like each Shell owns a cwd) and wraps
// its own DesktopWindow — the parent only manages z-order/focus/open-state.
import { ref } from "vue";
import DesktopWindow from "./DesktopWindow.vue";
import { resolveInput, samePage, frameSrc, type Page } from "../browser";

defineProps<{ z: number; focused: boolean }>();
const emit = defineEmits<{ close: []; minimize: []; focus: [] }>();

const page = ref<Page>({ kind: "start" });
const backStack = ref<Page[]>([]);
const fwdStack = ref<Page[]>([]);
const address = ref("");

// Load state of the current frame page. "error" is transient — it never enters
// history; back/forward or retry re-enter the page and probe again.
const loadState = ref<"loading" | "ok" | "error">("ok");
const frameKey = ref(0); // bumped to force an iframe remount (reload/retry)
let navToken = 0; // invalidates probe/timer results from a superseded navigation
let failTimer = 0;

function syncAddress() {
  const p = page.value;
  address.value =
    p.kind === "frame"
      ? p.url.replace(/^https:\/\//, "")
      : p.kind === "notfound"
        ? p.input
        : p.kind === "bottom"
          ? "hlink.dev"
          : "";
}

function enterPage(p: Page) {
  syncAddress();
  clearTimeout(failTimer);
  const token = ++navToken;
  if (p.kind !== "frame") return;

  loadState.value = "loading";
  // Reachability probe: no-cors resolves opaquely whenever the server answers
  // at all and rejects only on network-level failure — exactly the split we
  // want. A CSP frame-ancestors block is NOT detectable from js (the probe
  // passes and the iframe still fires load), so that case shows the browser's
  // native refusal box until klym's deployment allows this origin.
  fetch(frameSrc(p.url), { mode: "no-cors", signal: AbortSignal.timeout(4000) }).catch(() => {
    // an overzealous extension can reject the probe while the frame loads
    // fine — only fail if the frame hasn't already come up
    if (token === navToken && loadState.value !== "ok") loadState.value = "error";
  });
  // belt and braces: a frame that never commits counts as unreachable
  failTimer = window.setTimeout(() => {
    if (token === navToken && loadState.value === "loading") loadState.value = "error";
  }, 10000);
}

// a load always wins — the hidden iframe keeps loading behind the error page,
// so a slow site (or a nested dev build pulling hundreds of modules) heals
// itself instead of staying stuck on "isn't answering"
function onFrameLoad() {
  loadState.value = "ok";
}

function navigate(p: Page) {
  if (samePage(p, page.value)) return reload();
  backStack.value.push(page.value);
  fwdStack.value = [];
  page.value = p;
  enterPage(p);
}
function reload() {
  frameKey.value++;
  enterPage(page.value);
}
function goBack() {
  const p = backStack.value.pop();
  if (!p) return;
  fwdStack.value.push(page.value);
  page.value = p;
  enterPage(p);
}
function goForward() {
  const p = fwdStack.value.pop();
  if (!p) return;
  backStack.value.push(page.value);
  page.value = p;
  enterPage(p);
}

/** Escape hatch: the framed site, full-size in a real tab. */
function popOut() {
  if (page.value.kind === "frame") window.open(page.value.url, "_blank", "noopener");
}

/** Navigate from raw user input (address bar, a dial, or the shell's `open`). */
function navigateTo(raw: string) {
  const t = resolveInput(raw);
  if (t.kind === "external") {
    window.open(t.url, "_blank", "noopener");
    syncAddress(); // the typed address opened elsewhere; show where we still are
    return;
  }
  navigate(t);
}
defineExpose({ navigateTo });
</script>

<template>
  <DesktopWindow
    ariaLabel="safari"
    :z="z"
    :focused="focused"
    :initial-size="{ w: 900, h: 620 }"
    :cascade="56"
    :min-w="560"
    :min-h="360"
    @close="emit('close')"
    @minimize="emit('minimize')"
    @focus="emit('focus')"
  >
    <template #titlebar>
      <div class="finder-toolbar safari-toolbar">
        <button
          class="finder-nav"
          aria-label="back"
          :disabled="!backStack.length"
          @click="goBack"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M8 1.5 L3.5 6 L8 10.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          class="finder-nav"
          aria-label="forward"
          :disabled="!fwdStack.length"
          @click="goForward"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M4 1.5 L8.5 6 L4 10.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <form class="safari-addr" @submit.prevent="navigateTo(address)">
          <input
            v-model="address"
            type="text"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            placeholder="search or enter website name"
            aria-label="address"
          />
        </form>
        <button
          class="finder-nav"
          aria-label="open in a real tab"
          :disabled="page.kind !== 'frame'"
          @click="popOut"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="M5 2.5 H3 q-1 0-1 1 V9 q0 1 1 1 h5.5 q1 0 1-1 V7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M7 2 h3.5 v3.5 M10.2 2.3 L5.8 6.7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </template>

    <div class="safari-body">
      <!-- start page: apps run live in here, repositories open real GitHub tabs.
           filled colorful tile = app, blue outline tile = repo. -->
      <div v-if="page.kind === 'start'" class="safari-start">
        <div class="safari-start-head">Apps</div>
        <div class="safari-dials">
          <button class="safari-dial" @click="navigateTo('klym.hlink.dev')">
            <span class="safari-tile">
              <!-- the real klym logo (klym/branding/klym-logo.svg) — fixed
                   brand colors, identical in both themes -->
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <polygon points="4,58 4,52 15,44 15,58" fill="#eab308" />
                <polygon points="15,58 15,44 26,34 26,58" fill="#f59e0b" />
                <polygon points="26,58 26,34 37,20 37,58" fill="#f97316" />
                <polygon points="37,58 37,20 48,4 48,58" fill="#dc2626" />
                <polygon points="48,58 48,4 59,58" fill="#7f1d1d" />
              </svg>
            </span>
            klym
          </button>
          <button class="safari-dial" @click="navigateTo('hlink.dev')">
            <span class="safari-tile full">
              <!-- the hlink mark (hlink/brand/hlink-tile.svg) — fixed brand
                   colours, identical in both themes, like klym's -->
              <svg viewBox="0 0 512 512" aria-hidden="true">
                <rect width="512" height="512" rx="112" fill="#1a1b26" />
                <path fill="#82aaff" d="M192 512L112 512C94.8 512 78.5 508.1 64 501.2L64 299Q64 260 79.1 224.2Q93.7 189.8 120.2 163.2Q146.8 136.7 181.2 122.1Q217 107 256 107Q280.7 107 304 113L304 213Q304 231.9 291.3 245.5Q275.8 235 256 235Q229.5 235 210.7 253.7Q192 272.5 192 299ZM320 411Q328.6 408.2 337 404.6Q374.3 388.8 403.1 360.1Q431.8 331.3 447.6 294Q447.8 293.6 447.9 293.3Q448 296.1 448 299L448 501.2C433.5 508.1 417.2 512 400 512L320 512ZM112 0L192 0L192 101Q183.4 103.8 175 107.4Q137.7 123.2 108.9 151.9Q80.2 180.7 64.4 218Q64.2 218.4 64.1 218.7Q64 215.9 64 213L64 10.8C78.5 3.9 94.8 0 112 0Z" />
                <path fill="#7dcfff" d="M220.7 266.5Q236.2 277 256 277Q282.5 277 301.3 258.3Q320 239.5 320 213L320 0L400 0C417.2 0 433.5 3.9 448 10.8L448 213Q448 252 432.9 287.8Q418.3 322.2 391.8 348.8Q365.2 375.3 330.8 389.9Q295 405 256 405Q231.3 405 208 399L208 299Q208 280.1 220.7 266.5Z" />
                <rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="var(--dki-edge)" stroke-width="8" />
              </svg>
            </span>
            hlink.dev
          </button>
        </div>

        <div class="safari-start-head">Repositories</div>
        <div class="safari-dials">
          <a
            class="safari-dial"
            href="https://github.com/Josef-Hlink/klym"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="safari-tile">
              <!-- klym's outline mark (klym/branding/klym-logo-outline-*.svg),
                   stroked in the repo-tile blue -->
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <g fill="none" stroke="var(--blue)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">
                  <path d="M4 58 V52 L15 44 L26 34 L37 20 L48 4 L59 58 Z" />
                  <path d="M15 58 V44 M26 58 V34 M37 58 V20 M48 58 V4" />
                </g>
              </svg>
            </span>
            klym
          </a>
          <a
            class="safari-dial"
            href="https://github.com/Josef-Hlink/hlink.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="safari-tile full">
              <!-- skeleton of the mark in the repo-tile blue, the source of
                   the app above it: the two links cut for over/under with no
                   gap (so a crossing is one line), legs running past the tile
                   and clipped (so the four ends stay open) -->
              <svg viewBox="0 0 512 512" aria-hidden="true">
                <defs>
                  <clipPath id="safari-hlink-skeleton">
                    <rect width="512" height="512" rx="112" />
                  </clipPath>
                </defs>
                <rect width="512" height="512" rx="112" fill="var(--dki-term-tile)" />
                <g
                  clip-path="url(#safari-hlink-skeleton)"
                  fill="none"
                  stroke="var(--dki-term-ring)"
                  stroke-width="14"
                  stroke-linejoin="round"
                >
                  <path d="M64 768L64 299Q64 260 79.1 224.2Q93.7 189.8 120.2 163.2Q146.8 136.7 181.2 122.1Q217 107 256 107Q289.2 107 320 117.9L320 213Q320 237.9 303.4 256Q302.4 254.9 301.3 253.7Q282.5 235 256 235Q229.5 235 210.7 253.7Q192 272.5 192 299L192 768ZM320 394.1Q325.4 392.1 330.8 389.9Q365.2 375.3 391.8 348.8Q418.3 322.2 432.9 287.8Q439.5 272.2 443.2 256Q448 277 448 299L448 768L320 768Z" />
                  <path d="M208.6 256Q209.6 257.1 210.7 258.3Q229.5 277 256 277Q282.5 277 301.3 258.3Q320 239.5 320 213L320 -256L448 -256L448 213Q448 252 432.9 287.8Q418.3 322.2 391.8 348.8Q365.2 375.3 330.8 389.9Q295 405 256 405Q222.8 405 192 394.1L192 299Q192 274.1 208.6 256ZM192 -256L192 117.9Q186.6 119.9 181.2 122.1Q146.8 136.7 120.2 163.2Q93.7 189.8 79.1 224.2Q72.5 239.8 68.8 256Q64 235 64 213L64 -256Z" />
                </g>
                <rect x="4" y="4" width="504" height="504" rx="108" fill="none" stroke="var(--dki-edge)" stroke-width="8" />
              </svg>
            </span>
            hlink.dev
          </a>
          <a
            class="safari-dial"
            href="https://github.com/Josef-Hlink/twin"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="safari-tile">
              <!-- twin builds tmux sessions: a window split into panes -->
              <svg viewBox="0 0 34 34" aria-hidden="true">
                <g fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round">
                  <rect x="5" y="7" width="24" height="20" rx="3" />
                  <path d="M17 7 V27 M17 17 H29" />
                </g>
              </svg>
            </span>
            twin
          </a>
        </div>
        <p class="safari-start-hint">
          a small internet — the terminal's <code>open</code> command lands here too
        </p>
      </div>

      <!-- a framed site (klym) -->
      <template v-else-if="page.kind === 'frame'">
        <iframe
          :key="page.url + ':' + frameKey"
          :src="frameSrc(page.url)"
          class="safari-frame"
          :title="page.host"
          v-show="loadState !== 'error'"
          @load="onFrameLoad"
        ></iframe>
        <div v-if="loadState === 'loading'" class="safari-veil">loading…</div>
        <div v-else-if="loadState === 'error'" class="safari-errpage">
          <svg class="safari-err-compass" viewBox="0 0 34 34" aria-hidden="true">
            <circle cx="17" cy="17" r="14" fill="var(--dki-safari-dial)" />
            <circle cx="17" cy="17" r="12.4" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.8" />
            <path d="M25.3 8.7 L19.8 19.8 L14.2 14.2 Z" fill="#ff5b50" />
            <path d="M8.7 25.3 L14.2 14.2 L19.8 19.8 Z" fill="#f2f4f8" />
          </svg>
          <div class="safari-err-title">{{ page.host }} isn't answering</div>
          <p>check your connection, or try again in a bit</p>
          <button class="safari-err-btn" @click="reload">try again</button>
        </div>
      </template>

      <!-- the recursion floor: a framed copy can't frame itself again -->
      <div v-else-if="page.kind === 'bottom'" class="safari-errpage">
        <svg class="safari-err-compass" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="14" fill="var(--dki-safari-dial)" />
          <circle cx="17" cy="17" r="12.4" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.8" />
          <path d="M25.3 8.7 L19.8 19.8 L14.2 14.2 Z" fill="#ff5b50" />
          <path d="M8.7 25.3 L14.2 14.2 L19.8 19.8 Z" fill="#f2f4f8" />
        </svg>
        <div class="safari-err-title">you've hit the bottom of the rabbit hole</div>
        <p>the browser won't nest a page inside itself twice — two dreams deep is the limit</p>
        <button class="safari-err-btn" @click="navigateTo('')">back to favorites</button>
      </div>

      <!-- fake-DNS miss -->
      <div v-else class="safari-errpage">
        <svg class="safari-err-compass" viewBox="0 0 34 34" aria-hidden="true">
          <circle cx="17" cy="17" r="14" fill="var(--dki-safari-dial)" />
          <circle cx="17" cy="17" r="12.4" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.8" />
          <path d="M25.3 8.7 L19.8 19.8 L14.2 14.2 Z" fill="#ff5b50" />
          <path d="M8.7 25.3 L14.2 14.2 L19.8 19.8 Z" fill="#f2f4f8" />
        </svg>
        <div class="safari-err-title">Safari can't find the server "{{ page.host }}"</div>
        <p>this internet only has a few sites — the favorites know the way</p>
        <button class="safari-err-btn" @click="navigateTo('')">back to favorites</button>
      </div>

      <!-- while unfocused, the first click focuses the window instead of
           landing inside the iframe (macOS-style); it bubbles to the
           DesktopWindow's capture handler, then this guard unmounts -->
      <div v-if="!focused" class="safari-guard" aria-hidden="true"></div>
    </div>
  </DesktopWindow>
</template>
