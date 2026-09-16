import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { Line } from "../state/store";

const THINKING_FRAMES = ["", ".", "..", "..."];
const THINKING_TICK_MS = 350;

interface DisplayLine {
  speaker: Line["speaker"];
  rows: string[];
}

function length(value: string): number {
  return Array.from(value).length;
}

function wrapText(text: string, firstPrefix: string, continuationPrefix: string, columns: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [firstPrefix];

  const rows: string[] = [];
  let prefix = firstPrefix;
  let content = "";
  let available = Math.max(1, columns - length(prefix));

  function push(): void {
    rows.push(prefix + content);
    prefix = continuationPrefix;
    content = "";
    available = Math.max(1, columns - length(prefix));
  }

  for (const word of words) {
    const characters = Array.from(word);
    if (!content && characters.length > available) {
      let rest = characters;
      while (rest.length > available) {
        rows.push(prefix + rest.slice(0, available).join(""));
        rest = rest.slice(available);
        prefix = continuationPrefix;
        available = Math.max(1, columns - length(prefix));
      }
      content = rest.join("");
    } else if (!content) {
      content = word;
    } else if (length(content) + 1 + characters.length <= available) {
      content += ` ${word}`;
    } else {
      push();
      if (characters.length > available) {
        let rest = characters;
        while (rest.length > available) {
          rows.push(prefix + rest.slice(0, available).join(""));
          rest = rest.slice(available);
          prefix = continuationPrefix;
          available = Math.max(1, columns - length(prefix));
        }
        content = rest.join("");
      } else {
        content = word;
      }
    }
  }
  if (content) rows.push(prefix + content);
  return rows;
}

function toDisplayLine(line: Line, columns: number): DisplayLine {
  switch (line.speaker) {
    case "user":
      return { speaker: line.speaker, rows: wrapText(line.text, "  Вы: ", "     ", columns) };
    case "bartender":
      return { speaker: line.speaker, rows: wrapText(line.text, "  Виктор: ", "          ", columns) };
    case "system":
      return { speaker: line.speaker, rows: wrapText(`— ${line.text} —`, "  ", "  ", columns) };
  }
}

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((current) => (current + 1) % THINKING_FRAMES.length);
    }, THINKING_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return <Text color="gray" dimColor>{"  "}Виктор задумался{THINKING_FRAMES[frame]}</Text>;
}

function color(speaker: Line["speaker"]): "green" | "cyan" | "gray" {
  switch (speaker) {
    case "user":
      return "green";
    case "bartender":
      return "cyan";
    case "system":
      return "gray";
  }
}

export function DialoguePanel({
  lines,
  streaming,
  busy,
  maxLines,
  columns = process.stdout.columns || 80,
}: {
  lines: Line[];
  streaming: string;
  busy: boolean;
  maxLines: number;
  columns?: number;
}) {
  if (maxLines <= 0) return null;

  const width = Math.max(20, columns - 4);
  const streamingRows = streaming
    ? wrapText(streaming, "  Виктор: ", "          ", width).slice(-maxLines)
    : [];
  const indicatorRows = streamingRows.length || busy ? 1 : 0;
  let remaining = Math.max(0, maxLines - Math.max(indicatorRows, streamingRows.length));
  const visible: DisplayLine[] = [];

  for (const line of [...lines].reverse()) {
    const displayLine = toDisplayLine(line, width);
    if (displayLine.rows.length > remaining) break;
    visible.unshift(displayLine);
    remaining -= displayLine.rows.length;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {visible.flatMap((line, lineIndex) => line.rows.map((row, rowIndex) => (
        <Text key={`${lineIndex}-${rowIndex}`} color={color(line.speaker)} dimColor={line.speaker === "system"}>
          {row}
        </Text>
      )))}
      {streamingRows.length ? streamingRows.map((row, index) => (
        <Text key={`stream-${index}`} color="cyan">
          {row}{index === streamingRows.length - 1 ? <Text color="gray">▋</Text> : null}
        </Text>
      )) : busy ? <ThinkingIndicator /> : null}
    </Box>
  );
}
