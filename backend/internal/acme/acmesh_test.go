package acme

import (
	"fmt"
	"testing"

	"npm/internal/config"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/dnsprovider"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

// TODO configurable
const acmeLogFile = "/data/logs/acme.sh.log"

func TestBuildCertRequestArgs(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

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
					"--debug",
					"2",
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
					"--debug",
					"2",
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
					"--debug",
					"2",
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
					"--debug",
					"2",
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

func TestGetAcmeShFilePath(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		path, err := getAcmeShFilePath()
		if err != nil {
			assert.Equal(t, "Cannot find acme.sh execuatable script in PATH: exec: \"acme.sh\": executable file not found in $PATH", err.Error())
			assert.Equal(t, "", path)
		} else {
			assert.Equal(t, "/bin/acme.sh", path)
		}
	})
}

func TestGetCommonEnvVars(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		t.Setenv("ACMESH_CONFIG_HOME", "/data/.acme.sh/config")
		t.Setenv("ACMESH_HOME", "/data/.acme.sh")
		t.Setenv("CERT_HOME", "/data/.acme.sh/certs")
		t.Setenv("LE_CONFIG_HOME", "/data/.acme.sh/config")
		t.Setenv("LE_WORKING_DIR", "/data/.acme.sh")

		expected := []string{
			"ACMESH_CONFIG_HOME=/data/.acme.sh/config",
			"ACMESH_HOME=/data/.acme.sh",
			"CERT_HOME=/data/.acme.sh/certs",
			"LE_CONFIG_HOME=/data/.acme.sh/config",
			"LE_WORKING_DIR=/data/.acme.sh",
		}
		vals := getCommonEnvVars()
		assert.Equal(t, expected, vals)
	})
}

func TestGetAcmeShVersion(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	t.Run("basic test", func(t *testing.T) {
		resp := GetAcmeShVersion()
		// Seems like a pointless test, however when this is run in CI
		// it doesn't have access to the acme.sh command so it will
		// always be empty. But when running in Docker, it will.
		if resp != "" {
			assert.Equal(t, "v", resp[:1])
		}
	})
}
