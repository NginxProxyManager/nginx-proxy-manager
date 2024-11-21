package schema

import (
	"bytes"
	"encoding/json"
	"testing"

	"npm/internal/entity/certificate"

	"github.com/stretchr/testify/assert"
)

func TestSchemas(t *testing.T) {
	tests := []struct {
		name   string
		schema string
	}{
		{
			name:   "CreateCertificate",
			schema: CreateCertificate(),
		},
		{
			name:   "UpdateCertificate TypeHTTP",
			schema: UpdateCertificate(certificate.TypeHTTP),
		},
		{
			name:   "UpdateCertificate TypeDNS",
			schema: UpdateCertificate(certificate.TypeDNS),
		},
		{
			name:   "UpdateCertificate TypeCustom",
			schema: UpdateCertificate(certificate.TypeCustom),
		},
		{
			name:   "UpdateCertificate TypeMkcert",
			schema: UpdateCertificate(certificate.TypeMkcert),
		},
		{
			name:   "UpdateCertificate default",
			schema: UpdateCertificate(""),
		},
		{
			name:   "CreateAccessList",
			schema: CreateAccessList(),
		},
		{
			name:   "CreateCertificateAuthority",
			schema: CreateCertificateAuthority(),
		},
		{
			name:   "CreateDNSProvider",
			schema: CreateDNSProvider(),
		},
		{
			name:   "CreateHost",
			schema: CreateHost(),
		},
		{
			name:   "CreateNginxTemplate",
			schema: CreateNginxTemplate(),
		},
		{
			name:   "CreateSetting",
			schema: CreateSetting(),
		},
		{
			name:   "CreateStream",
			schema: CreateStream(),
		},
		{
			name:   "CreateUpstream",
			schema: CreateUpstream(),
		},
		{
			name:   "CreateUser",
			schema: CreateUser(),
		},
		{
			name:   "GetToken",
			schema: GetToken(),
		},
		{
			name:   "SetAuth",
			schema: SetAuth(),
		},
		{
			name:   "UpdateAccessList",
			schema: UpdateAccessList(),
		},
		{
			name:   "UpdateCertificateAuthority",
			schema: UpdateCertificateAuthority(),
		},
		{
			name:   "UpdateDNSProvider",
			schema: UpdateDNSProvider(),
		},
		{
			name:   "UpdateHost",
			schema: UpdateHost(),
		},
		{
			name:   "UpdateNginxTemplate",
			schema: UpdateNginxTemplate(),
		},
		{
			name:   "UpdateSetting",
			schema: UpdateSetting(),
		},
		{
			name:   "UpdateStream",
			schema: UpdateStream(),
		},
		{
			name:   "UpdateUpstream",
			schema: UpdateUpstream(),
		},
		{
			name:   "UpdateUser",
			schema: UpdateUser(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			byt := []byte(tt.schema)
			var prettyJSON bytes.Buffer
			err := json.Indent(&prettyJSON, byt, "", "  ")
			assert.NoError(t, err)
			assert.Greater(t, len(prettyJSON.String()), 0)
		})
	}
}
