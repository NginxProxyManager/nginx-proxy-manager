import { createIntl, createIntlCache } from "react-intl";

import langEn from "./lang/en.json";

// todo
/*
const messages: Record<string, Record<string, string>> = {
	"en-US": { selectalanguage: "Select a language" },
	"pt-BR": { selectalanguage: "Selecione uma linguagem" },
};
*/
// end todo

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

console.log("MESSAGES:", initialMessages);
export const intl = createIntl(
	// @ts-ignore messages file typings are correct
	{ locale: initialLocale, messages: initialMessages },
	cache,
);

export const fmt = intl.formatMessage;
