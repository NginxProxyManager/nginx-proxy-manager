package middleware

import (
	"time"

	"npm/internal/logger"

	cache "github.com/patrickmn/go-cache"
)

// AuthCache is a cache item that stores the Admin API data for each admin that has been requesting endpoints
var AuthCache *cache.Cache

// AuthCacheInit will create a new Memory Cache
func AuthCacheInit() {
	logger.Debug("Creating a new AuthCache")
	AuthCache = cache.New(1*time.Minute, 5*time.Minute)
}

// AuthCacheSet will store the item in memory for the expiration time
func AuthCacheSet(k string, x interface{}) {
	AuthCache.Set(k, x, cache.DefaultExpiration)
}
