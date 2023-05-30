-- migrate:up

CREATE TABLE IF NOT EXISTS `jwt_keys`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`public_key` TEXT NOT NULL,
	`private_key` TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `user`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`name` VARCHAR(50) NOT NULL,
	`nickname` VARCHAR(50) NOT NULL,
	`email` VARCHAR(255) NOT NULL,
	`is_system` INT NOT NULL DEFAULT 0,
	`is_disabled` INT NOT NULL DEFAULT 0
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
	FOREIGN KEY (`capability_name`) REFERENCES `capability`(`name`)
);

CREATE TABLE IF NOT EXISTS `auth`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL,
	`secret` VARCHAR(255) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	UNIQUE (`user_id`, `type`)
);

CREATE TABLE IF NOT EXISTS `setting`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
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
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`object_type` VARCHAR(50) NOT NULL,
	`object_id` INT NOT NULL,
	`action` VARCHAR(50) NOT NULL,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS `certificate_authority`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`name` VARCHAR(50) NOT NULL,
	`acmesh_server` VARCHAR(255) NOT NULL DEFAULT '',
	`ca_bundle` VARCHAR(255) NOT NULL DEFAULT '',
	`is_wildcard_supported` INT NOT NULL DEFAULT 0, -- specific to each CA, acme v1 doesn't usually have wildcards
	`max_domains` INT NOT NULL DEFAULT 5, -- per request
	`is_readonly` INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `dns_provider`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`acmesh_name` VARCHAR(50) NOT NULL,
	`dns_sleep` INT NOT NULL DEFAULT 0,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS certificate
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL, -- custom,dns,http
	`certificate_authority_id` INT, -- 0 for a custom cert
	`dns_provider_id` INT, -- 0, for a http or custom cert
	`name` VARCHAR(50) NOT NULL,
	`domain_names` TEXT NOT NULL,
	`expires_on` INT DEFAULT 0,
	`status` VARCHAR(50) NOT NULL, -- ready,requesting,failed,provided
	`error_message` TEXT NOT NULL,
	`meta` TEXT NOT NULL,
	`is_ecc` INT NOT NULL DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	FOREIGN KEY (`certificate_authority_id`) REFERENCES `certificate_authority`(`id`),
	FOREIGN KEY (`dns_provider_id`) REFERENCES `dns_provider`(`id`)
);

CREATE TABLE IF NOT EXISTS `stream`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`listen_interface` VARCHAR(50) NOT NULL,
	`incoming_port` INT NOT NULL,
	`tcp_forwarding` INT NOT NULL DEFAULT 0,
	`udp_forwarding` INT NOT NULL DEFAULT 0,
	`advanced_config` TEXT NOT NULL,
	`is_disabled` INT NOT NULL DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS `nginx_template`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
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
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`nginx_template_id` INT NOT NULL,
	`ip_hash` INT NOT NULL DEFAULT 0,
	`ntlm` INT NOT NULL DEFAULT 0,
	`keepalive` INT NOT NULL DEFAULT 0,
	`keepalive_requests` INT NOT NULL DEFAULT 0,
	`keepalive_time` VARCHAR(50) NOT NULL DEFAULT '',
	`keepalive_timeout` VARCHAR(50) NOT NULL DEFAULT '',
	`advanced_config` TEXT NOT NULL,
	`status` VARCHAR(50) NOT NULL DEFAULT '',
	`error_message` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	FOREIGN KEY (`nginx_template_id`) REFERENCES `nginx_template`(`id`)
);

CREATE TABLE IF NOT EXISTS `upstream_server`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`upstream_id` INT NOT NULL,
	`server` VARCHAR(50) NOT NULL,
	`weight` INT NOT NULL DEFAULT 0,
	`max_conns` INT NOT NULL DEFAULT 0,
	`max_fails` INT NOT NULL DEFAULT 0,
	`fail_timeout` INT NOT NULL DEFAULT 0,
	`is_backup` INT NOT NULL DEFAULT 0,
	FOREIGN KEY (`upstream_id`) REFERENCES `upstream`(`id`)
);

CREATE TABLE IF NOT EXISTS `access_list`
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`name` VARCHAR(50) NOT NULL,
	`meta` TEXT NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`)
);

CREATE TABLE IF NOT EXISTS host
(
	`id` INT AUTO_INCREMENT PRIMARY KEY,
	`created_at` BIGINT NOT NULL DEFAULT 0,
	`updated_at` BIGINT NOT NULL DEFAULT 0,
	`is_deleted` INT NOT NULL DEFAULT 0,
	`user_id` INT NOT NULL,
	`type` VARCHAR(50) NOT NULL,
	`nginx_template_id` INT NOT NULL,
	`listen_interface` VARCHAR(50) NOT NULL DEFAULT '',
	`domain_names` TEXT NOT NULL,
	`upstream_id` INT NOT NULL DEFAULT 0,
	`proxy_scheme` VARCHAR(50) NOT NULL DEFAULT '',
	`proxy_host` VARCHAR(50) NOT NULL DEFAULT '',
	`proxy_port` INT NOT NULL DEFAULT 0,
	`certificate_id` INT NOT NULL DEFAULT 0,
	`access_list_id` INT NOT NULL DEFAULT 0,
	`ssl_forced` INT NOT NULL DEFAULT 0,
	`caching_enabled` INT NOT NULL DEFAULT 0,
	`block_exploits` INT NOT NULL DEFAULT 0,
	`allow_websocket_upgrade` INT NOT NULL DEFAULT 0,
	`http2_support` INT NOT NULL DEFAULT 0,
	`hsts_enabled` INT NOT NULL DEFAULT 0,
	`hsts_subdomains` INT NOT NULL DEFAULT 0,
	`paths` TEXT NOT NULL,
	`advanced_config` TEXT NOT NULL,
	`status` VARCHAR(50) NOT NULL DEFAULT '',
	`error_message` TEXT NOT NULL,
	`is_disabled` INT NOT NULL DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`),
	FOREIGN KEY (`nginx_template_id`) REFERENCES `nginx_template`(`id`),
	FOREIGN KEY (`upstream_id`) REFERENCES `upstream`(`id`),
	FOREIGN KEY (`certificate_id`) REFERENCES `certificate`(`id`),
	FOREIGN KEY (`access_list_id`) REFERENCES `access_list`(`id`)
);

-- migrate:down

-- Not allowed to go down from initial
