<script setup lang="ts">
// The dock: fixed bottom-center frosted bar. Finder + Terminal launch/focus
// their windows (dot = running), Mail jumps into the terminal's compose flow,
// Safari is a dimmed teaser for the upcoming browser, Trash just wobbles.
// All icons are inline SVG — no assets to load.
import { ref } from "vue";

type AppId = "terminal" | "finder";

defineProps<{ running: Record<AppId, boolean> }>();
const emit = defineEmits<{ launch: [id: AppId]; mail: [] }>();

const wobbling = ref(false);
let wobbleTimer = 0;
function wobbleTrash() {
  wobbling.value = false;
  // restart the animation even on rapid clicks
  requestAnimationFrame(() => (wobbling.value = true));
  clearTimeout(wobbleTimer);
  wobbleTimer = window.setTimeout(() => (wobbling.value = false), 600);
}
</script>

<template>
  <nav class="dock" aria-label="dock">
    <button class="dock-item" aria-label="Finder" @click="emit('launch', 'finder')">
      <span class="dock-tip">Finder</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <defs>
          <clipPath id="dk-finder"><rect width="34" height="34" rx="8" /></clipPath>
        </defs>
        <g clip-path="url(#dk-finder)">
          <rect width="17" height="34" fill="#86e1fc" />
          <rect x="17" width="17" height="34" fill="#82aaff" />
          <path d="M17 5.5 V22" stroke="#1e2030" stroke-width="1.6" opacity="0.6" fill="none" />
          <path
            d="M11 13 v4.5 M23 13 v4.5"
            stroke="#1e2030"
            stroke-width="2.2"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M9.5 22.5 q7.5 5.5 15 0"
            stroke="#1e2030"
            stroke-width="2.2"
            stroke-linecap="round"
            fill="none"
          />
        </g>
      </svg>
      <span v-if="running.finder" class="dock-dot"></span>
    </button>

    <button class="dock-item" aria-label="Terminal" @click="emit('launch', 'terminal')">
      <span class="dock-tip">Terminal</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect x="0.75" y="0.75" width="32.5" height="32.5" rx="7.5" fill="#1b1d2b" stroke="#3b4261" stroke-width="1.5" />
        <text
          x="7"
          y="22.5"
          fill="#c3e88d"
          font-family="JetBrains Mono, monospace"
          font-size="13"
          font-weight="700"
        >
          &gt;_
        </text>
      </svg>
      <span v-if="running.terminal" class="dock-dot"></span>
    </button>

    <button class="dock-item" aria-label="Mail" @click="emit('mail')">
      <span class="dock-tip">Mail</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="#82aaff" />
        <rect
          x="7"
          y="10.5"
          width="20"
          height="13.5"
          rx="2"
          fill="none"
          stroke="#f4f6fb"
          stroke-width="1.8"
        />
        <path
          d="M8 12.5 L17 19 L26 12.5"
          fill="none"
          stroke="#f4f6fb"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button class="dock-item disabled" aria-label="Safari (coming soon)" aria-disabled="true">
      <span class="dock-tip">Safari — coming soon</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="#eef2fb" />
        <circle cx="17" cy="17" r="11" fill="none" stroke="#82aaff" stroke-width="2.4" />
        <path d="M23.5 10.5 L19.6 19.6 L14.4 14.4 Z" fill="#ff757f" />
        <path d="M10.5 23.5 L14.4 14.4 L19.6 19.6 Z" fill="#828bb8" />
      </svg>
    </button>

    <span class="dock-sep" aria-hidden="true"></span>

    <button
      class="dock-item"
      :class="{ wobble: wobbling }"
      aria-label="Trash (empty)"
      @click="wobbleTrash"
    >
      <span class="dock-tip">Trash (empty)</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <g fill="none" stroke="var(--text)" stroke-width="1.7" opacity="0.75">
          <path d="M9.5 9.5 L11.5 28 H22.5 L24.5 9.5" stroke-linejoin="round" />
          <path d="M7.5 9.5 H26.5" stroke-linecap="round" />
          <path d="M14 6.5 h6" stroke-linecap="round" />
          <path d="M13.6 13 l0.9 11.5 M17 13 v11.5 M20.4 13 l-0.9 11.5" opacity="0.7" />
        </g>
      </svg>
    </button>
  </nav>
</template>
