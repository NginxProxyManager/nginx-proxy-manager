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
		middleware.PrettyPrint,
		middleware.Expansion,
		middleware.DecodeAuth(),
		middleware.BodyContext(),
	)

	return applyRoutes(r)
}

// applyRoutes is where the magic happens
func applyRoutes(r chi.Router) chi.Router {
	middleware.AuthCacheInit()
	r.NotFound(handler.NotFound())
	r.MethodNotAllowed(handler.NotAllowed())

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
		r.With(middleware.EnforceSetup()).Route("/access-lists", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityAccessListsView),
				middleware.ListQuery(accesslist.Model{}),
			).Get("/", handler.GetAccessLists())

			// Create
			r.With(middleware.Enforce(user.CapabilityAccessListsManage), middleware.EnforceRequestSchema(schema.CreateAccessList())).
				Post("/", handler.CreateAccessList())

			// Specific Item
			r.Route("/{accessListID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityAccessListsView)).
					Get("/", handler.GetAccessList())
				r.With(middleware.Enforce(user.CapabilityAccessListsManage)).Route("/", func(r chi.Router) {
					r.Delete("/{accessListID:[0-9]+}", handler.DeleteAccessList())
					r.With(middleware.EnforceRequestSchema(schema.UpdateAccessList())).
						Put("/{accessListID:[0-9]+}", handler.UpdateAccessList())
				})
			})
		})

		// DNS Providers
		r.With(middleware.EnforceSetup()).Route("/dns-providers", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityDNSProvidersView),
				middleware.ListQuery(dnsprovider.Model{}),
			).Get("/", handler.GetDNSProviders())

			// Create
			r.With(middleware.Enforce(user.CapabilityDNSProvidersManage), middleware.EnforceRequestSchema(schema.CreateDNSProvider())).
				Post("/", handler.CreateDNSProvider())

			// Specific Item
			r.Route("/{providerID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityDNSProvidersView)).
					Get("/{providerID:[0-9]+}", handler.GetDNSProvider())
				r.With(middleware.Enforce(user.CapabilityDNSProvidersManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteDNSProvider())
					r.With(middleware.EnforceRequestSchema(schema.UpdateDNSProvider())).
						Put("/{providerID:[0-9]+}", handler.UpdateDNSProvider())
				})
			})

			// List Acme DNS Providers
			r.With(middleware.Enforce(user.CapabilityDNSProvidersView)).Route("/acmesh", func(r chi.Router) {
				r.Get("/{acmeshID:[a-z0-9_]+}", handler.GetAcmeshProvider())
				r.Get("/", handler.GetAcmeshProviders())
			})
		})

		// Certificate Authorities
		r.With(middleware.EnforceSetup()).Route("/certificate-authorities", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityCertificateAuthoritiesView),
				middleware.ListQuery(certificateauthority.Model{}),
			).Get("/", handler.GetCertificateAuthorities())

			// Create
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage), middleware.EnforceRequestSchema(schema.CreateCertificateAuthority())).
				Post("/", handler.CreateCertificateAuthority())

			// Specific Item
			r.Route("/{caID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesView)).
					Get("/", handler.GetCertificateAuthority())

				r.With(middleware.EnforceRequestSchema(schema.UpdateCertificateAuthority())).
					Put("/", handler.UpdateCertificateAuthority())
				r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage)).
					Delete("/", handler.DeleteCertificateAuthority())

				r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage)).Route("/", func(r chi.Router) {
					r.Delete("/{caID:[0-9]+}", handler.DeleteCertificateAuthority())
					r.With(middleware.EnforceRequestSchema(schema.UpdateCertificateAuthority())).
						Put("/{caID:[0-9]+}", handler.UpdateCertificateAuthority())
				})
			})
		})

		// Certificates
		r.With(middleware.EnforceSetup()).Route("/certificates", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityCertificatesView),
				middleware.ListQuery(certificate.Model{}),
			).Get("/", handler.GetCertificates())

			// Create
			r.With(middleware.Enforce(user.CapabilityCertificatesManage), middleware.EnforceRequestSchema(schema.CreateCertificate())).
				Post("/", handler.CreateCertificate())

			// Specific Item
			r.Route("/{certificateID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityCertificatesView)).
					Get("/", handler.GetCertificate())
				r.With(middleware.Enforce(user.CapabilityCertificatesManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteCertificate())
					r.Put("/", handler.UpdateCertificate())
					// r.With(middleware.EnforceRequestSchema(schema.UpdateCertificate())).
					//     Put("/", handler.UpdateCertificate())
					r.Post("/renew", handler.RenewCertificate())
					r.Get("/download", handler.DownloadCertificate())
				})
			})
		})

		// Hosts
		r.With(middleware.EnforceSetup()).Route("/hosts", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityHostsView),
				middleware.ListQuery(host.Model{}),
			).Get("/", handler.GetHosts())

			// Create
			r.With(middleware.Enforce(user.CapabilityHostsManage), middleware.EnforceRequestSchema(schema.CreateHost())).
				Post("/", handler.CreateHost())

			// Specific Item
			r.Route("/{hostID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityHostsView)).
					Get("/", handler.GetHost())
				r.With(middleware.Enforce(user.CapabilityHostsManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteHost())
					r.With(middleware.EnforceRequestSchema(schema.UpdateHost())).
						Put("/", handler.UpdateHost())
					r.Get("/nginx-config", handler.GetHostNginxConfig("json"))
					r.Get("/nginx-config.txt", handler.GetHostNginxConfig("text"))
				})
			})
		})

		// Nginx Templates
		r.With(middleware.EnforceSetup()).Route("/nginx-templates", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityNginxTemplatesView),
				middleware.ListQuery(nginxtemplate.Model{}),
			).Get("/", handler.GetNginxTemplates())

			// Create
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesManage), middleware.EnforceRequestSchema(schema.CreateNginxTemplate())).
				Post("/", handler.CreateNginxTemplate())

			// Specific Item
			r.Route("/{templateID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityNginxTemplatesView)).
					Get("/", handler.GetNginxTemplates())
				r.With(middleware.Enforce(user.CapabilityHostsManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteNginxTemplate())
					r.With(middleware.EnforceRequestSchema(schema.UpdateNginxTemplate())).
						Put("/", handler.UpdateNginxTemplate())
				})
			})
		})

		// Streams
		r.With(middleware.EnforceSetup()).Route("/streams", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityStreamsView),
				middleware.ListQuery(stream.Model{}),
			).Get("/", handler.GetStreams())

			// Create
			r.With(middleware.Enforce(user.CapabilityStreamsManage), middleware.EnforceRequestSchema(schema.CreateStream())).
				Post("/", handler.CreateStream())

			// Specific Item
			r.Route("/{hostID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityStreamsView)).
					Get("/", handler.GetStream())
				r.With(middleware.Enforce(user.CapabilityHostsManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteStream())
					r.With(middleware.EnforceRequestSchema(schema.UpdateStream())).
						Put("/", handler.UpdateStream())
				})
			})
		})

		// Upstreams
		r.With(middleware.EnforceSetup()).Route("/upstreams", func(r chi.Router) {
			// List
			r.With(
				middleware.Enforce(user.CapabilityHostsView),
				middleware.ListQuery(upstream.Model{}),
			).Get("/", handler.GetUpstreams())

			// Create
			r.With(middleware.Enforce(user.CapabilityHostsManage), middleware.EnforceRequestSchema(schema.CreateUpstream())).
				Post("/", handler.CreateUpstream())

			// Specific Item
			r.Route("/{upstreamID:[0-9]+}", func(r chi.Router) {
				r.With(middleware.Enforce(user.CapabilityHostsView)).
					Get("/", handler.GetUpstream())
				r.With(middleware.Enforce(user.CapabilityHostsManage)).Route("/", func(r chi.Router) {
					r.Delete("/", handler.DeleteUpstream())
					r.With(middleware.EnforceRequestSchema(schema.UpdateUpstream())).
						Put("/", handler.UpdateUpstream())
					r.Get("/nginx-config", handler.GetUpstreamNginxConfig("json"))
					r.Get("/nginx-config.txt", handler.GetUpstreamNginxConfig("text"))
				})
			})
		})
	})

	return r
}
