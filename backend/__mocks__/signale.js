/**
 * Manual stub for the `signale` logging library.
 *
 * Used via moduleNameMapper so it must NOT reference jest globals.
 * Provides the Signale class and default logger methods as no-ops.
 */

const noop = () => {};

const makeLogger = () => ({
	debug:    noop,
	info:     noop,
	warn:     noop,
	error:    noop,
	log:      noop,
	fatal:    noop,
	trace:    noop,
	start:    noop,
	success:  noop,
	await:    noop,
	note:     noop,
	pause:    noop,
	complete: noop,
	pending:  noop,
	star:     noop,
	watch:    noop,
});

class Signale {
	constructor(_opts) {
		Object.assign(this, makeLogger());
	}
}

const defaultLogger = makeLogger();

export default {
	Signale,
	...defaultLogger,
};
