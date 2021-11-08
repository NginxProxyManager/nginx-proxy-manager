import * as React from "react";

import { ColorModeScript } from "@chakra-ui/react";
import * as ReactDOM from "react-dom";

import App from "./App";
import "./index.scss";
import customTheme from "./theme/customTheme";

declare global {
	interface Function {
		Item: React.FC<any>;
		Link: React.FC<any>;
		Header: React.FC<any>;
		Main: React.FC<any>;
		Options: React.FC<any>;
		SubTitle: React.FC<any>;
		Title: React.FC<any>;
	}
}

ReactDOM.render(
	<>
		<ColorModeScript initialColorMode={customTheme.config.initialColorMode} />
		<App />
	</>,
	document.getElementById("root"),
);
