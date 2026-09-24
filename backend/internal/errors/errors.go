package errors

import (
	"strings"

	"github.com/rotisserie/eris"
)

// All error messages used by the service package to report
// problems back to calling clients
var (
	ErrDatabaseUnavailable    = eris.New("database-unavailable")
	ErrDuplicateEmailUser     = eris.New("email-already-exists")
	ErrInvalidLogin           = eris.New("invalid-login-credentials")
	ErrInvalidAuthType        = eris.New("invalid-auth-type")
	ErrUserDisabled           = eris.New("user-disabled")
	ErrSystemUserReadonly     = eris.New("cannot-save-system-users")
	ErrValidationFailed       = eris.New("request-failed-validation")
	ErrCurrentPasswordInvalid = eris.New("current-password-invalid")
	ErrCABundleDoesNotExist   = eris.New("ca-bundle-does-not-exist")
	ErrProviderNotFound       = eris.New("provider_not_found")
)

// Join works the same as golang builtin errors.Join except that it
// won't use new lines as separators, it uses commas
func Join(errs ...error) error {
	nonNil := make([]error, 0, len(errs))
	for _, err := range errs {
		if err != nil {
			nonNil = append(nonNil, err)
		}
	}

	if len(nonNil) == 0 {
		return nil
	}

	return joinedError{errs: nonNil}
}

type joinedError struct {
	errs []error
}

func (e joinedError) Error() string {
	messages := make([]string, len(e.errs))

	for i, err := range e.errs {
		messages[i] = err.Error()
	}

	return strings.Join(messages, ", ")
}

// Unwrap lets errors.Is and errors.As inspect every joined error.
func (e joinedError) Unwrap() []error {
	return e.errs
}
