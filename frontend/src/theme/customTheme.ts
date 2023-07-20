import {
	theme as chakraTheme,
	ThemeConfig,
	extendTheme,
} from "@chakra-ui/react";

// declare a variable for fonts and set our fonts
const fonts = {
	...chakraTheme.fonts,
	body: `"Source Sans Pro",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"`,
	heading: `"Source Sans Pro",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"`,
};

const config: ThemeConfig = {
	initialColorMode: "system",
};

const shadows = {
	...chakraTheme.shadows,
	outline: "none",
};

const lightTheme = extendTheme({ fonts, config, shadows });

export default lightTheme;
