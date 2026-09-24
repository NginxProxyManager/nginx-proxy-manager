package migrations

import (
	"time"

	"npm/internal/entity"
	"npm/internal/entity/certificateauthority"
	"npm/internal/entity/nginxtemplate"
	"npm/internal/entity/setting"
	"npm/internal/entity/user"
	"npm/internal/model"

	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const proxyTemplate = `# ------------------------------------------------------------
{{#each Host.DomainNames}}
# {{this}}
{{/each}}
# ------------------------------------------------------------

server {
  {{#if Config.Ipv4}}
  listen 80;
  {{/if}}
  {{#if Config.Ipv6}}
  listen [::]:80;
  {{/if}}

  {{#if Certificate.ID}}
  {{#if Config.Ipv4}}
  listen 443 ssl {{#if Host.HTTP2Support}}http2{{/if}};
  {{/if}}
  {{#if Config.Ipv6}}
  listen [::]:443 ssl {{#if Host.HTTP2Support}}http2{{/if}};
  {{/if}}
  {{/if}}

  server_name {{#each Host.DomainNames}}{{this}} {{/each}};

  {{#if Certificate.ID}}
  include conf.d/include/ssl-ciphers.conf;
  {{#if Certificate.IsAcme}}
  ssl_certificate {{Certificate.Folder}}/fullchain.pem;
  ssl_certificate_key {{Certificate.Folder}}/privkey.pem;
  {{else}}
  # Custom SSL
  ssl_certificate /data/custom_ssl/npm-{{Certicicate.ID}}/fullchain.pem;
  ssl_certificate_key /data/custom_ssl/npm-{{Certificate.ID}}/privkey.pem;
  {{/if}}
  {{/if}}

  {{#if Host.CachingEnabled}}
  include conf.d/include/assets.conf;
  {{/if}}

  {{#if Host.BlockExploits}}
  include conf.d/include/block-exploits.conf;
  {{/if}}

  {{#if Certificate.ID}}
  {{#if Host.SSLForced}}
  {{#if Host.HSTSEnabled}}
  # HSTS (ngx_http_headers_module is required) (63072000 seconds = 2 years)
  add_header Strict-Transport-Security "max-age=63072000;{{#if Host.HSTSSubdomains}} includeSubDomains;{{/if}} preload" always;
  {{/if}}
  # Force SSL
  include conf.d/include/force-ssl.conf;
  {{/if}}
  {{/if}}

  {{#if Host.AllowWebsocketUpgrade}}
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;
  proxy_http_version 1.1;
  {{/if}}

  access_log /data/logs/host-{{Host.ID}}_access.log proxy;
  error_log /data/logs/host-{{Host.ID}}_error.log warn;

  {{Host.AdvancedConfig}}

  # locations ?

  # default location:
  location / {
    {{#if Host.AccessListID}}
    # Authorization
    auth_basic            "Authorization required";
    auth_basic_user_file  /data/access/{{Host.AccessListID}};
    # access_list.passauth ? todo
    {{/if}}

    # Access Rules ? todo

    # Access checks must...? todo

    {{#if Certificate.ID}}
    {{#if Host.SSLForced}}
    {{#if Host.HSTSEnabled}}
    # HSTS (ngx_http_headers_module is required) (63072000 seconds = 2 years)
    add_header Strict-Transport-Security "max-age=63072000;{{#if Host.HSTSSubdomains}} includeSubDomains;{{/if}} preload" always;
    {{/if}}
    {{/if}}
    {{/if}}

    {{#if Host.AllowWebsocketUpgrade}}
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    {{/if}}

    # Proxy!
    add_header       X-Served-By $host;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Scheme $scheme;
    proxy_set_header X-Forwarded-Proto  $scheme;
    proxy_set_header X-Forwarded-For    $remote_addr;
    proxy_http_version 1.1;

    {{#if Upstream.ID}}
    # upstream
    proxy_pass {{Host.ProxyScheme}}://npm_upstream_{{Upstream.ID}};
    {{else}}
    # proxy a single host
    proxy_pass {{Host.ProxyScheme}}://{{Host.ProxyHost}}:{{Host.ProxyPort}};
    {{/if}}
  }

  # Legacy Custom Configuration
  include /data/nginx/custom/server_proxy[.]conf;
}
`

const upstreamTemplate = `# ------------------------------------------------------------
# Upstream {{Upstream.ID}}: {{Upstream.Name}}
# ------------------------------------------------------------

upstream npm_upstream_{{Upstream.ID}} {

  {{#if Upstream.IPHash~}}
  ip_hash;
  {{~/if}}

  {{#if Upstream.NTLM~}}
  ntlm;
  {{~/if}}

  {{#if Upstream.Keepalive~}}
  keepalive {{Upstream.Keepalive}};
  {{~/if}}

  {{#if Upstream.KeepaliveRequests~}}
  keepalive_requests {{Upstream.KeepaliveRequests}};
  {{~/if}}

  {{#if Upstream.KeepaliveTime~}}
  keepalive_time {{Upstream.KeepaliveTime}};
  {{~/if}}

  {{#if Upstream.KeepaliveTimeout~}}
  keepalive_timeout {{Upstream.KeepaliveTimeout}};
  {{~/if}}

  {{Upstream.AdvancedConfig}}

  {{#each Upstream.Servers~}}
  {{#unless IsDeleted~}}
  server {{Server}} {{#if Weight}}weight={{Weight}} {{/if}}{{#if MaxConns}}max_conns={{MaxConns}} {{/if}}{{#if MaxFails}}max_fails={{MaxFails}} {{/if}}{{#if FailTimeout}}fail_timeout={{FailTimeout}} {{/if}}{{#if Backup}}backup{{/if}};
  {{/unless}}
  {{/each}}
}
`

// initialData seeds the tables created by initialSchema with the same
// default rows that the old per-engine dbmate migrations inserted:
// capabilities, default settings, built-in certificate authorities, the
// system user, and the built-in nginx templates.
func initialData() *gormigrate.Migration {
	return &gormigrate.Migration{
		ID: "20201013035839",
		Migrate: func(tx *gorm.DB) error {
			now := time.Now().UnixMilli()
			base := func() model.Base {
				return model.Base{CreatedAt: now, UpdatedAt: now}
			}

			capabilities := []entity.Capability{
				{Name: user.CapabilityFullAdmin},
				{Name: user.CapabilityAccessListsView},
				{Name: user.CapabilityAccessListsManage},
				{Name: user.CapabilityAuditLogView},
				{Name: user.CapabilityCertificatesView},
				{Name: user.CapabilityCertificatesManage},
				{Name: user.CapabilityCertificateAuthoritiesView},
				{Name: user.CapabilityCertificateAuthoritiesManage},
				{Name: user.CapabilityDNSProvidersView},
				{Name: user.CapabilityDNSProvidersManage},
				{Name: user.CapabilityHostsView},
				{Name: user.CapabilityHostsManage},
				{Name: user.CapabilityNginxTemplatesView},
				{Name: user.CapabilityNginxTemplatesManage},
				{Name: user.CapabilitySettingsManage},
				{Name: user.CapabilityStreamsView},
				{Name: user.CapabilityStreamsManage},
				{Name: user.CapabilityUsersManage},
			}
			if err := tx.Create(&capabilities).Error; err != nil {
				return err
			}

			settings := []setting.Model{
				{
					Base:        base(),
					Name:        "default-site",
					Description: "What to show users who hit your Nginx server by default",
					Value:       datatypes.JSON(`"welcome"`),
				},
				{
					Base:        base(),
					Name:        "auth-methods",
					Description: "Which methods are enabled for authentication",
					Value:       datatypes.JSON(`["local"]`),
				},
				{
					Base:        base(),
					Name:        "oauth-auth",
					Description: "Configuration for OAuth authentication",
					Value:       datatypes.JSON(`{}`),
				},
				{
					Base:        base(),
					Name:        "ldap-auth",
					Description: "Configuration for LDAP authentication",
					Value:       datatypes.JSON(`{"host": "", "dn": "", "sync_by": "uid"}`),
				},
			}
			if err := tx.Create(&settings).Error; err != nil {
				return err
			}

			certificateAuthorities := []certificateauthority.Model{
				{
					Base:                base(),
					Name:                "ZeroSSL",
					AcmeshServer:        "zerossl",
					IsWildcardSupported: true,
					MaxDomains:          10,
					IsReadonly:          true,
				},
				{
					Base:                base(),
					Name:                "Let's Encrypt",
					AcmeshServer:        "https://acme-v02.api.letsencrypt.org/directory",
					IsWildcardSupported: true,
					MaxDomains:          10,
					IsReadonly:          true,
				},
				{
					Base:                base(),
					Name:                "Buypass Go SSL",
					AcmeshServer:        "https://api.buypass.com/acme/directory",
					IsWildcardSupported: false,
					MaxDomains:          5,
					IsReadonly:          true,
				},
				{
					Base:                base(),
					Name:                "SSL.com",
					AcmeshServer:        "ssl.com",
					IsWildcardSupported: false,
					MaxDomains:          10,
					IsReadonly:          true,
				},
				{
					Base:                base(),
					Name:                "Let's Encrypt (Testing)",
					AcmeshServer:        "https://acme-staging-v02.api.letsencrypt.org/directory",
					IsWildcardSupported: true,
					MaxDomains:          10,
					IsReadonly:          true,
				},
				{
					Base:                base(),
					Name:                "Buypass Go SSL (Testing)",
					AcmeshServer:        "https://api.test4.buypass.no/acme/directory",
					IsWildcardSupported: false,
					MaxDomains:          5,
					IsReadonly:          true,
				},
			}
			if err := tx.Create(&certificateAuthorities).Error; err != nil {
				return err
			}

			systemUser := user.Model{
				Base:     base(),
				Name:     "System",
				Email:    "system@localhost",
				IsSystem: true,
			}
			if err := tx.Create(&systemUser).Error; err != nil {
				return err
			}

			templates := []nginxtemplate.Model{
				{
					Base:     base(),
					UserID:   systemUser.ID,
					Name:     "Default Proxy Template",
					Type:     "proxy",
					Template: proxyTemplate,
				},
				{
					Base:     base(),
					UserID:   systemUser.ID,
					Name:     "Default Redirect Template",
					Type:     "redirect",
					Template: "# this is a redirect template",
				},
				{
					Base:     base(),
					UserID:   systemUser.ID,
					Name:     "Default Dead Template",
					Type:     "dead",
					Template: "# this is a dead template",
				},
				{
					Base:     base(),
					UserID:   systemUser.ID,
					Name:     "Default Stream Template",
					Type:     "stream",
					Template: "# this is a stream template",
				},
				{
					Base:     base(),
					UserID:   systemUser.ID,
					Name:     "Default Upstream Template",
					Type:     "upstream",
					Template: upstreamTemplate,
				},
			}
			return tx.Create(&templates).Error
		},
	}
}
