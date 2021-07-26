import { createIntl, createIntlCache } from "react-intl";

import langEn from "./lang/en.json";

const loadMessages = (locale: string) => {
	switch (locale) {
		/*
		case 'fr':
			return import("./lang/fr.json");
		*/
		default:
			return langEn;
	}
};

export const initialLocale = "en-US";
export const cache = createIntlCache();

const initialMessages = loadMessages(initialLocale);

export const intl = createIntl(
	// @ts-ignore messages file typings are correct
	{ locale: initialLocale, messages: initialMessages },
	cache,
);
