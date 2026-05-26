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
