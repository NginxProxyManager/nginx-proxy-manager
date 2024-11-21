package handler

import (
	"net/http"

	"npm/internal/acme"
	h "npm/internal/api/http"
	"npm/internal/config"
)

type healthCheckResponse struct {
	Version       string `json:"version"`
	Commit        string `json:"commit"`
	AcmeShVersion string `json:"acme.sh"`
	Healthy       bool   `json:"healthy"`
	IsSetup       bool   `json:"setup"`
}

// Health returns the health of the api
// Route: GET /health
func Health() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		health := healthCheckResponse{
			Version:       config.Version,
			Commit:        config.Commit,
			Healthy:       true,
			IsSetup:       config.IsSetup,
			AcmeShVersion: acme.GetAcmeShVersion(),
		}

		h.ResultResponseJSON(w, r, http.StatusOK, health)
	}
}
