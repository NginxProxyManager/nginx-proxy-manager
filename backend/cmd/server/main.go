package main

import (
	"os"
	"os/signal"
	"syscall"

	"npm/internal/api"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/entity/setting"
	"npm/internal/jobqueue"
	"npm/internal/logger"
)

var commit string
var version string
var sentryDSN string

func main() {
	config.InitArgs(&version, &commit)
	config.Init(&version, &commit, &sentryDSN)

	database.Migrate(func() {
		setting.ApplySettings()
		database.CheckSetup()

		// Internal Job Queue
		jobqueue.Start()
		certificate.AddPendingJobs()
		host.AddPendingJobs()

		// Http server
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
				// nolint
				jobqueue.Shutdown()
				break
			}
		}
	})
}
