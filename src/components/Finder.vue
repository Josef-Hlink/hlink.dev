<script setup lang="ts">
// Finder: browse the same in-memory filesystem the shell walks, with a mouse.
// Owns its own navigation state (like each Shell owns a cwd) and wraps its own
// DesktopWindow — the parent only manages z-order/focus/open-state. Dotfiles
// stay hidden, like real Finder (keeps `.welcome` a terminal-only easter egg).
import { ref, computed } from "vue";
import DesktopWindow from "./DesktopWindow.vue";
import QuickLook from "./QuickLook.vue";
import { HOME, resolve, type FSDir, type FSFile, type FSNode } from "../fs";

defineProps<{ z: number; focused: boolean }>();
const emit = defineEmits<{ close: []; minimize: []; focus: [] }>();

const path = ref<string[]>([...HOME]);
const backStack = ref<string[][]>([]);
const fwdStack = ref<string[][]>([]);
const selected = ref<string | null>(null);
const quickLook = ref<FSFile | null>(null);

const node = computed<FSDir | null>(() => {
  const n = resolve(path.value);
  return n && n.type === "dir" ? n : null;
});

const entries = computed<FSNode[]>(() => {
  if (!node.value) return [];
  return Object.values(node.value.children)
    .filter((n) => !n.name.startsWith("."))
    .sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
    );
});

const title = computed(() =>
  path.value.length ? path.value[path.value.length - 1] : "hlink",
);

const FAVORITES: { label: string; to: string[] }[] = [
  { label: "josef", to: [...HOME] },
  { label: "projects", to: [...HOME, "projects"] },
  { label: "bin", to: ["bin"] },
];

const samePath = (a: string[], b: string[]) =>
  a.length === b.length && a.every((p, i) => p === b[i]);

function navigate(to: string[]) {
  if (samePath(to, path.value)) return;
  backStack.value.push([...path.value]);
  fwdStack.value = [];
  path.value = [...to];
  selected.value = null;
}
function goBack() {
  const p = backStack.value.pop();
  if (!p) return;
  fwdStack.value.push([...path.value]);
  path.value = p;
  selected.value = null;
}
function goForward() {
  const p = fwdStack.value.pop();
  if (!p) return;
  backStack.value.push([...path.value]);
  path.value = p;
  selected.value = null;
}

function open(n: FSNode) {
  if (n.type === "dir") navigate([...path.value, n.name]);
  else quickLook.value = n;
}
</script>

<template>
  <DesktopWindow
    ariaLabel="finder"
    :z="z"
    :focused="focused"
    :initial-size="{ w: 760, h: 480 }"
    :cascade="28"
    :min-w="560"
    :min-h="320"
    @close="emit('close')"
    @minimize="emit('minimize')"
    @focus="emit('focus')"
  >
    <template #titlebar>
      <div class="finder-toolbar">
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
        <span class="finder-title">{{ title }}</span>
      </div>
    </template>

    <div class="finder-body">
      <aside class="finder-side">
        <div class="finder-side-head">Favorites</div>
        <button
          v-for="f in FAVORITES"
          :key="f.label"
          class="finder-fav"
          :class="{ active: samePath(f.to, path) }"
          @click="navigate(f.to)"
        >
          <svg v-if="f.label === 'josef'" viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
            <path
              d="M2 6.5 L7 2 L12 6.5 V12 H8.5 V8.5 h-3 V12 H2 Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else-if="f.label === 'bin'" viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
            <path
              d="M2.5 3.5 L6 7 L2.5 10.5 M7.5 10.5 H12"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
            <path
              d="M1.5 4 q0-1 1-1 h3 l1.2 1.5 h5.8 q1 0 1 1 V10 q0 1-1 1 h-10 q-1 0-1-1 Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          {{ f.label }}
        </button>
      </aside>

      <div class="finder-main">
        <div class="finder-grid" @click.self="selected = null">
          <button
            v-for="n in entries"
            :key="n.name"
            class="finder-item"
            :class="{ selected: selected === n.name }"
            @click.stop="selected = n.name"
            @dblclick="open(n)"
          >
            <svg v-if="n.type === 'dir'" class="finder-icon" viewBox="0 0 44 44" aria-hidden="true">
              <path
                d="M5 12.5 q0-2.5 2.5-2.5 h9.5 l3.5 4 h16 q2.5 0 2.5 2.5 v15 q0 2.5-2.5 2.5 h-29 q-2.5 0-2.5-2.5 Z"
                fill="var(--blue)"
                opacity="0.92"
              />
              <path
                d="M5 15.5 h34 v-1 q0-2.5-2.5-2.5 h-16 l-3.5-4 h-9.5 q-2.5 0-2.5 2.5 Z"
                fill="var(--sky)"
                opacity="0.55"
              />
            </svg>
            <svg v-else class="finder-icon" viewBox="0 0 44 44" aria-hidden="true">
              <path
                d="M11.5 5.5 h16 l7 7 v26 h-23 Z"
                fill="var(--base)"
                stroke="var(--subtext)"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
              <path
                d="M27.5 5.5 v7 h7"
                fill="none"
                stroke="var(--subtext)"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
              <path
                d="M16.5 21.5 h11 M16.5 26.5 h11 M16.5 31.5 h7"
                fill="none"
                stroke="var(--overlay)"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <span class="finder-name">{{ n.name }}</span>
          </button>
        </div>
        <div class="finder-status">
          {{ entries.length }} item{{ entries.length === 1 ? "" : "s" }}
        </div>
      </div>
    </div>

    <QuickLook :file="quickLook" @close="quickLook = null" />
  </DesktopWindow>
</template>
