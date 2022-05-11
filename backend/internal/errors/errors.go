package errors

import "errors"

// All error messages used by the service package to report
// problems back to calling clients
var (
	ErrDatabaseUnavailable    = errors.New("database-unavailable")
	ErrDuplicateEmailUser     = errors.New("email-already-exists")
	ErrInvalidLogin           = errors.New("invalid-login-credentials")
	ErrUserDisabled           = errors.New("user-disabled")
	ErrSystemUserReadonly     = errors.New("cannot-save-system-users")
	ErrValidationFailed       = errors.New("request-failed-validation")
	ErrCurrentPasswordInvalid = errors.New("current-password-invalid")
	ErrCABundleDoesNotExist   = errors.New("ca-bundle-does-not-exist")
)
