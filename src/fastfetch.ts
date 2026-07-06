// Renders the fastfetch block shown when the terminal boots (and on `ff`).
// The logo is the classic Apple mark, rainbow-banded per row via theme tokens.
// Everything is real monospace text — selectable, copyable, same line grid as
// the rest of the terminal. Returns a trusted HTML string (no user input).

import { c, esc, type Color } from "./util";
import { JOSH_VERSION } from "./josh";

// Real, per-visitor: read the actual browser + version from navigator. Prefers
// the structured userAgentData (Chromium) and falls back to UA-string parsing.
function detectBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const trim = (v: string) => v.replace(/(\.0)+$/, ""); // 131.0.0.0 -> 131

  const uaData = (navigator as { userAgentData?: { brands?: { brand: string; version: string }[] } })
    .userAgentData;
  if (uaData?.brands?.length) {
    const brands = uaData.brands;
    const pick =
      brands.find((b) => /Edge|Opera|Brave|Arc|Vivaldi/i.test(b.brand)) ??
      brands.find((b) => /Google Chrome/i.test(b.brand)) ??
      brands.find((b) => !/Not.?A.?Brand/i.test(b.brand));
    if (pick) {
      const name = pick.brand.replace(/Google |Microsoft /, "");
      return `${name} ${trim(pick.version)}`;
    }
  }

  const ver = (re: RegExp) => trim(ua.match(re)?.[1] ?? "");
  if (/Edg\//.test(ua)) return `Edge ${ver(/Edg\/([\d.]+)/)}`;
  if (/OPR\/|Opera/.test(ua)) return `Opera ${ver(/(?:OPR|Opera)\/([\d.]+)/)}`;
  if (/Firefox\//.test(ua)) return `Firefox ${ver(/Firefox\/([\d.]+)/)}`;
  if (/Chrome\//.test(ua)) return `Chrome ${ver(/Chrome\/([\d.]+)/)}`;
  if (/Version\/[\d.]+.*Safari\//.test(ua)) return `Safari ${ver(/Version\/([\d.]+)/)}`;
  return "unknown";
}

// Real (Chromium only): JS heap in use + the heap budget (jsHeapSizeLimit), in
// MiB. This is the JS heap — smaller than the full per-tab figure browsers
// show, which needs cross-origin isolation to read. null on Safari/Firefox.
function memoryMiB(): { used: number; limit: number } | null {
  if (typeof performance === "undefined") return null;
  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  if (!mem) return null;
  return {
    used: Math.round(mem.usedJSHeapSize / 1048576),
    limit: Math.round(mem.jsHeapSizeLimit / 1048576),
  };
}

// More real, per-visitor values.
const locale = (): string =>
  typeof navigator !== "undefined" ? navigator.language || "unknown" : "unknown";

const timezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  } catch {
    return "unknown";
  }
};

const cores = (): string => {
  const n = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
  return n ? String(n) : "unknown";
};

const LOGO = `                     ..'
                 ,xNMM.
               .OMMMMo
               lMM"
     .;loddo:.  .olloddol;.
   cKMMMMMMMMMMNWMMMMMMMMMM0:
 .KMMMMMMMMMMMMMMMMMMMMMMMWd.
 XMMMMMMMMMMMMMMMMMMMMMMMX.
;MMMMMMMMMMMMMMMMMMMMMMMM:
:MMMMMMMMMMMMMMMMMMMMMMMM:
.MMMMMMMMMMMMMMMMMMMMMMMMX.
 kMMMMMMMMMMMMMMMMMMMMMMMMWd.
 'XMMMMMMMMMMMMMMMMMMMMMMMMMMk
  'XMMMMMMMMMMMMMMMMMMMMMMMMK.
    kMMMMMMMMMMMMMMMMMMMMMMd
     ;KMMMMMMMWXXWMMMMMMMk.
       "cooc*"    "*coo'"`;

// "Label: value" line.
const field = (label: string, value: string): string =>
  c(label, "blue", true) + c(":", "dim") + " " + value;

const COLORS = ["red", "peach", "yellow", "green", "teal", "blue", "mauve", "pink"] as const;

// one row of color blocks — actual ███ characters, like the real tool prints
const colorRow = (bright: boolean): string => {
  const row = COLORS.map((name) => c("███", name)).join("");
  return bright ? `<span class="nf-bright">${row}</span>` : row;
};

// rainbow band color for each logo row (Apple palette, top→bottom), via theme tokens
const BANDS: Color[] = [
  "green", "green", "green", "green",
  "yellow", "yellow", "yellow",
  "peach", "peach", "peach",
  "red", "red", "red",
  "mauve", "mauve",
  "blue", "blue",
];

export function fastfetch(): string {
  const res =
    typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown";

  // used + budget are real where available; fall back to the fake 8 GB line
  const mem = memoryMiB();
  const memory = mem ? `${mem.used}MiB / ${mem.limit}MiB` : "412MiB / 8192MiB DDR3";

  const info: string[] = [
    c("josef", "green", true) + c("@", "dim") + c("hlink", "green", true),
    c("─".repeat(11), "dim"),
    field("OS", c("macOS Tahoe 26.4 arm64", "text")),
    field("Uptime", c("48 days, 23 hours", "text")),
    field("Shell", c(`josh ${JOSH_VERSION}`, "text")),
    field("WM", c("Quartz + AeroSpace", "text")),
    field("Terminal", c("Apple Terminal 470", "text")),
    field("Font", c("JetBrains Mono", "text")),
    // --- below here is real, per-visitor data ---
    field("Browser", c(esc(detectBrowser()), "text")),
    field("Memory", c(memory, "text")),
    field("Display", c(res, "text")),
    field("Cores", c(esc(cores()), "text")),
    field("Locale", c(esc(locale()), "text")),
    field("Timezone", c(esc(timezone()), "text")),
    "",
    colorRow(false),
    colorRow(true),
  ];

  // Merge into single lines — logo segment (padded to a fixed width) + gap +
  // info — so it's one cohesive block like a real terminal fetch.
  const logo = LOGO.split("\n");
  const width = Math.max(...logo.map((l) => l.length));
  const gap = "   ";

  const rows: string[] = [];
  for (let i = 0; i < Math.max(logo.length, info.length); i++) {
    const raw = logo[i] ?? "";
    const padded = raw + " ".repeat(width - raw.length);
    rows.push(c(esc(padded), BANDS[i] ?? "blue") + gap + (info[i] ?? ""));
  }

  return `<pre class="nf-fetch">${rows.join("\n")}</pre>`;
}
