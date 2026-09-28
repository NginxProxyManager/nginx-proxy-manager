package api

import (
	"net/http"
	"time"

	"npm/internal/api/handler"
	"npm/internal/api/middleware"
	"npm/internal/api/schema"
	"npm/internal/config"
	"npm/internal/entity/accesslist"
	"npm/internal/entity/certificate"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"
	"npm/internal/entity/host"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/setting"
	"npm/internal/entity/stream"
	"npm/internal/entity/upstream"
	"npm/internal/entity/user"
	"npm/internal/logger"
	"npm/internal/serverevents"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter returns a new router object
func NewRouter() http.Handler {
	// Cors
	corss := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		AllowCredentials: true,
		MaxAge:           300,
	})

	r := chi.NewRouter()
	r.Use(
		// corss.Handler is the one and only place that decides
		// Access-Control-Allow-Origin - it must run before
		// middleware.Cors/Options so it can fully answer (and stop the
		// chain for) a real CORS preflight using the configured allowlist;
		// those two previously ran first and Options independently
		// hardcoded a wildcard, which shadowed this properly-configured
		// library entirely for every preflight request. middleware.Cors/
		// Options still run afterward for their own, non-CORS purpose
		// (reporting a matched route's allowed methods, and answering a
		// bare OPTIONS probe that isn't a browser CORS preflight at all).
		middleware.AccessControl,
		corss.Handler,
		middleware.Cors(r),
		middleware.Options(r),
		// nginx in front of the api overwrites X-Forwarded-For with the
		// connecting address, so the last value is the only trusted one
		chiMiddleware.ClientIPFromHeader("X-Forwarded-For"),
		chiMiddleware.Recoverer,
		chiMiddleware.Throttle(5),
		middleware.PrettyPrint,
		middleware.Expansion,
		middleware.DecodeAuth(),
		middleware.BodyContext(),
		middleware.Log,
	)

	return applyRoutes(r)
}

