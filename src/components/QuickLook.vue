<script setup lang="ts">
// Quick Look: a teleported overlay previewing one file. Teleport is required —
// the window clips its children (overflow: hidden), and the panel should float
// above everything. Content renders exactly like the shell's `cat`, so URLs
// come out as clickable .term-link anchors.
import { computed, onMounted, onUnmounted } from "vue";
import type { FSFile } from "../fs";
import { c, linkify } from "../util";

const props = defineProps<{ file: FSFile | null }>();
const emit = defineEmits<{ close: [] }>();

const bodyHtml = computed(() =>
  props.file ? c(linkify(props.file.content.replace(/\n+$/, "")), "text") : "",
);

function onKey(e: KeyboardEvent) {
  if (props.file && e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="ql">
      <div v-if="file" class="ql-backdrop" @click.self="emit('close')">
        <div class="ql-panel" role="dialog" :aria-label="'preview of ' + file.name">
          <div class="ql-head">
            <span class="ql-name">{{ file.name }}</span>
            <button class="ql-close" aria-label="close preview" @click="emit('close')">
              &times;
            </button>
          </div>
          <div class="ql-body" v-html="bodyHtml"></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
