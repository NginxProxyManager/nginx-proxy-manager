package migrations

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"strings"

	"npm/internal/logger"
)

// logHandler routes polyschema's slog output through the application
// logger, so migration progress and warnings (e.g. MySQL committing DDL
// implicitly) show up alongside everything else.
type logHandler struct {
	attrs []slog.Attr
}

func newSlogLogger() *slog.Logger {
	return slog.New(&logHandler{})
}

// Enabled lets every record through; the application logger applies its
// own level filtering.
func (*logHandler) Enabled(context.Context, slog.Level) bool {
	return true
}

func (h *logHandler) Handle(_ context.Context, r slog.Record) error {
	var b strings.Builder
	b.WriteString(r.Message)
	write := func(a slog.Attr) bool {
		fmt.Fprintf(&b, " %s=%v", a.Key, a.Value)
		return true
	}
	for _, a := range h.attrs {
		write(a)
	}
	r.Attrs(write)

	msg := b.String()
	switch {
	case r.Level >= slog.LevelWarn:
		logger.Warn("%s", msg)
	case r.Level >= slog.LevelInfo:
		logger.Info("%s", msg)
	default:
		logger.Debug("%s", msg)
	}
	return nil
}

func (h *logHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &logHandler{attrs: slices.Concat(h.attrs, attrs)}
}

// WithGroup is unused by polyschema, so groups are flattened.
func (h *logHandler) WithGroup(string) slog.Handler {
	return h
}
