import { createProvider } from "../src/agent/providers";
import { BARTENDER_TOOL, parseBartenderAction } from "../src/agent/tools";
import { BARTENDER_SYSTEM_PROMPT } from "../src/agent/prompt";
import { config } from "../src/config";

async function main() {
  const provider = createProvider();
  console.log(`provider=${config.provider} model=${config.model}\n`);

  let text = "";
  let toolInput: unknown = null;

  for await (const ev of provider.streamTurn({
    system: BARTENDER_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: "Эй, налей мне чего-нибудь покрепче, день был — жесть." },
    ],
    tools: [BARTENDER_TOOL],
  })) {
    if (ev.type === "token") {
      process.stdout.write(ev.text);
      text += ev.text;
    } else if (ev.type === "toolCall") {
      toolInput = ev.input;
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
