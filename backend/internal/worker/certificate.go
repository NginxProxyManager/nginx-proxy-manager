package worker

import (
	"time"

	"npm/internal/entity/certificate"
	"npm/internal/logger"
	"npm/internal/state"
)

type certificateWorker struct {
	state *state.AppState
}

// StartCertificateWorker starts the CertificateWorker
func StartCertificateWorker(state *state.AppState) {
	worker := newCertificateWorker(state)
	logger.Info("CertificateWorker Started")
	worker.Run()
}

func newCertificateWorker(state *state.AppState) *certificateWorker {
	return &certificateWorker{
		state: state,
	}
}

// Run the CertificateWorker
func (w *certificateWorker) Run() {
	// global wait group
	gwg := w.state.GetWaitGroup()
	gwg.Add(1)

	ticker := time.NewTicker(15 * time.Second)
mainLoop:
	for {
		select {
		case _, more := <-w.state.GetTermSig():
			if !more {
				logger.Info("Terminating CertificateWorker ... ")
				break mainLoop
			}
		case <-ticker.C:
			requestCertificates()
		}
	}
}

func requestCertificates() {
	rows, err := certificate.GetByStatus(certificate.StatusReady)
	if err != nil {
		logger.Error("requestCertificatesError", err)
		return
	}

	for _, row := range rows {
		if err := row.Request(); err != nil {
			logger.Error("CertificateRequestError", err)
		}
	}
}
