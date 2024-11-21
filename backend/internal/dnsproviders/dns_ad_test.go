package dnsproviders

import (
	"testing"

	"npm/internal/util"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestAdProvider(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	provider := getDNSAd()
	provider.ConvertToUpdatable()
	json, err := provider.GetJSONSchema()
	assert.Nil(t, err)
	assert.Equal(t, `{
  "title": "dns_ad",
  "type": "object",
  "additionalProperties": false,
  "minProperties": 1,
  "properties": {
    "AD_API_KEY": {
      "title": "api-key",
      "type": "string",
      "additionalProperties": false,
      "minLength": 1
    }
  }
}`, util.PrettyPrintJSON(json))
}
