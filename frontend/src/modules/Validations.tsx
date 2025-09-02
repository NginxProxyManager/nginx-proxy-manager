const validateString = (minLength = 0, maxLength = 0) => {
	if (minLength <= 0 && maxLength <= 0) {
		// this doesn't require translation
		console.error("validateString() must be called with a min or max or both values in order to work!");
	}

	return (value: string): string | undefined => {
		if (minLength && (typeof value === "undefined" || !value.length)) {
			return "This is required";
		}
		if (minLength && value.length < minLength) {
			return `Minimum length is ${minLength} character${minLength === 1 ? "" : "s"}`;
		}
		if (maxLength && (typeof value === "undefined" || value.length > maxLength)) {
			return `Maximum length is ${maxLength} character${maxLength === 1 ? "" : "s"}`;
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
			return "This is required";
		}
		if (min > -1 && int < min) {
			return `Minimum is ${min}`;
		}
		if (max > -1 && int > max) {
			return `Maximum is ${max}`;
		}
	};
};

const validateEmail = () => {
	return (value: string): string | undefined => {
		if (!value.length) {
			return "This is required";
		}
		if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) {
			return "Invalid email address";
		}
	};
};

export { validateEmail, validateNumber, validateString };
