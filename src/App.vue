<script setup lang="ts">
// The "desktop": wallpaper + faux macOS menubar + one floating terminal window
// whose body hosts the tmux windows. Owns the cross-cutting state: which tmux
// window is active, the live clock, the Ctrl-Space prefix, and window dragging.
import { ref, watchEffect, onMounted, onUnmounted, nextTick } from "vue";
import MenuBar from "./components/MenuBar.vue";
import TmuxStatus from "./components/TmuxStatus.vue";
import ShellWindow from "./components/ShellWindow.vue";

// Every window is a real josh shell (each needs a focused <input> to keep the
// keyboard, so input-less windows are out). Window 2 just boots by cat-ing the
// about file. To add a window: append a name + a <ShellWindow> in the template.
const windows = ["josh", "josh"];

// Theme: the menubar's ◑ toggles dark/light, persisted across visits. An inline
// script in index.html applies the stored value before paint; we keep it synced.
type Theme = "dark" | "light";
const theme = ref<Theme>(localStorage.getItem("hlink-theme") === "light" ? "light" : "dark");
watchEffect(() => {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.value;
  localStorage.setItem("hlink-theme", theme.value);
});
const toggleTheme = () => (theme.value = theme.value === "dark" ? "light" : "dark");

const active = ref(0);
const prefix = ref(false);
const maximized = ref(false);
const windowVisible = ref(true);
const leaveKind = ref<"close" | "minimize">("close");
const now = ref(new Date());

// The window is an explicit fixed frame {x,y,w,h} so edges/corners resize
// naturally (the dragged edge moves, the opposite stays put).
const MENUBAR = 28; // matches --menubar-h
const MIN_W = 460;
const MIN_H = 280;
type Frame = { x: number; y: number; w: number; h: number };

function initialFrame(): Frame {
  if (window.innerWidth < 680) {
    return { x: 0, y: MENUBAR, w: window.innerWidth, h: window.innerHeight - MENUBAR };
  }
  const w = Math.min(940, Math.round(window.innerWidth * 0.94));
  const h = Math.min(600, Math.round(window.innerHeight * 0.74));
  return {
    x: Math.round((window.innerWidth - w) / 2),
    y: Math.round(MENUBAR + (window.innerHeight - MENUBAR - h) / 2),
    w,
    h,
  };
}
const frame = ref<Frame>(initialFrame());
const dragging = ref(false);
const resizing = ref(false);

const shell1Ref = ref<InstanceType<typeof ShellWindow> | null>(null);
const shell2Ref = ref<InstanceType<typeof ShellWindow> | null>(null);
const shells = [shell1Ref, shell2Ref];

let clockTimer = 0;
let prefixTimer = 0;

// --- drag (titlebar) ---
let drag: { px: number; py: number; x: number; y: number } | null = null;
function onTitlebarPointerdown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest(".light")) return; // let traffic lights click
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
  if (rz.dir.includes("e")) w = Math.max(MIN_W, s.w + dx);
  if (rz.dir.includes("s")) h = Math.max(MIN_H, s.h + dy);
  if (rz.dir.includes("w")) {
    w = Math.max(MIN_W, s.w - dx);
    x = right - w;
  }
  if (rz.dir.includes("n")) {
    h = Math.max(MIN_H, s.h - dy);
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

// Traffic lights. No dock to minimize into, so both close + minimize just
// dismiss the window (with different animations) — refresh to reopen.
function closeWin() {
  leaveKind.value = "close";
  windowVisible.value = false;
}
function minimizeWin() {
  leaveKind.value = "minimize";
  windowVisible.value = false;
}

function activate(i: number) {
  if (i < 0 || i >= windows.length) return;
  active.value = i;
  // focus the active window's shell input so the keyboard stays with us
  nextTick(() => shells[i]?.value?.focus());
}
const cycle = (d: number) => activate((active.value + d + windows.length) % windows.length);

function enterPrefix() {
  prefix.value = true;
  clearTimeout(prefixTimer);
  prefixTimer = window.setTimeout(() => (prefix.value = false), 2000);
}
function exitPrefix() {
  prefix.value = false;
  clearTimeout(prefixTimer);
}

// Capture phase so we intercept the prefix sequence before the terminal input
// (which lives inside this tree) ever sees the keystrokes.
function onKeydown(e: KeyboardEvent) {
  if (prefix.value) {
    // bare modifier presses shouldn't cancel the armed prefix (you're likely
    // still holding Ctrl from the chord) — just ignore them
    if (e.key === "Control" || e.key === "Shift" || e.key === "Alt" || e.key === "Meta") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // match the physical key (e.code) so it survives layout / input-source switches
    const digit = /^Digit([1-9])$/.exec(e.code); // base-index 1
    if (digit) activate(Number(digit[1]) - 1);
    else if (e.code === "KeyN") cycle(1);
    else if (e.code === "KeyP") cycle(-1);
    exitPrefix();
    return;
  }
  if (e.ctrlKey && e.code === "Space") {
    e.preventDefault();
    enterPrefix();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown, { capture: true });
  clockTimer = window.setInterval(() => (now.value = new Date()), 1000);
  nextTick(() => shell1Ref.value?.focus());
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown, true);
  clearInterval(clockTimer);
});
</script>

<template>
  <div class="wallpaper" aria-hidden="true"></div>

  <MenuBar :now="now" :theme="theme" @toggle-theme="toggleTheme" />

  <main class="stage">
    <Transition :name="'win-' + leaveKind">
      <section
        v-if="windowVisible"
        class="window"
        :class="{ maximized, interacting: dragging || resizing }"
        :style="
          maximized
            ? undefined
            : {
                left: frame.x + 'px',
                top: frame.y + 'px',
                width: frame.w + 'px',
                height: frame.h + 'px',
              }
        "
        aria-label="josef@hlink terminal"
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
            <button class="light red" aria-label="close" tabindex="-1" @click="closeWin">
              <span class="glyph">&times;</span>
            </button>
            <button class="light yellow" aria-label="minimize" tabindex="-1" @click="minimizeWin">
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
          <div class="title">josef@hlink: ~ (tmux)</div>
          <div class="lights-spacer"></div>
        </div>

        <div class="window-body">
          <TmuxStatus :windows="windows" :active="active" :prefix="prefix" @select="activate" />
          <div class="panes">
            <ShellWindow ref="shell1Ref" v-show="active === 0" />
            <ShellWindow ref="shell2Ref" boot-cmd="cat about.txt" v-show="active === 1" />
          </div>
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
    </Transition>
  </main>
</template>
