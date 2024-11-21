package dnsproviders

import (
	"testing"

	"npm/internal/util"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestAcmeDNSProvider(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	provider := getDNSAcmeDNS()
	json, err := provider.GetJSONSchema()
	assert.Nil(t, err)
	assert.Equal(t, `{
  "title": "dns_acmedns",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "ACMEDNS_BASE_URL",
    "ACMEDNS_SUBDOMAIN",
    "ACMEDNS_USERNAME",
    "ACMEDNS_PASSWORD"
  ],
  "properties": {
    "ACMEDNS_BASE_URL": {
      "title": "base-url",
      "type": "string",
      "additionalProperties": false
    },
    "ACMEDNS_PASSWORD": {
      "title": "password",
      "type": "string",
      "additionalProperties": false
    },
    "ACMEDNS_SUBDOMAIN": {
      "title": "subdomain",
      "type": "string",
      "additionalProperties": false
    },
    "ACMEDNS_USERNAME": {
      "title": "username",
      "type": "string",
      "additionalProperties": false
    }
  }
}`, util.PrettyPrintJSON(json))
}
