package main

import (
	"fmt"
	"log"
	
	"npm-backend/internal/services"
)

func main() {
	svc, err := services.NewNginxConfigService("internal/templates")
	if err != nil {
		log.Fatalf("Failed to init service: %v", err)
	}

	data := map[string]interface{}{
		"enabled":                 true,
		"id":                      1,
		"forward_scheme":          "http",
		"forward_host":            "192.168.1.100",
		"forward_port":            8080,
		"allow_websocket_upgrade": true,
		"advanced_config":         "# advanced custom logic",
		"locations":               "",
		"use_default_location":    true,
		"certificate_id":          0,
		"ssl_forced":              false,
		"hsts_enabled":            false,
		"hsts_subdomains":         false,
		"block_exploits":          false,
		"caching_enabled":         false,
		"domain_names":            []string{"example.com"},
		"access_list_id":          1,
		"access_list": map[string]interface{}{
			"items": []interface{}{"foo"}, // to simulate length > 0
			"clients": []map[string]interface{}{
				{"address": "192.168.1.50", "directive": "allow"},
			},
			"pass_auth":   false,
			"satisfy_any": true,
		},
		"meta":                    map[string]interface{}{"letsencrypt_agree": true},
	}

	out, err := svc.GenerateConfig("proxy_host.conf", data)
	if err != nil {
		log.Fatalf("Failed to generate: %v", err)
	}

	fmt.Println("SUCCESS. Output:")
	fmt.Println(out)
}
