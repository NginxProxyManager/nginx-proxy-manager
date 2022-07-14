package jobqueue

import (
	"context"
	"errors"
)

var (
	ctx    context.Context
	cancel context.CancelFunc
	worker *Worker
)

// Start ...
func Start() {
	ctx, cancel = context.WithCancel(context.Background())
	q := &Queue{
		jobs:   make(chan Job),
		ctx:    ctx,
		cancel: cancel,
	}

	// Defines a queue worker, which will execute our queue.
	worker = newWorker(q)

	// Execute jobs in queue.
	go worker.doWork()
}

// AddJob adds a job to the queue for processing
func AddJob(j Job) error {
	if worker == nil {
		return errors.New("Unable to add job, jobqueue has not been started")
	}
	worker.Queue.AddJob(j)
	return nil
}

// Shutdown ...
func Shutdown() error {
	if cancel == nil {
		return errors.New("Unable to shutdown, jobqueue has not been started")
	}
	cancel()
	return nil
}
