import { useStore } from "../src/state/store";
import { runTurn } from "../src/agent/loop";

function dump(label: string) {
  const s = useStore.getState();
  const last = [...s.lines].reverse().find((l) => l.speaker === "bartender");
  console.log(`\n=== ${label} ===`);
  console.log(`mood=${s.mood} · drunkenness=${s.drunkenness.toFixed(1)} ` +
    `(perceived=${s.perceivedScore.toFixed(1)} bac=${s.bacProxy.toFixed(1)})`);
  console.log(`served=${s.served.length} · tab=${s.tab}₽ · phase=${s.phase}`);
  console.log(`Виктор: ${last?.text ?? "—"}`);
}

async function main() {
  useStore.getState().reset();
  console.log("Ход 1: гость просит крепкое после тяжёлого дня");
  await runTurn("Эй, налей мне чего-нибудь покрепче, день был — просто жесть.");
  dump("после хода 1");

  console.log("\nХод 2: гость заметно пьянеет (опечатки, повторы)");
  await runTurn("Ооо отличнО, давай ещё одну, я чуствую себя прям отличноааа, налей ещё и ещё");
  dump("после хода 2");

  console.log("\nХод 3: гость очень пьян");
  await runTurn("нннсли ещё рюмку и пойдду... я вас всхех лблю...");
  dump("после хода 3");
}

main().catch((err) => {
  console.error("\n[smoke] FAILED:", err);
  process.exit(1);
});
