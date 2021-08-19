package dnsprovider

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestModelGetAcmeShEnvVars(t *testing.T) {
	type want struct {
		envs []string
		err  error
	}

	tests := []struct {
		name        string
		dnsProvider Model
		want        want
	}{
		{
			name: "dns_aws",
			dnsProvider: Model{
				AcmeShName: "dns_aws",
			},
			want: want{
				envs: []string{
					"AWS_ACCESS_KEY_ID=\"sdfsdfsdfljlbjkljlkjsdfoiwje\"",
					"AWS_SECRET_ACCESS_KEY=\"xxxxxxx\"",
				},
				err: nil,
			},
		},
		{
			name: "dns_cf",
			dnsProvider: Model{
				AcmeShName: "dns_cf",
			},
			want: want{
				envs: []string{
					"CF_Key=\"sdfsdfsdfljlbjkljlkjsdfoiwje\"",
					"CF_Email=\"xxxx@sss.com\"",
					"CF_Token=\"xxxx\"",
					"CF_Account_ID=\"xxxx\"",
					"CF_Zone_ID=\"xxxx\"",
				},
				err: nil,
			},
		},
		{
			name: "dns_duckdns",
			dnsProvider: Model{
				AcmeShName: "dns_duckdns",
			},
			want: want{
				envs: []string{
					"DuckDNS_Token=\"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\"",
				},
				err: nil,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			envs, err := tt.dnsProvider.GetAcmeShEnvVars()
			assert.Equal(t, tt.want.envs, envs)
			assert.Equal(t, tt.want.err, err)
		})
	}
}
