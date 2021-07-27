import { createIntl, createIntlCache } from "react-intl";

import langDe from "./lang/de.json";
import langEn from "./lang/en.json";
import langFa from "./lang/fa.json";
import langList from "./lang/lang-list.json";

const loadMessages = (locale?: string) => {
	locale = locale || "en";
	switch (locale.substr(0, 2)) {
		case "de":
			return Object.assign({}, langList, langEn, langDe);
		case "fa":
			return Object.assign({}, langList, langEn, langFa);
		default:
			return Object.assign({}, langList, langEn);
	}
};

export const getFlagCodeForLocale = (locale?: string) => {
	switch (locale) {
		case "de-DE":
		case "de":
			return "de";
		case "fa-IR":
		case "fa":
			return "ir";
		default:
			return "us";
	}
};

export const getLocale = () => {
	let loc = window.localStorage.getItem("locale");
	if (!loc) {
		loc = document.documentElement.lang;
	}
	return loc;
};

const cache = createIntlCache();

const initialMessages = loadMessages(getLocale());
export let intl = createIntl(
	{ locale: getLocale(), messages: initialMessages },
	cache,
);

export const changeLocale = (locale: string): void => {
	const messages = loadMessages(locale);
	intl = createIntl({ locale, messages }, cache);
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
};
