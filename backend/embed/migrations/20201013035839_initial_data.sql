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
	"If enabled, any application errors are reported to Sentry. Sensitive information is not sent. All information sent is also private.",
	"true"
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
	"welcome"
);

-- Default Certificate Authorities

INSERT INTO `certificate_authority` (
	created_on,
	modified_on,
	name,
	acme2_url
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt",
	"https://acme-v02.api.letsencrypt.org/directory"
), (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"Let's Encrypt (Staging)",
	"https://acme-staging-v02.api.letsencrypt.org/directory"
);


-- migrate:down

-- Not allowed to go down from initial
