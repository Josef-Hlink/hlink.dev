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
              <!-- the dock's terminal icon: this very site, inside itself -->
              <svg viewBox="0 0 34 34" aria-hidden="true">
                <rect width="34" height="34" rx="8" fill="var(--dki-term-tile)" />
                <rect
                  x="2.2"
                  y="2.2"
                  width="29.6"
                  height="29.6"
                  rx="5.8"
                  fill="none"
                  stroke="var(--dki-term-ring)"
                  stroke-width="1.4"
                />
                <path
                  d="M8.5 10.5 L14 15 L8.5 19.5"
                  stroke="var(--dki-term-glyph)"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
                <path
                  d="M16.5 19.5 H22.5"
                  stroke="var(--dki-term-glyph)"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  fill="none"
                />
                <rect
                  x="0.5"
                  y="0.5"
                  width="33"
                  height="33"
                  rx="7.5"
                  fill="none"
                  stroke="var(--dki-edge)"
                />
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
              <!-- skeleton of the terminal app icon: no ring, the >_ takes
                   the ring's blue — the source of the app above it -->
              <svg viewBox="0 0 34 34" aria-hidden="true">
                <rect width="34" height="34" rx="8" fill="var(--dki-term-tile)" />
                <path
                  d="M8.5 10.5 L14 15 L8.5 19.5"
                  stroke="var(--dki-term-ring)"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
                <path
                  d="M16.5 19.5 H22.5"
                  stroke="var(--dki-term-ring)"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  fill="none"
                />
                <rect
                  x="0.5"
                  y="0.5"
                  width="33"
                  height="33"
                  rx="7.5"
                  fill="none"
                  stroke="var(--dki-edge)"
                />
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
