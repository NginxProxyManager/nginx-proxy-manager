package dnsproviders

import (
	"npm/internal/util"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAdProvider(t *testing.T) {
	provider := getDNSAd()
	provider.ConvertToUpdatable()
	json, err := provider.GetJsonSchema()
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
