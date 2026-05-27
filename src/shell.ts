// The (fake) shell: a tiny command interpreter that walks the in-memory
// filesystem in fs.ts. Pure TypeScript, no framework — the Vue terminal calls
// `run()` and renders the returned HTML string.
//
// To add a command: add a spec to COMMANDS in commands.ts, then a matching
// `case` in run(). To add easter eggs: drop nodes into fs.ts and they're
// reachable via ls/cd/cat/tree automatically.

import { root, HOME, type FSDir, type FSNode } from "./fs";
import { esc, c } from "./util";
import { fastfetch } from "./fastfetch";
import { joshVersion, joshNoop } from "./josh";
import { COMMANDS, commandIndex, manPage, DEFAULT_ALIASES, type CommandSpec } from "./commands";

export interface RunResult {
  /** Trusted/escaped HTML to append to the terminal. */
  html: string;
  /** If true, wipe the scrollback instead of appending. */
  clear?: boolean;
}

export class Shell {
  cwd: string[] = [...HOME];
  private prev: string[] = [...HOME];
  /** name/alias → canonical spec, used to resolve and look up commands. */
  private cmds = commandIndex();
  /** aliases that expand to a full command line (name → value). Seeded with the
   *  built-in defaults; `alias name=value` adds more for the session. A reload
   *  resets to the defaults, so there's no need for an unalias. */
  private aliases = new Map<string, string>(Object.entries(DEFAULT_ALIASES));

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
    const raw = input.trim();
    if (!raw) return { html: "" };

    // A leading user alias expands once (single-pass, so `alias ls='ls -la'`
    // is safe and can't loop). Built-in name aliases are resolved below.
    const line = this.expandAlias(raw);
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    // raw tail after the command word, for commands that parse it themselves
    const rest = line.slice(cmd.length).trim();

    // Resolve aliases (ff → fastfetch, ll → ls, …) up front, so each command
    // needs only one case below and `which`/help stay authoritative.
    const spec = this.cmds.get(cmd);
    if (!spec) return { html: this.notFound(cmd) };

    // -h anywhere (incl. clusters like -lh) or --help prints the man-blurb —
    // the same text as `cat /bin/<command>`.
    const shortChars = args.filter((a) => /^-[^-]/.test(a)).flatMap((a) => [...a.slice(1)]);
    if (args.includes("--help") || shortChars.includes("h")) {
      return { html: c(esc(manPage(spec).replace(/\n+$/, "")), "text") };
    }

    // reject unknown flags, the way a real tool would (rawArgs commands skip this)
    const bad = this.badOption(spec, args);
    if (bad) return { html: this.optionError(spec, bad) };

