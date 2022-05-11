package cache

import (
	"time"

	"npm/internal/entity/setting"
	"npm/internal/logger"
)

// Cache is a memory cache
type Cache struct {
	Settings *map[string]setting.Model
}

// Status is the status of last update
type Status struct {
	LastUpdate time.Time
	Valid      bool
}

// NewCache will create and return a new Cache object
func NewCache() *Cache {
	return &Cache{
		Settings: nil,
	}
}

// Refresh will refresh all cache items
func (c *Cache) Refresh() {
	c.RefreshSettings()
}

// Clear will clear the cache
func (c *Cache) Clear() {
	c.Settings = nil
}

// RefreshSettings will refresh the settings from db
func (c *Cache) RefreshSettings() {
	logger.Info("Cache refreshing Settings")
	/*
		c.ProductOffers = client.GetProductOffers()

		if c.ProductOffers != nil {
			c.Status["product_offers"] = Status{
				LastUpdate: time.Now(),
				Valid:      true,
			}
		}
	*/
}
