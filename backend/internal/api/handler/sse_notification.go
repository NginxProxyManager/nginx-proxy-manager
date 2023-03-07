package handler

import (
	"encoding/json"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/serverevents"
)

// TestSSENotification specifically fires of a SSE message for testing purposes
// Route: POST /sse-notification
func TestSSENotification() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)

		var msg serverevents.Message
		err := json.Unmarshal(bodyBytes, &msg)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		serverevents.Send(msg, "")
		h.ResultResponseJSON(w, r, http.StatusOK, true)
	}
}
