import type { Theme as PiTheme } from "@earendil-works/pi-coding-agent";

export type SiftlightTheme = Pick<PiTheme, "bold" | "fg"> &
  Partial<Pick<PiTheme, "getBgAnsi" | "getFgAnsi" | "getColorMode">>;
const DARK = [
  [255, 95, 175],
  [255, 135, 0],
  [255, 215, 0],
  [95, 255, 95],
  [0, 215, 255],
  [175, 135, 255],
] as const;
const LIGHT = [
  [215, 0, 95],
  [215, 95, 0],
  [175, 135, 0],
  [0, 135, 0],
  [0, 135, 175],
  [135, 0, 255],
] as const;
const TOKENS = [
  "syntaxKeyword",
  "syntaxType",
  "accent",
  "syntaxString",
  "syntaxNumber",
  "syntaxFunction",
] as const;

function brightness(ansi: string): number | undefined {
  if (!ansi.startsWith("\u001b[")) return undefined;
  const rgb = /^\[(?:38|48);2;(\d+);(\d+);(\d+)m/u.exec(ansi.slice(1));
  if (rgb) return (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 255000;
  const indexed = /^\[(?:38|48);5;(\d+)m/u.exec(ansi.slice(1));
  if (!indexed) return undefined;
  const n = Number(indexed[1]);
  if (n >= 232) return (8 + (n - 232) * 10) / 255;
  if (n < 16) return undefined; // ANSI base colors are user-defined.
  const levels = [0, 95, 135, 175, 215, 255];
  const index = n - 16;
  return (
    ((levels[Math.floor(index / 36)] ?? 0) * 299 +
      (levels[Math.floor(index / 6) % 6] ?? 0) * 587 +
      (levels[index % 6] ?? 0) * 114) /
    255000
  );
}

/** Read host styling on every render; no independent theme state or terminal queries. */
export function candy(theme: SiftlightTheme, index: number, text: string): string {
  const background = theme.getBgAnsi ? brightness(theme.getBgAnsi("toolSuccessBg")) : undefined;
  const foreground = theme.getFgAnsi ? brightness(theme.getFgAnsi("text")) : undefined;
  const light =
    background === undefined
      ? foreground === undefined
        ? undefined
        : foreground < 0.5
      : background > 0.5;
  const slot = index % DARK.length;
  if (light === undefined) return theme.fg(TOKENS[slot] ?? "accent", text);
  const [r, g, b] = (light ? LIGHT : DARK)[slot] ?? DARK[0];
  if (theme.getColorMode?.() === "truecolor")
    return `\u001b[38;2;${String(r)};${String(g)};${String(b)}m${text}\u001b[39m`;
  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (value: number): number =>
    levels.reduce(
      (best, level, i) =>
        Math.abs(level - value) < Math.abs((levels[best] ?? 0) - value) ? i : best,
      0,
    );
  const color = 16 + nearest(r) * 36 + nearest(g) * 6 + nearest(b);
  return `\u001b[38;5;${String(color)}m${text}\u001b[39m`;
}
