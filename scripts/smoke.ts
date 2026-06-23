import { createProvider } from "../src/agent/providers";
import { BARTENDER_TOOL, parseBartenderAction } from "../src/agent/tools";
import { BARTENDER_SYSTEM_PROMPT } from "../src/agent/prompt";
import { loadPreferences, isConfigured } from "../src/persistence";

async function main() {
  const prefs = await loadPreferences();
  if (!isConfigured(prefs)) {
    console.error("[smoke] Провайдер не настроен. Запусти /setup в TUI.");
    process.exit(1);
  }
  const provider = createProvider({
    endpoint: prefs.endpoint!,
    token: prefs.token!,
    model: prefs.model!,
    thinking: prefs.thinking ?? false,
  });
  console.log(`endpoint=${prefs.endpoint} model=${prefs.model} thinking=${prefs.thinking ?? false}\n`);

  let text = "";
  let toolInput: unknown = null;

  for await (const ev of provider.streamTurn({
    system: BARTENDER_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: "Эй, налей мне чего-нибудь покрепче, день был — жесть." },
    ],
    tools: [BARTENDER_TOOL],
  })) {
    if (ev.type === "text-delta") {
      process.stdout.write(ev.text);
      text += ev.text;
    } else if (ev.type === "reasoning-delta") {
      process.stderr.write(`\n[reasoning] ${ev.text}`);
    } else if (ev.type === "tool-call") {
      toolInput = ev.args;
    } else if (ev.type === "finish") {
      console.log(`\n[finish] reason=${ev.finishReason} usage=${JSON.stringify(ev.usage ?? {})}`);
    }
  }

  console.log("\n\n--- streamed text ---");
  console.log(text.trim());

  const action = parseBartenderAction(toolInput);
  console.log("\n--- parsed bartender_action ---");
  console.log(action);
}

main().catch((err) => {
  console.error("\n[smoke] FAILED:", err);
  process.exit(1);
});
