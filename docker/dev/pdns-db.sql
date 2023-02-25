CREATE TABLE `comments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `domain_id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `type` varchar(10) NOT NULL,
  `modified_at` int(11) NOT NULL,
  `account` varchar(40) DEFAULT NULL,
  `comment` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `comments_name_type_idx` (`name`,`type`),
  KEY `comments_order_idx` (`domain_id`,`modified_at`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

CREATE TABLE `cryptokeys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `domain_id` int(11) NOT NULL,
  `flags` int(11) NOT NULL,
  `active` tinyint(1) DEFAULT NULL,
  `published` tinyint(1) DEFAULT 1,
  `content` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `domainidindex` (`domain_id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

CREATE TABLE `domainmetadata` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `domain_id` int(11) NOT NULL,
  `kind` varchar(32) DEFAULT NULL,
  `content` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `domainmetadata_idx` (`domain_id`,`kind`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

INSERT INTO `domainmetadata` VALUES (1,1,'SOA-EDIT-API','DEFAULT');

CREATE TABLE `domains` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `master` varchar(128) DEFAULT NULL,
  `last_check` int(11) DEFAULT NULL,
  `type` varchar(6) NOT NULL,
  `notified_serial` int(10) unsigned DEFAULT NULL,
  `account` varchar(40) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name_index` (`name`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

INSERT INTO `domains` VALUES (1,'example.com','',NULL,'NATIVE',NULL,'');

CREATE TABLE `records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `domain_id` int(11) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `type` varchar(10) DEFAULT NULL,
  `content` TEXT DEFAULT NULL,
  `ttl` int(11) DEFAULT NULL,
  `prio` int(11) DEFAULT NULL,
  `disabled` tinyint(1) DEFAULT 0,
  `ordername` varchar(255) DEFAULT NULL,
  `auth` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `nametype_index` (`name`,`type`),
  KEY `domain_id` (`domain_id`),
  KEY `ordername` (`ordername`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;

INSERT INTO `records` VALUES
(1,1,'example.com','NS','ns1.pdns',1500,0,0,NULL,1),
(2,1,'example.com','NS','ns2.pdns',1500,0,0,NULL,1),
(4,1,'test.example.com','A','10.0.0.1',60,0,0,NULL,1),
(5,1,'example.com','SOA','a.misconfigured.dns.server.invalid hostmaster.example.com 2022020702 10800 3600 604800 3600',1500,0,0,NULL,1);

CREATE TABLE `supermasters` (
  `ip` varchar(64) NOT NULL,
  `nameserver` varchar(255) NOT NULL,
  `account` varchar(40) NOT NULL,
  PRIMARY KEY (`ip`,`nameserver`)
) DEFAULT CHARSET=latin1;

CREATE TABLE `tsigkeys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) DEFAULT NULL,
  `algorithm` varchar(50) DEFAULT NULL,
  `secret` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `namealgoindex` (`name`,`algorithm`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
