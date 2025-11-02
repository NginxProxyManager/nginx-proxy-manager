import * as en from "./en/index";
import * as fa from "./fa/index";

const items: any = { en, fa };

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
