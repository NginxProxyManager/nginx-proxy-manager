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
	"npm/internal/entity/user"
	"npm/internal/errors"
	"npm/internal/jobqueue"
	"npm/internal/jwt"
	"npm/internal/logger"
)

var commit string
var version string

func main() {
	config.InitArgs(&version, &commit)
	config.Init(&version, &commit)
	config.CreateDataFolders()
	logger.Info("Build Version: %s (%s)", version, commit)

	database.Migrate(func() {
		if err := jwt.LoadKeys(); err != nil {
			logger.Error("KeysError", err)
			os.Exit(1)
		}

		checkSetup()

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
				sqlDB, _ := database.GetDB().DB()
				err := sqlDB.Close()
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

// checkSetup Quick check by counting the number of users in the database
func checkSetup() {
	db := database.GetDB()
	var count int64

	if db != nil {
		db.Model(&user.Model{}).
			Where("is_disabled = ?", false).
			Where("is_system = ?", false).
			Count(&count)

		if count == 0 {
			logger.Warn("No users found, starting in Setup Mode")
		} else {
			config.IsSetup = true
			logger.Info("Application is setup")
		}
	} else {
		logger.Error("DatabaseError", errors.ErrDatabaseUnavailable)
	}
}
