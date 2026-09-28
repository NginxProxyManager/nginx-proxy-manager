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
	"npm/internal/migrations"

	// properly respect available cpu cores
	_ "go.uber.org/automaxprocs"
)

var commit string
var version string

func main() {
	config.InitArgs(&version, &commit)
	config.Init(&version, &commit)
	config.CreateDataFolders()
	logger.Info("Build Version: %s (%s)", version, commit)

	if err := config.LoadDBConfig(); err != nil {
		logger.Error("DatabaseConfigError", err)
		os.Exit(1)
	}

	if config.Configuration.DB.IsConfigured() {
		if err := start(); err != nil {
			logger.Error("StartupError", err)
			os.Exit(1)
		}
	} else {
		logger.Warn("No database configured, starting in Database Setup Mode")
		api.SetHandler(api.NewSetupRouter(start))
	}

	// Http server
	go api.StartServer()

	irqchan := make(chan os.Signal, 1)
	signal.Notify(irqchan, syscall.SIGINT, syscall.SIGTERM)

	for irq := range irqchan {
		if irq == syscall.SIGINT || irq == syscall.SIGTERM {
			logger.Info("Got %v, shutting server down ...", irq)
			database.Close()
			// nolint
			jobqueue.Shutdown()
			break
		}
	}
}

// start connects to the configured database, applies migrations and
// starts everything that depends on the database, then switches the http
// server over to the full router. It runs at boot when a database is
// already configured, otherwise when the database setup wizard completes.
func start() error {
	if !migrations.Migrate(func() {}) {
		return errors.ErrDatabaseUnavailable
	}

	if err := jwt.LoadKeys(); err != nil {
		return err
	}

	if err := checkSetup(); err != nil {
		return err
	}

	// Internal Job Queue
	jobqueue.Start()
	certificate.AddPendingJobs()
	host.AddPendingJobs()

	config.IsDBSetup = true
	api.SetHandler(api.NewRouter())
	return nil
}

// checkSetup Quick check by counting the number of users in the database
func checkSetup() error {
	db := database.GetDB()
	if db == nil {
		return errors.ErrDatabaseUnavailable
	}

	var count int64
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
	return nil
}