    switch (spec.name) {
      case "help":
        return { html: this.help() };
      case "ls":
        return { html: this.ls(args) };
      case "cd":
        return { html: this.cd(args[0]) };
      case "pwd":
        return { html: c(esc("/" + this.cwd.join("/")), "text") };
      case "cat":
        return { html: this.cat(args.find((a) => !a.startsWith("-"))) };
      case "tree":
        return { html: this.tree(args.find((a) => !a.startsWith("-"))) };
      case "which":
        return { html: this.which(args) };
      case "alias":
        return { html: this.alias(rest) };
      case "clear":
        return { html: "", clear: true };
      case "fastfetch":
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
      default:
        return { html: this.notFound(cmd) };
    }
  }

  // --- commands -------------------------------------------------------------

  private help(): string {
    // fastfetch is advertised by its short alias here
    const label = (name: string) => (name === "fastfetch" ? "fetch" : name);
    const essentials = COMMANDS.filter((s) => s.essential);
    const w = Math.max(...essentials.map((s) => label(s.name).length)) + 2;
    const rows = essentials.map(
      (s) => "  " + c(esc(label(s.name).padEnd(w)), "green", true) + c(esc(s.summary), "dim"),
    );
    return [
      c("all ", "dim") +
        c("commands", "green", true) +
        c(" live in ", "dim") +
        c("/bin", "blue", true) +
        c(", try ", "dim") +
        c("ls /bin", "green", true) +
        c(" to see all of them", "dim"),
      c("for help on what a command does, try ", "dim") +
        c(esc("<cmd> -h"), "green", true) +
        c(", or ", "dim") +
        c(esc("cat /bin/<cmd>"), "green", true),
      c("here's a few commands to get you started", "dim"),
      ...rows,
      "",
      c("tip: ", "dim") +
        c("Ctrl-Space", "mauve", true) +
        c(" then ", "dim") +
        c("1/2/n/p", "mauve", true) +
        c(" switches tmux windows.", "dim"),
      c("(a ", "dim") +
        c(">_", "mauve", true) +
        c(" will appear next to the session name when the prefix is armed)", "dim"),
    ].join("\n");
  }

  private which(args: string[]): string {
    if (!args.length) return c(esc("usage: which <command>..."), "red");
    return args
      .map((name) => {
        // an alias resolves to arbitrary text; a command resolves to its binary
        const expansion = this.aliases.get(name);
        if (expansion !== undefined)
          return c(esc(name), "text") + c(": aliased to ", "dim") + c(esc(expansion), "green", true);
        const spec = this.cmds.get(name);
        return spec ? c(esc("/bin/" + spec.name), "blue", true) : c(`${esc(name)} not found`, "red");
      })
      .join("\n");
  }

  /** Replace a leading expansion alias with its value, once. Keeps the rest of
   *  the line (args) intact: `ll` + " /bin" → `ls -l` + " /bin". */
  private expandAlias(line: string): string {
    const first = line.split(/\s+/)[0];
    const value = this.aliases.get(first);
    return value === undefined ? line : value + line.slice(first.length);
  }

  private alias(rest: string): string {
    // zsh-style: quote the value only when it has spaces
    const fmt = (v: string) => (/\s/.test(v) ? `'${v}'` : v);
    const row = (a: string, value: string) =>
      c(esc(a), "text") + c("=", "dim") + c(esc(fmt(value)), "green", true);

    // define: name=value  (value may be quoted to preserve spaces)
    const eq = rest.indexOf("=");
    if (eq > 0) {
      const name = rest.slice(0, eq).trim();
      const value = rest
        .slice(eq + 1)
        .trim()
        .replace(/^(['"])([\s\S]*)\1$/, "$2"); // strip one layer of matching quotes
      if (!/^[A-Za-z][\w-]*$/.test(name)) return c(`alias: ${esc(name)}: bad alias name`, "red");
      if (!value) return c(`alias: ${esc(name)}=: missing value`, "red");
      this.aliases.set(name, value);
      return ""; // shells say nothing on a successful definition
    }

    // look up specific names
    if (rest) {
      return rest
        .split(/\s+/)
        .map((name) => {
          const value = this.aliases.get(name);
          return value === undefined ? c(`alias: ${esc(name)}: not found`, "red") : row(name, value);
        })
        .join("\n");
    }

    // no args → every alias, sorted by name
    return [...this.aliases]
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([a, v]) => row(a, v))
      .join("\n");
  }

  private ls(args: string[]): string {
    const flags = args.filter((a) => a.startsWith("-")).join("");
    const all = flags.includes("a"); // -a: include dotfiles
    const long = flags.includes("l"); // -l: one per line, with metadata
    const pathArg = args.find((a) => !a.startsWith("-"));
    // no path → current directory (not HOME)
    const target = pathArg === undefined ? this.cwd : this.toAbs(pathArg);
    const node = this.resolve(target);

    if (!node) return c(`ls: ${esc(pathArg ?? "")}: No such file or directory`, "red");
    if (node.type === "file") return c(esc(node.name), "text");

    // everything in /bin is an "executable" — colour it like one
    const inBin = target.length === 1 && target[0] === "bin";
    const entries = Object.values(node.children)
      .filter((n) => all || !n.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!entries.length) return "";

    const nameCell = (n: FSNode) =>
      n.type === "dir"
        ? c(esc(n.name) + "/", "blue", true)
        : inBin
          ? c(esc(n.name), "green", true)
          : n.name.startsWith(".")
            ? c(esc(n.name), "dim")
            : c(esc(n.name), "text");

    if (!long) return entries.map(nameCell).join("   ");

    // long listing: mode, owner, size, name — one entry per line
    const size = (n: FSNode) => (n.type === "file" ? String(n.content.length) : "-");
    const sizeW = Math.max(...entries.map((n) => size(n).length));
    return entries
      .map((n) => {
        const mode = n.type === "dir" ? "drwxr-xr-x" : inBin ? "-rwxr-xr-x" : "-rw-r--r--";
        const meta = `${mode}  josef  staff  ${size(n).padStart(sizeW)}  `;
        return c(esc(meta), "dim") + nameCell(n);
      })
      .join("\n");
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

  /** First unrecognised option in args, or null. Short clusters are checked
   *  per character (returns the bad letter); long options whole (returns the
   *  whole "--opt"). rawArgs commands accept anything. */
  private badOption(spec: CommandSpec, args: string[]): string | null {
    if (spec.rawArgs) return null;
    const short = spec.flags ?? "";
    const long = new Set(spec.longFlags ?? []);
    for (const a of args) {
      if (!a.startsWith("-") || a === "-" || a === "--") continue; // -, -- aren't flags
      if (a.startsWith("--")) {
        if (!long.has(a.slice(2))) return a;
      } else {
        for (const ch of a.slice(1)) if (!short.includes(ch)) return ch;
      }
    }
    return null;
  }

  private optionError(spec: CommandSpec, bad: string): string {
    const msg = bad.startsWith("--")
      ? `${spec.name}: unrecognized option '${bad}'`
      : `${spec.name}: illegal option -- ${bad}`;
    return c(esc(msg), "red") + "\n" + c(esc("usage: " + spec.usage), "dim");
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
