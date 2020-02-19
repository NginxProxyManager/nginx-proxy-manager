const _    = require('lodash');
const util = require('util');

module.exports = {

	PermissionError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = 'Permission Denied';
		this.public   = true;
		this.status   = 403;
	},

	ItemNotFoundError: function (id, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = 'Item Not Found - ' + id;
		this.public   = true;
		this.status   = 404;
	},

	AuthError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.public   = true;
		this.status   = 401;
	},

	InternalError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.status   = 500;
		this.public   = false;
	},

	InternalValidationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.status   = 400;
		this.public   = false;
	},

	ConfigurationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.status   = 400;
		this.public   = true;
	},

	CacheError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.message  = message;
		this.previous = previous;
		this.status   = 500;
		this.public   = false;
	},

	ValidationError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.public   = true;
		this.status   = 400;
	},

	AssertionFailedError: function (message, previous) {
		Error.captureStackTrace(this, this.constructor);
		this.name     = this.constructor.name;
		this.previous = previous;
		this.message  = message;
		this.public   = false;
		this.status   = 400;
	}
};

_.forEach(module.exports, function (error) {
	util.inherits(error, Error);
});
