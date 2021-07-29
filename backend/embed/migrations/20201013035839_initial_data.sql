-- migrate:up

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
	max_domains
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"ZeroSSL",
	"zerossl",
	1,
	10
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt",
	"https://acme-v02.api.letsencrypt.org/directory",
	1,
	10
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Buypass Go SSL",
	"https://api.buypass.com/acme/directory",
	0,
	5
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt (Testing)",
	"https://acme-staging-v02.api.letsencrypt.org/directory",
	1,
	10
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Buypass Go SSL (Testing)",
	"https://api.test4.buypass.no/acme/directory",
	0,
	5
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"SSL.com",
	"ssl.com",
	0,
	10
);

-- migrate:down
