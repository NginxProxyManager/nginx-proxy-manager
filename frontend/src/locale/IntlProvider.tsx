import React from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";
import { useSelector } from "react-redux";
import { RootState } from "../store";

import langEn from "./en.json";
import langZh from "./zh.json";
import langDe from "./de.json";
import langFr from "./fr.json";
import langNl from "./nl.json";
import langIt from "./it.json";
import langPt from "./pt.json";
import langTw from "./tw.json";

const localeOptions = [
  ["en", "en-US", langEn],
  ["zh", "zh-CN", langZh],
  ["de", "de-DE", langDe],
  ["fr", "fr-FR", langFr],
  ["nl", "nl-NL", langNl],
  ["it", "it-IT", langIt],
  ["pt", "pt-BR", langPt],
];

// Add Traditional Chinese locale
localeOptions.push(["tw", "zh-TW", langTw]);

interface IntlProviderProps {
  children: React.ReactNode;
}

const IntlProvider: React.FC<IntlProviderProps> = ({ children }) => {
  const locale = useSelector((state: RootState) => state.ui.locale);

  // Find the matching locale from localeOptions
  const localeData = localeOptions.find(([key]) => key === locale) || localeOptions[0];
  const [, localeString, messages] = localeData;

  // Special cases for locale strings
  const specialCases: Record<string, string> = {
    zh: "zh",
    de: "de",
    fr: "fr",
    nl: "nl",
    it: "it",
    pt: "pt",
    tw: "tw",
  };

  const localeToUse = specialCases[locale] || localeString;

  return (
    <ReactIntlProvider locale={localeToUse} messages={messages}>
      {children}
    </ReactIntlProvider>
  );
};

export default IntlProvider;
