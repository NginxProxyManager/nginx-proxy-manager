import * as de from "./de/index";
import * as en from "./en/index";
import * as fa from "./fa/index";
import * as es from "./es/index";

const items: any = { de, en, fa, es };

export const getHelpFile = (lang: string, section: string): string => {
	if (
		typeof items[lang] !== "undefined" &&
		typeof items[lang][section] !== "undefined"
	) {
		return items[lang][section].default;
	}
	throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

export default items;
