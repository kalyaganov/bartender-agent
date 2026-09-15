import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Mood } from "../agent/schemas";

export const FACE_IMAGE_COLUMNS = 28;
export const FACE_IMAGE_ROWS = 14;

export type TerminalImageProtocol = "kitty" | "iterm2";

export function getTerminalImageProtocol(
  env: NodeJS.ProcessEnv = process.env,
  isTTY = process.stdout.isTTY === true,
): TerminalImageProtocol | null {
  if (!isTTY || env.TMUX || env.TERM?.startsWith("screen")) return null;

  const terminalProgram = env.TERM_PROGRAM?.toLowerCase();
  if (
    env.KITTY_WINDOW_ID ||
    env.TERM === "xterm-kitty" ||
    terminalProgram === "ghostty"
  ) {
    return "kitty";
  }
  if (
    terminalProgram === "iterm.app" ||
    terminalProgram === "wezterm" ||
    env.LC_TERMINAL === "iTerm2"
  ) {
    return "iterm2";
  }
  return null;
}

export function faceImageFilename(mood: Mood): string {
  return `${mood}.png`;
}

function assetDirectories(): string[] {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(currentDirectory, "../assets/faces"),
    resolve(currentDirectory, "../../assets/faces"),
  ];
}

function readFaceImage(mood: Mood): Buffer | null {
  const filename = faceImageFilename(mood);
  const path = assetDirectories()
    .map((directory) => join(directory, filename))
    .find(existsSync);
  return path ? readFileSync(path) : null;
}

function kittySequence(image: Buffer): string {
  const chunks = image.toString("base64").match(/.{1,4096}/g) ?? [""];
  return chunks
    .map((chunk, index) => {
      const more = index < chunks.length - 1 ? 1 : 0;
      const controls = index === 0
        ? `a=T,f=100,c=${FACE_IMAGE_COLUMNS},r=${FACE_IMAGE_ROWS},C=1,m=${more}`
        : `m=${more}`;
      return `\x1b_G${controls};${chunk}\x1b\\`;
    })
    .join("");
}

function itermSequence(image: Buffer): string {
  const controls = [
    "inline=1",
    `width=${FACE_IMAGE_COLUMNS}`,
    `height=${FACE_IMAGE_ROWS}`,
    "preserveAspectRatio=1",
    "doNotMoveCursor=1",
  ].join(";");
  return `\x1b]1337;File=${controls}:${image.toString("base64")}\x07`;
}

export function createTerminalImageSequence(
  protocol: TerminalImageProtocol,
  image: Buffer,
): string {
  return protocol === "kitty" ? kittySequence(image) : itermSequence(image);
}

export function getFaceImageSequence(
  mood: Mood,
  protocol: TerminalImageProtocol,
): string | null {
  const image = readFaceImage(mood);
  return image ? createTerminalImageSequence(protocol, image) : null;
}

function faceImageColumn(columns: number): number {
  return Math.max(1, Math.floor((columns - FACE_IMAGE_COLUMNS) / 2) + 1);
}

export function clearTerminalImages(
  protocol: TerminalImageProtocol,
  columns = process.stdout.columns ?? 80,
): string {
  if (protocol === "kitty") return "\x1b_Ga=d,d=a;\x1b\\";

  const column = faceImageColumn(columns);
  const rows = Array.from(
    { length: FACE_IMAGE_ROWS },
    (_, index) => `\x1b[${4 + index};${column}H\x1b[2K`,
  ).join("");
  return `\x1b7${rows}\x1b8`;
}

export function placeTerminalImage(sequence: string, columns = process.stdout.columns ?? 80): string {
  return `\x1b7\x1b[4;${faceImageColumn(columns)}H${sequence}\x1b8`;
}
