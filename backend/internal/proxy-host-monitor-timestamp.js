const UNIX_MILLISECONDS_THRESHOLD = 100_000_000_000;

// Nginx's $msec value is a Unix timestamp in seconds (with milliseconds as a
// decimal fraction). Convert it to a browser-safe date before persistence.
export const normalizeEventTimestamp = (value, fallback = new Date()) => {
	const rawValue = String(value ?? "").trim();
	if (!rawValue) return fallback;
	const numericValue = Number(rawValue);
	const timestamp = Number.isFinite(numericValue)
		? new Date(Math.abs(numericValue) >= UNIX_MILLISECONDS_THRESHOLD ? numericValue : numericValue * 1000)
		: new Date(rawValue);
	return Number.isNaN(timestamp.getTime()) ? fallback : timestamp;
};
