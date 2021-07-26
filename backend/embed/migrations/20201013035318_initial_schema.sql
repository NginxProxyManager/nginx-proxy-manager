-- migrate:up

CREATE TABLE IF NOT EXISTS `user`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	nickname TEXT NOT NULL,
	email TEXT NOT NULL,
	roles TEXT NOT NULL,
	is_disabled INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `auth`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	type TEXT NOT NULL,
	secret TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id),
	UNIQUE (user_id, type)
);

CREATE TABLE IF NOT EXISTS `setting`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	description TEXT NOT NULL,
	value TEXT NOT NULL,
	UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS `audit_log`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	object_type TEXT NOT NULL,
	object_id INTEGER NOT NULL,
	action TEXT NOT NULL,
	meta TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `certificate_authority`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	acme2_url TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `dns_provider`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	provider_key TEXT NOT NULL,
	name TEXT NOT NULL,
	meta TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `certificate`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	type TEXT NOT NULL, -- custom,dns,http
	user_id INTEGER NOT NULL,
	certificate_authority_id INTEGER, -- 0 for a custom cert
	dns_provider_id INTEGER, -- 0, for a http or custom cert
	name TEXT NOT NULL,
	domain_names TEXT NOT NULL,
	expires_on INTEGER DEFAULT 0,
	status TEXT NOT NULL, -- ready,requesting,failed,provided
	error_message text NOT NULL DEFAULT "",
	meta TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id),
	FOREIGN KEY (certificate_authority_id) REFERENCES certificate_authority (id),
	FOREIGN KEY (dns_provider_id) REFERENCES dns_provider (id)
);

CREATE TABLE IF NOT EXISTS `stream`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	listen_interface TEXT NOT NULL,
	incoming_port INTEGER NOT NULL,
	upstream_options TEXT NOT NULL,
	tcp_forwarding INTEGER NOT NULL DEFAULT 0,
	udp_forwarding INTEGER NOT NULL DEFAULT 0,
	advanced_config TEXT NOT NULL,
	is_disabled INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `upstream`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	hosts TEXT NOT NULL,
	balance_method TEXT NOT NULL,
	max_fails INTEGER NOT NULL DEFAULT 1,
	fail_timeout INTEGER NOT NULL DEFAULT 10,
	advanced_config TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `access_list`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	meta TEXT NOT NULL,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `host`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_on INTEGER NOT NULL DEFAULT 0,
	modified_on INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	type TEXT NOT NULL,
	listen_interface TEXT NOT NULL,
	domain_names TEXT NOT NULL,
	upstream_id INTEGER NOT NULL,
	certificate_id INTEGER,
	access_list_id INTEGER,
	ssl_forced INTEGER NOT NULL DEFAULT 0,
	caching_enabled INTEGER NOT NULL DEFAULT 0,
	block_exploits INTEGER NOT NULL DEFAULT 0,
	allow_websocket_upgrade INTEGER NOT NULL DEFAULT 0,
	http2_support INTEGER NOT NULL DEFAULT 0,
	hsts_enabled INTEGER NOT NULL DEFAULT 0,
	hsts_subdomains INTEGER NOT NULL DEFAULT 0,
	paths TEXT NOT NULL,
	upstream_options TEXT NOT NULL DEFAULT "",
	advanced_config TEXT NOT NULL DEFAULT "",
	is_disabled INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id),
	FOREIGN KEY (upstream_id) REFERENCES upstream (id),
	FOREIGN KEY (certificate_id) REFERENCES certificate (id),
	FOREIGN KEY (access_list_id) REFERENCES access_list (id)
);

-- migrate:down

-- Not allowed to go down from initial
