package errors

import "errors"

// All error messages used by the service package to report
// problems back to calling clients
var (
	ErrDatabaseUnavailable = errors.New("Database is unavailable")
	ErrDuplicateEmailUser  = errors.New("A user already exists with this email address")
)
