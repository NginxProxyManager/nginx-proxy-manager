import { createContext, useState, useEffect, ReactNode } from "react";
import { IntlProvider as Provider, MessageFormatElement } from "react-intl";
import langEn from "./lang/en.json";
import langDe from "./lang/de.json";
import langZh from "./lang/zh.json";
import langRu from "./lang/ru.json";
import langFr from "./lang/fr.json";
import langPl from "./lang/pl.json";
import langPtBR from "./lang/pt-BR.json";
import langEs from "./lang/es.json";
import langNl from "./lang/nl.json";
import langJa from "./lang/ja.json";
import langSv from "./lang/sv.json";
import langTw from "./lang/tw.json";

const localeOptions: [
	string,
	string | string[],
	Record<string, string> | Record<string, MessageFormatElement[]>,
][] = [
	["en", ["en", "en-US", "en-GB"], langEn],
	["de", "de-DE", langDe],
	["zh", "zh-CN", langZh],
	["ru", "ru-RU", langRu],
	["fr", "fr-FR", langFr],
	["pl", "pl-PL", langPl],
	["pt-BR", "pt-BR", langPtBR],
	["es", "es-ES", langEs],
	["nl", "nl-NL", langNl],
	["ja", "ja-JP", langJa],
	["sv", "sv-SE", langSv],
	["tw", "zh-TW", langTw],
];

export interface IntlContextType {
	locale: string;
	setLocale: (locale: string) => void;
	messages: Record<string, string> | Record<string, MessageFormatElement[]>;
}

export const IntlContext = createContext<IntlContextType>({
	locale: "en",
	setLocale: () => {},
	messages: langEn,
});

const getFlagCodeForLocale = (locale: string): string => {
	const specialCases: Record<string, string> = {
		en: "gb", // Great Britain
		ja: "jp", // Japan
		zh: "cn", // China
		tw: "tw", // Taiwan
	};

	return specialCases[locale] || locale;
};

const browserLanguages =
	navigator.languages || [navigator.language || "en-US"];

const getLocaleFromNavigator = (): string => {
	for (const navLang of browserLanguages) {
		for (const [locale, code] of localeOptions) {
			if (Array.isArray(code)) {
				if (code.includes(navLang)) return locale;
			} else {
				if (navLang === code) return locale;
			}
		}
	}
	return "en";
};

export const IntlProvider = ({ children }: { children: ReactNode }) => {
	const [locale, setLocale] = useState<string>(
		localStorage.getItem("locale") || getLocaleFromNavigator(),
	);

	const [messages, setMessages] = useState<
		Record<string, string> | Record<string, MessageFormatElement[]>
	>(langEn);

	useEffect(() => {
		const selectedLocale = localeOptions.find(
			([loc]) => loc === locale,
		)?.[0];
		if (selectedLocale) {
			const localeData = localeOptions.find(
				([loc]) => loc === selectedLocale,
			);
			if (localeData) {
				setMessages(localeData[2]);
				localStorage.setItem("locale", selectedLocale);
			}
		}
	}, [locale]);

	return (
		<IntlContext.Provider value={{ locale, setLocale, messages }}>
			<Provider locale={locale} messages={messages}>
				{children}
			</Provider>
		</IntlContext.Provider>
	);
};

export const getAvailableLocales = () => {
	return localeOptions.map(([locale]) => ({
		value: locale,
		label: locale,
		flag: getFlagCodeForLocale(locale),
	}));
};
