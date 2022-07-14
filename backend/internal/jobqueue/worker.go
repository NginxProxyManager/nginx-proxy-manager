package jobqueue

import (
	"fmt"
	"npm/internal/logger"
)

// Worker responsible for queue serving.
type Worker struct {
	Queue *Queue
}

func newWorker(queue *Queue) *Worker {
	return &Worker{
		Queue: queue,
	}
}

// doWork processes jobs from the queue (jobs channel).
func (w *Worker) doWork() bool {
	for {
		select {
		// if context was canceled.
		case <-w.Queue.ctx.Done():
			logger.Info("JobQueue worker graceful shutdown")
			return true
		// if job received.
		case job := <-w.Queue.jobs:
			err := job.Run()
			if err != nil {
				logger.Error(fmt.Sprintf("%sError", job.Name), err)
				continue
			}
		}
	}
}
