package main

import (
	"os"
	"os/signal"
	"syscall"

	"npm/internal/api"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/setting"
	"npm/internal/logger"
	"npm/internal/state"
	"npm/internal/worker"
)

var commit string
var version string
var sentryDSN string

func main() {
	config.Init(&version, &commit, &sentryDSN)
	appstate := state.NewState()

	database.Migrate(func() {
		setting.ApplySettings()
		database.CheckSetup()
		go worker.StartCertificateWorker(appstate)

		api.StartServer()
		irqchan := make(chan os.Signal, 1)
		signal.Notify(irqchan, syscall.SIGINT, syscall.SIGTERM)

		for irq := range irqchan {
			if irq == syscall.SIGINT || irq == syscall.SIGTERM {
				logger.Info("Got ", irq, " shutting server down ...")
				// Close db
				err := database.GetInstance().Close()
				if err != nil {
					logger.Error("DatabaseCloseError", err)
				}
				break
			}
		}
	})
}
