import _ from "lodash";

const errs = {
	PermissionError: function (_, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = "Permission Denied";
		this.public = true;
		this.status = 403;
	},

	ItemNotFoundError: function (id, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = "Not Found";
		if (id) {
			this.message = `Not Found - ${id}`;
		}
		this.public = true;
		this.status = 404;
	},

	AuthError: function (message, messageI18n, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.message_i18n = messageI18n;
		this.public = true;
		this.status = 400;
	},

	InternalError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.status = 500;
		this.public = false;
	},

	InternalValidationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.status = 400;
		this.public = false;
	},

	ConfigurationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.status = 400;
		this.public = true;
	},

	CacheError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.message = message;
		this.previous = previous;
		this.status = 500;
		this.public = false;
	},

	ValidationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.public = true;
		this.status = 400;
	},

	AssertionFailedError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = message;
		this.public = false;
		this.status = 400;
	},

	CommandError: function (stdErr, code, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name = this.constructor.name;
		this.previous = previous;
		this.message = stdErr;
		this.code = code;
		this.public = false;
	},
};

_.forEach(errs, (err) => {
	err.prototype = Object.create(Error.prototype);
});

export default errs;
