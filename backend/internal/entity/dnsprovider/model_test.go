package dnsprovider

import (
	"encoding/json"
	"npm/internal/types"
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
		metaJSON    string
		want        want
	}{
		{
			name: "dns_aws",
			dnsProvider: Model{
				AcmeshName: "dns_aws",
			},
			metaJSON: `{"AWS_ACCESS_KEY_ID":"sdfsdfsdfljlbjkljlkjsdfoiwje","AWS_SECRET_ACCESS_KEY":"xxxxxxx"}`,
			want: want{
				envs: []string{
					`AWS_ACCESS_KEY_ID=sdfsdfsdfljlbjkljlkjsdfoiwje`,
					`AWS_SECRET_ACCESS_KEY=xxxxxxx`,
				},
				err: nil,
			},
		},
		{
			name: "dns_cf",
			dnsProvider: Model{
				AcmeshName: "dns_cf",
			},
			metaJSON: `{"CF_Key":"sdfsdfsdfljlbjkljlkjsdfoiwje","CF_Email":"me@example.com","CF_Token":"dkfjghdk","CF_Account_ID":"hgbdjfg","CF_Zone_ID":"ASDASD"}`,
			want: want{
				envs: []string{
					`CF_Token=dkfjghdk`,
					`CF_Account_ID=hgbdjfg`,
					`CF_Zone_ID=ASDASD`,
					`CF_Key=sdfsdfsdfljlbjkljlkjsdfoiwje`,
					`CF_Email=me@example.com`,
				},
				err: nil,
			},
		},
		{
			name: "dns_duckdns",
			dnsProvider: Model{
				AcmeshName: "dns_duckdns",
			},
			metaJSON: `{"DuckDNS_Token":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}`,
			want: want{
				envs: []string{
					`DuckDNS_Token=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
				},
				err: nil,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var meta types.JSONB
			err := json.Unmarshal([]byte(tt.metaJSON), &meta.Decoded)
			assert.Equal(t, nil, err)
			tt.dnsProvider.Meta = meta
			envs, err := tt.dnsProvider.GetAcmeShEnvVars()
			assert.Equal(t, tt.want.err, err)
			for _, i := range tt.want.envs {
				assert.Contains(t, envs, i)
			}
		})
	}
}
