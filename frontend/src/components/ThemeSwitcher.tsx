import {
	Icon,
	IconButton,
	IconButtonProps,
	useColorMode,
} from "@chakra-ui/react";
import { intl } from "locale";
import { FiSun, FiMoon } from "react-icons/fi";

interface ThemeSwitcherProps {
	background?: "normal" | "transparent";
}
function ThemeSwitcher({ background }: ThemeSwitcherProps) {
	const { colorMode, toggleColorMode } = useColorMode();
	const additionalProps: Partial<IconButtonProps> = {};
	if (background === "transparent") {
		additionalProps["backgroundColor"] = "transparent";
	}

	return (
		<IconButton
			onClick={toggleColorMode}
			{...additionalProps}
			aria-label={
				colorMode === "light"
					? intl.formatMessage({ id: "theme.to-dark" })
					: intl.formatMessage({ id: "theme.to-light" })
			}
			icon={<Icon as={colorMode === "light" ? FiMoon : FiSun} />}
		/>
	);
}

export { ThemeSwitcher };
