<script setup lang="ts">
defineProps<{
  windows: string[];
  active: number;
  prefix: boolean;
}>();

defineEmits<{ select: [i: number] }>();
</script>

<template>
  <header class="tmux">
    <!-- status-left: "#S #{?client_prefix,>_,}" in magenta -->
    <span class="tmux-left">
      <span class="tmux-session">hlink</span>
      <span v-if="prefix" class="tmux-prefix">&gt;_</span>
    </span>

    <!-- windows, absolute-centred. current window = "#I:#W#F" (cyan bold) -->
    <span class="tmux-wins">
      <button
        v-for="(w, i) in windows"
        :key="i"
        class="tmux-win"
        :class="{ active: i === active }"
        @click="$emit('select', i)"
      >{{ i + 1 }}:{{ w }}<template v-if="i === active">*</template></button>
    </span>

    <!-- status-right is empty -->
    <span class="tmux-right"></span>
  </header>
</template>
