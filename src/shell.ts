// The (fake) shell: a tiny command interpreter that walks the in-memory
// filesystem in fs.ts. Pure TypeScript, no framework — the Vue terminal calls
// `run()` and renders the returned HTML string.
//
// To add a command: add a `case` in run(). To add easter eggs: drop nodes into
// fs.ts and they're reachable via ls/cd/cat/tree automatically.

import { root, HOME, type FSDir, type FSNode } from "./fs";
import { esc, c } from "./util";
import { fastfetch } from "./fastfetch";
import { joshVersion, joshNoop } from "./josh";

export interface RunResult {
  /** Trusted/escaped HTML to append to the terminal. */
  html: string;
  /** If true, wipe the scrollback instead of appending. */
  clear?: boolean;
}

export class Shell {
  cwd: string[] = [...HOME];
  private prev: string[] = [...HOME];

  /** Pretty path for the prompt: ~ inside HOME, absolute otherwise. */
  pathDisplay(path: string[] = this.cwd): string {
    const inHome = path.length >= HOME.length && HOME.every((p, i) => path[i] === p);
    if (inHome) {
      const rest = path.slice(HOME.length);
      return "~" + (rest.length ? "/" + rest.join("/") : "");
    }
    return "/" + path.join("/");
  }

  promptHTML(): string {
    return (
      c("josef", "green", true) +
      c("@", "green") +
      c("hlink", "green", true) +
      " " +
      c(esc(this.pathDisplay()), "blue", true) +
      " " +
      c("❯", "mauve", true) +
      " "
    );
  }

  // --- path helpers ---------------------------------------------------------

