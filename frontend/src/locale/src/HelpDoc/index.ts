import * as de from "./de/index";
import * as en from "./en/index";
import * as ja from "./ja/index";
import * as pl from "./pl/index";
import * as ru from "./ru/index";
import * as sk from "./sk/index";
import * as zh from "./zh/index";
import * as it from "./it/index";

const items: any = { en, de, ja, sk, zh, pl, ru, it };

const fallbackLang = "en";

export const getHelpFile = (lang: string, section: string): string => {
	if (typeof items[lang] !== "undefined" && typeof items[lang][section] !== "undefined") {
		return items[lang][section].default;
	}
	// Fallback to English
	if (typeof items[fallbackLang] !== "undefined" && typeof items[fallbackLang][section] !== "undefined") {
		return items[fallbackLang][section].default;
	}
	throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

export default items;
