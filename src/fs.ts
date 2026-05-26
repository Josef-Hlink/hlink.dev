// The fake filesystem. This is the thing we grow over time: add nodes here and
// the shell (ls/cd/cat/tree) picks them up for free. Hide easter eggs by giving
// files a name that starts with "." (revealed with `ls -a`).

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

export const root: FSDir = dir("/", [
  dir("Users", [
    dir("josef", [
      dir("project1"),
      dir("project2"),
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
