package sso

import (
	"context"

	"gorm.io/gorm"
	"npm/internal/authpolicy"
)

// WithPolicyWrite serializes policy edits and callback admission with session
// revocation and protected delivery. The handler coordinates all mutations in tx.
func WithPolicyWrite(ctx context.Context, fn func(tx *gorm.DB) error) error {
	return authpolicy.WithMutation(ctx, fn)
}
