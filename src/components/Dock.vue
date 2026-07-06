<script setup lang="ts">
// The dock: fixed bottom-center frosted bar. Finder + Terminal + Safari
// launch/focus their windows (dot = running), Mail jumps into the terminal's
// compose flow, Trash just wobbles. All icons are inline SVG — no assets to
// load.
import { ref } from "vue";

type AppId = "terminal" | "finder" | "safari";

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
    <!-- Icon colors come from --dki-* vars (scoped on .dock, flipped by theme):
         dark = charcoal tiles with colored motifs, light = classic colorful tiles. -->
    <button class="dock-item" aria-label="Finder" @click="emit('launch', 'finder')">
      <span class="dock-tip">Finder</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <defs>
          <clipPath id="dkf-tile"><rect width="34" height="34" rx="8" /></clipPath>
          <clipPath id="dkf-l"><rect width="17" height="34" /></clipPath>
          <clipPath id="dkf-r"><rect x="17" width="17" height="34" /></clipPath>
        </defs>
        <g clip-path="url(#dkf-tile)">
          <rect width="34" height="34" fill="var(--dki-finder-b)" />
          <!-- left half of the face; the profile's nose notches into it,
               pointing left like the real icon -->
          <path
            d="M0 0 H17 V11 L13 15.2 Q12.2 16 13 16.8 L17 20.5 V34 H0 Z"
            fill="var(--dki-finder-a)"
          />
          <!-- eyes: each sits fully in its half, colored with the other half -->
          <path
            d="M10 10.5 v4.6"
            stroke="var(--dki-finder-b)"
            stroke-width="2.4"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M24 10.5 v4.6"
            stroke="var(--dki-finder-a)"
            stroke-width="2.4"
            stroke-linecap="round"
            fill="none"
          />
          <!-- the smile spans both halves, so it's drawn twice and clipped -->
          <g clip-path="url(#dkf-l)">
            <path
              d="M7.5 23 Q17 30.5 26.5 23"
              stroke="var(--dki-finder-b)"
              stroke-width="2.4"
              stroke-linecap="round"
              fill="none"
            />
          </g>
          <g clip-path="url(#dkf-r)">
            <path
              d="M7.5 23 Q17 30.5 26.5 23"
              stroke="var(--dki-finder-a)"
              stroke-width="2.4"
              stroke-linecap="round"
              fill="none"
            />
          </g>
        </g>
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
      <span v-if="running.finder" class="dock-dot"></span>
    </button>

    <button class="dock-item" aria-label="Terminal" @click="emit('launch', 'terminal')">
      <span class="dock-tip">Terminal</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="var(--dki-term-tile)" />
        <!-- blue inner ring: deliberate off-canon touch so every icon carries
             some blue -->
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
      <span v-if="running.terminal" class="dock-dot"></span>
    </button>

    <button class="dock-item" aria-label="Mail" @click="emit('mail')">
      <span class="dock-tip">Mail</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="var(--dki-mail-tile)" />
        <rect x="6.5" y="10" width="21" height="14.5" rx="2" fill="var(--dki-mail-env)" />
        <!-- flap + bottom seams, engraved in the tile color -->
        <path
          d="M7.5 11.8 L17 18.6 L26.5 11.8"
          stroke="var(--dki-mail-tile)"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
        <path
          d="M7.8 23.6 L14 18 M26.2 23.6 L20 18"
          stroke="var(--dki-mail-tile)"
          stroke-width="1.3"
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
    </button>

    <button class="dock-item" aria-label="Safari" @click="emit('launch', 'safari')">
      <span class="dock-tip">Safari</span>
      <svg class="dock-svg" viewBox="0 0 34 34" aria-hidden="true">
        <rect width="34" height="34" rx="8" fill="var(--dki-safari-tile)" />
        <circle cx="17" cy="17" r="11.5" fill="var(--dki-safari-dial)" />
        <circle
          cx="17"
          cy="17"
          r="10.2"
          fill="none"
          stroke="rgba(255, 255, 255, 0.4)"
          stroke-width="0.8"
        />
        <path d="M23.8 10.2 L19.3 19.3 L14.7 14.7 Z" fill="#ff5b50" />
        <path d="M10.2 23.8 L14.7 14.7 L19.3 19.3 Z" fill="#f2f4f8" />
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
      <span v-if="running.safari" class="dock-dot"></span>
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
        <g fill="none" stroke="var(--dki-trash)" stroke-width="1.7" opacity="0.85">
          <path d="M9.5 9.5 L11.5 28 H22.5 L24.5 9.5" stroke-linejoin="round" />
          <path d="M7.5 9.5 H26.5" stroke-linecap="round" />
          <path d="M14 6.5 h6" stroke-linecap="round" />
          <path d="M13.6 13 l0.9 11.5 M17 13 v11.5 M20.4 13 l-0.9 11.5" opacity="0.7" />
        </g>
      </svg>
    </button>
  </nav>
</template>
