package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	c "npm/internal/api/context"
	h "npm/internal/api/http"
	"npm/internal/api/middleware"
	"npm/internal/entity"
	"npm/internal/model"

	"gorm.io/gorm"
)

// userOwned is an entity that belongs to the user that created it
type userOwned interface {
	SetUserID(userID uint)
	Save() error
}

// createUserOwned decodes the request body into item, assigns it to the
// requesting user and saves it. label is used in the error message.
func createUserOwned(w http.ResponseWriter, r *http.Request, item userOwned, label string) {
	bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
	if err := json.Unmarshal(bodyBytes, item); err != nil {
		h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
		return
	}

	// Get userID from token
	userID, _ := r.Context().Value(c.UserIDCtxKey).(uint)
	item.SetUserID(userID)

	if err := item.Save(); err != nil {
		h.ResultErrorJSON(w, r, http.StatusBadRequest, fmt.Sprintf("Unable to save %s: %s", label, err.Error()), nil)
		return
	}

	h.ResultResponseJSON(w, r, http.StatusOK, item)
}

// getNginxConfig returns a handler that loads an entity by the ID in the
// paramName url param and responds with its nginx config from disk, as
// plain text when format is "text" or JSON otherwise
func getNginxConfig[T any](
	format string,
	paramName string,
	getByID func(uint) (T, error),
	getContent func(T) (string, error),
) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := getURLParamInt(r, paramName)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := getByID(id)
		switch err {
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			// Get the config from disk
			content, nErr := getContent(item)
			if nErr != nil {
				h.ResultErrorJSON(w, r, http.StatusBadRequest, nErr.Error(), nil)
				return
			}
			if format == "text" {
				h.ResultResponseText(w, http.StatusOK, content)
				return
			}
			h.ResultResponseJSON(w, r, http.StatusOK, content)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// getByIDHandler returns a handler that responds with the entity loaded by
// the ID in the paramName url param
func getByIDHandler[T any](paramName string, getByID func(uint) (T, error)) func(http.ResponseWriter, *http.Request) {
	return withEntity(paramName, getByID, func(w http.ResponseWriter, r *http.Request, item *T) {
		h.ResultResponseJSON(w, r, http.StatusOK, item)
	})
}

// updateByIDHandler returns a handler that loads the entity by the ID in the
// paramName url param, decodes the request body over it and saves it
func updateByIDHandler[T any](
	paramName string,
	getByID func(uint) (T, error),
	save func(*T) error,
) func(http.ResponseWriter, *http.Request) {
	return withEntity(paramName, getByID, func(w http.ResponseWriter, r *http.Request, item *T) {
		bodyBytes, _ := r.Context().Value(c.BodyCtxKey).([]byte)
		if err := json.Unmarshal(bodyBytes, item); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, h.ErrInvalidPayload.Error(), nil)
			return
		}

		if err := save(item); err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		h.ResultResponseJSON(w, r, http.StatusOK, item)
	})
}

// deleteByIDHandler returns a handler that loads the entity by the ID in the
// paramName url param, deletes it and responds with the result of del
func deleteByIDHandler[T, R any](
	paramName string,
	getByID func(uint) (T, error),
	del func(*T) R,
) func(http.ResponseWriter, *http.Request) {
	return withEntity(paramName, getByID, func(w http.ResponseWriter, r *http.Request, item *T) {
		h.ResultResponseJSON(w, r, http.StatusOK, del(item))
	})
}

// withEntity returns a handler that loads the entity by the ID in the
// paramName url param and passes it to fn, responding with not found or
// bad request when it can't be loaded
func withEntity[T any](
	paramName string,
	getByID func(uint) (T, error),
	fn func(http.ResponseWriter, *http.Request, *T),
) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := getURLParamInt(r, paramName)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		item, err := getByID(id)
		switch err {
		case gorm.ErrRecordNotFound:
			h.NotFound(w, r)
		case nil:
			fn(w, r, &item)
		default:
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		}
	}
}

// listHandler returns a handler that responds with a page of entities
// matching the request's pagination and filters
func listHandler(list func(model.PageInfo, []model.Filter) (entity.ListResponse, error)) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		pageInfo, err := getPageInfoFromRequest(r)
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
			return
		}

		items, err := list(pageInfo, middleware.GetFiltersFromContext(r))
		if err != nil {
			h.ResultErrorJSON(w, r, http.StatusBadRequest, err.Error(), nil)
		} else {
			h.ResultResponseJSON(w, r, http.StatusOK, items)
		}
	}
}
