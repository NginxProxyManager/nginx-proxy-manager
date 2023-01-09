package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	c "npm/internal/api/context"
	"npm/internal/errors"
	"npm/internal/logger"

	"github.com/qri-io/jsonschema"
)

// Response interface for standard API results
type Response struct {
	Result interface{} `json:"result"`
	Error  interface{} `json:"error,omitempty"`
}

// ErrorResponse interface for errors returned via the API
type ErrorResponse struct {
	Code    interface{} `json:"code"`
	Message interface{} `json:"message"`
	Invalid interface{} `json:"invalid,omitempty"`
}

// ResultResponseJSON will write the result as json to the http output
func ResultResponseJSON(w http.ResponseWriter, r *http.Request, status int, result interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	var response Response
	resultClass := fmt.Sprintf("%v", reflect.TypeOf(result))

	if resultClass == "http.ErrorResponse" {
		response = Response{
			Error: result,
		}
	} else {
		response = Response{
			Result: result,
		}
	}

	var payload []byte
	var err error
	if getPrettyPrintFromContext(r) {
		payload, err = json.MarshalIndent(response, "", "  ")
	} else {
		payload, err = json.Marshal(response)
	}

	if err != nil {
		logger.Error("ResponseMarshalError", err)
	}

	fmt.Fprint(w, string(payload))
}

// ResultSchemaErrorJSON will format the result as a standard error object and send it for output
func ResultSchemaErrorJSON(w http.ResponseWriter, r *http.Request, errs []jsonschema.KeyError) {
	errorResponse := ErrorResponse{
		Code:    http.StatusBadRequest,
		Message: errors.ErrValidationFailed,
		Invalid: errs,
	}

	ResultResponseJSON(w, r, http.StatusBadRequest, errorResponse)
}

// ResultErrorJSON will format the result as a standard error object and send it for output
func ResultErrorJSON(w http.ResponseWriter, r *http.Request, status int, message string, extended interface{}) {
	errorResponse := ErrorResponse{
		Code:    status,
		Message: message,
		Invalid: extended,
	}

	ResultResponseJSON(w, r, status, errorResponse)
}

// ResultResponseText will write the result as text to the http output
func ResultResponseText(w http.ResponseWriter, r *http.Request, status int, content string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	fmt.Fprint(w, content)
}

// getPrettyPrintFromContext returns the PrettyPrint setting
func getPrettyPrintFromContext(r *http.Request) bool {
	pretty, ok := r.Context().Value(c.PrettyPrintCtxKey).(bool)
	if !ok {
		return false
	}
	return pretty
}
