import { createIntl, createIntlCache } from "react-intl";

import langDe from "./lang/de.json";
import langEn from "./lang/en.json";
import langFa from "./lang/fa.json";
import langEs from "./lang/es.json";
import langList from "./lang/lang-list.json";

// first item of each array should be the language code,
// not the country code
// Remember when adding to this list, also update check-locales.js script
const localeOptions = [
	["en", "en-US"],
	["de", "de-DE"],
	["fa", "fa-IR"],
	["es", "es-ES"],
];

const loadMessages = (locale?: string): typeof langList & typeof langEn => {
	locale = locale || "en";
	switch (locale.slice(0, 2)) {
		case "de":
			return Object.assign({}, langList, langEn, langDe);
		case "fa":
			return Object.assign({}, langList, langEn, langFa);
		case "es":
			return Object.assign({}, langList, langEn, langEs);
		default:
			return Object.assign({}, langList, langEn);
	}
};

const getFlagCodeForLocale = (locale?: string) => {
	switch (locale) {
		case "de-DE":
		case "de":
			return "DE";
		case "fa-IR":
		case "fa":
			return "IR";
		case "es-ES":
		case "es":
			return "ES";
		default:
			return "US";
	}
};

const getLocale = (short = false) => {
	let loc = window.localStorage.getItem("locale");
	if (!loc) {
		loc = document.documentElement.lang;
	}
	if (short) {
		return loc.slice(0, 2);
	}
	return loc;
};

const cache = createIntlCache();

const initialMessages = loadMessages(getLocale());
let intl = createIntl(
	{ locale: getLocale(), messages: initialMessages },
	cache,
);

const changeLocale = (locale: string): void => {
	const messages = loadMessages(locale);
	intl = createIntl({ locale, messages }, cache);
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
};

export {
	localeOptions,
	getFlagCodeForLocale,
	getLocale,
	createIntl,
	changeLocale,
	intl,
};
