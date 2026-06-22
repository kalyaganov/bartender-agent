import { useInput } from "ink";
import { useAppStore } from "./state/app";
import { BarScreen } from "./ui/BarScreen";
import { ProviderPicker } from "./ui/ProviderPicker";
import { SettingsMenu } from "./ui/SettingsMenu";
import { ExitConfirm } from "./ui/ExitConfirm";

export function App() {
  const screen = useAppStore((s) => s.screen);

  // Ctrl+C — глобально ведёт к подтверждению выхода из любого экрана (SPEC §2.1).
  // ESC контекстен и обрабатывается в каждом экране отдельно (SPEC §6).
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      useAppStore.getState().go("exit-confirm");
    }
  });

  switch (screen) {
    case "selecting-provider":
      return <ProviderPicker />;
    case "menu":
      return <SettingsMenu />;
    case "exit-confirm":
      return <ExitConfirm />;
    case "bar":
    default:
      return <BarScreen />;
  }
}
