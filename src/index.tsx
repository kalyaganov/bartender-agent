import React from "react";
import { render } from "ink";
import { App } from "./App";
import { bootstrap } from "./bootstrap";
import { enterAltScreen, installAltScreenGuards } from "./altScreen";

void bootstrap().then(() => {
  installAltScreenGuards();
  enterAltScreen("🍸 Бар");
  render(React.createElement(App), { exitOnCtrlC: false });
});
