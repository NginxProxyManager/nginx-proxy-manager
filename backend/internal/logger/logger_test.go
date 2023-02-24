package logger

import (
	"bytes"
	"io"
	"log"
	"os"
	"testing"

	"github.com/getsentry/sentry-go"
	"github.com/rotisserie/eris"
	"github.com/stretchr/testify/assert"
)

func TestGetLogLevel(t *testing.T) {
	assert.Equal(t, InfoLevel, GetLogLevel())
}

func TestThreshold(t *testing.T) {
	buf := new(bytes.Buffer)
	log.SetOutput(buf)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	assert.NoError(t, Configure(&Config{
		LogThreshold: InfoLevel,
	}))

	Debug("this should not display")
	assert.Empty(t, buf.String())

	Info("this should display")
	assert.NotEmpty(t, buf.String())

	Error("ErrorClass", eris.New("this should display"))
	assert.NotEmpty(t, buf.String())
}

func TestDebug(t *testing.T) {
	buf := new(bytes.Buffer)
	log.SetOutput(buf)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	assert.NoError(t, Configure(&Config{
		LogThreshold: DebugLevel,
	}))

	Debug("This is a %s message", "test")
	assert.Contains(t, buf.String(), "DEBUG")
	assert.Contains(t, buf.String(), "This is a test message")
}

func TestInfo(t *testing.T) {
	buf := new(bytes.Buffer)
	log.SetOutput(buf)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	assert.NoError(t, Configure(&Config{
		LogThreshold: InfoLevel,
	}))

	Info("This is a %s message", "test")
	assert.Contains(t, buf.String(), "INFO")
	assert.Contains(t, buf.String(), "This is a test message")
}

func TestWarn(t *testing.T) {
	buf := new(bytes.Buffer)
	log.SetOutput(buf)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	assert.NoError(t, Configure(&Config{
		LogThreshold: InfoLevel,
	}))

	Warn("This is a %s message", "test")
	assert.Contains(t, buf.String(), "WARN")
	assert.Contains(t, buf.String(), "This is a test message")
}

func TestError(t *testing.T) {
	buf := new(bytes.Buffer)
	log.SetOutput(buf)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	assert.NoError(t, Configure(&Config{
		LogThreshold: ErrorLevel,
	}))

	Error("TestErrorClass", eris.Errorf("this is a %s error", "test"))
	assert.Contains(t, buf.String(), "ERROR")
	assert.Contains(t, buf.String(), "this is a test error")
}

func TestConfigure(t *testing.T) {
	type args struct {
		c *Config
	}
	tests := []struct {
		name    string
		args    args
		wantErr bool
	}{
		{
			name: "configure",
			args: args{
				&Config{
					LogThreshold: InfoLevel,
					SentryConfig: sentry.ClientOptions{},
				},
			},
			wantErr: false,
		},
		{
			name: "invalid log level",
			args: args{
				&Config{
					SentryConfig: sentry.ClientOptions{},
				},
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			if err := Configure(tt.args.c); (err != nil) != tt.wantErr {
				t.Errorf("Configure() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func BenchmarkLogLevelBelowThreshold(b *testing.B) {
	l := NewLogger()

	log.SetOutput(io.Discard)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	for i := 0; i < b.N; i++ {
		l.logLevel(DebugLevel, "benchmark %d", i)
	}
}

func BenchmarkLogLevelAboveThreshold(b *testing.B) {
	l := NewLogger()

	log.SetOutput(io.Discard)
	defer func() {
		log.SetOutput(os.Stderr)
	}()

	for i := 0; i < b.N; i++ {
		l.logLevel(InfoLevel, "benchmark %d", i)
	}
}
