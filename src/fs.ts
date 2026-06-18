// The fake filesystem. This is the thing we grow over time: add nodes here and
// the shell (ls/cd/cat/tree) picks them up for free. Hide easter eggs by giving
// files a name that starts with "." (revealed with `ls -a`).

import { COMMANDS, manPage } from "./commands";

// Page content lives as real files under content/ so it's easy to write and
// maintain. Vite's `?raw` inlines each one as a string at build time. Add a
// project by dropping files in content/<name>/ and wiring them up below.
import twinReadme from "./content/twin/README.md?raw";
import twinUrl from "./content/twin/url?raw";

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
      // real projects live here now; `cat README`, then `cat url` for the link
      dir("projects", [
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
