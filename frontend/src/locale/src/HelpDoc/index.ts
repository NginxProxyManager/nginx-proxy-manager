import * as bg from "./bg/index";
import * as de from "./de/index";
import * as pt from "./pt/index";
import * as en from "./en/index";
import * as es from "./es/index";
import * as et from "./et/index";
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
import * as cs from "./cs/index";
import * as vi from "./vi/index";
import * as zh from "./zh/index";
import * as zhTw from "./zh-tw/index";
import * as tr from "./tr/index";
import * as hu from "./hu/index";

const items: any = { en, de, pt, es, et, ja, sk, cs, zh, "zh-TW": zhTw, pl, ru, it, vi, nl, bg, ko, ga, id, fr, tr, hu };


const fallbackLang = "en";

export const getHelpFile = (lang: string, section: string): string => {
  const requestedLang = lang.toLowerCase();
  const exactLang = Object.keys(items).find((key) => key.toLowerCase() === requestedLang);
  const shortLang = Object.keys(items).find((key) => key.toLowerCase() === requestedLang.slice(0, 2));

  if (exactLang && typeof items[exactLang][section] !== "undefined") {
    return items[exactLang][section].default;
  }
  if (shortLang && typeof items[shortLang][section] !== "undefined") {
    return items[shortLang][section].default;
  }
  // Fallback to English
  if (typeof items[fallbackLang] !== "undefined" && typeof items[fallbackLang][section] !== "undefined") {
    return items[fallbackLang][section].default;
  }
  throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

export default items;
