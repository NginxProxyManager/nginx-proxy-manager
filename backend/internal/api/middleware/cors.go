package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi"
)

var methodMap = []string{
	http.MethodGet,
	http.MethodHead,
	http.MethodPost,
	http.MethodPut,
	http.MethodPatch,
	http.MethodDelete,
	http.MethodConnect,
	http.MethodTrace,
}

func getRouteMethods(routes chi.Router, path string) []string {
	var methods []string
	tctx := chi.NewRouteContext()
	for _, method := range methodMap {
		if routes.Match(tctx, method, path) {
			methods = append(methods, method)
		}
	}
	return methods
}

var headersAllowedByCORS = []string{
	"Authorization",
	"Host",
	"Content-Type",
	"Connection",
	"User-Agent",
	"Cache-Control",
	"Accept-Encoding",
}

// Cors handles cors headers
func Cors(routes chi.Router) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			methods := getRouteMethods(routes, r.URL.Path)
			if len(methods) == 0 {
				// no route no cors
				next.ServeHTTP(w, r)
				return
			}
			methods = append(methods, http.MethodOptions)
			w.Header().Set("Access-Control-Allow-Methods", strings.Join(methods, ","))
			w.Header().Set("Access-Control-Allow-Headers",
				strings.Join(headersAllowedByCORS, ","),
			)
			next.ServeHTTP(w, r)
		})
	}
}

// Options handles options requests
func Options(routes chi.Router) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			methods := getRouteMethods(routes, r.URL.Path)
			if len(methods) == 0 {
				// no route shouldn't have options
				next.ServeHTTP(w, r)
				return
			}
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Origin", "*")
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, "{}")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
