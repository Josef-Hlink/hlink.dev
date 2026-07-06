// The command set, in one place. Everything that knows "what commands exist"
// reads from here: fs.ts populates /bin from it, and shell.ts uses it to
// dispatch, to power `which`, and to print `help`. Keeping it single-source
// means /bin, which, and help can never drift out of sync.
//
// Aliases live entirely in DEFAULT_ALIASES, separate from the command specs —
// a command doesn't know or care what names point at it.
//
// To add a command: add a spec here, then add a matching `case spec.name` in
// shell.ts's run().

export interface CommandSpec {
  /** Canonical name — this is the file that appears in /bin. */
  name: string;
  /** One-liner, shown by `cat /bin/<name>`. */
  summary: string;
  /** Usage line for that same man-blurb (just the name if it takes no args). */
  usage: string;
  /** Short option letters this command accepts, e.g. "al" for ls. The global
   *  -h/--help is handled centrally and need not be listed. */
  flags?: string;
  /** Long options accepted, without the leading --, e.g. ["version"]. */
  longFlags?: string[];
  /** Take args literally — don't reject unknown flags. For echo, which prints
   *  whatever you pass (including things that look like flags). */
  rawArgs?: boolean;
  /** Show in the short `help` listing. Most commands are discoverable via
   *  `ls /bin` instead, so only the essentials opt in. */
  essential?: boolean;
}

export const COMMANDS: CommandSpec[] = [
  { name: "ls", summary: "list directory contents", usage: "ls [-al] [path]", flags: "al", essential: true },
  { name: "cd", summary: "change directory", usage: "cd [path]   (.. , ~ , -)", essential: true },
  { name: "cat", summary: "print a file's contents", usage: "cat <file>", essential: true },
  { name: "tree", summary: "show the directory tree", usage: "tree [path]" },
  { name: "pwd", summary: "print the working directory", usage: "pwd" },
  { name: "which", summary: "locate a command", usage: "which <command>...", essential: true },
  { name: "alias", summary: "list or set aliases", usage: "alias [name | name=value]...", rawArgs: true },
  { name: "fastfetch", summary: "system info, unix larp", usage: "fastfetch", essential: true },
  { name: "mail", summary: "send josef an email", usage: "mail", essential: true },
  { name: "open", summary: "open a url in Safari", usage: "open <url | file>", essential: true },
  { name: "josh", summary: "josef's own shell", usage: "josh [-v]", flags: "vV", longFlags: ["version"] },
  { name: "whoami", summary: "print the current user", usage: "whoami" },
  { name: "hostname", summary: "print the hostname", usage: "hostname" },
  { name: "date", summary: "print the current date and time", usage: "date" },
  { name: "echo", summary: "write its arguments back out", usage: "echo [text...]", rawArgs: true },
  { name: "clear", summary: "clear the screen  (or Ctrl-L)", usage: "clear" },
  { name: "help", summary: "the essentials, and how to find the rest", usage: "help" },
];

/** Every alias, name → the command line it expands to. Seeded into the shell at
 *  startup; `alias name=value` adds more for the session (a reload resets to
 *  these). Values can carry args (ll → "ls -l") or be bare renames (ff →
 *  "fastfetch"). */
export const DEFAULT_ALIASES: Record<string, string> = {
  ff: "fastfetch",
  fetch: "fastfetch",
  less: "cat",
  more: "cat",
  ll: "ls -l",
  la: "ls -al",
  compose: "mail",
};

/** Map each command name to its spec, for dispatch + `which`. Aliases are
 *  resolved separately (by expansion) before this is consulted. */
export function commandIndex(): Map<string, CommandSpec> {
  return new Map(COMMANDS.map((spec) => [spec.name, spec]));
}

/** The plain text shown when you `cat /bin/<name>`. */
export function manPage(spec: CommandSpec): string {
  return `${spec.name} — ${spec.summary}\nusage: ${spec.usage}\n`;
}
