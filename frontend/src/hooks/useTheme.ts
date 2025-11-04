import { Dark, Light, useTheme as useThemeContext } from "src/context";

// Simple hook wrapper for clarity and scalability
const useTheme = () => {
	return useThemeContext();
};

export { useTheme, Dark, Light };
