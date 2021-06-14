package handler

import (
	"net/http"

	h "npm/internal/api/http"
)

// NotAllowed is a json error handler for when method is not allowed
func NotAllowed() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		h.ResultErrorJSON(w, r, http.StatusNotFound, "Not allowed", nil)
	}
}
