package api

import (
	"fmt"
	"net/http"

	"npm/internal/logger"
)

const httpPort = 3000

// StartServer creates a http server
func StartServer() {
	logger.Info("Server starting on port %v", httpPort)
	err := http.ListenAndServe(fmt.Sprintf(":%v", httpPort), NewRouter())
	if err != nil {
		logger.Error("HttpListenError", err)
	}
}
