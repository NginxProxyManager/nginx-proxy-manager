-- migrate:up

-- User permissions
INSERT INTO `capability` (
	name
) VALUES
	("full-admin"),
	("access-lists.view"),
	("access-lists.manage"),
	("audit-log.view"),
	("certificates.view"),
	("certificates.manage"),
	("certificate-authorities.view"),
	("certificate-authorities.manage"),
	("dns-providers.view"),
	("dns-providers.manage"),
	("hosts.view"),
	("hosts.manage"),
	("nginx-templates.view"),
	("nginx-templates.manage"),
	("settings.manage"),
	("streams.view"),
	("streams.manage"),
	("users.manage");

-- Default error reporting setting
INSERT INTO `setting` (
	created_on,
	modified_on,
	name,
	description,
	value
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"error-reporting",
	"If enabled, any application errors are reported to Sentry. Sensitive information is not sent.",
	"true" -- remember this is json
);

-- Default site
INSERT INTO `setting` (
	created_on,
	modified_on,
	name,
	description,
	value
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"default-site",
	"What to show users who hit your Nginx server by default",
	'"welcome"' -- remember this is json
);

-- Default Certificate Authorities

INSERT INTO `certificate_authority` (
	created_on,
	modified_on,
	name,
	acmesh_server,
	is_wildcard_supported,
	max_domains,
	is_readonly
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"ZeroSSL",
	"zerossl",
	1,
	10,
	1
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt",
	"https://acme-v02.api.letsencrypt.org/directory",
	1,
	10,
	1
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Buypass Go SSL",
	"https://api.buypass.com/acme/directory",
	0,
	5,
	1
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"SSL.com",
	"ssl.com",
	0,
	10,
	1
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt (Testing)",
	"https://acme-staging-v02.api.letsencrypt.org/directory",
	1,
	10,
	1
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Buypass Go SSL (Testing)",
	"https://api.test4.buypass.no/acme/directory",
	0,
	5,
	1
);

-- System User
INSERT INTO `user` (
	created_on,
	modified_on,
	name,
	nickname,
	email,
	is_system
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"System",
	"System",
	"system@localhost",
	1
);

-- Host Templates
INSERT INTO `nginx_template` (
	created_on,
	modified_on,
	user_id,
	name,
	type,
	template
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Proxy Template",
	"proxy",
	"# ------------------------------------------------------------
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
  add_header Strict-Transport-Security ""max-age=63072000;{{#if Host.HSTSSubdomains}} includeSubDomains;{{/if}} preload"" always;
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
    auth_basic            ""Authorization required"";
    auth_basic_user_file  /data/access/{{Host.AccessListID}};
    # access_list.passauth ? todo
    {{/if}}

    # Access Rules ? todo

    # Access checks must...? todo

    {{#if Certificate.ID}}
    {{#if Host.SSLForced}}
    {{#if Host.HSTSEnabled}}
    # HSTS (ngx_http_headers_module is required) (63072000 seconds = 2 years)
    add_header Strict-Transport-Security ""max-age=63072000;{{#if Host.HSTSSubdomains}} includeSubDomains;{{/if}} preload"" always;
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
"
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Redirect Template",
	"redirect",
	"# this is a redirect template"
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Dead Template",
	"dead",
	"# this is a dead template"
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Stream Template",
	"stream",
	"# this is a stream template"
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Upstream Template",
	"upstream",
	"# ------------------------------------------------------------
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
"
);

-- migrate:down
