<script setup lang="ts">
// The interactive terminal: append-only scrollback + a single input line with a
// custom block caret. A transparent <input> captures keystrokes (so mobile
// keyboards work) while we render the visible line ourselves.
import { ref, onMounted, nextTick, computed } from "vue";
import { Shell } from "../shell";
import { fastfetch } from "../fastfetch";
import { esc } from "../util";

// optional command to run on boot instead of the fastfetch intro (e.g. window 2
// boots with `cat about.txt`). the window stays a normal interactive shell.
const props = defineProps<{ bootCmd?: string }>();

const shell = new Shell();

const lines = ref<string[]>([]); // committed scrollback; each entry is trusted HTML
const promptHtml = ref(shell.promptHTML());
const value = ref("");
const caret = ref(0);

const screenEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const history: string[] = [];
let histIndex = 0;
let draft = "";

// Split the current input around the caret so we can paint a block cursor.
// NOTE: these are raw substrings — Vue's {{ }} interpolation escapes them.
const before = computed(() => value.value.slice(0, caret.value));
const under = computed(() => value.value.slice(caret.value, caret.value + 1) || " ");
const after = computed(() => value.value.slice(caret.value + 1));

function scrollToBottom() {
  nextTick(() => {
    const el = screenEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function syncCaret() {
  caret.value = inputEl.value?.selectionStart ?? value.value.length;
}

function onInput() {
  value.value = inputEl.value?.value ?? "";
  histIndex = history.length;
  syncCaret();
}

function setValue(v: string) {
  value.value = v;
  const el = inputEl.value;
  if (el) {
    el.value = v;
    el.setSelectionRange(v.length, v.length);
  }
  caret.value = v.length;
}

function echo(raw: string, suffix = "") {
  lines.value.push(`<span class="term-prompt">${promptHtml.value}</span>${esc(raw)}${suffix}`);
}

function commit() {
  const raw = value.value;
  echo(raw);
  if (raw.trim() && history[history.length - 1] !== raw) history.push(raw);

  const res = shell.run(raw);
  if (res.clear) lines.value = [];
  else if (res.html) lines.value.push(res.html);

  promptHtml.value = shell.promptHTML(); // cwd may have changed
  setValue("");
  histIndex = history.length;
  draft = "";
  scrollToBottom();
}

function onKeydown(e: KeyboardEvent) {
  // Let App's capture-phase handler own the tmux prefix (Ctrl-Space).
  if (e.ctrlKey && e.code === "Space") return;

  if (e.key === "Enter") {
    e.preventDefault();
    commit();
  } else if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
    e.preventDefault();
    lines.value = [];
  } else if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
    e.preventDefault();
    echo(value.value, '<span class="c-dim">^C</span>');
    setValue("");
    histIndex = history.length;
    scrollToBottom();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (histIndex > 0) {
      if (histIndex === history.length) draft = value.value;
      setValue(history[--histIndex]);
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (histIndex < history.length) {
      histIndex++;
      setValue(histIndex === history.length ? draft : history[histIndex]);
    }
  }
}

function focus() {
  inputEl.value?.focus({ preventScroll: true });
}
defineExpose({ focus });

onMounted(() => {
  if (props.bootCmd) {
    // boot by "running" a command (no login banner) — stays interactive after
    echo(props.bootCmd);
    const res = shell.run(props.bootCmd);
    if (res.html) lines.value.push(res.html);
    promptHtml.value = shell.promptHTML();
  } else {
    const stamp = new Date().toString().replace(/ GMT.*/, "");
    lines.value.push(`<span class="c-dim">Last login: ${esc(stamp)} on ttys001</span>`);
    lines.value.push(fastfetch());
    lines.value.push(
      `<span class="c-dim">type </span><span class="c-green b">help</span><span class="c-dim"> to look around. there are easter eggs.</span>`,
    );
  }
  scrollToBottom();
  // focus is owned by App (so a hidden window doesn't grab focus on mount)
});
</script>

<template>
  <div class="term-screen" ref="screenEl" @click="focus">
    <div class="term-output">
      <div v-for="(l, i) in lines" :key="i" class="term-line" v-html="l"></div>
    </div>

    <div class="term-inputline">
      <span class="term-prompt" v-html="promptHtml"></span
      ><span class="term-typed">{{ before }}<span class="caret">{{ under }}</span>{{ after }}</span>
      <input
        ref="inputEl"
        class="term-capture"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        aria-label="terminal input"
        @input="onInput"
        @keydown="onKeydown"
        @keyup="syncCaret"
        @click.stop="syncCaret"
      />
    </div>
  </div>
</template>
