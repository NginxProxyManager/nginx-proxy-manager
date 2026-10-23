package main

import (
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"npm/internal/api"
	"npm/internal/api/handler"
	"npm/internal/config"
	"npm/internal/database"
	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	ssoconfig "npm/internal/entity/sso"
	"npm/internal/entity/user"
	"npm/internal/errors"
	"npm/internal/jobqueue"
	"npm/internal/jwt"
	"npm/internal/logger"
	"npm/internal/migrations"
	"npm/internal/secretstore"
	"npm/internal/sso"

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
	// Local bootstrap remains available, while a broken SSO restore is explicit
	// in diagnostics. SSO services must require a successfully opened store.
	secrets, err := secretstore.Open(config.Configuration.DataFolder)
	if err != nil {
		logger.Error("SSOInitializationError", err)
	}
	oidc := sso.NewOIDCAdapter(nil, secrets).(*sso.OIDCAdapter)
	oauth2 := sso.NewOAuth2Adapter(nil, secrets).(*sso.OAuth2Adapter)
	saml := sso.NewSAMLAdapter(nil, secrets).(*sso.SAMLAdapter)
	handler.RegisterSSOProbe(ssoconfig.OIDC, oidc.Probe)
	handler.RegisterSSOProbe(ssoconfig.OAuth2, oauth2.Probe)
	handler.RegisterSSOProbe(ssoconfig.SAML, saml.Probe)
	handler.RegisterSSOSAML(saml.PreviewMetadata, saml.PrepareConnection)
	var browserService *sso.Service
	if secrets != nil {
		browserService = sso.NewService(database.GetDB(), secrets, map[ssoconfig.Protocol]sso.Adapter{
			ssoconfig.OIDC: oidc, ssoconfig.OAuth2: oauth2, ssoconfig.SAML: saml,
		})
	}
	handler.RegisterBrowserSSO(browserService, func(r *http.Request, conn ssoconfig.Connection, origin string) ([]byte, error) {
		return saml.Metadata(r.Context(), conn, origin)
	})

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
