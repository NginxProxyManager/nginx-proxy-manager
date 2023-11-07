package dnsproviders

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/goleak"
)

func TestGetAll(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	providers := GetAll()
	// This number will have to (annoyingly) be updated
	// when adding new dns providers to the list
	assert.Equal(t, 45, len(providers))

	_, dynuExists := providers["dns_dynu"]
	assert.Equal(t, true, dynuExists)
	_, duckDNSExists := providers["dns_duckdns"]
	assert.Equal(t, true, duckDNSExists)
	_, cfExists := providers["dns_cf"]
	assert.Equal(t, true, cfExists)
	_, randomExists := providers["dns_shouldnotexist"]
	assert.Equal(t, false, randomExists)
}

func TestGet(t *testing.T) {
	// goleak is used to detect goroutine leaks
	defer goleak.VerifyNone(t, goleak.IgnoreAnyFunction("database/sql.(*DB).connectionOpener"))

	provider, err := Get("dns_duckdns")
	assert.Nil(t, err)
	assert.Equal(t, "dns_duckdns", provider.Title)

	provider, err = Get("dns_shouldnotexist")
	assert.NotNil(t, err)
	assert.Equal(t, "provider_not_found", err.Error())
}
