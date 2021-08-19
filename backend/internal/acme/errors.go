package acme

import "errors"

// All errors relating to Acme.sh use
var (
	ErrDNSNeedsDNSProvider = errors.New("RequestCert dns method requires a dns provider")
	ErrHTTPHasDNSProvider  = errors.New("RequestCert http method does not need a dns provider")
	ErrMethodNotSupported  = errors.New("RequestCert method not supported")
)
