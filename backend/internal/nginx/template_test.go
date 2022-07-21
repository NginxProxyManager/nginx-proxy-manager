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
  {{#if Certificate}}
    {{#if Certificate.CertificateAuthorityID}}
      # Acme SSL
      include {{ConfDir}}/npm/conf.d/acme-challenge.conf;
      include {{ConfDir}}/npm/conf.d/include/ssl-ciphers.conf;
      ssl_certificate {{CertsDir}}/npm-{{Certificate.ID}}/fullchain.pem;
      ssl_certificate_key {{CertsDir}}/npm-{{Certificate.ID}}/privkey.pem;
    {{else}}
      # Custom SSL
      ssl_certificate {{DataDir}}/custom_ssl/npm-{{Certificate.ID}}/fullchain.pem;
      ssl_certificate_key {{DataDir}}/custom_ssl/npm-{{Certificate.ID}}/privkey.pem;
    {{/if}}
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
		want want
	}{
		{
			name: "Basic Template enabled",
			data: TemplateData{
				ConfDir: "/etc/nginx/conf.d",
				Host: &host.Model{
					IsDisabled: false,
				},
				Certificate: &certificate.Model{
					CertificateAuthorityID: 0,
				},
			},
			want: want{
				output: "\nserver {\n      # Custom SSL\n      ssl_certificate /custom_ssl/npm-0/fullchain.pem;\n      ssl_certificate_key /custom_ssl/npm-0/privkey.pem;\n  \n}\n\n",
				err:    nil,
			},
		},
		{
			name: "Basic Template disabled",
			data: TemplateData{
				ConfDir:  "/etc/nginx/conf.d",
				DataDir:  "/data",
				CertsDir: "/acme.sh/certs",
				Host: &host.Model{
					IsDisabled: true,
				},
			},
			want: want{
				output: "\n  # Host is disabled\n\n",
				err:    nil,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(st *testing.T) {
			output, err := generateHostConfig(template, test.data)
			assert.Equal(t, test.want.err, err)
			assert.Equal(t, test.want.output, output)
		})
	}
}
