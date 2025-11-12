import { intl } from "src/locale";

const validateString = (minLength = 0, maxLength = 0) => {
	if (minLength <= 0 && maxLength <= 0) {
		// this doesn't require translation
		console.error("validateString() must be called with a min or max or both values in order to work!");
	}

	return (value: string): string | undefined => {
		if (minLength && (typeof value === "undefined" || !value.length)) {
			return intl.formatMessage({ id: "error.required" });
		}
		if (minLength && value.length < minLength) {
			return intl.formatMessage({ id: "error.min-character-length" }, { min: minLength });
		}
		if (maxLength && (typeof value === "undefined" || value.length > maxLength)) {
			return intl.formatMessage({ id: "error.max-character-length" }, { max: maxLength });
		}
	};
};

const validateNumber = (min = -1, max = -1) => {
	if (min === -1 && max === -1) {
		// this doesn't require translation
		console.error("validateNumber() must be called with a min or max or both values in order to work!");
	}

	return (value: string): string | undefined => {
		const int: number = +value;
		if (min > -1 && !int) {
			return intl.formatMessage({ id: "error.required" });
		}
		if (min > -1 && int < min) {
			return intl.formatMessage({ id: "error.minimum" }, { min });
		}
		if (max > -1 && int > max) {
			return intl.formatMessage({ id: "error.maximum" }, { max });
		}
	};
};

const validateEmail = () => {
	return (value: string): string | undefined => {
		if (!value.length) {
			return intl.formatMessage({ id: "error.required" });
		}
		if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+$/i.test(value)) {
			return intl.formatMessage({ id: "error.invalid-email" });
		}
	};
};

const validateDomain = (allowWildcards = false) => {
	return (d: string): boolean => {
		const dom = d.trim().toLowerCase();

		if (dom.length < 3) {
			return false;
		}

		// Prevent wildcards
		if (!allowWildcards && dom.indexOf("*") !== -1) {
			return false;
		}

		// Prevent duplicate * in domain
		if ((dom.match(/\*/g) || []).length > 1) {
			return false;
		}

		// Prevent some invalid characters
		if ((dom.match(/(@|,|!|&|\$|#|%|\^|\(|\))/g) || []).length > 0) {
			return false;
		}

		// This will match *.com type domains,
		return dom.match(/\*\.[^.]+$/m) === null;
	};
};

const validateDomains = (allowWildcards = false, maxDomains?: number) => {
	const vDom = validateDomain(allowWildcards);

	return (value?: string[]): string | undefined => {
		if (!value?.length) {
			return intl.formatMessage({ id: "error.required" });
		}

		// Deny if the list of domains is hit
		if (maxDomains && value?.length >= maxDomains) {
			return intl.formatMessage({ id: "error.max-domains" }, { max: maxDomains });
		}

		// validate each domain
		for (let i = 0; i < value?.length; i++) {
			if (!vDom(value[i])) {
				return intl.formatMessage({ id: "error.invalid-domain" }, { domain: value[i] });
			}
		}
	};
};

export { validateEmail, validateNumber, validateString, validateDomains, validateDomain };
