package schema

import (
	"fmt"

	"npm/internal/entity/certificate"
)

// This validation is strictly for Custom certificates
// and the combination of values that must be defined
func createCertificateCustom() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"required": [
				"type",
				"name",
				"domain_names"
			],
			"properties": {
				"type": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, strictString("custom"), stringMinMax(1, 100), domainNames())
}

// This validation is strictly for HTTP certificates
// and the combination of values that must be defined
func createCertificateHTTP() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"required": [
				"type",
				"certificate_authority_id",
				"name",
				"domain_names"
			],
			"properties": {
				"type": %s,
				"certificate_authority_id": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, strictString("http"), intMinOne, stringMinMax(1, 100), domainNames())
}

// This validation is strictly for DNS certificates
// and the combination of values that must be defined
func createCertificateDNS() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"required": [
				"type",
				"certificate_authority_id",
				"dns_provider_id",
				"name",
				"domain_names"
			],
			"properties": {
				"type": %s,
				"certificate_authority_id": %s,
				"dns_provider_id": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, strictString("dns"), intMinOne, intMinOne, stringMinMax(1, 100), domainNames())
}

// This validation is strictly for MKCERT certificates
// and the combination of values that must be defined
func createCertificateMkcert() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"required": [
				"type",
				"name",
				"domain_names"
			],
			"properties": {
				"type": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, strictString("mkcert"), stringMinMax(1, 100), domainNames())
}

func updateCertificateHTTP() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"minProperties": 1,
			"properties": {
				"certificate_authority_id": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, intMinOne, stringMinMax(1, 100), domainNames())
}

func updateCertificateDNS() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"minProperties": 1,
			"properties": {
				"certificate_authority_id": %s,
				"dns_provider_id": %s,
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, intMinOne, intMinOne, stringMinMax(1, 100), domainNames())
}

func updateCertificateCustom() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"minProperties": 1,
			"properties": {
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, stringMinMax(1, 100), domainNames())
}

func updateCertificateMkcert() string {
	return fmt.Sprintf(`
		{
			"type": "object",
			"minProperties": 1,
			"properties": {
				"name": %s,
				"domain_names": %s,
				"meta": {
					"type": "object"
				}
			}
		}`, stringMinMax(1, 100), domainNames())
}

// CreateCertificate is the schema for incoming data validation
func CreateCertificate() string {
	return fmt.Sprintf(`
	{
		"oneOf": [%s, %s, %s, %s]
	}`, createCertificateHTTP(), createCertificateDNS(), createCertificateCustom(), createCertificateMkcert())
}

// UpdateCertificate is the schema for incoming data validation
func UpdateCertificate(certificateType string) string {
	switch certificateType {
	case certificate.TypeHTTP:
		return updateCertificateHTTP()
	case certificate.TypeDNS:
		return updateCertificateDNS()
	case certificate.TypeCustom:
		return updateCertificateCustom()
	case certificate.TypeMkcert:
		return updateCertificateMkcert()
	default:
		return fmt.Sprintf(`
		{
			"oneOf": [%s, %s, %s, %s]
		}`, updateCertificateHTTP(), updateCertificateDNS(), updateCertificateCustom(), updateCertificateMkcert())
	}
}
