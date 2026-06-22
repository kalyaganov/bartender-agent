import type { Mood } from "../agent/schemas";

export interface FaceArt {
  lines: string[];
  eyesRow: number;
  closedEyes: string;
  accent: string;
}

const INTERIOR_WIDTH = 16;
const WALL = "      ██";

function center(feature: string, width = INTERIOR_WIDTH): string {
  const pad = Math.max(0, width - feature.length);
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + feature + " ".repeat(pad - left);
}

function center2(left: string, right: string, width = INTERIOR_WIDTH): string {
  return center(`${left}   ${right}`, width);
}

/** Строка носа с румянцем по бокам (слот cheeks, SPEC §5.2). */
function noseRow(cheekL: string, cheekR: string): string {
  // col0-1 spaces, col2 cheekL, col3-6 spaces, col7 ▼, col8-12 spaces, col13 cheekR, col14-15 spaces
  return `  ${cheekL}    ▼     ${cheekR}  `;
}

interface FaceFeatures {
  browL: string;
  browR: string;
  eyeL: string;
  eyeR: string;
  mouth: string;
  cheek: string; // слот cheeks: " " — нет, "◦" — румянец
  accent: string;
}

function compile(f: FaceFeatures): FaceArt {
  const raw = [
    "        ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
    "      ▟███████████████████▙",
    WALL + center2(f.browL, f.browR) + "██",
    WALL + center2(f.eyeL, f.eyeR) + "██",
    WALL + noseRow(f.cheek, f.cheek) + "██",
    WALL + center(f.mouth) + "██",
    WALL + center("{═════}") + "██",
    "      ▜███████████████████▛",
    "        ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀",
  ];
  const closedEyes = WALL + center2("‿", "‿") + "██";
  const width = Math.max(...raw.map((l) => l.length), closedEyes.length);
  return {
    lines: raw.map((l) => l.padEnd(width)),
    closedEyes: closedEyes.padEnd(width),
    eyesRow: 3,
    accent: f.accent,
  };
}

// Глифы строго по таблице SPEC §5.2. Цвета — именованные, как в SPEC.
const FACES_RAW: Record<Mood, FaceFeatures> = {
  neutral:     { browL: "─", browR: "─", eyeL: "•", eyeR: "•", mouth: "─",    cheek: " ", accent: "cyan" },
  cheerful:    { browL: "﹀", browR: "﹀", eyeL: "^", eyeR: "^", mouth: "▔▀▔",  cheek: "◦", accent: "green" },
  amused:      { browL: "﹀", browR: "﹀", eyeL: "⌣", eyeR: "⌣", mouth: "◡",    cheek: "◦", accent: "magenta" },
  curious:     { browL: "─", browR: "﹀", eyeL: "°", eyeR: "°", mouth: "┐",    cheek: " ", accent: "cyan" },
  concerned:   { browL: "⌒", browR: "⌒", eyeL: "◯", eyeR: "◯", mouth: "╮",    cheek: " ", accent: "yellow" },
  sympathetic: { browL: "⌒", browR: "⌒", eyeL: "•", eyeR: "•", mouth: "︵",    cheek: " ", accent: "blue" },
  firm:        { browL: "╲", browR: "╱", eyeL: "‐", eyeR: "‐", mouth: "▂",    cheek: " ", accent: "red" },
  surprised:   { browL: "⌒", browR: "⌒", eyeL: "◉", eyeR: "◉", mouth: "○",    cheek: " ", accent: "yellow" },
  laughing:    { browL: "﹀", browR: "﹀", eyeL: "^^", eyeR: "^^", mouth: "◠◡◠",  cheek: "◦", accent: "green" },
  thoughtful:  { browL: "﹀", browR: "─", eyeL: "•", eyeR: "•", mouth: "─",    cheek: " ", accent: "cyan" },
};

export const FACES: Record<Mood, FaceArt> = Object.fromEntries(
  (Object.entries(FACES_RAW) as [Mood, FaceFeatures][]).map(([mood, f]) => [
    mood,
    compile(f),
  ]),
) as Record<Mood, FaceArt>;

export function getFace(mood: Mood): FaceArt {
  return FACES[mood] ?? FACES.neutral;
}
