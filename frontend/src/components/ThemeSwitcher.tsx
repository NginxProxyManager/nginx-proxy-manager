import React from "react";

import { Button, Icon, useColorMode } from "@chakra-ui/react";
import { FiSun, FiMoon } from "react-icons/fi";

function ThemeSwitcher() {
	const { colorMode, toggleColorMode } = useColorMode();
	return (
		<Button onClick={toggleColorMode}>
			{colorMode === "light" ? <Icon as={FiMoon} /> : <Icon as={FiSun} />}
		</Button>
	);
}

export { ThemeSwitcher };
