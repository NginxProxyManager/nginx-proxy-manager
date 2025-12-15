import React, { ReactElement, ReactNode } from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";
import langDa from "./lang/da.json";
import langDe from "./lang/de.json";
import langEn from "./lang/en.json";
import langEs from "./lang/es.json";
import langFr from "./lang/fr.json";
import langIt from "./lang/it.json";
import langJa from "./lang/ja.json";
import langNb from "./lang/nb.json";
import langPl from "./lang/pl.json";
import langPt from "./lang/pt.json";
import langRu from "./lang/ru.json";
import langTw from "./lang/tw.json";
import langZh from "./lang/zh.json";
import langNl from "./lang/nl.json";
import langSv from "./lang/sv.json";

const messages: Record<string, Record<string, string>> = {
	da: langDa,
	de: langDe,
	en: langEn,
	es: langEs,
	fr: langFr,
	it: langIt,
	ja: langJa,
	nb: langNb,
	pl: langPl,
	pt: langPt,
	ru: langRu,
	tw: langTw,
	zh: langZh,
	nl: langNl,
	sv: langSv,
};

/**
 * Gets the locale based on browser language.
 *
 * @returns {string}
 */
function getLocale(): string {
	const specialCases: Record<string, string> = {
		zh: "zh", // Chinese (Simplified)
		"zh-cn": "zh", // Chinese (Simplified, China)
		"zh-sg": "zh", // Chinese (Simplified, Singapore)
		"zh-hans": "zh", // Chinese (Simplified)
		"zh-hant": "zh", // Chinese (Traditional) - we don't have a traditional Chinese translation yet
		"zh-tw": "tw", // Chinese (Traditional, Taiwan)
		"zh-hk": "tw", // Chinese (Traditional, Hong Kong)
		"zh-mo": "tw", // Chinese (Traditional, Macau)
		tw: "tw", // Taiwan
		nb: "nb", // Norwegian Bokmål
		"nb-no": "nb", // Norwegian Bokmål (Norway)
		no: "nb", // Norwegian (defaults to Bokmål)
		nn: "nb", // Norwegian Nynorsk (fallback to Bokmål)
		"nn-no": "nb", // Norwegian Nynorsk (Norway) (fallback to Bokmål)
	};

	let language =
		window?.navigator?.language ?? window?.navigator?.languages?.[0];
	if (!language) {
		return "en";
	}

	const searchLanguage = language.toLowerCase();

	// Check if the language or locale is in the special cases
	if (specialCases[searchLanguage]) {
		return specialCases[searchLanguage];
	}

	// If the language is supported as-is, return it
	if (messages[searchLanguage]) {
		return searchLanguage;
	}

	// If the language is a locale (e.g. "en-US"), try the base language (e.g. "en")
	const baseLanguage = searchLanguage.split("-")[0];
	if (messages[baseLanguage]) {
		return baseLanguage;
	}

	// Default to English
	return "en";
}

function IntlProvider(props: {
	children: ReactNode;
}): ReactElement<ReactNode> {
	const locale = getLocale();

	return (
		<ReactIntlProvider
			defaultLocale="en"
			locale={locale}
			messages={messages[locale]}
		>
			{props.children}
		</ReactIntlProvider>
	);
}

export default IntlProvider;
