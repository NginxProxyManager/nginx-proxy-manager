package api

import (
	"net/http"

	"npm/internal/api/middleware"

	"github.com/go-chi/chi/v5"
)

// resourceRoutes describes the standard list/create/get/update/delete
// endpoints for an entity
type resourceRoutes struct {
	// idParam is the url param name for a specific item, eg "hostID"
	idParam string
	// model is the entity used to validate list query sorting and filtering
	model any
	// viewCapability is required to list and get items
	viewCapability string
	// manageCapability is required to create, update and delete items
	manageCapability string
	createSchema     string
	// updateSchema is optional, the request body isn't validated when empty
	updateSchema string
	list         http.HandlerFunc
	create       http.HandlerFunc
	get          http.HandlerFunc
	update       http.HandlerFunc
	del          http.HandlerFunc
	// manageItem optionally registers extra routes on a specific item that
	// require manageCapability
	manageItem func(chi.Router)
}

// mount registers the resource's routes on r
func (rr resourceRoutes) mount(r chi.Router) {
	// List
	r.With(
		middleware.Enforce(rr.viewCapability),
		middleware.ListQuery(rr.model),
	).Get("/", rr.list)

	// Create
	r.With(middleware.Enforce(rr.manageCapability), middleware.EnforceRequestSchema(rr.createSchema)).
		Post("/", rr.create)

	// Specific Item
	r.Route("/{"+rr.idParam+":[0-9]+}", func(r chi.Router) {
		r.With(middleware.Enforce(rr.viewCapability)).
			Get("/", rr.get)
		r.With(middleware.Enforce(rr.manageCapability)).Route("/", func(r chi.Router) {
			r.Delete("/", rr.del)
			if rr.updateSchema != "" {
				r.With(middleware.EnforceRequestSchema(rr.updateSchema)).Put("/", rr.update)
			} else {
				r.Put("/", rr.update)
			}
			if rr.manageItem != nil {
				rr.manageItem(r)
			}
		})
	})
}
