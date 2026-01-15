import * as bg from "./bg/index";
import * as de from "./de/index";
import * as en from "./en/index";
import * as es from "./es/index";
import * as fr from "./fr/index";
import * as ga from "./ga/index";
import * as id from "./id/index";
import * as it from "./it/index";
import * as ja from "./ja/index";
import * as ko from "./ko/index";
import * as nl from "./nl/index";
import * as pl from "./pl/index";
import * as ru from "./ru/index";
import * as sk from "./sk/index";
import * as uz from "./uz/index";
import * as vi from "./vi/index";
import * as zh from "./zh/index";

const items: any = {bg, de, en, es, fr, ga, id, it, ja, ko, nl, pl, ru, sk, uz, vi, zh};

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
