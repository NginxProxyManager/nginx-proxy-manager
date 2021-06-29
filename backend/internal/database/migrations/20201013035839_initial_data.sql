-- migrate:up

-- Default error reporting setting
INSERT INTO `setting` (
	created_on,
	modified_on,
	name,
	value
) VALUES (
	strftime('%s', 'now'),
	strftime('%s', 'now'),
	"error-reporting",
	"true"
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
