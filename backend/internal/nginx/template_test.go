package nginx

import (
	"testing"

	"npm/internal/entity/certificate"
	"npm/internal/entity/host"
	"npm/internal/model"
	"npm/internal/test"
	"npm/internal/types"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestRenderTemplate(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	test.InitConfig(t)

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
				Base: model.Base{
					ID: 77,
				},
				Status:                 certificate.StatusProvided,
				Type:                   certificate.TypeHTTP,
				CertificateAuthorityID: types.NullableDBUint{Uint: 99},
			},
			want: want{
				output: `
server {
    include /etc/nginx/conf.d/npm/conf.d/acme-challenge.conf;
    include /etc/nginx/conf.d/npm/conf.d/include/ssl-ciphers.conf;
    ssl_certificate /data/.acme.sh/certs/npm-77/fullchain.pem;
    ssl_certificate_key /data/.acme.sh/certs/npm-77/privkey.pem;
}
`,
				err: nil,
			},
		},
		{
			name: "Basic Template custom ssl",
			host: host.Model{
				IsDisabled: false,
			},
			cert: certificate.Model{
				Base: model.Base{
					ID: 66,
				},
				Status: certificate.StatusProvided,
				Type:   certificate.TypeCustom,
			},
			want: want{
				output: `
server {
    ssl_certificate /data/custom_ssl/npm-66/fullchain.pem;
    ssl_certificate_key /data/custom_ssl/npm-66/privkey.pem;
}
`,
				err: nil,
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

	for _, tst := range tests {
		t.Run(tst.name, func(st *testing.T) {
			templateData := TemplateData{
				ConfDir:     "/etc/nginx/conf.d",
				DataDir:     "/data",
				Host:        tst.host.GetTemplate(),
				Certificate: tst.cert.GetTemplate(),
			}

			output, err := renderTemplate(template, templateData)
			assert.Equal(st, tst.want.err, err)
			assert.Equal(st, tst.want.output, output)
		})
	}
}
