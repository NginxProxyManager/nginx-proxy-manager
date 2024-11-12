package jobqueue

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/rotisserie/eris"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type MockJob struct {
	done chan bool
}

func (m *MockJob) Execute() {
	time.Sleep(1 * time.Second)
	m.done <- true
}

func TestStart(t *testing.T) {
	Start()
	assert.NotNil(t, ctx, "Context should not be nil after Start")
	assert.NotNil(t, cancel, "Cancel function should not be nil after Start")
	assert.NotNil(t, worker, "Worker should not be nil after Start")
	Shutdown()
}

func TestShutdown(t *testing.T) {
	Start()
	err := Shutdown()
	require.Nil(t, err, "Shutdown should not return an error when jobqueue is started")

	// nolint: gosimple
	select {
	case <-ctx.Done():
		switch ctx.Err() {
		case context.DeadlineExceeded:
			fmt.Println("context timeout exceeded")
		case context.Canceled:
			fmt.Println("context cancelled by force. whole process is complete")
		default:
			require.Nil(t, ctx.Err(), "Context done state has unexpected value")
		}
	}

	require.Nil(t, cancel, "Cancel function should be nil after Shutdown")
	require.Nil(t, worker, "Worker should be nil after Shutdown")

	err = Shutdown()
	require.NotNil(t, err, "Shutdown should return an error when jobqueue is not started")
	require.Equal(t, eris.New("Unable to shutdown, jobqueue has not been started").Error(), err.Error())
}

func TestAddJobWithoutStart(t *testing.T) {
	mockJob := Job{
		Name: "mockJob",
		Action: func() error {
			return nil
		},
	}
	err := AddJob(mockJob)
	assert.NotNil(t, err, "AddJob should return an error when jobqueue is not started")
	assert.Equal(t, eris.New("Unable to add job, jobqueue has not been started").Error(), err.Error())
}
