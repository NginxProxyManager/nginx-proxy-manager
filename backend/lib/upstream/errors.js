/**
 * Errors specific to the upstream endpoints. They follow the shape of lib/error.js
 * (public + status) so the app error handler renders them like every other public error.
 */

function TooManyRequestsError(message, retryAfter, previous) {
	Error.captureStackTrace(this, TooManyRequestsError);
	this.name = "TooManyRequestsError";
	this.previous = previous;
	this.message = message || "Too many requests";
	this.retry_after = retryAfter || null;
	// sent as error.details, so a client can show the wait in its own language
	this.details = { kind: "rate_limited", retry_after: this.retry_after };
	this.public = true;
	this.status = 429;
}

TooManyRequestsError.prototype = Object.create(Error.prototype);
TooManyRequestsError.prototype.constructor = TooManyRequestsError;

export { TooManyRequestsError };
