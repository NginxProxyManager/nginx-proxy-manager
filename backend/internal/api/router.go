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

	// API
	r.Route("/api", func(r chi.Router) {
		r.Get("/", handler.Health())
		r.Get("/schema", handler.Schema())
		r.With(middleware.EnforceSetup(true), middleware.Enforce("")).
			Get("/config", handler.Config())

		// Tokens
		r.With(middleware.EnforceSetup(true)).Route("/tokens", func(r chi.Router) {
			r.With(middleware.EnforceRequestSchema(schema.GetToken())).
				Post("/", handler.NewToken())
			r.With(middleware.Enforce("")).
				Get("/", handler.RefreshToken())
		})

		// Users
		r.Route("/users", func(r chi.Router) {
			r.With(middleware.EnforceSetup(true), middleware.Enforce("")).Get("/{userID:(?:me)}", handler.GetUser())
			r.With(middleware.EnforceSetup(true), middleware.Enforce(user.CapabilityUsersManage)).Get("/{userID:(?:[0-9]+)}", handler.GetUser())

			r.With(middleware.EnforceSetup(true), middleware.Enforce(user.CapabilityUsersManage)).Delete("/{userID:(?:[0-9]+|me)}", handler.DeleteUser())
			r.With(middleware.EnforceSetup(true), middleware.Enforce(user.CapabilityUsersManage)).With(middleware.Filters(user.GetFilterSchema())).
				Get("/", handler.GetUsers())
			r.With(middleware.EnforceRequestSchema(schema.CreateUser()), middleware.Enforce(user.CapabilityUsersManage)).
				Post("/", handler.CreateUser())

			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.UpdateUser()), middleware.Enforce("")).
				Put("/{userID:(?:me)}", handler.UpdateUser())
			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.UpdateUser()), middleware.Enforce(user.CapabilityUsersManage)).
				Put("/{userID:(?:[0-9]+)}", handler.UpdateUser())

			// Auth
			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.SetAuth()), middleware.Enforce("")).
				Post("/{userID:(?:me)}/auth", handler.SetAuth())
			r.With(middleware.EnforceSetup(true)).With(middleware.EnforceRequestSchema(schema.SetAuth()), middleware.Enforce(user.CapabilityUsersManage)).
				Post("/{userID:(?:[0-9]+)}/auth", handler.SetAuth())
		})

		// Only available in debug mode: delete users without auth
		if config.GetLogLevel() == logger.DebugLevel {
			r.Delete("/users", handler.DeleteUsers())
		}

		// Settings
		r.With(middleware.EnforceSetup(true), middleware.Enforce(user.CapabilitySettingsManage)).Route("/settings", func(r chi.Router) {
			r.With(middleware.Filters(setting.GetFilterSchema())).
				Get("/", handler.GetSettings())
			r.Get("/{name}", handler.GetSetting())
			r.With(middleware.EnforceRequestSchema(schema.CreateSetting())).
				Post("/", handler.CreateSetting())
			r.With(middleware.EnforceRequestSchema(schema.UpdateSetting())).
				Put("/{name}", handler.UpdateSetting())
		})

		// Access Lists
		r.With(middleware.EnforceSetup(true)).Route("/access-lists", func(r chi.Router) {
			r.With(middleware.Filters(accesslist.GetFilterSchema()), middleware.Enforce(user.CapabilityAccessListsView)).
				Get("/", handler.GetAccessLists())
			r.With(middleware.Enforce(user.CapabilityAccessListsView)).Get("/{accessListID:[0-9]+}", handler.GetAccessList())
			r.With(middleware.Enforce(user.CapabilityAccessListsManage)).Delete("/{accessListID:[0-9]+}", handler.DeleteAccessList())
			r.With(middleware.Enforce(user.CapabilityAccessListsManage)).With(middleware.EnforceRequestSchema(schema.CreateAccessList())).
				Post("/", handler.CreateAccessList())
			r.With(middleware.Enforce(user.CapabilityAccessListsManage)).With(middleware.EnforceRequestSchema(schema.UpdateAccessList())).
				Put("/{accessListID:[0-9]+}", handler.UpdateAccessList())
		})

		// DNS Providers
		r.With(middleware.EnforceSetup(true)).Route("/dns-providers", func(r chi.Router) {
			r.With(middleware.Filters(dnsprovider.GetFilterSchema()), middleware.Enforce(user.CapabilityDNSProvidersView)).
				Get("/", handler.GetDNSProviders())
			r.With(middleware.Enforce(user.CapabilityDNSProvidersView)).Get("/{providerID:[0-9]+}", handler.GetDNSProvider())
			r.With(middleware.Enforce(user.CapabilityDNSProvidersManage)).Delete("/{providerID:[0-9]+}", handler.DeleteDNSProvider())
			r.With(middleware.Enforce(user.CapabilityDNSProvidersManage)).With(middleware.EnforceRequestSchema(schema.CreateDNSProvider())).
				Post("/", handler.CreateDNSProvider())
			r.With(middleware.Enforce(user.CapabilityDNSProvidersManage)).With(middleware.EnforceRequestSchema(schema.UpdateDNSProvider())).
				Put("/{providerID:[0-9]+}", handler.UpdateDNSProvider())

			r.With(middleware.Enforce(user.CapabilityDNSProvidersView)).Route("/acmesh", func(r chi.Router) {
				r.Get("/{acmeshID:[a-z0-9_]+}", handler.GetAcmeshProvider())
				r.Get("/", handler.GetAcmeshProviders())
			})
		})

		// Certificate Authorities
		r.With(middleware.EnforceSetup(true)).Route("/certificate-authorities", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesView), middleware.Filters(certificateauthority.GetFilterSchema())).
				Get("/", handler.GetCertificateAuthorities())
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesView)).Get("/{caID:[0-9]+}", handler.GetCertificateAuthority())
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage)).Delete("/{caID:[0-9]+}", handler.DeleteCertificateAuthority())
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage)).With(middleware.EnforceRequestSchema(schema.CreateCertificateAuthority())).
				Post("/", handler.CreateCertificateAuthority())
			r.With(middleware.Enforce(user.CapabilityCertificateAuthoritiesManage)).With(middleware.EnforceRequestSchema(schema.UpdateCertificateAuthority())).
				Put("/{caID:[0-9]+}", handler.UpdateCertificateAuthority())
		})

		// Certificates
		r.With(middleware.EnforceSetup(true)).Route("/certificates", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityCertificatesView), middleware.Filters(certificate.GetFilterSchema())).
				Get("/", handler.GetCertificates())
			r.With(middleware.Enforce(user.CapabilityCertificatesView)).Get("/{certificateID:[0-9]+}", handler.GetCertificate())
			r.With(middleware.Enforce(user.CapabilityCertificatesManage)).Delete("/{certificateID:[0-9]+}", handler.DeleteCertificate())
			r.With(middleware.Enforce(user.CapabilityCertificatesManage)).With(middleware.EnforceRequestSchema(schema.CreateCertificate())).
				Post("/", handler.CreateCertificate())
				/*
					r.With(middleware.EnforceRequestSchema(schema.UpdateCertificate())).
						Put("/{certificateID:[0-9]+}", handler.UpdateCertificate())
				*/
			r.With(middleware.Enforce(user.CapabilityCertificatesManage)).Put("/{certificateID:[0-9]+}", handler.UpdateCertificate())
		})

		// Hosts
		r.With(middleware.EnforceSetup(true)).Route("/hosts", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityHostsView), middleware.Filters(host.GetFilterSchema())).
				Get("/", handler.GetHosts())
			r.With(middleware.Enforce(user.CapabilityHostsView)).Get("/{hostID:[0-9]+}", handler.GetHost())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Delete("/{hostID:[0-9]+}", handler.DeleteHost())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).With(middleware.EnforceRequestSchema(schema.CreateHost())).
				Post("/", handler.CreateHost())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).With(middleware.EnforceRequestSchema(schema.UpdateHost())).
				Put("/{hostID:[0-9]+}", handler.UpdateHost())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Get("/{hostID:[0-9]+}/nginx-config", handler.GetHostNginxConfig("json"))
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Get("/{hostID:[0-9]+}/nginx-config.txt", handler.GetHostNginxConfig("text"))
		})

		// Nginx Templates
		r.With(middleware.EnforceSetup(true)).Route("/nginx-templates", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesView), middleware.Filters(nginxtemplate.GetFilterSchema())).
				Get("/", handler.GetNginxTemplates())
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesView)).Get("/{templateID:[0-9]+}", handler.GetNginxTemplates())
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesManage)).Delete("/{templateID:[0-9]+}", handler.DeleteNginxTemplate())
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesManage)).With(middleware.EnforceRequestSchema(schema.CreateNginxTemplate())).
				Post("/", handler.CreateNginxTemplate())
			r.With(middleware.Enforce(user.CapabilityNginxTemplatesManage)).With(middleware.EnforceRequestSchema(schema.UpdateNginxTemplate())).
				Put("/{templateID:[0-9]+}", handler.UpdateNginxTemplate())
		})

		// Streams
		r.With(middleware.EnforceSetup(true)).Route("/streams", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityStreamsView), middleware.Filters(stream.GetFilterSchema())).
				Get("/", handler.GetStreams())
			r.With(middleware.Enforce(user.CapabilityStreamsView)).Get("/{hostID:[0-9]+}", handler.GetStream())
			r.With(middleware.Enforce(user.CapabilityStreamsManage)).Delete("/{hostID:[0-9]+}", handler.DeleteStream())
			r.With(middleware.Enforce(user.CapabilityStreamsManage)).With(middleware.EnforceRequestSchema(schema.CreateStream())).
				Post("/", handler.CreateStream())
			r.With(middleware.Enforce(user.CapabilityStreamsManage)).With(middleware.EnforceRequestSchema(schema.UpdateStream())).
				Put("/{hostID:[0-9]+}", handler.UpdateStream())
		})

		// Upstreams
		r.With(middleware.EnforceSetup(true)).Route("/upstreams", func(r chi.Router) {
			r.With(middleware.Enforce(user.CapabilityHostsView), middleware.Filters(upstream.GetFilterSchema())).
				Get("/", handler.GetUpstreams())
			r.With(middleware.Enforce(user.CapabilityHostsView)).Get("/{upstreamID:[0-9]+}", handler.GetUpstream())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Delete("/{upstreamID:[0-9]+}", handler.DeleteUpstream())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).With(middleware.EnforceRequestSchema(schema.CreateUpstream())).
				Post("/", handler.CreateUpstream())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).With(middleware.EnforceRequestSchema(schema.UpdateUpstream())).
				Put("/{upstreamID:[0-9]+}", handler.UpdateUpstream())
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Get("/{upstreamID:[0-9]+}/nginx-config", handler.GetUpstreamNginxConfig("json"))
			r.With(middleware.Enforce(user.CapabilityHostsManage)).Get("/{upstreamID:[0-9]+}/nginx-config.txt", handler.GetUpstreamNginxConfig("text"))
		})
	})

	return r
}
