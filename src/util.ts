// Small shared helpers used by the shell + renderers.

/** Escape text that originated from the user or the (fake) filesystem before
 *  it ever touches innerHTML. Everything rendered as HTML must pass through here
 *  unless it is a trusted literal we authored. */
export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );

export type Color =
  | "text"
  | "dim"
  | "blue"
  | "lav"
  | "sky"
  | "teal"
  | "green"
  | "yellow"
  | "peach"
  | "red"
  | "mauve"
  | "pink"
  | "maroon";

/** Wrap already-escaped (or trusted) text in a colored span. */
export const c = (text: string, color: Color, bold = false): string =>
  `<span class="c-${color}${bold ? " b" : ""}">${text}</span>`;

/** Escape plain text and turn any bare http(s) URL in it into a clickable, new-tab
 *  anchor. Splitting on a capturing group keeps the in-between text and the URLs
 *  apart so both still pass through esc() — the result is safe for innerHTML.
 *  Used by `cat` so a file can hold a link that lights up when you read it. */
export const linkify = (s: string): string =>
  s
    .split(/(\bhttps?:\/\/[^\s<>()]+)/g)
    .map((part, i) =>
      i % 2 === 1
        ? `<a class="term-link" href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`
        : esc(part),
    )
    .join("");
