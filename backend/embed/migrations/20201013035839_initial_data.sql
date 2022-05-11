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
	("host-templates.view"),
	("host-templates.manage"),
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
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"SSL.com",
	"ssl.com",
	0,
	10,
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
INSERT INTO `host_template` (
	created_on,
	modified_on,
	user_id,
	name,
	host_type,
	template
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	(SELECT id FROM user WHERE is_system = 1 LIMIT 1),
	"Default Proxy Template",
	"proxy",
	"# this is a proxy template"
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
);

-- migrate:down
