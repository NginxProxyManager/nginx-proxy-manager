package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"npm/internal/config"
	"npm/internal/model"

	"github.com/rotisserie/eris"
)

var commit string
var version string
var sentryDSN string

var cloudfrontURL = "https://ip-ranges.amazonaws.com/ip-ranges.json"
var cloudflare4URL = "https://www.cloudflare.com/ips-v4"
var cloudflare6URL = "https://www.cloudflare.com/ips-v6"

func main() {
	config.InitArgs(&version, &commit)
	if err := config.InitIPRanges(&version, &commit, &sentryDSN); err != nil {
		fmt.Printf("# Config ERROR: %v\n", err)
		os.Exit(1)
	}

	exitCode := 0

	// Cloudfront
	fmt.Printf("# Cloudfront Ranges from: %s\n", cloudfrontURL)
	if ranges, err := parseCloudfront(); err == nil {
		for _, item := range ranges {
			fmt.Printf("set_real_ip_from %s;\n", item)
		}
	} else {
		fmt.Printf("# ERROR: %v\n", err)
	}

	// Cloudflare ipv4
	if !config.Configuration.DisableIPV4 {
		fmt.Printf("\n# Cloudflare Ranges from: %s\n", cloudflare4URL)
		if ranges, err := parseCloudflare(cloudflare4URL); err == nil {
			for _, item := range ranges {
				fmt.Printf("set_real_ip_from %s;\n", item)
			}
		} else {
			fmt.Printf("# ERROR: %v\n", err)
		}
	}

	// Cloudflare ipv6
	if !config.Configuration.DisableIPV6 {
		fmt.Printf("\n# Cloudflare Ranges from: %s\n", cloudflare6URL)
		if ranges, err := parseCloudflare(cloudflare6URL); err == nil {
			for _, item := range ranges {
				fmt.Printf("set_real_ip_from %s;\n", item)
			}
		} else {
			fmt.Printf("# ERROR: %v\n", err)
		}
	}

	// Done
	os.Exit(exitCode)
}

func parseCloudfront() ([]string, error) {
	// nolint: gosec
	resp, err := http.Get(cloudfrontURL)
	if err != nil {
		return nil, eris.Wrapf(err, "Failed to download Cloudfront IP Ranges from %s", cloudfrontURL)
	}

	// nolint: errcheck, gosec
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, eris.Wrapf(err, "Failed to read Cloudfront IP Ranges body")
	}

	var result model.CloudfrontIPRanges
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, eris.Wrapf(err, "Failed to unmarshal Cloudfront IP Ranges file")
	}

	ranges := make([]string, 0)
	if !config.Configuration.DisableIPV4 {
		for _, item := range result.IPV4Prefixes {
			ranges = append(ranges, item.Value)
		}
	}
	if !config.Configuration.DisableIPV6 {
		for _, item := range result.IPV6Prefixes {
			ranges = append(ranges, item.Value)
		}
	}

	return ranges, nil
}

func parseCloudflare(url string) ([]string, error) {
	// nolint: gosec
	resp, err := http.Get(url)
	if err != nil {
		return nil, eris.Wrapf(err, "Failed to download Cloudflare IP Ranges from %s", url)
	}

	// nolint: errcheck, gosec
	defer resp.Body.Close()

	scanner := bufio.NewScanner(resp.Body)
	scanner.Split(bufio.ScanLines)

	ranges := make([]string, 0)
	for scanner.Scan() {
		if scanner.Text() != "" {
			ranges = append(ranges, scanner.Text())
		}
	}
	return ranges, nil
}
