package session

import "context"

type principalContextKey struct{}

// WithPrincipal carries the authenticated session identity to lower-level transports.
// Consumers must reauthorize before delivering protected data.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

func CurrentPrincipal(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalContextKey{}).(Principal)
	return p, ok
}
