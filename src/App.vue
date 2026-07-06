<script setup lang="ts">
// The "desktop": wallpaper + faux macOS menubar + a dock + the app windows
// (terminal, finder). Owns the cross-cutting state: which apps are open /
// minimized, z-order + focus, which tmux window is active, the live clock,
// and the Ctrl-Space prefix.
import { ref, reactive, computed, watch, watchEffect, onMounted, onUnmounted, nextTick } from "vue";
import MenuBar from "./components/MenuBar.vue";
import Dock from "./components/Dock.vue";
import DesktopWindow from "./components/DesktopWindow.vue";
import TmuxStatus from "./components/TmuxStatus.vue";
import ShellWindow from "./components/ShellWindow.vue";
import Finder from "./components/Finder.vue";

// Every tmux window is a real josh shell (each needs a focused <input> to keep
// the keyboard, so input-less windows are out). Window 2 just boots by cat-ing
// the about file. To add a window: append a name + a <ShellWindow> below.
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
const now = ref(new Date());

// --- window manager ---------------------------------------------------------
// Closed apps unmount (relaunch = fresh boot); minimized ones only hide, so
// their state survives the round-trip to the dock. leaveKind picks the
// transition: shrink-to-dock for minimize, fade-out for close.
type AppId = "terminal" | "finder";
type WinState = "open" | "minimized" | "closed";

const winState = reactive<Record<AppId, WinState>>({ terminal: "open", finder: "closed" });
const leaveKind = reactive<Record<AppId, "close" | "minimize">>({
  terminal: "close",
  finder: "close",
});
// bottom → top; z-index = position + 1, so windows always stay below the
// menubar (z 10) and the dock (z 9)
const zOrder = ref<AppId[]>(["finder", "terminal"]);
const zIndexOf = (id: AppId) => zOrder.value.indexOf(id) + 1;

// frontmost open window; null when everything is closed/minimized (the real
// macOS desktop state — menubar then says Finder)
const focusedApp = computed<AppId | null>(
  () => [...zOrder.value].reverse().find((id) => winState[id] === "open") ?? null,
);

function bringToFront(id: AppId) {
  zOrder.value = [...zOrder.value.filter((a) => a !== id), id];
}
function launch(id: AppId) {
  winState[id] = "open";
  bringToFront(id);
}
function closeWin(id: AppId) {
  leaveKind[id] = "close";
  winState[id] = "closed";
}
function minimizeWin(id: AppId) {
  leaveKind[id] = "minimize";
  winState[id] = "minimized";
}
function onDockLaunch(id: AppId) {
  if (winState[id] === "open") bringToFront(id);
  else launch(id);
}
// Mail lives in the terminal: make sure it's up, then run `mail` like a typed
// command. By nextTick a freshly relaunched shell has already booted, so the
// command lands after the banner.
function onDockMail() {
  onDockLaunch("terminal");
  nextTick(() => shells[active.value]?.value?.runCommand("mail"));
}

const shell1Ref = ref<InstanceType<typeof ShellWindow> | null>(null);
const shell2Ref = ref<InstanceType<typeof ShellWindow> | null>(null);
const shells = [shell1Ref, shell2Ref];

// Keep DOM focus in step with window focus: the terminal's hidden input must
// not swallow keystrokes while the finder is frontmost.
watch(focusedApp, (app) => {
  if (app === "terminal") {
    nextTick(() => shells[active.value]?.value?.focus());
  } else {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.classList.contains("term-capture")) el.blur();
  }
});

let clockTimer = 0;
let prefixTimer = 0;

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
  if (focusedApp.value !== "terminal") return; // tmux prefix belongs to the terminal
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

  <MenuBar
    :now="now"
    :theme="theme"
    :app="focusedApp === 'terminal' ? 'Terminal' : 'Finder'"
    @toggle-theme="toggleTheme"
  />

  <main class="stage">
    <Transition :name="'win-' + leaveKind.terminal">
      <DesktopWindow
        v-if="winState.terminal !== 'closed'"
        v-show="winState.terminal !== 'minimized'"
        ariaLabel="josef@hlink terminal"
        title="josef@hlink: ~ (tmux)"
        :z="zIndexOf('terminal')"
        :focused="focusedApp === 'terminal'"
        @close="closeWin('terminal')"
        @minimize="minimizeWin('terminal')"
        @focus="bringToFront('terminal')"
      >
        <TmuxStatus :windows="windows" :active="active" :prefix="prefix" @select="activate" />
        <div class="panes">
          <ShellWindow ref="shell1Ref" v-show="active === 0" />
          <ShellWindow ref="shell2Ref" boot-cmd="cat about.txt" v-show="active === 1" />
        </div>
      </DesktopWindow>
    </Transition>

    <Transition :name="'win-' + leaveKind.finder">
      <Finder
        v-if="winState.finder !== 'closed'"
        v-show="winState.finder !== 'minimized'"
        :z="zIndexOf('finder')"
        :focused="focusedApp === 'finder'"
        @close="closeWin('finder')"
        @minimize="minimizeWin('finder')"
        @focus="bringToFront('finder')"
      />
    </Transition>
  </main>

  <Dock
    :running="{ terminal: winState.terminal !== 'closed', finder: winState.finder !== 'closed' }"
    @launch="onDockLaunch"
    @mail="onDockMail"
  />
</template>
