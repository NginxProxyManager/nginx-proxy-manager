-- migrate:up

CREATE TABLE "jwt_keys" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"public_key" TEXT NOT NULL,
	"private_key" TEXT NOT NULL
);

CREATE TABLE "user" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"name" VARCHAR(50) NOT NULL,
	"nickname" VARCHAR(50) NOT NULL,
	"email" VARCHAR(255) NOT NULL,
	"is_system" BOOLEAN NOT NULL DEFAULT FALSE,
	"is_disabled" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "capability" (
	"name" TEXT NOT NULL PRIMARY KEY,
	UNIQUE ("name")
);

CREATE TABLE "user_has_capability" (
	"user_id" INTEGER NOT NULL,
	"capability_name" TEXT NOT NULL REFERENCES "capability"("name") ON DELETE CASCADE,
	UNIQUE ("user_id", "capability_name")
);

CREATE TABLE "auth" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"type" VARCHAR(50) NOT NULL,
	"secret" VARCHAR(255) NOT NULL,
	UNIQUE ("user_id", "type")
);

CREATE TABLE "setting" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"name" VARCHAR(50) NOT NULL,
	"description" VARCHAR(255) NOT NULL DEFAULT '',
	"value" TEXT NOT NULL,
	UNIQUE ("name")
);

CREATE TABLE "audit_log" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"object_type" VARCHAR(50) NOT NULL,
	"object_id" INTEGER NOT NULL,
	"action" VARCHAR(50) NOT NULL,
	"meta" TEXT NOT NULL
);

CREATE TABLE "certificate_authority" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"name" VARCHAR(50) NOT NULL,
	"acmesh_server" VARCHAR(255) NOT NULL DEFAULT '',
	"ca_bundle" VARCHAR(255) NOT NULL DEFAULT '',
	"is_wildcard_supported" BOOLEAN NOT NULL DEFAULT FALSE, -- specific to each CA, acme v1 doesn't usually have wildcards
	"max_domains" INTEGER NOT NULL DEFAULT 5, -- per request
	"is_readonly" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "dns_provider" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"name" VARCHAR(50) NOT NULL,
	"acmesh_name" VARCHAR(50) NOT NULL,
	"dns_sleep" INTEGER NOT NULL DEFAULT 0,
	"meta" TEXT NOT NULL
);

CREATE TABLE "certificate" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"type" VARCHAR(50) NOT NULL, -- custom,dns,http
	"certificate_authority_id" INTEGER REFERENCES "certificate_authority"("id") ON DELETE CASCADE, -- 0 for a custom cert
	"dns_provider_id" INTEGER REFERENCES "dns_provider"("id") ON DELETE CASCADE, -- 0, for a http or custom cert
	"name" VARCHAR(50) NOT NULL,
	"domain_names" TEXT NOT NULL,
	"expires_on" INTEGER DEFAULT 0,
	"status" VARCHAR(50) NOT NULL, -- ready,requesting,failed,provided
	"error_message" TEXT NOT NULL DEFAULT '',
	"meta" TEXT NOT NULL,
	"is_ecc" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "stream" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"listen_interface" VARCHAR(50) NOT NULL,
	"incoming_port" INTEGER NOT NULL,
	"tcp_forwarding" INTEGER NOT NULL DEFAULT 0,
	"udp_forwarding" INTEGER NOT NULL DEFAULT 0,
	"advanced_config" TEXT NOT NULL,
	"is_disabled" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "nginx_template" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"name" VARCHAR(50) NOT NULL,
	"type" VARCHAR(50) NOT NULL,
	"template" TEXT NOT NULL
);

CREATE TABLE "upstream" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id"),
	"name" VARCHAR(50) NOT NULL,
	"nginx_template_id" INTEGER NOT NULL REFERENCES "nginx_template"("id") ON DELETE CASCADE,
	"ip_hash" BOOLEAN NOT NULL DEFAULT FALSE,
	"ntlm" BOOLEAN NOT NULL DEFAULT FALSE,
	"keepalive" INTEGER NOT NULL DEFAULT 0,
	"keepalive_requests" INTEGER NOT NULL DEFAULT 0,
	"keepalive_time" VARCHAR(50) NOT NULL DEFAULT '',
	"keepalive_timeout" VARCHAR(50) NOT NULL DEFAULT '',
	"advanced_config" TEXT NOT NULL,
	"status" VARCHAR(50) NOT NULL DEFAULT '',
	"error_message" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "upstream_server" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"upstream_id" INTEGER NOT NULL REFERENCES "upstream"("id") ON DELETE CASCADE,
	"server" VARCHAR(50) NOT NULL,
	"weight" INTEGER NOT NULL DEFAULT 0,
	"max_conns" INTEGER NOT NULL DEFAULT 0,
	"max_fails" INTEGER NOT NULL DEFAULT 0,
	"fail_timeout" INTEGER NOT NULL DEFAULT 0,
	"is_backup" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "access_list" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"name" VARCHAR(50) NOT NULL,
	"meta" TEXT NOT NULL
);

CREATE TABLE "host" (
	"id" SERIAL PRIMARY KEY,
	"created_at" BIGINT NOT NULL DEFAULT 0,
	"updated_at" BIGINT NOT NULL DEFAULT 0,
	"is_deleted" INTEGER NOT NULL DEFAULT 0, -- int on purpose, gormism
	"user_id" INTEGER NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"type" TEXT NOT NULL,
	"nginx_template_id" INTEGER NOT NULL REFERENCES "nginx_template"("id") ON DELETE CASCADE,
	"listen_interface" TEXT NOT NULL DEFAULT '',
	"domain_names" TEXT NOT NULL,
	"upstream_id" INTEGER REFERENCES "upstream"("id") ON DELETE CASCADE,
	"proxy_scheme" TEXT NOT NULL DEFAULT '',
	"proxy_host" TEXT NOT NULL DEFAULT '',
	"proxy_port" INTEGER NOT NULL DEFAULT 0,
	"certificate_id" INTEGER REFERENCES "certificate"("id") ON DELETE CASCADE,
	"access_list_id" INTEGER REFERENCES "access_list"("id") ON DELETE CASCADE,
	"ssl_forced" BOOLEAN NOT NULL DEFAULT FALSE,
	"caching_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
	"block_exploits" BOOLEAN NOT NULL DEFAULT FALSE,
	"allow_websocket_upgrade" BOOLEAN NOT NULL DEFAULT FALSE,
	"http2_support" BOOLEAN NOT NULL DEFAULT FALSE,
	"hsts_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
	"hsts_subdomains" BOOLEAN NOT NULL DEFAULT FALSE,
	"paths" TEXT NOT NULL DEFAULT '',
	"advanced_config" TEXT NOT NULL DEFAULT '',
	"status" TEXT NOT NULL DEFAULT '',
	"error_message" TEXT NOT NULL DEFAULT '',
	"is_disabled" BOOLEAN NOT NULL DEFAULT FALSE
);

-- migrate:down

-- Not allowed to go down from initial
