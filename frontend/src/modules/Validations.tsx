import { intl } from "src/locale";

const validateString = (minLength = 0, maxLength = 0) => {
	if (minLength <= 0 && maxLength <= 0) {
		// this doesn't require translation
		console.error(
			"validateString() must be called with a min or max or both values in order to work!",
		);
	}

	return (value: string): string | undefined => {
		if (minLength && !value.length) {
			return intl.formatMessage({ id: "form.required" });
		}
		if (minLength && value.length < minLength) {
			return intl.formatMessage(
				{ id: "form.min-length" },
				{ count: minLength },
			);
		}
		if (maxLength && value.length > maxLength) {
			return intl.formatMessage(
				{ id: "form.max-length" },
				{ count: maxLength },
			);
		}
	};
};

const validateNumber = (min = -1, max = -1) => {
	if (min === -1 && max === -1) {
		// this doesn't require translation
		console.error(
			"validateNumber() must be called with a min or max or both values in order to work!",
		);
	}

	return (value: string): string | undefined => {
		const int: number = +value;
		if (min > -1 && !int) {
			return intl.formatMessage({ id: "form.required" });
		}
		if (min > -1 && int < min) {
			return intl.formatMessage({ id: "form.min-int" }, { count: min });
		}
		if (max > -1 && int > max) {
			return intl.formatMessage({ id: "form.max-int" }, { count: max });
		}
	};
};

const validateEmail = () => {
	return (value: string): string | undefined => {
		if (!value.length) {
			return intl.formatMessage({ id: "form.required" });
		}
		if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
			return intl.formatMessage({ id: "form.invalid-email" });
		}
	};
};

export { validateEmail, validateNumber, validateString };
