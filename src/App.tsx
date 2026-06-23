import { useInput } from "ink";
import { useAppStore } from "./state/app";
import { BarScreen } from "./ui/BarScreen";
import { SetupScreen } from "./ui/SetupScreen";
import { SettingsMenu } from "./ui/SettingsMenu";
import { ExitConfirm } from "./ui/ExitConfirm";

export function App() {
  const screen = useAppStore((s) => s.screen);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      useAppStore.getState().go("exit-confirm");
    }
  });

  switch (screen) {
    case "setup":
      return <SetupScreen />;
    case "menu":
      return <SettingsMenu />;
    case "exit-confirm":
      return <ExitConfirm />;
    case "bar":
    default:
      return <BarScreen />;
  }
}
