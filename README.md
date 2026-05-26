# hlink.dev

My corner of the internet: a floating macOS terminal running tmux, as my
landing page. Window `1:josh` boots `fastfetch` (Apple logo, with a few real
per-visitor lines) and drops you into an interactive fake shell, `josh`, with a
curated filesystem to explore. Window `2:josh` opens my about file with `cat`.

Static site, no backend. The shell, filesystem, and easter eggs all run in the
browser, so the origin just serves files (and Cloudflare caches them at the edge).

## Stack

- Vite + Vue 3 + TypeScript
- Custom DOM terminal (no xterm.js)
- The filesystem and command interpreter are plain, framework-free TS modules

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + bundle to dist/
npm run preview  # serve the built dist/ locally
```

## Project layout

```
src/
  fs.ts             the fake filesystem (the thing I grow over time)
  shell.ts          command interpreter: ls/cd/cat/tree/fastfetch/josh/...
  fastfetch.ts      boot banner (Apple logo + system info; browser/memory/locale are real)
  josh.ts           josh's version + changelog (josh --version)
  util.ts           esc() + colored-span helpers
  App.vue           desktop: wallpaper, menubar, window, tmux state, Ctrl-Space prefix
  components/
    MenuBar.vue     faux macOS menubar + clock
    TmuxStatus.vue  top tmux status bar (centered, clickable windows)
    ShellWindow.vue the interactive terminal (every window is one)
```

## How to extend

- Add files / easter eggs: edit `src/fs.ts`. New nodes are picked up by
  `ls`/`cd`/`cat`/`tree` automatically. Prefix a name with `.` to hide it behind
  `ls -a`.
- Add a command: add a `case` to `run()` in `src/shell.ts`.
- Ship a change: bump `JOSH_VERSION` in `src/josh.ts` and prepend a changelog
  entry, so `josh --version` always shows what's new.
- Add a tmux window: append a name to `windows` in `App.vue` and add a
  `<ShellWindow>` to `.panes`. Every window must be a real shell (one with a
  focused input) so it keeps the keyboard for prefix navigation.

## Keys

- type `help` for the command list
- `Ctrl-Space` then `1` / `2` / `n` / `p` switches windows (or click them). The
  `>_` by the session name means the prefix is armed. Mirrors the `C-SPACE`
  prefix in my tmux config (tap it, release Ctrl, then the number).
- `Ctrl-l` clears, `Ctrl-c` cancels the line, up/down walk history
- drag the titlebar to move; double-click it (or the green light) to zoom; drag
  any edge or corner to resize

## Deploy

`npm run build` produces a static `dist/`. Options:

- Cloudflare Pages: point it at this repo, build command `npm run build`, output
  directory `dist`.
- Any static origin behind Cloudflare. Example Caddy config:
  ```
  hlink.dev {
      root * /var/www/hlink/dist
      file_server
      encode zstd gzip
  }
  ```
