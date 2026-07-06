<script setup lang="ts">
// A macOS window: explicit fixed frame {x,y,w,h}, titlebar drag, 8 resize
// handles, traffic lights, maximize. Extracted from App.vue so the desktop can
// host more than one app (terminal, finder, …). The parent owns z-order and
// focus; this component owns its own frame and maximized state.
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    ariaLabel: string;
    /** centered titlebar text; superseded by the #titlebar slot when present */
    title?: string;
    /** stacking order, set by the parent's window manager */
    z: number;
    focused: boolean;
    initialSize?: { w: number; h: number };
    /** px offset from dead center, so new windows don't stack exactly */
    cascade?: number;
    minW?: number;
    minH?: number;
  }>(),
  {
    title: "",
    initialSize: () => ({ w: 940, h: 600 }),
    cascade: 0,
    minW: 460,
    minH: 280,
  },
);

const emit = defineEmits<{ close: []; minimize: []; focus: [] }>();

const MENUBAR = 28; // matches --menubar-h
const DOCK_CLEAR = 74; // matches --dock-clear

type Frame = { x: number; y: number; w: number; h: number };

function initialFrame(): Frame {
  if (window.innerWidth < 680) {
    return {
      x: 0,
      y: MENUBAR,
      w: window.innerWidth,
      h: window.innerHeight - MENUBAR - DOCK_CLEAR,
    };
  }
  const w = Math.min(props.initialSize.w, Math.round(window.innerWidth * 0.94));
  const h = Math.min(props.initialSize.h, Math.round(window.innerHeight * 0.74));
  return {
    x: Math.round((window.innerWidth - w) / 2) + props.cascade,
    y: Math.round(MENUBAR + (window.innerHeight - MENUBAR - h) / 2) + props.cascade,
    w,
    h,
  };
}
const frame = ref<Frame>(initialFrame());
const maximized = ref(false);
const dragging = ref(false);
const resizing = ref(false);

// --- drag (titlebar) ---
let drag: { px: number; py: number; x: number; y: number } | null = null;
function onTitlebarPointerdown(e: PointerEvent) {
  // let interactive titlebar content (lights, toolbar buttons) receive clicks
  if ((e.target as HTMLElement).closest("button, a, input")) return;
  if (maximized.value) return; // no dragging while zoomed
  dragging.value = true;
  drag = { px: e.clientX, py: e.clientY, x: frame.value.x, y: frame.value.y };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onTitlebarPointermove(e: PointerEvent) {
  if (!drag) return;
  frame.value = {
    ...frame.value,
    x: drag.x + (e.clientX - drag.px),
    y: Math.max(MENUBAR, drag.y + (e.clientY - drag.py)),
  };
}
function onTitlebarPointerup() {
  drag = null;
  dragging.value = false;
}

// --- resize (8 edge/corner handles) ---
const RESIZE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
let rz: { dir: string; px: number; py: number; start: Frame } | null = null;
function onResizePointerdown(e: PointerEvent, dir: string) {
  e.preventDefault();
  resizing.value = true;
  rz = { dir, px: e.clientX, py: e.clientY, start: { ...frame.value } };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onResizePointermove(e: PointerEvent) {
  if (!rz) return;
  const dx = e.clientX - rz.px;
  const dy = e.clientY - rz.py;
  const s = rz.start;
  const right = s.x + s.w;
  const bottom = s.y + s.h;
  let { x, y, w, h } = s;
  if (rz.dir.includes("e")) w = Math.max(props.minW, s.w + dx);
  if (rz.dir.includes("s")) h = Math.max(props.minH, s.h + dy);
  if (rz.dir.includes("w")) {
    w = Math.max(props.minW, s.w - dx);
    x = right - w;
  }
  if (rz.dir.includes("n")) {
    h = Math.max(props.minH, s.h - dy);
    y = bottom - h;
    if (y < MENUBAR) {
      y = MENUBAR;
      h = bottom - MENUBAR;
    }
  }
  frame.value = { x, y, w, h };
}
function onResizePointerup() {
  rz = null;
  resizing.value = false;
}
</script>

<template>
  <section
    class="window"
    :class="{ maximized, interacting: dragging || resizing, focused }"
    :style="
      maximized
        ? { zIndex: z }
        : {
            zIndex: z,
            left: frame.x + 'px',
            top: frame.y + 'px',
            width: frame.w + 'px',
            height: frame.h + 'px',
          }
    "
    :aria-label="ariaLabel"
    @pointerdown.capture="emit('focus')"
  >
    <div
      class="titlebar"
      @pointerdown="onTitlebarPointerdown"
      @pointermove="onTitlebarPointermove"
      @pointerup="onTitlebarPointerup"
      @pointercancel="onTitlebarPointerup"
      @dblclick="maximized = !maximized"
    >
      <div class="lights">
        <button class="light red" aria-label="close" tabindex="-1" @click="emit('close')">
          <span class="glyph">&times;</span>
        </button>
        <button class="light yellow" aria-label="minimize" tabindex="-1" @click="emit('minimize')">
          <span class="glyph">&minus;</span>
        </button>
        <button
          class="light green"
          aria-label="zoom"
          tabindex="-1"
          @click="maximized = !maximized"
        >
          <span class="glyph">
            <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
              <path fill="currentColor" d="M1.6 1.6 H6 L1.6 6 Z M8.4 8.4 H4 L8.4 4 Z" />
            </svg>
          </span>
        </button>
      </div>
      <slot name="titlebar">
        <div class="title">{{ title }}</div>
      </slot>
      <div class="lights-spacer"></div>
    </div>

    <div class="window-body">
      <slot />
    </div>

    <!-- edge + corner resize handles (each carries its own resize cursor) -->
    <template v-if="!maximized">
      <div
        v-for="d in RESIZE_DIRS"
        :key="d"
        class="rz"
        :class="'rz-' + d"
        @pointerdown="onResizePointerdown($event, d)"
        @pointermove="onResizePointermove"
        @pointerup="onResizePointerup"
        @pointercancel="onResizePointerup"
      ></div>
    </template>
  </section>
</template>
