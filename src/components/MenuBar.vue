<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ now: Date; theme: "dark" | "light"; app: string }>();
const emit = defineEmits<{ "toggle-theme": [] }>();

// menu labels follow the frontmost app, like the real menubar
const MENUS: Record<string, string[]> = {
  Terminal: ["Shell", "Edit", "View", "Window", "Help"],
  Finder: ["File", "Edit", "View", "Go", "Window", "Help"],
  Safari: ["File", "Edit", "View", "History", "Bookmarks", "Window", "Help"],
};
const items = computed(() => MENUS[props.app] ?? MENUS.Finder);

const clock = computed(() => {
  const d = props.now;
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const date = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${date}  ${time}`;
});
</script>

<template>
  <header class="menubar">
    <div class="menu-left">
      <svg class="apple" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M17.05 12.04c-.03-2.6 2.13-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-1.72-.92-2.83-.9-1.46.02-2.8.85-3.55 2.16-1.51 2.62-.39 6.5 1.09 8.63.72 1.04 1.58 2.21 2.71 2.17 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.88-2.31-3.49M14.53 4.5c.6-.73 1.01-1.74.9-2.75-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.65.97.08 1.96-.49 2.56-1.21"
        />
      </svg>
      <span class="menu-app">{{ props.app }}</span>
      <span v-for="m in items" :key="m" class="menu-item">{{ m }}</span>
    </div>
    <div class="menu-right">
      <button
        class="menu-glyph"
        type="button"
        :aria-label="`switch to ${props.theme === 'dark' ? 'light' : 'dark'} mode`"
        @click="emit('toggle-theme')"
      >
        {{ props.theme === "dark" ? "◑" : "◐" }}
      </button>
      <span class="menu-clock">{{ clock }}</span>
    </div>
  </header>
</template>
