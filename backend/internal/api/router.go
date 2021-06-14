package api

import (
	"net/http"
	"time"

	"npm/internal/api/handler"
	"npm/internal/api/middleware"
	"npm/internal/api/schema"
	"npm/internal/config"
	"npm/internal/entity/certificate"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/entity/host"
	"npm/internal/entity/setting"
	"npm/internal/entity/stream"
	"npm/internal/entity/user"
	"npm/internal/logger"

	"github.com/go-chi/chi"
	chiMiddleware "github.com/go-chi/chi/middleware"
	"github.com/go-chi/cors"
)

// NewRouter returns a new router object
func NewRouter() http.Handler {
	// Cors
	cors := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		AllowCredentials: true,
		MaxAge:           300,
	})

	r := chi.NewRouter()
	r.Use(
		middleware.AccessControl,
		middleware.Cors(r),
		middleware.Options(r),
		cors.Handler,
		chiMiddleware.RealIP,
		chiMiddleware.Recoverer,
		chiMiddleware.Throttle(5),
		chiMiddleware.Timeout(30*time.Second),
		middleware.PrettyPrint,
		middleware.DecodeAuth(),
		middleware.BodyContext(),
	)

	return applyRoutes(r)
}

// applyRoutes is where the magic happens
func applyRoutes(r chi.Router) chi.Router {
	r.NotFound(handler.NotFound())
	r.MethodNotAllowed(handler.NotAllowed())

	// API
	r.Route("/api", func(r chi.Router) {
		r.Get("/", handler.Health())
		r.Get("/schema", handler.Schema())
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).
			Get("/config", handler.Config())

		// Tokens
		r.With(middleware.EnforceSetup(true)).Route("/tokens", func(r chi.Router) {
			r.With(middleware.EnforceRequestSchema(schema.GetToken())).
				Post("/", handler.NewToken())
			r.With(middleware.Enforce()).
				Get("/", handler.RefreshToken())
		})

		// Users
		r.With(middleware.Enforce()).Route("/users", func(r chi.Router) {
			r.With(middleware.EnforceSetup(true)).Get("/{userID:(?:[0-9]+|me)}", handler.GetUser())
			r.With(middleware.EnforceSetup(true)).Delete("/{userID:(?:[0-9]+|me)}", handler.DeleteUser())
			r.With(middleware.EnforceSetup(true)).With(middleware.Filters(user.GetFilterSchema())).
				Get("/", handler.GetUsers())
			r.With(middleware.EnforceRequestSchema(schema.CreateUser())).
				Post("/", handler.CreateUser())
			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.UpdateUser())).
				Put("/{userID:(?:[0-9]+|me)}", handler.UpdateUser())

			// Auth
			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.SetAuth())).
				Post("/{userID:(?:[0-9]+|me)}/auth", handler.SetAuth())
		})

		// Only available in debug mode: delete users without auth
		if config.GetLogLevel() == logger.DebugLevel {
			r.Delete("/users", handler.DeleteUsers())
		}

		// Settings
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/settings", func(r chi.Router) {
			r.With(middleware.Filters(setting.GetFilterSchema())).
				Get("/", handler.GetSettings())
			r.Get("/{name}", handler.GetSetting())
			r.With(middleware.EnforceRequestSchema(schema.CreateSetting())).
				Post("/", handler.CreateSetting())
			r.With(middleware.EnforceRequestSchema(schema.UpdateSetting())).
				Put("/{name}", handler.UpdateSetting())
		})

		// DNS Providers
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/dns-providers", func(r chi.Router) {
			r.With(middleware.Filters(dnsprovider.GetFilterSchema())).
				Get("/", handler.GetDNSProviders())
			r.Get("/{providerID:[0-9]+}", handler.GetDNSProvider())
			r.Delete("/{providerID:[0-9]+}", handler.DeleteDNSProvider())
			r.With(middleware.EnforceRequestSchema(schema.CreateDNSProvider())).
				Post("/", handler.CreateDNSProvider())
			r.With(middleware.EnforceRequestSchema(schema.UpdateDNSProvider())).
				Put("/{providerID:[0-9]+}", handler.UpdateDNSProvider())
		})

		// Certificate Authorities
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/certificate-authorities", func(r chi.Router) {
			r.With(middleware.Filters(certificateauthority.GetFilterSchema())).
				Get("/", handler.GetCertificateAuthorities())
			r.Get("/{caID:[0-9]+}", handler.GetCertificateAuthority())
			r.Delete("/{caID:[0-9]+}", handler.DeleteCertificateAuthority())
			r.With(middleware.EnforceRequestSchema(schema.CreateCertificateAuthority())).
				Post("/", handler.CreateCertificateAuthority())
			r.With(middleware.EnforceRequestSchema(schema.UpdateCertificateAuthority())).
				Put("/{caID:[0-9]+}", handler.UpdateCertificateAuthority())
		})

		// Certificates
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/certificates", func(r chi.Router) {
			r.With(middleware.Filters(certificate.GetFilterSchema())).
				Get("/", handler.GetCertificates())
			r.Get("/{certificateID:[0-9]+}", handler.GetCertificate())
			r.Delete("/{certificateID:[0-9]+}", handler.DeleteCertificate())
			r.With(middleware.EnforceRequestSchema(schema.CreateCertificate())).
				Post("/", handler.CreateCertificate())
				/*
					r.With(middleware.EnforceRequestSchema(schema.UpdateCertificate())).
						Put("/{certificateID:[0-9]+}", handler.UpdateCertificate())
				*/
			r.Put("/{certificateID:[0-9]+}", handler.UpdateCertificate())
		})

		// Hosts
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/hosts", func(r chi.Router) {
			r.With(middleware.Filters(host.GetFilterSchema())).
				Get("/", handler.GetHosts())
			r.Get("/{hostID:[0-9]+}", handler.GetHost())
			r.Delete("/{hostID:[0-9]+}", handler.DeleteHost())
			r.With(middleware.EnforceRequestSchema(schema.CreateHost())).
				Post("/", handler.CreateHost())
			r.With(middleware.EnforceRequestSchema(schema.UpdateHost())).
				Put("/{hostID:[0-9]+}", handler.UpdateHost())
		})

		// Streams
		r.With(middleware.EnforceSetup(true), middleware.Enforce()).Route("/streams", func(r chi.Router) {
			r.With(middleware.Filters(stream.GetFilterSchema())).
				Get("/", handler.GetStreams())
			r.Get("/{hostID:[0-9]+}", handler.GetStream())
			r.Delete("/{hostID:[0-9]+}", handler.DeleteStream())
			r.With(middleware.EnforceRequestSchema(schema.CreateStream())).
				Post("/", handler.CreateStream())
			r.With(middleware.EnforceRequestSchema(schema.UpdateStream())).
				Put("/{hostID:[0-9]+}", handler.UpdateStream())
		})
	})

	return r
}
