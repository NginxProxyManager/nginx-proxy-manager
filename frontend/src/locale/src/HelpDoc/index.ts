import * as en from "./en/index";
import * as de from "./de/index";
import * as ja from "./ja/index";

const items: any = { en, de, ja };

const fallbackLang = "en";

export const getHelpFile = (lang: string, section: string): string => {
	if (
		typeof items[lang] !== "undefined" && 
		typeof items[lang][section] !== "undefined"
	) {
		return items[lang][section].default;
	}
	// Fallback to English
	if (
		typeof items[fallbackLang] !== "undefined" && 
		typeof items[fallbackLang][section] !== "undefined"
	) {
		return items[fallbackLang][section].default;
	}
	throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

export default items;
