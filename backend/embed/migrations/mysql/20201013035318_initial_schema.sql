-- migrate:up

CREATE TABLE IF NOT EXISTS `jwt_keys`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`public_key` TEXT NOT NULL,
	`private_key` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `user`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`name` VARCHAR(50) NOT NULL,
	`email` VARCHAR(255) NOT NULL,
	`is_system` BOOLEAN NOT NULL DEFAULT FALSE,
	`is_disabled` BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS `capability`
(
	`name` VARCHAR(50) PRIMARY KEY,
	UNIQUE (`name`)
);

CREATE TABLE IF NOT EXISTS `user_has_capability`
(
	`user_id` INT NOT NULL,
	`capability_name` VARCHAR(50) NOT NULL,
	UNIQUE (`user_id`, `capability_name`),
	FOREIGN KEY (`capability_name`) REFERENCES `capability`(`name`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `auth`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL,
	`identity` VARCHAR(255) NOT NULL,
	`secret` VARCHAR(255) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	UNIQUE (`user_id`, `type`)
);

CREATE TABLE IF NOT EXISTS `setting`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`name` VARCHAR(50) NOT NULL,
	`description` VARCHAR(255) NOT NULL DEFAULT '',
	`value` TEXT NOT NULL,
	UNIQUE (`name`)
);

CREATE TABLE IF NOT EXISTS `audit_log`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`object_type` VARCHAR(50) NOT NULL,
	`object_id` INT NOT NULL,
	`action` VARCHAR(50) NOT NULL,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `certificate_authority`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`name` VARCHAR(50) NOT NULL,
	`acmesh_server` VARCHAR(255) NOT NULL DEFAULT '',
	`ca_bundle` VARCHAR(255) NOT NULL DEFAULT '',
	`is_wildcard_supported` BOOLEAN NOT NULL DEFAULT FALSE, -- specific to each CA, acme v1 doesn't usually have wildcards
	`max_domains` INT NOT NULL DEFAULT 5, -- per request
	`is_readonly` BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS `dns_provider`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`acmesh_name` VARCHAR(50) NOT NULL,
	`dns_sleep` INT NOT NULL DEFAULT 0,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `certificate`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL, -- custom,dns,http
	`certificate_authority_id` INT, -- null for a custom cert
	`dns_provider_id` INT, -- 0, for a http or custom cert
	`name` VARCHAR(50) NOT NULL,
	`domain_names` TEXT NOT NULL,
	`expires_on` BIGINT NOT NULL DEFAULT 0,
	`status` VARCHAR(50) NOT NULL, -- ready,requesting,failed,provided
	`error_message` TEXT NOT NULL,
	`meta` TEXT NOT NULL,
	`is_ecc` BOOLEAN NOT NULL DEFAULT FALSE,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`certificate_authority_id`) REFERENCES `certificate_authority`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`dns_provider_id`) REFERENCES `dns_provider`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `stream`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`listen_interface` VARCHAR(50) NOT NULL,
	`incoming_port` INT NOT NULL,
	`tcp_forwarding` INT NOT NULL DEFAULT 0,
	`udp_forwarding` INT NOT NULL DEFAULT 0,
	`advanced_config` TEXT NOT NULL,
	`is_disabled` BOOLEAN NOT NULL DEFAULT FALSE,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `nginx_template`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`type` VARCHAR(50) NOT NULL,
	`template` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS `upstream`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`nginx_template_id` INT NOT NULL,
	`ip_hash` BOOLEAN NOT NULL DEFAULT FALSE,
	`ntlm` BOOLEAN NOT NULL DEFAULT FALSE,
	`keepalive` INT NOT NULL DEFAULT 0,
	`keepalive_requests` INT NOT NULL DEFAULT 0,
	`keepalive_time` VARCHAR(50) NOT NULL DEFAULT '',
	`keepalive_timeout` VARCHAR(50) NOT NULL DEFAULT '',
	`advanced_config` TEXT NOT NULL,
	`status` VARCHAR(50) NOT NULL DEFAULT '',
	`error_message` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`nginx_template_id`) REFERENCES `nginx_template`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `upstream_server`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`upstream_id` INT NOT NULL,
	`server` VARCHAR(50) NOT NULL,
	`weight` INT NOT NULL DEFAULT 0,
	`max_conns` INT NOT NULL DEFAULT 0,
	`max_fails` INT NOT NULL DEFAULT 0,
	`fail_timeout` INT NOT NULL DEFAULT 0,
	`is_backup` BOOLEAN NOT NULL DEFAULT FALSE,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstream`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `access_list`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `host`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0, -- int on purpose, gormism
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL,
	`nginx_template_id` INT NOT NULL,
	`listen_interface` VARCHAR(50) NOT NULL DEFAULT '',
	`domain_names` TEXT NOT NULL,
	`upstream_id` INT,
	`proxy_scheme` VARCHAR(50) NOT NULL DEFAULT '',
	`proxy_host` VARCHAR(50) NOT NULL DEFAULT '',
	`proxy_port` INT NOT NULL DEFAULT 0,
	`certificate_id` INT,
	`access_list_id` INT,
	`ssl_forced` BOOLEAN NOT NULL DEFAULT FALSE,
	`caching_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
	`block_exploits` BOOLEAN NOT NULL DEFAULT FALSE,
	`allow_websocket_upgrade` BOOLEAN NOT NULL DEFAULT FALSE,
	`http2_support` BOOLEAN NOT NULL DEFAULT FALSE,
	`hsts_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
	`hsts_subdomains` BOOLEAN NOT NULL DEFAULT FALSE,
	`paths` TEXT NOT NULL,
	`advanced_config` TEXT NOT NULL,
	`status` VARCHAR(50) NOT NULL DEFAULT '',
	`error_message` TEXT NOT NULL,
	`is_disabled` BOOLEAN NOT NULL DEFAULT FALSE,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`nginx_template_id`) REFERENCES `nginx_template`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstream`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificate`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`access_list_id`) REFERENCES `access_list`(`id`) ON DELETE CASCADE
);

-- migrate:down

-- Not allowed to go down from initial
