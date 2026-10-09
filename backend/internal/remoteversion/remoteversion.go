// Package remoteversion checks github for the latest release
package remoteversion

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"npm/internal/config"
	"npm/internal/logger"
)

const (
	defaultURL          = "https://api.github.com/repos/NginxProxyManager/nginx-proxy-manager/releases/latest"
	successCacheTimeout = 15 * time.Minute
	failureCacheTimeout = 1 * time.Minute
)

// Result is the outcome of a version check. Current and Latest are empty
// when the check could not be completed.
type Result struct {
	Current         string
	Latest          string
	UpdateAvailable bool
}

// Checker fetches and caches the latest release version
type Checker struct {
	url    string
	client *http.Client

	mu        sync.Mutex
	latest    string
	fetchedAt time.Time
	lastErr   error
}

// NewChecker creates a Checker that queries the given release url
func NewChecker(url string) *Checker {
	return &Checker{
		url:    url,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

var defaultChecker = NewChecker(defaultURL)

// Check compares the running version against the latest github release
func Check() Result {
	return defaultChecker.Check()
}

// Check compares the running version against the latest release
func (c *Checker) Check() Result {
	current, ok := currentVersion()
	if !ok {
		return Result{}
	}

	latest, err := c.getLatest()
	if err != nil {
		return Result{}
	}

	return Result{
		Current:         current,
		Latest:          latest,
		UpdateAvailable: IsNewer(current, latest),
	}
}

// currentVersion returns the running version as vMAJOR.MINOR.PATCH
func currentVersion() (string, bool) {
	v := config.GetVersionSplit()
	if v == (config.VersionSplit{}) {
		return "", false
	}
	return fmt.Sprintf("v%d.%d.%d", v.Major, v.Minor, v.Patch), true
}

// getLatest returns the cached latest tag, refreshing it when stale. The lock
// is held during the fetch so concurrent callers share a single request, and
// failures are cached briefly so an outage doesn't cause a request per call.
// On failure, a previously fetched tag is served if there is one.
func (c *Checker) getLatest() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.fetchedAt.IsZero() {
		timeout := successCacheTimeout
		if c.lastErr != nil {
			timeout = failureCacheTimeout
		}
		if time.Since(c.fetchedAt) < timeout {
			return c.result()
		}
	}

	tag, err := c.fetch()
	c.fetchedAt = time.Now()
	c.lastErr = err
	if err != nil {
		logger.Warn("Remote version check failed: %v", err)
	} else {
		c.latest = tag
	}
	return c.result()
}

func (c *Checker) result() (string, error) {
	if c.latest != "" {
		return c.latest, nil
	}
	return "", c.lastErr
}

func (c *Checker) fetch() (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "NginxProxyManager v"+config.Version)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status from github: %d", resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err
	}
	if release.TagName == "" {
		return "", errors.New("github response has no tag_name")
	}
	return release.TagName, nil
}

// IsNewer returns true if latest is a higher version than current
func IsNewer(current, latest string) bool {
	c := strings.Split(strings.TrimPrefix(current, "v"), ".")
	l := strings.Split(strings.TrimPrefix(latest, "v"), ".")
	for i := 0; i < len(c) || i < len(l); i++ {
		var cv, lv uint64
		if i < len(c) {
			cv, _ = strconv.ParseUint(c[i], 10, 64)
		}
		if i < len(l) {
			lv, _ = strconv.ParseUint(l[i], 10, 64)
		}
		if lv != cv {
			return lv > cv
		}
	}
	return false
}
