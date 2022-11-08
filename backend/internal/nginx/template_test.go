package nginx

import (
	"testing"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"

	"github.com/stretchr/testify/assert"
)

func TestWriteTemplate(t *testing.T) {
	template := `
{{#if Host.IsDisabled}}
  # Host is disabled
{{else}}
server {
  {{#if Certificate.IsProvided}}
    {{#if Certificate.IsAcme}}
    include {{ConfDir}}/npm/conf.d/acme-challenge.conf;
    include {{ConfDir}}/npm/conf.d/include/ssl-ciphers.conf;
    {{/if}}
    ssl_certificate {{Certificate.Folder}}/fullchain.pem;
    ssl_certificate_key {{Certificate.Folder}}/privkey.pem;
  {{/if}}
}
{{/if}}
`

	type want struct {
		output string
		err    error
	}

	tests := []struct {
		name string
		data TemplateData
		host host.Model
		cert certificate.Model
		want want
	}{
		{
			name: "Basic Template enabled",
			host: host.Model{
				IsDisabled: false,
			},
			cert: certificate.Model{
				ID:                     77,
				Status:                 certificate.StatusProvided,
				Type:                   certificate.TypeHTTP,
				CertificateAuthorityID: 99,
			},
			want: want{
				output: "\nserver {\n    include /etc/nginx/conf.d/npm/conf.d/acme-challenge.conf;\n    include /etc/nginx/conf.d/npm/conf.d/include/ssl-ciphers.conf;\n    ssl_certificate /npm-77/fullchain.pem;\n    ssl_certificate_key /npm-77/privkey.pem;\n}\n",
				err:    nil,
			},
		},
		{
			name: "Basic Template custom ssl",
			host: host.Model{
				IsDisabled: false,
			},
			cert: certificate.Model{
				ID:     66,
				Status: certificate.StatusProvided,
				Type:   certificate.TypeCustom,
			},
			want: want{
				output: "\nserver {\n    ssl_certificate /custom_ssl/npm-66/fullchain.pem;\n    ssl_certificate_key /custom_ssl/npm-66/privkey.pem;\n}\n",
				err:    nil,
			},
		},
		{
			name: "Basic Template disabled",
			host: host.Model{
				IsDisabled: true,
			},
			cert: certificate.Model{},
			want: want{
				output: "\n  # Host is disabled\n",
				err:    nil,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(st *testing.T) {
			templateData := TemplateData{
				ConfDir:     "/etc/nginx/conf.d",
				DataDir:     "/data",
				Host:        test.host.GetTemplate(),
				Certificate: test.cert.GetTemplate(),
			}

			output, err := generateHostConfig(template, templateData)
			assert.Equal(t, test.want.err, err)
			assert.Equal(t, test.want.output, output)
		})
	}
}
