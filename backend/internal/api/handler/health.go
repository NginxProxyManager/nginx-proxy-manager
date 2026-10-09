package handler

import (
	"net/http"

	"npm/internal/acme"
	h "npm/internal/api/http"
	"npm/internal/config"
	"npm/internal/remoteversion"
)

type healthCheckResponse struct {
	Version       config.VersionSplit `json:"version"`
	Commit        string              `json:"commit"`
	AcmeShVersion string              `json:"acme.sh"`
	Healthy       bool                `json:"healthy"`
	IsDBSetup     bool                `json:"db_setup"`
	IsSetup       bool                `json:"setup"`
}

// Health returns the health of the api
// Route: GET /health
func Health() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		health := healthCheckResponse{
			Version:       config.GetVersionSplit(),
			Commit:        config.Commit,
			Healthy:       true,
			IsDBSetup:     config.IsDBSetup,
			IsSetup:       config.IsSetup,
			AcmeShVersion: acme.GetAcmeShVersion(),
		}

		h.ResultResponseJSON(w, r, http.StatusOK, health)
	}
}

type versionCheckResponse struct {
	Current         *string `json:"current"`
	Latest          *string `json:"latest"`
	UpdateAvailable bool    `json:"update_available"`
}

// VersionCheck will check github for new releases and return the latest version
// Route: GET /version/check
func VersionCheck() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// Always respond 200, even when the check fails, to avoid triggering
		// repeated update checks. Failed checks have null versions.
		var resp versionCheckResponse
		if res := remoteversion.Check(); res.Current != "" {
			resp = versionCheckResponse{
				Current:         &res.Current,
				Latest:          &res.Latest,
				UpdateAvailable: res.UpdateAvailable,
			}
		}
		h.ResultResponseJSON(w, r, http.StatusOK, resp)
	}
}
