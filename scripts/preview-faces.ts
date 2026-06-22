import { FACES, getFace } from "../src/ui/faces";
import { MOODS } from "../src/agent/schemas";

const widths = new Set<string>();
for (const mood of MOODS) {
  const art = getFace(mood);
  const w = new Set(art.lines.map((l) => l.length));
  if (w.size !== 1) widths.add(`${mood}: inconsistent line widths ${[...w].join(",")}`);
}
console.log("alignment issues:", widths.size ? [...widths] : "none");

for (const mood of MOODS) {
  console.log(`\n=== ${mood} (${getFace(mood).accent}) ===`);
  for (const line of getFace(mood).lines) console.log(line);
}
