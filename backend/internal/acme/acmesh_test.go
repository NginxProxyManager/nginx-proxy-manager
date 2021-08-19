package acme

import (
	"testing"

	"npm/internal/entity/dnsprovider"

	"github.com/stretchr/testify/assert"
)

// Tear up/down
/*
func TestMain(m *testing.M) {
	config.Init(&version, &commit, &sentryDSN)
	code := m.Run()
	os.Exit(code)
}
*/

// TODO configurable
const acmeLogFile = "/data/logs/acme.sh.log"
const acmeWebroot = "/data/acme/wellknown"

func TestBuildCertRequestArgs(t *testing.T) {
	type want struct {
		args []string
		err  error
	}

	tests := []struct {
		name                string
		domains             []string
		method              string
		caBundle            string
		outputFullchainFile string
		outputKeyFile       string
		dnsProvider         *dnsprovider.Model
		want                want
	}{
		{
			name:                "http single domain",
			domains:             []string{"example.com"},
			method:              "http",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider:         nil,
			want: want{
				args: []string{
					"--issue",
					"--log",
					acmeLogFile,
					"--fullchain-file",
					"/data/acme/certs/a.crt",
					"--key-file",
					"/data/acme/certs/example.com.key",
					"-d",
					"example.com",
					"-w",
					acmeWebroot,
				},
				err: nil,
			},
		},
		{
			name:                "http multiple domains",
			domains:             []string{"example.com", "example-two.com", "example-three.com"},
			method:              "http",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider:         nil,
			want: want{
				args: []string{
					"--issue",
					"--log",
					acmeLogFile,
					"--fullchain-file",
					"/data/acme/certs/a.crt",
					"--key-file",
					"/data/acme/certs/example.com.key",
					"-d",
					"example.com",
					"-w",
					acmeWebroot,
					"-d",
					"example-two.com",
					"-d",
					"example-three.com",
				},
				err: nil,
			},
		},
		{
			name:                "http single domain with dns provider",
			domains:             []string{"example.com"},
			method:              "http",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider: &dnsprovider.Model{
				AcmeShName: "dns_cf",
			},
			want: want{
				args: nil,
				err:  ErrHTTPHasDNSProvider,
			},
		},
		{
			name:                "dns single domain",
			domains:             []string{"example.com"},
			method:              "dns",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider: &dnsprovider.Model{
				AcmeShName: "dns_cf",
			},
			want: want{
				args: []string{
					"--issue",
					"--log",
					acmeLogFile,
					"--fullchain-file",
					"/data/acme/certs/a.crt",
					"--key-file",
					"/data/acme/certs/example.com.key",
					"-d",
					"example.com",
					"--dns",
					"dns_cf",
				},
				err: nil,
			},
		},
		{
			name:                "dns multiple domains",
			domains:             []string{"example.com", "example-two.com", "example-three.com"},
			method:              "dns",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider: &dnsprovider.Model{
				AcmeShName: "dns_cf",
			},
			want: want{
				args: []string{
					"--issue",
					"--log",
					acmeLogFile,
					"--fullchain-file",
					"/data/acme/certs/a.crt",
					"--key-file",
					"/data/acme/certs/example.com.key",
					"-d",
					"example.com",
					"--dns",
					"dns_cf",
					"-d",
					"example-two.com",
					"-d",
					"example-three.com",
				},
				err: nil,
			},
		},
		{
			name:                "dns single domain no provider",
			domains:             []string{"example.com"},
			method:              "dns",
			caBundle:            "",
			outputFullchainFile: "/data/acme/certs/a.crt",
			outputKeyFile:       "/data/acme/certs/example.com.key",
			dnsProvider:         nil,
			want: want{
				args: nil,
				err:  ErrDNSNeedsDNSProvider,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args, err := buildCertRequestArgs(tt.domains, tt.method, tt.caBundle, tt.outputFullchainFile, tt.outputKeyFile, tt.dnsProvider)

			assert.Equal(t, tt.want.args, args)
			assert.Equal(t, tt.want.err, err)
		})
	}
}
