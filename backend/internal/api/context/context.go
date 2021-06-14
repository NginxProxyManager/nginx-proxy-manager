package context

var (
	// BodyCtxKey is the name of the Body value on the context
	BodyCtxKey = &contextKey{"Body"}
	// UserIDCtxKey is the name of the UserID value on the context
	UserIDCtxKey = &contextKey{"UserID"}
	// FiltersCtxKey is the name of the Filters value on the context
	FiltersCtxKey = &contextKey{"Filters"}
	// PrettyPrintCtxKey is the name of the pretty print context
	PrettyPrintCtxKey = &contextKey{"Pretty"}
	// ExpansionCtxKey is the name of the expansion context
	ExpansionCtxKey = &contextKey{"Expansion"}
)

// contextKey is a value for use with context.WithValue. It's used as
// a pointer so it fits in an interface{} without allocation. This technique
// for defining context keys was copied from Go 1.7's new use of context in net/http.
type contextKey struct {
	name string
}

func (k *contextKey) String() string {
	return "context value: " + k.name
}
