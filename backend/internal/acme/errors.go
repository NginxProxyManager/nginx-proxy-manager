package acme

import (
	"github.com/rotisserie/eris"
)

// All errors relating to Acme.sh use
var (
	ErrDNSNeedsDNSProvider = eris.New("RequestCert dns method requires a dns provider")
	ErrHTTPHasDNSProvider  = eris.New("RequestCert http method does not need a dns provider")
	ErrMethodNotSupported  = eris.New("RequestCert method not supported")
)
