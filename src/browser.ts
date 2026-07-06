// The fake DNS Safari resolves against. This internet has a handful of known
// hosts: klym renders live in the window, GitHub opens a real tab, and
// everything else lands on the toy not-found page. Shared with App.vue so the
// shell's `open` can send external urls straight to a new tab without
// bouncing through Safari.

export type Target =
  | { kind: "start" }
  | { kind: "frame"; url: string; host: string } // rendered in the iframe
  | { kind: "external"; url: string } // real new tab
  | { kind: "notfound"; input: string; host: string }
  | { kind: "bottom" }; // the recursion floor (see SELF_HOSTS below)

/** What Safari keeps in history — external opens never enter it. */
export type Page = Exclude<Target, { kind: "external" }>;

const FRAME_HOSTS = new Set(["klym.hlink.dev"]);
// hlink.dev framing itself is deliberate — inception is the whole point. But
// browsers silently refuse to load a frame whose url matches an ancestor
// document's, so the copy-inside-the-copy can't embed a third: when we're
// already framed, self-navigation lands on the rabbit-hole floor instead.
const SELF_HOSTS = new Set(["hlink.dev", "www.hlink.dev"]);
const EXTERNAL_HOSTS = new Set(["github.com", "www.github.com"]);
const START_HOSTS = new Set(["favorites"]);
// easter eggs: hosts that resolve somewhere else entirely. yes, that's the
// real DOJ url — the bash manual was in the files. EFTA00315849 forever
const EGG_HOSTS: Record<string, string> = {
  "epstein.files": "https://www.justice.gov/epstein/files/DataSet%209/EFTA00315849.pdf",
};

export function resolveInput(raw: string): Target {
  const input = raw.trim();
  if (!input) return { kind: "start" };

  let url: URL;
  try {
    // bare hostnames get the scheme every browser would assume
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : "https://" + input);
  } catch {
    return { kind: "notfound", input, host: input };
  }
  if (url.protocol === "favorites:") return { kind: "start" };
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { kind: "notfound", input, host: url.hostname || input };

  const host = url.hostname.toLowerCase();
  const egg = EGG_HOSTS[host];
  if (egg) return { kind: "external", url: egg };
  if (SELF_HOSTS.has(host) && window.self !== window.top) return { kind: "bottom" };
  if (FRAME_HOSTS.has(host) || SELF_HOSTS.has(host)) {
    url.protocol = "https:"; // these only speak https; URL.href also normalizes
    return { kind: "frame", url: url.href, host };
  }
  if (EXTERNAL_HOSTS.has(host)) return { kind: "external", url: url.href };
  if (START_HOSTS.has(host)) return { kind: "start" };
  return { kind: "notfound", input, host };
}

/** Where a frame page actually loads from. The address bar keeps the canonical
 *  url; in dev, hlink.dev's content comes from the vite server instead — the
 *  inception frame is then always as fresh as the page you're looking at. */
export function frameSrc(url: string): string {
  if (!import.meta.env.DEV) return url;
  const u = new URL(url);
  if (u.hostname !== "hlink.dev" && u.hostname !== "www.hlink.dev") return url;
  return location.origin + u.pathname + u.search + u.hash;
}

/** History dedupe, like Finder's samePath. */
export function samePage(a: Page, b: Page): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "frame" && b.kind === "frame") return a.url === b.url;
  if (a.kind === "notfound" && b.kind === "notfound") return a.input === b.input;
  return true; // two starts
}
