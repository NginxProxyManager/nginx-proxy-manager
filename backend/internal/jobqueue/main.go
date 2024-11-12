package jobqueue

import (
	"context"

	"github.com/rotisserie/eris"
)

var (
	ctx    context.Context
	cancel context.CancelFunc
	worker *Worker
)

// Start will intantiate the queue and start doing work
func Start() {
	ctx, cancel = context.WithCancel(context.Background())
	q := &Queue{
		jobs:   make(chan Job, 10),
		ctx:    ctx,
		cancel: cancel,
	}

	// Defines a queue worker, which will execute our queue.
	worker = newWorker(q)

	// Execute jobs in queue.
	go worker.doWork()
}

// Shutdown will gracefully stop the queue
func Shutdown() error {
	if cancel == nil {
		return eris.New("Unable to shutdown, jobqueue has not been started")
	}
	cancel()
	worker = nil
	cancel = nil
	return nil
}

// AddJob adds a job to the queue for processing
func AddJob(j Job) error {
	if worker == nil {
		return eris.New("Unable to add job, jobqueue has not been started")
	}
	worker.Queue.AddJob(j)
	return nil
}
