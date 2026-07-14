// Renders the fastfetch block shown when the terminal boots (and on `ff`).
// The logo is the NixOS snowflake as fastfetch ships it, $n color markers and
// all — odd markers are blue, even are cyan, one color per lambda arm.
// Everything is real monospace text — selectable, copyable, same line grid as
// the rest of the terminal. Returns a trusted HTML string (no user input).

import { c, esc, RELEASE_TIME, type Color } from "./util";
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

// Real, sort of: the box "reboots" at every release, so uptime is the time
// since the latest tag's commit. Formatted like the real tool.
const uptime = (): string => {
  const mins = Math.max(0, Math.floor((Date.now() - RELEASE_TIME) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (d > 0) return `${n(d, "day")}, ${n(h, "hour")}`;
  if (h > 0) return `${n(h, "hour")}, ${n(m, "min")}`;
  return n(m, "min");
};

// Verbatim from fastfetch's src/logo/ascii/n/nixos.txt.
const LOGO = `          $1▗▄▄▄       $2▗▄▄▄▄    ▄▄▄▖
          $1▜███▙       $2▜███▙  ▟███▛
           $1▜███▙       $2▜███▙▟███▛
            $1▜███▙       $2▜██████▛
     $1▟█████████████████▙ $2▜████▛     $3▟▙
    $1▟███████████████████▙ $2▜███▙    $3▟██▙
           $6▄▄▄▄▖           $2▜███▙  $3▟███▛
          $6▟███▛             $2▜██▛ $3▟███▛
         $6▟███▛               $2▜▛ $3▟███▛
$6▟███████████▛                  $3▟██████████▙
$6▜██████████▛                  $3▟███████████▛
      $6▟███▛ $5▟▙               $3▟███▛
     $6▟███▛ $5▟██▙             $3▟███▛
    $6▟███▛  $5▜███▙           $3▝▀▀▀▀
    $6▜██▛    $5▜███▙ $4▜██████████████████▛
     $6▜▛     $5▟████▙ $4▜████████████████▛
           $5▟██████▙         $4▜███▙
          $5▟███▛▜███▙         $4▜███▙
         $5▟███▛  ▜███▙         $4▜███▙
         $5▝▀▀▀    ▀▀▀▀▘         $4▀▀▀▘`;

const stripMarkers = (row: string): string => row.replace(/\$\d/g, "");

// Colorize the logo: each $n marker switches color until the next one, and a
// row that starts unmarked continues the previous row's color. Returns one
// HTML string per row.
const renderLogo = (rows: string[]): string[] => {
  let color: Color = "blue";
  return rows.map((row) => {
    let out = "";
    for (const part of row.split(/(\$\d)/)) {
      if (/^\$\d$/.test(part)) color = Number(part[1]) % 2 ? "blue" : "sky";
      else if (part) out += c(esc(part), color);
    }
    return out;
  });
};

// "Label: value" line.
const field = (label: string, value: string): string =>
  c(label, "blue", true) + c(":", "dim") + " " + value;

const COLORS = ["red", "peach", "yellow", "green", "teal", "blue", "mauve", "pink"] as const;

// one row of color blocks — actual ███ characters, like the real tool prints
const colorRow = (bright: boolean): string => {
  const row = COLORS.map((name) => c("███", name)).join("");
  return bright ? `<span class="nf-bright">${row}</span>` : row;
};

export function fastfetch(cols = 80): string {
  const res =
    typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown";

  // used + budget are real where available; fall back to the fake 8 GB line
  const mem = memoryMiB();
  const memory = mem ? `${mem.used}MiB / ${mem.limit}MiB` : "412MiB / 8192MiB";

  const info: string[] = [
    c("guest", "green", true) + c("@", "dim") + c("hlink", "green", true),
    c("─".repeat(11), "dim"),
    field("OS", c("NixOS 26.05 (Yarara) aarch64", "text")),
    field("Host", c("Apple MacBook Air (M1, 2020)", "text")),
    field("Kernel", c("Linux 7.0.11", "text")),
    field("Uptime", c(esc(uptime()), "text")),
    field("Shell", c(`josh ${JOSH_VERSION}`, "text")),
    field("Terminal", c("/dev/pts/0", "text")),
    field("Font", c("JetBrains Mono", "text")),
    field("Wallpaper", c("Mac OS X Lion Default", "text")),
    field("Battery", c("100% [AC connected]", "text")),
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

  const logo = LOGO.split("\n");
  const width = Math.max(...logo.map((l) => stripMarkers(l).length));
  const gap = "   ";

  // Lay out to the terminal's width like a TUI: when both columns don't fit,
  // skip the logo (à la --logo none) and print just the info block. Once
  // printed it's plain text — shrink the window and it wraps like any output.
  const plainLen = (html: string) =>
    html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "x").length;
  const infoW = Math.max(...info.map(plainLen));
  if (cols < width + gap.length + infoW) {
    return `<pre class="nf-fetch">${info.join("\n")}</pre>`;
  }

  // Merge into single lines — logo segment (padded to a fixed width) + gap +
  // info — so it's one cohesive block like a real terminal fetch.
  const colored = renderLogo(logo);
  const rows: string[] = [];
  for (let i = 0; i < Math.max(logo.length, info.length); i++) {
    const pad = " ".repeat(width - stripMarkers(logo[i] ?? "").length);
    rows.push((colored[i] ?? "") + pad + gap + (info[i] ?? ""));
  }

  return `<pre class="nf-fetch">${rows.join("\n")}</pre>`;
}
