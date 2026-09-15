import { describe, expect, it } from "vitest";
import {
  clearTerminalImages,
  createTerminalImageSequence,
  FACE_IMAGE_COLUMNS,
  FACE_IMAGE_ROWS,
  faceImageFilename,
  getFaceImageSequence,
  getTerminalImageProtocol,
  placeTerminalImage,
} from "../ui/terminalImage";

describe("terminal images", () => {
  it.each([
    [{ KITTY_WINDOW_ID: "12" }, "kitty"],
    [{ TERM: "xterm-kitty" }, "kitty"],
    [{ TERM_PROGRAM: "ghostty" }, "kitty"],
    [{ TERM_PROGRAM: "iTerm.app" }, "iterm2"],
    [{ TERM_PROGRAM: "WezTerm" }, "iterm2"],
    [{ LC_TERMINAL: "iTerm2" }, "iterm2"],
  ] as const)("выбирает %s", (env, protocol) => {
    expect(getTerminalImageProtocol(env, true)).toBe(protocol);
  });

  it("оставляет ASCII-лицо для неподдерживаемых окружений", () => {
    expect(getTerminalImageProtocol({ TERM_PROGRAM: "Apple_Terminal" }, true)).toBeNull();
    expect(getTerminalImageProtocol({ KITTY_WINDOW_ID: "12", TMUX: "1" }, true)).toBeNull();
    expect(getTerminalImageProtocol({ KITTY_WINDOW_ID: "12" }, false)).toBeNull();
  });

  it("связывает mood с PNG", () => {
    expect(faceImageFilename("thoughtful")).toBe("thoughtful.png");
    expect(getFaceImageSequence("neutral", "kitty")).toContain("a=T");
  });

  it("создаёт Kitty graphics sequence", () => {
    const sequence = createTerminalImageSequence("kitty", Buffer.from("png"));
    expect(sequence).toBe(
      `\x1b_Ga=T,f=100,c=${FACE_IMAGE_COLUMNS},r=${FACE_IMAGE_ROWS},C=1,m=0;cG5n\x1b\\`,
    );
  });

  it("создаёт iTerm2 inline-image sequence", () => {
    const sequence = createTerminalImageSequence("iterm2", Buffer.from("png"));
    expect(sequence).toBe(
      `\x1b]1337;File=inline=1;width=${FACE_IMAGE_COLUMNS};height=${FACE_IMAGE_ROWS};preserveAspectRatio=1;doNotMoveCursor=1:cG5n\x07`,
    );
  });

  it("удаляет предыдущее Kitty-изображение", () => {
    expect(clearTerminalImages("kitty")).toBe("\x1b_Ga=d,d=a;\x1b\\");
  });

  it("стирает область iTerm2-изображения", () => {
    const sequence = clearTerminalImages("iterm2", 80);
    expect(sequence.startsWith("\x1b7\x1b[4;27H\x1b[2K")).toBe(true);
    expect(sequence.match(/\x1b\[2K/g)).toHaveLength(FACE_IMAGE_ROWS);
    expect(sequence.endsWith("\x1b8")).toBe(true);
  });

  it("размещает изображение по центру строки лица", () => {
    expect(placeTerminalImage("image", 80)).toBe("\x1b7\x1b[4;27Himage\x1b8");
  });
});
