package acme

import (
	"fmt"
	"testing"

	"npm/internal/config"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"

	"github.com/stretchr/testify/assert"
)

// TODO configurable
const acmeLogFile = "/data/logs/acme.sh.log"

func TestBuildCertRequestArgs(t *testing.T) {
	type want struct {
		args []string
		err  error
	}

	wellknown := config.Configuration.Acmesh.GetWellknown()
	exampleKey := fmt.Sprintf("%s/example.com.key", config.Configuration.Acmesh.CertHome)
	exampleChain := fmt.Sprintf("%s/a.crt", config.Configuration.Acmesh.CertHome)

	tests := []struct {
		name                string
		domains             []string
		method              string
		outputFullchainFile string
		outputKeyFile       string
		dnsProvider         *dnsprovider.Model
		ca                  *certificateauthority.Model
		want                want
	}{
		{
			name:                "http single domain",
			domains:             []string{"example.com"},
			method:              "http",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider:         nil,
			ca:                  nil,
			want: want{
				args: []string{
					"--issue",
					"--fullchain-file",
					exampleChain,
					"--key-file",
					exampleKey,
					"-d",
					"example.com",
					"-w",
					wellknown,
					"--log",
					acmeLogFile,
				},
				err: nil,
			},
		},
		{
			name:                "http multiple domains",
			domains:             []string{"example.com", "example-two.com", "example-three.com"},
			method:              "http",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider:         nil,
			ca:                  nil,
			want: want{
				args: []string{
					"--issue",
					"--fullchain-file",
					exampleChain,
					"--key-file",
					exampleKey,
					"-d",
					"example.com",
					"-w",
					wellknown,
					"-d",
					"example-two.com",
					"-d",
					"example-three.com",
					"--log",
					acmeLogFile,
				},
				err: nil,
			},
		},
		{
			name:                "http single domain with dns provider",
			domains:             []string{"example.com"},
			method:              "http",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider: &dnsprovider.Model{
				AcmeshName: "dns_cf",
			},
			ca: nil,
			want: want{
				args: nil,
				err:  ErrHTTPHasDNSProvider,
			},
		},
		{
			name:                "dns single domain",
			domains:             []string{"example.com"},
			method:              "dns",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider: &dnsprovider.Model{
				AcmeshName: "dns_cf",
			},
			ca: nil,
			want: want{
				args: []string{
					"--issue",
					"--fullchain-file",
					exampleChain,
					"--key-file",
					exampleKey,
					"-d",
					"example.com",
					"--dns",
					"dns_cf",
					"--log",
					acmeLogFile,
				},
				err: nil,
			},
		},
		{
			name:                "dns multiple domains",
			domains:             []string{"example.com", "example-two.com", "example-three.com"},
			method:              "dns",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider: &dnsprovider.Model{
				AcmeshName: "dns_cf",
			},
			ca: nil,
			want: want{
				args: []string{
					"--issue",
					"--fullchain-file",
					exampleChain,
					"--key-file",
					exampleKey,
					"-d",
					"example.com",
					"--dns",
					"dns_cf",
					"-d",
					"example-two.com",
					"-d",
					"example-three.com",
					"--log",
					acmeLogFile,
				},
				err: nil,
			},
		},
		{
			name:                "dns single domain no provider",
			domains:             []string{"example.com"},
			method:              "dns",
			outputFullchainFile: exampleChain,
			outputKeyFile:       exampleKey,
			dnsProvider:         nil,
			ca:                  nil,
			want: want{
				args: nil,
				err:  ErrDNSNeedsDNSProvider,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			args, err := buildCertRequestArgs(tt.domains, tt.method, tt.outputFullchainFile, tt.outputKeyFile, tt.dnsProvider, tt.ca, false)

			assert.Equal(t, tt.want.args, args)
			assert.Equal(t, tt.want.err, err)
		})
	}
}
