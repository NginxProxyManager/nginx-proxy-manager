package dnsproviders

import (
	"testing"

	"npm/internal/util"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestAliProvider(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	provider := getDNSAli()
	json, err := provider.GetJSONSchema()
	assert.Nil(t, err)
	assert.Equal(t, `{
  "title": "dns_ali",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "Ali_Key",
    "Ali_Secret"
  ],
  "properties": {
    "Ali_Key": {
      "title": "api-key",
      "type": "string",
      "additionalProperties": false,
      "minLength": 1
    },
    "Ali_Secret": {
      "title": "secret",
      "type": "string",
      "additionalProperties": false,
      "minLength": 1
    }
  }
}`, util.PrettyPrintJSON(json))
}
