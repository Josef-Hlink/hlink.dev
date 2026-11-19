// What Safari's homemade repo page shows, read live from GitHub's public API
// (github.com itself refuses to be framed). Four unauthenticated calls per
// repo, cached for the session: GitHub allows 60 an hour per visitor IP.

export interface RepoEntry {
  name: string;
  dir: boolean;
  url: string; // the real github.com page for it
}

export interface Language {
  name: string;
  pct: number; // of the repo's code, by bytes
}

export interface Repo {
  fullName: string;
  description: string;
  languages: Language[]; // biggest first
  stars: number;
  pushedAt: string;
  topics: string[];
  homepage: string;
  htmlUrl: string;
  entries: RepoEntry[]; // dirs first, then files, each alphabetical
  readmeHtml: string | null; // rendered + sanitized by GitHub, links resolved
}

export type RepoError = "notfound" | "ratelimit" | "offline";

const API = "https://api.github.com/repos/";
const cache = new Map<string, Promise<Repo>>();

async function get(path: string, accept = "application/vnd.github+json"): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, { headers: { Accept: accept } });
  } catch {
    throw "offline" satisfies RepoError;
  }
  if (res.status === 404) throw "notfound" satisfies RepoError;
  if (res.status === 403 || res.status === 429) throw "ratelimit" satisfies RepoError;
  if (!res.ok) throw "offline" satisfies RepoError;
  return res;
}

async function load(owner: string, name: string): Promise<Repo> {
  const base = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const [meta, contents, langs, readme] = await Promise.all([
    get(base).then((r) => r.json()),
    get(base + "/contents").then((r) => r.json()),
    get(base + "/languages").then((r) => r.json() as Promise<Record<string, number>>),
    // no README is fine; a rate limit or outage still fails the page
    get(base + "/readme", "application/vnd.github.html+json")
      .then((r) => r.text())
      .catch((e: RepoError) => (e === "notfound" ? null : Promise.reject(e))),
  ]);
  const entries: RepoEntry[] = (Array.isArray(contents) ? contents : [])
    .map((e: { name: string; type: string; html_url: string }) => ({
      name: e.name,
      dir: e.type === "dir",
      url: e.html_url,
    }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
  const languages = Object.entries(langs)
    .map(([name, bytes]) => ({ name, pct: (bytes / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
  return {
    fullName: meta.full_name,
    description: meta.description ?? "",
    languages,
    stars: meta.stargazers_count,
    pushedAt: meta.pushed_at,
    topics: meta.topics ?? [],
    homepage: meta.homepage ?? "",
    htmlUrl: meta.html_url,
    entries,
    readmeHtml: readme && resolveLinks(readme, owner, name, meta.default_branch),
  };
}

// GitHub renders a README's own paths relative (static/logo.svg); on its site
// they resolve against the repo, here they'd resolve against nothing. Point
// images at the raw files and links at their pages on github.com.
function resolveLinks(html: string, owner: string, name: string, branch: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const repo = `https://github.com/${owner}/${name}`;
  const raw = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/`;
  const blob = `${repo}/blob/${branch}/`;
  const relative = (u: string) => !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src")!;
    if (relative(src)) img.setAttribute("src", new URL(src, raw).href);
  }
  for (const source of doc.querySelectorAll("source[srcset]")) {
    const set = source.getAttribute("srcset")!;
    if (relative(set)) source.setAttribute("srcset", new URL(set, raw).href);
  }
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href")!;
    if (href.startsWith("#")) a.setAttribute("href", repo + href);
    else if (relative(href)) {
      // a linked image goes to the raw file, anything else to its page
      const img = a.querySelector("img");
      a.setAttribute("href", img ? img.getAttribute("src")! : new URL(href, blob).href);
    }
  }
  return doc.body.innerHTML;
}

/** One fetch per repo per session; a failed one is forgotten so retry works. */
export function fetchRepo(owner: string, name: string): Promise<Repo> {
  const key = `${owner}/${name}`.toLowerCase();
  let p = cache.get(key);
  if (!p) {
    p = load(owner, name);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
