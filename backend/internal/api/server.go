package api

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"npm/internal/logger"
	"npm/internal/serverevents"
)

const httpPort = 3000

// currentHandler is the router serving requests. It starts as the setup
// router when no database is configured and is replaced by the full router
// once the database setup wizard completes, without restarting the server.
var currentHandler atomic.Pointer[http.Handler]

// SetHandler replaces the router serving requests
func SetHandler(handler http.Handler) {
	currentHandler.Store(&handler)
}

// StartServer creates a http server
func StartServer() {
	logger.Info("Server starting on port %v", httpPort)

	server := &http.Server{
		Addr: fmt.Sprintf(":%v", httpPort),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			(*currentHandler.Load()).ServeHTTP(w, r)
		}),
		ReadHeaderTimeout: 3 * time.Second,
	}

	defer serverevents.Shutdown()

	err := server.ListenAndServe()
	if err != nil {
		logger.Error("HttpListenError", err)
	}
}
