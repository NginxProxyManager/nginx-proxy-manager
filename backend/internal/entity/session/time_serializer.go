package session

import (
	"context"
	"fmt"
	"reflect"
	"time"

	"gorm.io/gorm/schema"
)

// portableTimestampSerializer accepts the timestamp text returned by SQLite
// for polyschema timestamp columns while preserving native time values from
// Postgres and MySQL.
type portableTimestampSerializer struct{}

func init() {
	schema.RegisterSerializer("session_timestamp", portableTimestampSerializer{})
}

func (portableTimestampSerializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue any) error {
	if dbValue == nil {
		return field.Set(ctx, dst, nil)
	}
	value, err := parsePortableTimestamp(dbValue)
	if err != nil {
		return err
	}
	if field.FieldType.Kind() == reflect.Pointer {
		return field.Set(ctx, dst, &value)
	}
	return field.Set(ctx, dst, value)
}

func (portableTimestampSerializer) Value(_ context.Context, _ *schema.Field, _ reflect.Value, fieldValue any) (any, error) {
	switch value := fieldValue.(type) {
	case time.Time:
		return value, nil
	case *time.Time:
		if value == nil {
			return nil, nil
		}
		return *value, nil
	default:
		return nil, fmt.Errorf("session timestamp has unsupported value %T", fieldValue)
	}
}

func parsePortableTimestamp(value any) (time.Time, error) {
	if parsed, ok := value.(time.Time); ok {
		return parsed, nil
	}
	var raw string
	switch typed := value.(type) {
	case string:
		raw = typed
	case []byte:
		raw = string(typed)
	default:
		return time.Time{}, fmt.Errorf("session timestamp has unsupported database value %T", value)
	}
	for _, layout := range []string{
		time.RFC3339Nano,
		"2006-01-02 15:04:05.999999999Z07:00",
		"2006-01-02 15:04:05.999999999-07:00",
		"2006-01-02 15:04:05Z07:00",
		time.DateTime,
	} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid session timestamp %q", raw)
}
