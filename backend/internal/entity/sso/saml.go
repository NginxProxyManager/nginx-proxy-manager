package sso

// SAMLMetadataPreview contains public trust material for explicit administrator review.
// ImportToken is opaque authenticated ciphertext, never a private key upload.
type SAMLMetadataPreview struct {
	ImportToken             string   `json:"import_token"`
	EntityID                string   `json:"entity_id"`
	SSOURL                  string   `json:"sso_url"`
	CertificateFingerprints []string `json:"certificate_fingerprints"`
	SignRequests            bool     `json:"sign_requests"`
	SPCertificate           string   `json:"sp_certificate,omitempty"`
}
