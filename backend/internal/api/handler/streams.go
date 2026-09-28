//nolint:dupl // thin wiring of the shared CRUD helpers in crud.go
package handler

import (
	"net/http"

	"npm/internal/entity/stream"
)

// GetStreams will return a list of Streams
// Route: GET /hosts/streams
func GetStreams() func(http.ResponseWriter, *http.Request) {
	return listHandler(stream.List)
}

// GetStream will return a single Streams
// Route: GET /hosts/streams/{hostID}
func GetStream() func(http.ResponseWriter, *http.Request) {
	return getByIDHandler("hostID", stream.GetByID)
}

// CreateStream will create a Stream
// Route: POST /hosts/steams
func CreateStream() func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		createUserOwned(w, r, &stream.Model{}, "Stream")
	}
}

// UpdateStream updates a stream
// Route: PUT /hosts/streams/{hostID}
func UpdateStream() func(http.ResponseWriter, *http.Request) {
	return updateByIDHandler("hostID", stream.GetByID, (*stream.Model).Save)
}

// DeleteStream removes a stream
// Route: DELETE /hosts/streams/{hostID}
func DeleteStream() func(http.ResponseWriter, *http.Request) {
	return deleteByIDHandler("hostID", stream.GetByID, (*stream.Model).Delete)
}
