/**
 * This file contains info about available Certbot DNS plugins.
 * This only works for plugins which use the standard argument structure, so:
 * --authenticator <plugin-name> --<plugin-name>-credentials <FILE> --<plugin-name>-propagation-seconds <number>
 *
 * File Structure:
 *
 *  {
 *    cloudflare: {
 *      display_name: "Name displayed to the user",
 *      package_name: "Package name in PyPi repo",
 *      package_version: "Package version in PyPi repo",
 *      dependencies: "Additional dependencies, space separated (as you would pass it to pip install)",
 *      credentials: `Template of the credentials file`,
 *      full_plugin_name: "The full plugin name as used in the commandline with certbot, including prefixes, e.g. 'certbot-dns-njalla:dns-njalla'",
 *    },
 *    ...
 *  }
 *
 */

module.exports = {
	cloudflare: {
		display_name:    'Cloudflare',
		package_name:    'certbot-dns-cloudflare',
		package_version: '1.8.0',
		dependencies:    'cloudflare',
		credentials:     `# Cloudflare API token
dns_cloudflare_api_token = 0123456789abcdef0123456789abcdef01234567`,
		full_plugin_name: 'dns-cloudflare',
	},
	//####################################################//
	cloudxns: {
		display_name:    'CloudXNS',
		package_name:    'certbot-dns-cloudxns',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `dns_cloudxns_api_key = 1234567890abcdef1234567890abcdef
dns_cloudxns_secret_key = 1122334455667788`,
		full_plugin_name: 'dns-cloudxns',
	},
	//####################################################//
	corenetworks: {
		display_name:    'Core Networks',
		package_name:    'certbot-dns-corenetworks',
		package_version: '0.1.4',
		dependencies:    '',
		credentials:     `certbot_dns_corenetworks:dns_corenetworks_username = asaHB12r
certbot_dns_corenetworks:dns_corenetworks_password = secure_password`,
		full_plugin_name: 'certbot-dns-corenetworks:dns-corenetworks',
	},
	//####################################################//
	cpanel: {
		display_name:    'cPanel',
		package_name:    'certbot-dns-cpanel',
		package_version: '0.2.2',
		dependencies:    '',
		credentials:     `certbot_dns_cpanel:cpanel_url = https://cpanel.example.com:2083
certbot_dns_cpanel:cpanel_username = user
certbot_dns_cpanel:cpanel_password = hunter2`,
		full_plugin_name: 'certbot-dns-cpanel:cpanel',
	},
	//####################################################//
	digitalocean: {
		display_name:     'DigitalOcean',
		package_name:     'certbot-dns-digitalocean',
		package_version:  '1.8.0',
		dependencies:     '',
		credentials:      'dns_digitalocean_token = 0000111122223333444455556666777788889999aaaabbbbccccddddeeeeffff',
		full_plugin_name: 'dns-digitalocean',
	},
	//####################################################//
	directadmin: {
		display_name:    'DirectAdmin',
		package_name:    'certbot-dns-directadmin',
		package_version: '0.0.20',
		dependencies:    '',
		credentials:     `directadmin_url = https://my.directadminserver.com:2222
directadmin_username = username
directadmin_password = aSuperStrongPassword`,
		full_plugin_name: 'certbot-dns-directadmin:directadmin',
	},
	//####################################################//
	dnsimple: {
		display_name:     'DNSimple',
		package_name:     'certbot-dns-dnsimple',
		package_version:  '1.8.0',
		dependencies:     '',
		credentials:      'dns_dnsimple_token = MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw',
		full_plugin_name: 'dns-dnsimple',
	},
	//####################################################//
	dnsmadeeasy: {
		display_name:    'DNS Made Easy',
		package_name:    'certbot-dns-dnsmadeeasy',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `dns_dnsmadeeasy_api_key = 1c1a3c91-4770-4ce7-96f4-54c0eb0e457a
dns_dnsmadeeasy_secret_key = c9b5625f-9834-4ff8-baba-4ed5f32cae55`,
		full_plugin_name: 'dns-dnsmadeeasy',
	},
	//####################################################//
	dnspod: {
		display_name:    'DNSPod',
		package_name:    'certbot-dns-dnspod',
		package_version: '0.1.0',
		dependencies:    '',
		credentials:     `certbot_dns_dnspod:dns_dnspod_email = "DNSPOD-API-REQUIRES-A-VALID-EMAIL"
certbot_dns_dnspod:dns_dnspod_api_token = "DNSPOD-API-TOKEN"`,
		full_plugin_name: 'certbot-dns-dnspod:dns-dnspod',
	},
	//####################################################//
	google: {
		display_name:    'Google',
		package_name:    'certbot-dns-google',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `{
"type": "service_account",
...
}`,
		full_plugin_name: 'dns-google',
	},
	//####################################################//
	hetzner: {
		display_name:     'Hetzner',
		package_name:     'certbot-dns-hetzner',
		package_version:  '1.0.4',
		dependencies:     '',
		credentials:      'certbot_dns_hetzner:dns_hetzner_api_token = 0123456789abcdef0123456789abcdef',
		full_plugin_name: 'certbot-dns-hetzner:dns-hetzner',
	},
	//####################################################//
	inwx: {
		display_name:    'INWX',
		package_name:    'certbot-dns-inwx',
		package_version: '2.1.2',
		dependencies:    '',
		credentials:     `certbot_dns_inwx:dns_inwx_url = https://api.domrobot.com/xmlrpc/
certbot_dns_inwx:dns_inwx_username = your_username
certbot_dns_inwx:dns_inwx_password = your_password
certbot_dns_inwx:dns_inwx_shared_secret = your_shared_secret optional`,
		full_plugin_name: 'certbot-dns-inwx:dns-inwx',
	},
	//####################################################//
	ispconfig: {
		display_name:    'ISPConfig',
		package_name:    'certbot-dns-ispconfig',
		package_version: '0.2.0',
		dependencies:    '',
		credentials:     `certbot_dns_ispconfig:dns_ispconfig_username = myremoteuser
certbot_dns_ispconfig:dns_ispconfig_password = verysecureremoteuserpassword
certbot_dns_ispconfig:dns_ispconfig_endpoint = https://localhost:8080`,
		full_plugin_name: 'certbot-dns-ispconfig:dns-ispconfig',
	},
	//####################################################//
	isset: {
		display_name:    'Isset',
		package_name:    'certbot-dns-isset',
		package_version: '0.0.3',
		dependencies:    '',
		credentials:     `certbot_dns_isset:dns_isset_endpoint="https://customer.isset.net/api"
certbot_dns_isset:dns_isset_token="<token>"`,
		full_plugin_name: 'certbot-dns-isset:dns-isset',
	},
	//####################################################//
	linode: {
		display_name:    'Linode',
		package_name:    'certbot-dns-linode',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `dns_linode_key = 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ64
dns_linode_version = [<blank>|3|4]`,
		full_plugin_name: 'dns-linode',
	},
	//####################################################//
	luadns: {
		display_name:    'LuaDNS',
		package_name:    'certbot-dns-luadns',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `dns_luadns_email = user@example.com
dns_luadns_token = 0123456789abcdef0123456789abcdef`,
		full_plugin_name: 'dns-luadns',
	},
	//####################################################//
	netcup: {
		display_name:    'netcup',
		package_name:    'certbot-dns-netcup',
		package_version: '1.0.0',
		dependencies:    '',
		credentials:     `dns_netcup_customer_id  = 123456
dns_netcup_api_key      = 0123456789abcdef0123456789abcdef01234567
dns_netcup_api_password = abcdef0123456789abcdef01234567abcdef0123`,
		full_plugin_name: 'certbot-dns-netcup:dns-netcup',
	},
	//####################################################//
	njalla: {
		display_name:     'Njalla',
		package_name:     'certbot-dns-njalla',
		package_version:  '1.0.0',
		dependencies:     '',
		credentials:      'certbot_dns_njalla:dns_njalla_token = 0123456789abcdef0123456789abcdef01234567',
		full_plugin_name: 'certbot-dns-njalla:dns-njalla',
	},
	//####################################################//
	nsone: {
		display_name:     'NS1',
		package_name:     'certbot-dns-nsone',
		package_version:  '1.8.0',
		dependencies:     '',
		credentials:      'dns_nsone_api_key = MDAwMDAwMDAwMDAwMDAw',
		full_plugin_name: 'dns-nsone',
	},
	//####################################################//
	ovh: {
		display_name:    'OVH',
		package_name:    'certbot-dns-ovh',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = MDAwMDAwMDAwMDAw
dns_ovh_application_secret = MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw
dns_ovh_consumer_key = MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw`,
		full_plugin_name: 'dns-ovh',
	},
	//####################################################//
	powerdns: {
		display_name:    'PowerDNS',
		package_name:    'certbot-dns-powerdns',
		package_version: '0.2.0',
		dependencies:    '',
		credentials:     `certbot_dns_powerdns:dns_powerdns_api_url = https://api.mypowerdns.example.org
certbot_dns_powerdns:dns_powerdns_api_key = AbCbASsd!@34`,
		full_plugin_name: 'certbot-dns-powerdns:dns-powerdns',
	},
	//####################################################//
	rfc2136: {
		display_name:    'RFC 2136',
		package_name:    'certbot-dns-rfc2136',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `# Target DNS server
dns_rfc2136_server = 192.0.2.1
# Target DNS port
dns_rfc2136_port = 53
# TSIG key name
dns_rfc2136_name = keyname.
# TSIG key secret
dns_rfc2136_secret = 4q4wM/2I180UXoMyN4INVhJNi8V9BCV+jMw2mXgZw/CSuxUT8C7NKKFs AmKd7ak51vWKgSl12ib86oQRPkpDjg==
# TSIG key algorithm
dns_rfc2136_algorithm = HMAC-SHA512`,
		full_plugin_name: 'dns-rfc2136',
	},
	//####################################################//
	route53: {
		display_name:    'Route 53 (Amazon)',
		package_name:    'certbot-dns-route53',
		package_version: '1.8.0',
		dependencies:    '',
		credentials:     `[default]
aws_access_key_id=AKIAIOSFODNN7EXAMPLE
aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
		full_plugin_name: 'dns-route53',
	},
	//####################################################//
	vultr: {
		display_name:     'Vultr',
		package_name:     'certbot-dns-vultr',
		package_version:  '1.0.3',
		dependencies:     '',
		credentials:      'certbot_dns_vultr:dns_vultr_key = YOUR_VULTR_API_KEY',
		full_plugin_name: 'certbot-dns-vultr:dns-vultr',
	},
};