// applyRoutes is where the magic happens
func applyRoutes(r chi.Router) chi.Router {
	middleware.AuthCacheInit()
	r.NotFound(handler.NotFound())
	r.MethodNotAllowed(handler.NotAllowed())

	// OAuth endpoints aren't technically API endpoints
	r.With(middleware.EnforceSetup()).Route("/oauth", func(r chi.Router) {
		r.Get("/login", handler.OAuthLogin())
		r.Get("/redirect", handler.OAuthRedirect())
	})

	// SSE - requires a sse token as the `jwt` get parameter
	// Exists inside /api but it's here so that we can skip the Timeout middleware
	// that applies to other endpoints.
	r.With(middleware.EnforceSetup(), middleware.SSEAuth).
		Mount("/api/sse", serverevents.Get())

	// API
	r.With(chiMiddleware.Timeout(30*time.Second)).Route("/api", func(r chi.Router) {
		r.Get("/", handler.Health())
		r.Get("/schema", handler.Schema())
		r.With(middleware.EnforceSetup(), middleware.Enforce()).
			Get("/config", handler.Config())

		// Auth
		r.With(middleware.EnforceSetup()).Route("/auth", func(r chi.Router) {
			r.Get("/", handler.GetAuthConfig())
			r.With(middleware.EnforceRequestSchema(schema.GetToken())).
				Post("/", handler.NewToken())
			r.With(middleware.Enforce()).
				Post("/refresh", handler.RefreshToken())
			r.With(middleware.Enforce()).
				Post("/sse", handler.NewSSEToken())
		})

		// Users
		r.Route("/users", func(r chi.Router) {
			// Create - can be done in Setup stage as well
			r.With(
				middleware.Enforce(user.CapabilityUsersManage),
				middleware.EnforceRequestSchema(schema.CreateUser()),
			).Post("/", handler.CreateUser())

			// Requires Setup stage to be completed
			r.With(middleware.EnforceSetup()).Route("/", func(r chi.Router) {
				// Get yourself, requires a login but no other permissions
				r.With(middleware.Enforce()).
					Get("/{userID:me}", handler.GetUser())

				// Update yourself, requires a login but no other permissions
				r.With(
					middleware.Enforce(),
					middleware.EnforceRequestSchema(schema.UpdateUser()),
				).Put("/{userID:me}", handler.UpdateUser())

				r.With(middleware.Enforce(user.CapabilityUsersManage)).Route("/", func(r chi.Router) {
					// List
					r.With(middleware.ListQuery(user.Model{})).Get("/", handler.GetUsers())

					// Specific Item
					r.Get("/{userID:[0-9]+}", handler.GetUser())
					r.Delete("/{userID:([0-9]+|me)}", handler.DeleteUser())

					// Update another user
					r.With(middleware.EnforceRequestSchema(schema.UpdateUser())).
						Put("/{userID:[0-9]+}", handler.UpdateUser())
				})

				// Auth - sets passwords
				r.With(
					middleware.Enforce(),
					middleware.EnforceRequestSchema(schema.SetAuth()),
				).Post("/{userID:me}/auth", handler.SetAuth())
				r.With(
					middleware.Enforce(user.CapabilityUsersManage),
					middleware.EnforceRequestSchema(schema.SetAuth()),
				).Post("/{userID:[0-9]+}/auth", handler.SetAuth())
			})
		})

		// Only available in debug mode
		if config.GetLogLevel() == logger.DebugLevel {
			// delete users without auth
			r.Delete("/users", handler.DeleteUsers())
			// SSE test endpoints
			r.Post("/sse-notification", handler.TestSSENotification())
		}

		// Settings
		r.With(middleware.EnforceSetup(), middleware.Enforce(user.CapabilitySettingsManage)).Route("/settings", func(r chi.Router) {
			// List
			r.With(
				middleware.ListQuery(setting.Model{}),
			).Get("/", handler.GetSettings())

			r.Get("/{name}", handler.GetSetting())
			r.With(middleware.EnforceRequestSchema(schema.CreateSetting())).
				Post("/", handler.CreateSetting())
			r.With(middleware.EnforceRequestSchema(schema.UpdateSetting())).
				Put("/{name}", handler.UpdateSetting())
		})

		// Access Lists
		r.With(middleware.EnforceSetup()).Route("/access-lists", resourceRoutes{
			idParam:          "accessListID",
			model:            accesslist.Model{},
			viewCapability:   user.CapabilityAccessListsView,
			manageCapability: user.CapabilityAccessListsManage,
			createSchema:     schema.CreateAccessList(),
			updateSchema:     schema.UpdateAccessList(),
			list:             handler.GetAccessLists(),
			create:           handler.CreateAccessList(),
			get:              handler.GetAccessList(),
			update:           handler.UpdateAccessList(),
			del:              handler.DeleteAccessList(),
		}.mount)

		// DNS Providers
		r.With(middleware.EnforceSetup()).Route("/dns-providers", func(r chi.Router) {
			resourceRoutes{
				idParam:          "providerID",
				model:            dnsprovider.Model{},
				viewCapability:   user.CapabilityDNSProvidersView,
				manageCapability: user.CapabilityDNSProvidersManage,
				createSchema:     schema.CreateDNSProvider(),
				updateSchema:     schema.UpdateDNSProvider(),
				list:             handler.GetDNSProviders(),
				create:           handler.CreateDNSProvider(),
				get:              handler.GetDNSProvider(),
				update:           handler.UpdateDNSProvider(),
				del:              handler.DeleteDNSProvider(),
			}.mount(r)

			// List Acme DNS Providers
			r.With(middleware.Enforce(user.CapabilityDNSProvidersView)).Route("/acmesh", func(r chi.Router) {
				r.Get("/{acmeshID:[a-z0-9_]+}", handler.GetAcmeshProvider())
				r.Get("/", handler.GetAcmeshProviders())
			})
		})

		// Certificate Authorities
		r.With(middleware.EnforceSetup()).Route("/certificate-authorities", resourceRoutes{
			idParam:          "caID",
			model:            certificateauthority.Model{},
			viewCapability:   user.CapabilityCertificateAuthoritiesView,
			manageCapability: user.CapabilityCertificateAuthoritiesManage,
			createSchema:     schema.CreateCertificateAuthority(),
			updateSchema:     schema.UpdateCertificateAuthority(),
			list:             handler.GetCertificateAuthorities(),
			create:           handler.CreateCertificateAuthority(),
			get:              handler.GetCertificateAuthority(),
			update:           handler.UpdateCertificateAuthority(),
			del:              handler.DeleteCertificateAuthority(),
		}.mount)

		// Certificates
		r.With(middleware.EnforceSetup()).Route("/certificates", resourceRoutes{
			idParam:          "certificateID",
			model:            certificate.Model{},
			viewCapability:   user.CapabilityCertificatesView,
			manageCapability: user.CapabilityCertificatesManage,
			createSchema:     schema.CreateCertificate(),
			// updateSchema:  schema.UpdateCertificate(),
			list:   handler.GetCertificates(),
			create: handler.CreateCertificate(),
			get:    handler.GetCertificate(),
			update: handler.UpdateCertificate(),
			del:    handler.DeleteCertificate(),
			manageItem: func(r chi.Router) {
				r.Post("/renew", handler.RenewCertificate())
				r.Get("/download", handler.DownloadCertificate())
			},
		}.mount)

		// Hosts
		r.With(middleware.EnforceSetup()).Route("/hosts", resourceRoutes{
			idParam:          "hostID",
			model:            host.Model{},
			viewCapability:   user.CapabilityHostsView,
			manageCapability: user.CapabilityHostsManage,
			createSchema:     schema.CreateHost(),
			updateSchema:     schema.UpdateHost(),
			list:             handler.GetHosts(),
			create:           handler.CreateHost(),
			get:              handler.GetHost(),
			update:           handler.UpdateHost(),
			del:              handler.DeleteHost(),
			manageItem: func(r chi.Router) {
				r.Get("/nginx-config", handler.GetHostNginxConfig("json"))
				r.Get("/nginx-config.txt", handler.GetHostNginxConfig("text"))
			},
		}.mount)

		// Nginx Templates
		r.With(middleware.EnforceSetup()).Route("/nginx-templates", resourceRoutes{
			idParam:          "templateID",
			model:            nginxtemplate.Model{},
			viewCapability:   user.CapabilityNginxTemplatesView,
			manageCapability: user.CapabilityNginxTemplatesManage,
			createSchema:     schema.CreateNginxTemplate(),
			updateSchema:     schema.UpdateNginxTemplate(),
			list:             handler.GetNginxTemplates(),
			create:           handler.CreateNginxTemplate(),
			get:              handler.GetNginxTemplate(),
			update:           handler.UpdateNginxTemplate(),
			del:              handler.DeleteNginxTemplate(),
		}.mount)

		// Streams
		r.With(middleware.EnforceSetup()).Route("/streams", resourceRoutes{
			idParam:          "hostID",
			model:            stream.Model{},
			viewCapability:   user.CapabilityStreamsView,
			manageCapability: user.CapabilityStreamsManage,
			createSchema:     schema.CreateStream(),
			updateSchema:     schema.UpdateStream(),
			list:             handler.GetStreams(),
			create:           handler.CreateStream(),
			get:              handler.GetStream(),
			update:           handler.UpdateStream(),
			del:              handler.DeleteStream(),
		}.mount)

		// Upstreams
		r.With(middleware.EnforceSetup()).Route("/upstreams", resourceRoutes{
			idParam:          "upstreamID",
			model:            upstream.Model{},
			viewCapability:   user.CapabilityHostsView,
			manageCapability: user.CapabilityHostsManage,
			createSchema:     schema.CreateUpstream(),
			updateSchema:     schema.UpdateUpstream(),
			list:             handler.GetUpstreams(),
			create:           handler.CreateUpstream(),
			get:              handler.GetUpstream(),
			update:           handler.UpdateUpstream(),
			del:              handler.DeleteUpstream(),
			manageItem: func(r chi.Router) {
				r.Get("/nginx-config", handler.GetUpstreamNginxConfig("json"))
				r.Get("/nginx-config.txt", handler.GetUpstreamNginxConfig("text"))
			},
		}.mount)
	})

	return r
}
