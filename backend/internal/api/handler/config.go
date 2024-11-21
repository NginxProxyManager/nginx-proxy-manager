package handler

import (
	"net/http"

	h "npm/internal/api/http"
	"npm/internal/config"
)

// Config returns the entire configuration, for debug purposes
// Route: GET /config
func Config() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		h.ResultResponseJSON(w, r, http.StatusOK, config.Configuration)
	}
}
