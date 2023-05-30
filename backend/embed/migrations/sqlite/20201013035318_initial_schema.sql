-- migrate:up

CREATE TABLE IF NOT EXISTS `jwt_keys`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	public_key TEXT NOT NULL,
	private_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `user`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	nickname TEXT NOT NULL,
	email TEXT NOT NULL,
	is_system INTEGER NOT NULL DEFAULT 0,
	is_disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `capability`
(
	name TEXT PRIMARY KEY,
	UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS `user_has_capability`
(
	user_id INTEGER NOT NULL,
	capability_name TEXT NOT NULL,
	UNIQUE (user_id, capability_name),
	FOREIGN KEY (capability_name) REFERENCES capability (name)
);

CREATE TABLE IF NOT EXISTS `auth`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	type TEXT NOT NULL,
	secret TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user (id),
	UNIQUE (user_id, type)
);

CREATE TABLE IF NOT EXISTS `setting`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT "",
	value TEXT NOT NULL,
	UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS `audit_log`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
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
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	name TEXT NOT NULL,
	acmesh_server TEXT NOT NULL DEFAULT "",
	ca_bundle TEXT NOT NULL DEFAULT "",
	is_wildcard_supported INTEGER NOT NULL DEFAULT 0, -- specific to each CA, acme v1 doesn't usually have wildcards
	max_domains INTEGER NOT NULL DEFAULT 5, -- per request
	is_readonly INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `dns_provider`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	acmesh_name TEXT NOT NULL,
	dns_sleep INTEGER NOT NULL DEFAULT 0,
	meta TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `certificate`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	type TEXT NOT NULL, -- custom,dns,http
	certificate_authority_id INTEGER, -- 0 for a custom cert
	dns_provider_id INTEGER, -- 0, for a http or custom cert
	name TEXT NOT NULL,
	domain_names TEXT NOT NULL,
	expires_on INTEGER DEFAULT 0,
	status TEXT NOT NULL, -- ready,requesting,failed,provided
	error_message TEXT NOT NULL DEFAULT "",
	meta TEXT NOT NULL,
	is_ecc INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id),
	FOREIGN KEY (certificate_authority_id) REFERENCES certificate_authority (id),
	FOREIGN KEY (dns_provider_id) REFERENCES dns_provider (id)
);

CREATE TABLE IF NOT EXISTS `stream`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	listen_interface TEXT NOT NULL,
	incoming_port INTEGER NOT NULL,
	tcp_forwarding INTEGER NOT NULL DEFAULT 0,
	udp_forwarding INTEGER NOT NULL DEFAULT 0,
	advanced_config TEXT NOT NULL,
	is_disabled INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `nginx_template`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	type TEXT NOT NULL,
	template TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `upstream`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	nginx_template_id INTEGER NOT NULL,
	ip_hash INTEGER NOT NULL DEFAULT 0,
	ntlm INTEGER NOT NULL DEFAULT 0,
	keepalive INTEGER NOT NULL DEFAULT 0,
	keepalive_requests INTEGER NOT NULL DEFAULT 0,
	keepalive_time TEXT NOT NULL DEFAULT "",
	keepalive_timeout TEXT NOT NULL DEFAULT "",
	advanced_config TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT "",
	error_message TEXT NOT NULL DEFAULT "",
	FOREIGN KEY (user_id) REFERENCES user (id),
	FOREIGN KEY (nginx_template_id) REFERENCES nginx_template (id)
);

CREATE TABLE IF NOT EXISTS `upstream_server`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	upstream_id INTEGER NOT NULL,
	server TEXT NOT NULL,
	weight INTEGER NOT NULL DEFAULT 0,
	max_conns INTEGER NOT NULL DEFAULT 0,
	max_fails INTEGER NOT NULL DEFAULT 0,
	fail_timeout INTEGER NOT NULL DEFAULT 0,
	is_backup INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (upstream_id) REFERENCES upstream (id)
);

CREATE TABLE IF NOT EXISTS `access_list`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	meta TEXT NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user (id)
);

CREATE TABLE IF NOT EXISTS `host`
(
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at INTEGER NOT NULL DEFAULT 0,
	updated_at INTEGER NOT NULL DEFAULT 0,
	is_deleted INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL,
	type TEXT NOT NULL,
	nginx_template_id INTEGER NOT NULL,
	listen_interface TEXT NOT NULL DEFAULT "",
	domain_names TEXT NOT NULL,
	upstream_id INTEGER,
	proxy_scheme TEXT NOT NULL DEFAULT "",
	proxy_host TEXT NOT NULL DEFAULT "",
	proxy_port INTEGER NOT NULL DEFAULT 0,
	certificate_id INTEGER,
	access_list_id INTEGER,
	ssl_forced INTEGER NOT NULL DEFAULT 0,
	caching_enabled INTEGER NOT NULL DEFAULT 0,
	block_exploits INTEGER NOT NULL DEFAULT 0,
	allow_websocket_upgrade INTEGER NOT NULL DEFAULT 0,
	http2_support INTEGER NOT NULL DEFAULT 0,
	hsts_enabled INTEGER NOT NULL DEFAULT 0,
	hsts_subdomains INTEGER NOT NULL DEFAULT 0,
	paths TEXT NOT NULL DEFAULT "",
	advanced_config TEXT NOT NULL DEFAULT "",
	status TEXT NOT NULL DEFAULT "",
	error_message TEXT NOT NULL DEFAULT "",
	is_disabled INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (user_id) REFERENCES user (id),
	FOREIGN KEY (nginx_template_id) REFERENCES nginx_template (id),
	FOREIGN KEY (upstream_id) REFERENCES upstream (id),
	FOREIGN KEY (certificate_id) REFERENCES certificate (id),
	FOREIGN KEY (access_list_id) REFERENCES access_list (id)
);

-- migrate:down

-- Not allowed to go down from initial
