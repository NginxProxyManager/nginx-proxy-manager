package status

const (
	// StatusReady means a host is ready to configure
	StatusReady = "ready"
	// StatusOK means a host is configured within Nginx
	StatusOK = "ok"
	// StatusError is self explanatory
	StatusError = "error"
)
