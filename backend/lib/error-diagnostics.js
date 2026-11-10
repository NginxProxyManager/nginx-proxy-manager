// Error messages, stacks and arbitrary driver fields can contain credentials or
// rendered configuration. Keep only known diagnostic labels and bounded numbers.
const names = new Set([
	"Error",
	"TypeError",
	"SyntaxError",
	"RangeError",
	"ValidationError",
	"PermissionError",
	"ItemNotFoundError",
	"AuthError",
	"TokenRevokedError",
	"InternalError",
	"InternalValidationError",
	"ConfigurationError",
	"CommandError",
	"DBError",
	"UniqueViolationError",
	"NotNullViolationError",
	"ForeignKeyViolationError",
]);
const codes = new Set([
	"EACCES",
	"EPERM",
	"ENOENT",
	"EEXIST",
	"EIO",
	"ENOSPC",
	"EMFILE",
	"ENFILE",
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
	"ENOTFOUND",
	"SQLITE_BUSY",
	"SQLITE_LOCKED",
	"SQLITE_CONSTRAINT",
	"SQLITE_CONSTRAINT_UNIQUE",
	"SQLITE_ERROR",
	"ER_DUP_ENTRY",
	"ER_LOCK_DEADLOCK",
	"ER_LOCK_WAIT_TIMEOUT",
	"ER_ACCESS_DENIED_ERROR",
	"23502",
	"23503",
	"23505",
	"40001",
	"40P01",
	"53300",
	"57P01",
	"entity.parse.failed",
	"entity.too.large",
	"request.aborted",
	"encoding.unsupported",
]);

export const errorDiagnostics = (err) => {
	const name = err?.name || err?.error;
	const result = { error: names.has(name) ? name : "Error" };
	if (codes.has(err?.code)) result.code = err.code;
	if (codes.has(err?.type)) result.type = err.type;
	if (Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599) result.status = err.status;
	const exitCode = Number.isInteger(err?.code) ? err.code : err?.exit_code;
	if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255) result.exit_code = exitCode;
	return result;
};
