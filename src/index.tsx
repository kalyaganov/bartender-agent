import React from "react";
import { render } from "ink";
import { App } from "./App";
import { bootstrap } from "./bootstrap";

void bootstrap().then(() => {
  render(React.createElement(App), { exitOnCtrlC: false });
});
