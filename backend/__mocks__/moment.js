/**
 * Minimal stub for moment.js.
 * Provides the API surface used by lib/helpers.js (parseDatePeriod).
 */

const momentObj = {
	add:      function() { return this; },
	subtract: function() { return this; },
	toDate:   () => new Date(),
	toISOString: () => new Date().toISOString(),
	isValid:  () => true,
	valueOf:  () => Date.now(),
};

function moment(input) {
	return {
		...momentObj,
		clone: () => moment(input),
	};
}

moment.duration = (_value, _unit) => ({
	asMilliseconds: () => 86400000,
	toISOString:    () => "P1D",
});

moment.isMoment   = (obj) => obj && typeof obj.toDate === "function";
moment.utc        = (input) => moment(input);
moment.unix       = (ts) => moment(new Date(ts * 1000));
moment.ISO_8601   = "ISO_8601";

export default moment;