  /** Resolve an absolute path (array of segments) to a node, or null. */
  private resolve(path: string[]): FSNode | null {
    let node: FSNode = root;
    for (const part of path) {
      if (node.type !== "dir") return null;
      const next: FSNode | undefined = node.children[part];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  /** Turn a user-supplied path string into an absolute segment array. */
  private toAbs(arg: string | undefined): string[] {
    if (arg === undefined || arg === "" || arg === "~") return [...HOME];
    if (arg === "-") return [...this.prev];

    let base: string[];
    let rest: string;
    if (arg.startsWith("/")) {
      base = [];
      rest = arg.slice(1);
    } else if (arg.startsWith("~/")) {
      base = [...HOME];
      rest = arg.slice(2);
    } else {
      base = [...this.cwd];
      rest = arg;
    }

    for (const part of rest.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") base.pop();
      else base.push(part);
    }
    return base;
  }

  // --- command dispatch -----------------------------------------------------

  run(input: string): RunResult {
    const line = input.trim();
    if (!line) return { html: "" };

    const parts = line.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
      case "help":
        return { html: this.help() };
      case "ls":
      case "ll":
        return { html: this.ls(args) };
      case "cd":
        return { html: this.cd(args[0]) };
      case "pwd":
        return { html: c(esc("/" + this.cwd.join("/")), "text") };
      case "cat":
      case "less":
      case "more":
        return { html: this.cat(args.find((a) => !a.startsWith("-"))) };
      case "tree":
        return { html: this.tree(args.find((a) => !a.startsWith("-"))) };
      case "clear":
        return { html: "", clear: true };
      case "fastfetch":
      case "ff":
      case "neofetch":
      case "fetch":
        return { html: fastfetch() };
      case "josh":
        return {
          html: args.some((a) => a === "-v" || a === "-V" || a === "--version")
            ? joshVersion()
            : joshNoop(),
        };
      case "whoami":
        return { html: c("josef", "text") };
      case "hostname":
        return { html: c("hlink", "text") };
      case "date":
        return { html: c(esc(new Date().toString()), "text") };
      case "echo":
        return { html: c(esc(args.join(" ")), "text") };
      case "sudo":
        return { html: c("this incident will be reported.", "red") };
      case "exit":
      case "logout":
      case "quit":
        return { html: c("there is no escape. (it's a webpage.)", "yellow") };
      case "rm":
        return { html: c("this filesystem is read-only. you can't rm your way out of here.", "yellow") };
      default:
        return { html: this.notFound(cmd) };
    }
  }

  // --- commands -------------------------------------------------------------

  private help(): string {
    const row = (name: string, desc: string) =>
      "  " + c(esc(name.padEnd(11)), "green", true) + c(esc(desc), "dim");
    return [
      c("available commands", "lav", true),
      row("ls", "list the current directory  (ls -a shows hidden files)"),
      row("cd", "change directory  (cd .. , cd ~ , cd -)"),
      row("pwd", "print the working directory"),
      row("cat", "print a file's contents"),
      row("tree", "show the directory tree"),
      row("ff", "(fastfetch) unix larp"),
      row("josh", "josef's own shell"),
      row("whoami", "in case you forget"),
      row("date", "the current time"),
      row("echo", "say something back"),
      row("clear", "clear the screen  (or Ctrl-L)"),
      row("help", "this"),
      "",
      c("  tip: ", "dim") +
        c("Ctrl-Space", "peach", true) +
        c(" then ", "dim") +
        c("1/2/n/p", "peach", true) +
        c(" switches tmux windows (the ", "dim") +
        c(">_", "mauve", true) +
        c(" up top means the prefix is armed).", "dim"),
    ].join("\n");
  }

  private ls(args: string[]): string {
    const all = args.some((a) => /^-\w*a/.test(a));
    const pathArg = args.find((a) => !a.startsWith("-"));
    // no path → current directory (not HOME)
    const node = this.resolve(pathArg === undefined ? this.cwd : this.toAbs(pathArg));

    if (!node) return c(`ls: ${esc(pathArg ?? "")}: No such file or directory`, "red");
    if (node.type === "file") return c(esc(node.name), "text");

    const entries = Object.values(node.children)
      .filter((n) => all || !n.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!entries.length) return "";
    return entries
      .map((n) =>
        n.type === "dir"
          ? c(esc(n.name) + "/", "blue", true)
          : n.name.startsWith(".")
            ? c(esc(n.name), "dim")
            : c(esc(n.name), "text"),
      )
      .join("   ");
  }

  private cd(arg: string | undefined): string {
    const abs = this.toAbs(arg);
    const node = this.resolve(abs);
    if (!node) return c(`cd: no such file or directory: ${esc(arg ?? "")}`, "red");
    if (node.type !== "dir") return c(`cd: not a directory: ${esc(arg ?? "")}`, "red");
    this.prev = this.cwd;
    this.cwd = abs;
    return "";
  }

  private cat(arg: string | undefined): string {
    if (!arg) return c("cat: missing file operand", "red");
    const node = this.resolve(this.toAbs(arg));
    if (!node) return c(`cat: ${esc(arg)}: No such file or directory`, "red");
    if (node.type === "dir") return c(`cat: ${esc(arg)}: Is a directory`, "red");
    return c(esc(node.content.replace(/\n+$/, "")), "text");
  }

  private tree(arg: string | undefined): string {
    // no path → current directory (not HOME)
    const node = this.resolve(arg === undefined ? this.cwd : this.toAbs(arg));
    if (!node) return c(`tree: ${esc(arg ?? ".")}: No such file or directory`, "red");
    if (node.type !== "dir") return c(esc(node.name), "text");
    const label = node === root ? "/" : node.name + "/";
    return c(esc(label), "blue", true) + "\n" + this.treeBody(node, "");
  }

  private treeBody(dir: FSDir, prefix: string): string {
    const entries = Object.values(dir.children)
      .filter((n) => !n.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));

    let out = "";
    entries.forEach((n, i) => {
      const last = i === entries.length - 1;
      const branch = last ? "└── " : "├── ";
      const label =
        n.type === "dir" ? c(esc(n.name) + "/", "blue", true) : c(esc(n.name), "text");
      out += c(esc(prefix + branch), "dim") + label + "\n";
      if (n.type === "dir") {
        out += this.treeBody(n, prefix + (last ? "    " : "│   "));
      }
    });
    return out;
  }

  private notFound(cmd: string): string {
    return (
      c(`josh: command not found: ${esc(cmd)}`, "red") +
      "\n" +
      c("type ", "dim") +
      c("help", "green", true) +
      c(" for a list of commands.", "dim")
    );
  }
}
