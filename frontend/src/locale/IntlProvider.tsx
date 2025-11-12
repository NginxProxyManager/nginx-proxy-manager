import { createIntl, createIntlCache } from "react-intl";
import langEn from "./lang/en.json";
import langDe from "./lang/de.json";
import langEs from "./lang/es.json";
import langJa from "./lang/ja.json";
import langRu from "./lang/ru.json";
import langList from "./lang/lang-list.json";

// first item of each array should be the language code,
// not the country code
// Remember when adding to this list, also update check-locales.js script
const localeOptions = [
	["en", "en-US"],
	["de", "de-DE"],
	["es", "es-ES"],
	["ja", "ja-JP"],
	["ru", "ru-RU"],
];

const loadMessages = (locale?: string): typeof langList & typeof langEn => {
	const thisLocale = locale || "en";
	switch (thisLocale.slice(0, 2)) {
		case "de":
			return Object.assign({}, langList, langEn, langDe);
		case "es":
			return Object.assign({}, langList, langEn, langEs);
		case "ja":
			return Object.assign({}, langList, langEn, langJa);
		case "ru":
			return Object.assign({}, langList, langEn, langRu);
		default:
			return Object.assign({}, langList, langEn);
	}
};

const getFlagCodeForLocale = (locale?: string) => {
	switch (locale) {
		case "es-ES":
		case "es":
			return "ES";
		case "de-DE":
		case "de":
			return "DE";
		case "ja-JP":
		case "ja":
			return "JP";
		case "ru-RU":
		case "ru":
			return "RU";
		default:
			return "EN";
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
	// finally, fallback
	if (!loc) {
		loc = "en";
	}
	return loc;
};

const cache = createIntlCache();

const initialMessages = loadMessages(getLocale());
let intl = createIntl({ locale: getLocale(), messages: initialMessages }, cache);

const changeLocale = (locale: string): void => {
	const messages = loadMessages(locale);
	intl = createIntl({ locale, messages }, cache);
	window.localStorage.setItem("locale", locale);
	document.documentElement.lang = locale;
};

// This is a translation component that wraps the translation in a span with a data
// attribute so devs can inspect the element to see the translation ID
const T = ({
	id,
	data,
	tData,
}: {
	id: string;
	data?: Record<string, string | number | undefined>;
	tData?: Record<string, string>;
}) => {
	const translatedData: Record<string, string> = {};
	if (tData) {
		// iterate over tData and translate each value
		Object.entries(tData).forEach(([key, value]) => {
			translatedData[key] = intl.formatMessage({ id: value });
		});
	}
	return (
		<span data-translation-id={id}>
			{intl.formatMessage(
				{ id },
				{
					...data,
					...translatedData,
				},
			)}
		</span>
	);
};

export { localeOptions, getFlagCodeForLocale, getLocale, createIntl, changeLocale, intl, T };
