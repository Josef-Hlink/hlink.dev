// The fake filesystem. This is the thing we grow over time: add nodes here and
// the shell (ls/cd/cat/tree) picks them up for free. Hide easter eggs by giving
// files a name that starts with "." (revealed with `ls -a`).

import { COMMANDS, manPage } from "./commands";

// Page content lives as real files under content/ so it's easy to write and
// maintain. Vite's `?raw` inlines each one as a string at build time. Add a
// project by dropping files in content/<name>/ and wiring them up below.
import twinReadme from "./content/twin/README.md?raw";
import twinUrl from "./content/twin/url?raw";
import klymReadme from "./content/klym/README.md?raw";
import klymUrl from "./content/klym/url?raw";

export interface FSFile {
  type: "file";
  name: string;
  content: string;
}

export interface FSDir {
  type: "dir";
  name: string;
  children: Record<string, FSNode>;
}

export type FSNode = FSFile | FSDir;

const dir = (name: string, children: FSNode[] = []): FSDir => ({
  type: "dir",
  name,
  children: Object.fromEntries(children.map((c) => [c.name, c])),
});

const file = (name: string, content: string): FSFile => ({ type: "file", name, content });

// "/" is represented as the empty path []. HOME is where the shell starts and
// what `~` expands to.
export const HOME = ["Users", "josef"];

// --- path helpers (shared by the shell and the Finder) -----------------------

/** Resolve an absolute path (array of segments) to a node, or null. */
export function resolve(path: string[]): FSNode | null {
  let node: FSNode = root;
  for (const part of path) {
    if (node.type !== "dir") return null;
    const next: FSNode | undefined = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Turn a user-supplied path string into an absolute segment array, relative
 *  to `cwd`. `prev` backs `-` (previous directory); it defaults to `cwd`. */
export function toAbs(arg: string | undefined, cwd: string[], prev: string[] = cwd): string[] {
  if (arg === undefined || arg === "" || arg === "~") return [...HOME];
  if (arg === "-") return [...prev];

  let base: string[];
  let rest: string;
  if (arg.startsWith("/")) {
    base = [];
    rest = arg.slice(1);
  } else if (arg.startsWith("~/")) {
    base = [...HOME];
    rest = arg.slice(2);
  } else {
    base = [...cwd];
    rest = arg;
  }

  for (const part of rest.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return base;
}

// /bin is generated from the command registry so it's always in step with
// what the shell can actually run. `cat /bin/<name>` reads the man-blurb.
const bin = dir(
  "bin",
  COMMANDS.map((spec) => file(spec.name, manPage(spec))),
);

export const root: FSDir = dir("/", [
  bin,
  dir("Users", [
    dir("josef", [
      // real projects live here now; `cat README`, then `open url` for the link
      dir("projects", [
        dir("klym", [
          file("README", klymReadme),
          file("url", klymUrl),
        ]),
        dir("twin", [
          file("README", twinReadme),
          file("url", twinUrl),
        ]),
      ]),
      // shown in window 2 (which boots with `cat about.txt`)
      file(
        "about.txt",
        [
          "josef hamelink",
          "",
          "i build software. this place is a work in progress;",
          "more here soon.",
        ].join("\n") + "\n",
      ),
      // A seed easter egg so the mechanism is wired up from day one.
      // Found with `ls -a`, then `cat .welcome`.
      file(
        ".welcome",
        [
          "you found a hidden file. nice.",
          "",
          "this filesystem is mostly empty for now. i'm building it out slowly.",
          "there will be more buried in here over time. keep an eye out.",
          "",
          "- josef",
        ].join("\n") + "\n",
      ),
    ]),
  ]),
]);
