// josh — josef's shell. The version is the project's canonical "iteration"
// marker: bump JOSH_VERSION and prepend a CHANGELOG entry each time we ship.
// It surfaces in fastfetch's `Shell:` line and via `josh --version`.

import { c } from "./util";

export const JOSH_VERSION = "0.2.0";

interface Release {
  version: string;
  date: string;
  notes: string[];
}

// newest first
export const CHANGELOG: Release[] = [
  {
    version: "0.2.0",
    date: "2026-05-27",
    notes: [
      "all commands now live in /bin, with a new which to locate them",
      "aliases: list or set your own with alias (ll, la & co. built in)",
      "-h help on any command, ls -l, and errors on unknown flags",
      "light / dark theme toggle up in the menubar",
      "small titlebar fixes",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-05-26",
    notes: [
      "first public release of hlink.dev",
      "interactive josh shell over a curated filesystem",
      "fastfetch with real per-visitor browser, memory & locale",
      "draggable + resizable terminal with tmux-style windows",
    ],
  },
];

// `josh -v` / `-V` / `--version` — version + a mini changelog of the latest release
export function joshVersion(): string {
  const latest = CHANGELOG[0];
  return [
    c("josh", "green", true) + c(` ${JOSH_VERSION}`, "text") + c("  ·  josef's shell", "dim"),
    "",
    c(`what's new in ${latest.version}`, "lav", true) + c(`  (${latest.date})`, "dim"),
    ...latest.notes.map((n) => c("  • ", "mauve") + c(n, "text")),
  ].join("\n");
}

// bare `josh` — we're already running it
export function joshNoop(): string {
  return (
    c("you're already running ", "dim") +
    c(`josh ${JOSH_VERSION}`, "green", true) +
    c(". try ", "dim") +
    c("josh --version", "green", true) +
    c(" to see what's new.", "dim")
  );
}
