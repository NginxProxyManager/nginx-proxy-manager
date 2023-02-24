package errors

import (
	"github.com/rotisserie/eris"
)

// All error messages used by the service package to report
// problems back to calling clients
var (
	ErrDatabaseUnavailable    = eris.New("database-unavailable")
	ErrDuplicateEmailUser     = eris.New("email-already-exists")
	ErrInvalidLogin           = eris.New("invalid-login-credentials")
	ErrUserDisabled           = eris.New("user-disabled")
	ErrSystemUserReadonly     = eris.New("cannot-save-system-users")
	ErrValidationFailed       = eris.New("request-failed-validation")
	ErrCurrentPasswordInvalid = eris.New("current-password-invalid")
	ErrCABundleDoesNotExist   = eris.New("ca-bundle-does-not-exist")
)
