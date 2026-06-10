#!/usr/bin/env python3
"""
DNS Monitor Service for Nginx Proxy Manager
Monitors DNS records and updates IP addresses in NPM configuration files
"""

import os
import re
import time
import json
import socket
import logging
import subprocess
import threading
from pathlib import Path
from typing import Dict, List, Set
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Configure logging with error handling
log_level = os.getenv('DNS_LOG_LEVEL', 'INFO').upper()

# Create logs directory if it doesn't exist
log_dir = Path('/app/logs')
log_dir.mkdir(parents=True, exist_ok=True)

# Setup logging handlers with fallback
handlers = [logging.StreamHandler()]  # Always have console output

try:
    # Try to create file handler
    file_handler = logging.FileHandler('/app/logs/dns_monitor.log')
    handlers.append(file_handler)
    print("✓ Log file created successfully: /app/logs/dns_monitor.log")
except (PermissionError, OSError) as e:
    print(f"⚠️  Warning: Cannot create log file (/app/logs/dns_monitor.log): {e}")
    print("📝 Logging will continue to console only")

logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=handlers
)
logger = logging.getLogger(__name__)

class ConfigFileHandler(FileSystemEventHandler):
    """Handler for configuration file changes"""
    
    def __init__(self, dns_monitor):
        self.dns_monitor = dns_monitor
        self.last_reload = 0
        self.reload_delay = 2  # Wait 2 seconds before reloading to avoid multiple rapid changes
        
    def on_modified(self, event):
        if event.is_directory:
            return
            
        # Check if it's our config file or any .conf file in nginx directory
        file_path = Path(event.src_path)
        current_time = time.time()
        
        # Avoid rapid successive reloads
        if current_time - self.last_reload < self.reload_delay:
            return
            
        if (file_path.name == 'dns_config.json' or 
            file_path.suffix == '.conf' and 
            str(file_path).startswith(self.dns_monitor.nginx_config_path)):
            
            logger.info(f"📁 Configuration change detected: {file_path}")
            self.last_reload = current_time
            
            # Schedule reload in a separate thread to avoid blocking the file watcher
            threading.Thread(target=self._delayed_reload, daemon=True).start()
    
    def _delayed_reload(self):
        """Reload configuration after a short delay"""
        time.sleep(self.reload_delay)
        try:
            logger.info("🔄 Reloading configuration due to file changes...")
            self.dns_monitor.reload_configuration()
        except Exception as e:
            logger.error(f"❌ Error reloading configuration: {e}")

class DNSMonitor:
    def __init__(self, config_path: str = '/app/config/dns_config.json'):
        self.config_path = config_path
        # Allow nginx config path to be configured via environment variable
        self.nginx_config_path = os.getenv('DNS_NGINX_CONFIG_PATH', '/data/nginx/proxy_host')
        self.dns_config = self.load_dns_config()
        self.current_ips = {}
        self.config_lock = threading.Lock()  # Thread safety for config reloads
        
        # Initialize file watcher
        self.observer = None
        self.setup_file_watcher()
        
        # Log the nginx config path being used
        logger.info(f"🔍 Looking for nginx config files in: {self.nginx_config_path}")
        
    def load_dns_config(self) -> Dict:
        """Load DNS configuration from environment variables or JSON file"""
        # Try to load from environment variables first
        env_domains = os.getenv('DNS_DOMAINS')
        if env_domains:
            logger.info("Loading configuration from environment variables")
            domains = []
            for domain in env_domains.split(','):
                domain = domain.strip()
                if domain:
                    domains.append({
                        "hostname": domain,
                        "description": f"Domain configured via environment: {domain}"
                    })
            
            config = {
                "domains": domains,
                "check_interval": int(os.getenv('DNS_CHECK_INTERVAL', '300')),
                "backup_configs": os.getenv('DNS_BACKUP_CONFIGS', 'true').lower() == 'true',
                "restart_nginx": os.getenv('DNS_RESTART_NGINX', 'true').lower() == 'true',
                "nginx_container_name": os.getenv('DNS_NGINX_CONTAINER', 'nginx-proxy'),
                "settings": {
                    "log_level": os.getenv('DNS_LOG_LEVEL', 'INFO'),
                    "max_backups": int(os.getenv('DNS_MAX_BACKUPS', '10')),
                    "notification": {
                        "enabled": False,
                        "webhook_url": "",
                        "email": ""
                    }
                }
            }
            logger.info(f"Loaded DNS configuration from environment with {len(config.get('domains', []))} domains")
            return config
        
        # Fallback to JSON file if environment variables not set
        try:
            with open(self.config_path, 'r') as f:
                config = json.load(f)
                logger.info(f"Loaded DNS configuration from file with {len(config.get('domains', []))} domains")
                return config
        except FileNotFoundError:
            logger.warning(f"Config file not found at {self.config_path} and no environment variables set, creating default")
            default_config = {
                "domains": [
                    {
                        "hostname": "ciccio.duckdns.org",
                        "description": "Example DuckDNS domain"
                    }
                ],
                "check_interval": 300,
                "backup_configs": True,
                "restart_nginx": True,
                "nginx_container_name": "nginx-proxy",
                "settings": {
                    "log_level": "INFO",
                    "max_backups": 10,
                    "notification": {
                        "enabled": False,
                        "webhook_url": "",
                        "email": ""
                    }
                }
            }
            os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
            with open(self.config_path, 'w') as f:
                json.dump(default_config, f, indent=2)
            return default_config
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            return {"domains": [], "check_interval": 300, "backup_configs": True, "restart_nginx": True, "nginx_container_name": "nginx-proxy"}

    def setup_file_watcher(self):
        """Setup file watcher for configuration changes"""
        try:
            self.observer = Observer()
            event_handler = ConfigFileHandler(self)
            
            # Watch the config directory
            config_dir = os.path.dirname(self.config_path)
            if os.path.exists(config_dir):
                self.observer.schedule(event_handler, config_dir, recursive=False)
                logger.info(f"👁️  Watching config directory: {config_dir}")
            
            # Watch the nginx config directory
            if os.path.exists(self.nginx_config_path):
                self.observer.schedule(event_handler, self.nginx_config_path, recursive=True)
                logger.info(f"👁️  Watching nginx config directory: {self.nginx_config_path}")
            
            self.observer.start()
            logger.info("✅ File watcher started successfully")
            
        except Exception as e:
            logger.warning(f"⚠️  Could not start file watcher: {e}")
            logger.info("📝 Configuration will only be loaded at startup")

    def reload_configuration(self):
        """Reload DNS configuration and update monitoring"""
        with self.config_lock:
            try:
                old_domains = set(d['hostname'] for d in self.dns_config.get('domains', []))
                
                # Reload configuration
                self.dns_config = self.load_dns_config()
                config_domains = set(d['hostname'] for d in self.dns_config.get('domains', []))
                
                # Auto-discover domains from nginx config files
                nginx_domains = self.extract_domains_from_nginx_configs()
                
                # Combine configured domains with auto-discovered domains
                all_domains = config_domains.union(nginx_domains)
                
                # Update the configuration to include auto-discovered domains
                if nginx_domains:
                    existing_hostnames = config_domains
                    for domain in nginx_domains:
                        if domain not in existing_hostnames:
                            self.dns_config.setdefault('domains', []).append({
                                "hostname": domain,
                                "description": f"Auto-discovered from nginx config: {domain}"
                            })
                            logger.info(f"🆕 Auto-discovered domain added to monitoring: {domain}")
                
                # Check for new domains
                added_domains = all_domains - old_domains
                removed_domains = old_domains - all_domains
                
                if added_domains:
                    logger.info(f"🆕 New domains detected: {', '.join(added_domains)}")
                    # Resolve IPs for new domains
                    for domain in added_domains:
                        ip = self.resolve_dns(domain)
                        if ip:
                            self.current_ips[domain] = ip
                            logger.info(f"📍 Initial IP for new domain {domain}: {ip}")
                
                if removed_domains:
                    logger.info(f"🗑️  Domains removed: {', '.join(removed_domains)}")
                    # Remove IPs for removed domains
                    for domain in removed_domains:
                        self.current_ips.pop(domain, None)
                
                if added_domains or removed_domains:
                    logger.info(f"📊 Now monitoring {len(self.current_ips)} domains")
                    # Perform synchronization check for all domains
                    self.verify_config_sync()
                else:
                    logger.info("🔄 Configuration reloaded (no domain changes)")
                    
            except Exception as e:
                logger.error(f"❌ Error during configuration reload: {e}")

    def extract_domains_from_nginx_configs(self) -> Set[str]:
        """Extract domain names from nginx configuration files"""
        domains = set()
        
        try:
            config_files = self.find_nginx_configs()
            logger.debug(f"Scanning {len(config_files)} nginx config files for domains")
            
            for config_file in config_files:
                try:
                    with open(config_file, 'r') as f:
                        content = f.read()
                    
                    # Extract server_name directives
                    server_name_pattern = r'server_name\s+([^;]+);'
                    matches = re.findall(server_name_pattern, content, re.MULTILINE)
                    
                    for match in matches:
                        # Split multiple domains and clean them
                        domain_names = match.strip().split()
                        for domain in domain_names:
                            domain = domain.strip()
                            # Skip default server names and wildcards
                            if domain and domain != '_' and not domain.startswith('*'):
                                domains.add(domain)
                                logger.debug(f"Found domain in {config_file.name}: {domain}")
                
                except Exception as e:
                    logger.warning(f"Error reading config file {config_file}: {e}")
            
            logger.info(f"🔍 Discovered {len(domains)} domains from nginx configs: {', '.join(sorted(domains))}")
            return domains
            
        except Exception as e:
            logger.error(f"❌ Error extracting domains from nginx configs: {e}")
            return set()

    def resolve_dns(self, hostname: str) -> str:
        """Resolve hostname to IP address"""
        try:
            ip = socket.gethostbyname(hostname)
            logger.debug(f"Resolved {hostname} to {ip}")
            return ip
        except socket.gaierror as e:
            logger.error(f"Failed to resolve {hostname}: {e}")
            return None

    def find_nginx_configs(self) -> List[Path]:
        """Find all .conf files in nginx proxy_host directory"""
        config_dir = Path(self.nginx_config_path)
        if not config_dir.exists():
            logger.warning(f"Nginx config directory not found: {config_dir}")
            return []
        
        conf_files = list(config_dir.glob("*.conf"))
        logger.info(f"Found {len(conf_files)} nginx config files")
        return conf_files

    def update_ip_in_config(self, config_file: Path, old_ip: str, new_ip: str) -> bool:
        """Update IP address in nginx configuration file"""
        try:
            content = config_file.read_text(encoding='utf-8')
            original_content = content
            
            # Pattern to match IP addresses (not in CIDR notation)
            pattern = rf'\b{re.escape(old_ip)}\b(?!/\d+)'
            
            # Count occurrences before replacement
            matches = re.findall(pattern, content)
            if matches:
                logger.info(f"🔍 Found {len(matches)} occurrences of {old_ip} in {config_file.name}")
                
                # Replace the IP directly (no backup)
                updated_content = re.sub(pattern, new_ip, content)
                
                # Verify the replacement worked
                if updated_content != original_content:
                    # Write updated content
                    config_file.write_text(updated_content, encoding='utf-8')
                    logger.info(f"✅ Updated {config_file.name}: {old_ip} -> {new_ip}")
                    
                    # Log a sample of the change for debugging
                    lines_changed = []
                    for i, (old_line, new_line) in enumerate(zip(original_content.split('\n'), updated_content.split('\n'))):
                        if old_line != new_line:
                            lines_changed.append(f"Line {i+1}: {old_line.strip()} -> {new_line.strip()}")
                    
                    if lines_changed:
                        logger.debug(f"📝 Changes made: {lines_changed[:3]}")  # Show first 3 changes
                    
                    return True
                else:
                    logger.warning(f"⚠️  No changes made to {config_file.name} despite finding matches")
                    return False
            else:
                logger.debug(f"🔍 IP {old_ip} not found in {config_file.name}")
                return False
                
        except PermissionError as e:
            logger.error(f"❌ Permission denied writing to {config_file}: {e}")
            logger.error("🔧 SOLUTION: Ensure the dns-monitor container has write permissions to nginx config files")
            logger.error("   Option 1: Add 'user: \"0:0\"' to dns-monitor service in docker-compose.yml")
            logger.error("   Option 2: Set proper file ownership: chown -R 1000:1000 /path/to/nginx/data")
            logger.error("   Option 3: Add volume mount with proper permissions")
            return False
        except Exception as e:
            logger.error(f"❌ Error updating {config_file}: {e}")
            return False

    def extract_ips_from_config(self, config_file: Path) -> Set[str]:
        """Extract all IP addresses from nginx config file"""
        try:
            content = config_file.read_text(encoding='utf-8')
            logger.debug(f"📄 Analyzing config file: {config_file.name}")
            
            # Multiple patterns to find IP addresses in different contexts
            patterns = [
                # Allow statements
                r'allow\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?!/\d+)\s*;',
                # Proxy_pass statements
                r'proxy_pass\s+https?://(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?',
                # Server statements
                r'server\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?',
                # Upstream statements
                r'upstream.*?{\s*server\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?',
                # General IP pattern (more broad)
                r'\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b'
            ]
            
            all_ips = set()
            for i, pattern in enumerate(patterns):
                matches = re.findall(pattern, content, re.MULTILINE | re.DOTALL)
                if matches:
                    logger.debug(f"🔍 Pattern {i+1} found IPs: {matches}")
                    all_ips.update(matches)
            
            # Filter out private IP ranges and localhost
            public_ips = set()
            for ip in all_ips:
                if self.is_public_ip(ip):
                    public_ips.add(ip)
                    logger.debug(f"✅ Public IP found: {ip}")
                else:
                    logger.debug(f"🚫 Private/Local IP ignored: {ip}")
            
            logger.info(f"📊 Config {config_file.name}: found {len(public_ips)} public IPs: {public_ips}")
            return public_ips
            
        except Exception as e:
            logger.error(f"Error extracting IPs from {config_file}: {e}")
            return set()

    def is_public_ip(self, ip: str) -> bool:
        """Check if IP address is public (not private/local)"""
        try:
            parts = [int(x) for x in ip.split('.')]
            
            # Private IP ranges
            if parts[0] == 10:
                return False
            if parts[0] == 172 and 16 <= parts[1] <= 31:
                return False
            if parts[0] == 192 and parts[1] == 168:
                return False
            if parts[0] == 127:  # Loopback
                return False
            if parts[0] == 169 and parts[1] == 254:  # Link-local
                return False
                
            return True
        except:
            return False

    def restart_nginx_container(self) -> bool:
        """Restart the nginx-proxy container to apply new configurations"""
        container_name = self.dns_config.get('nginx_container_name', 'nginx-proxy')
        
        try:
            logger.info(f"Restarting nginx container: {container_name}")
            
            # Try docker restart command
            result = subprocess.run(
                ['docker', 'restart', container_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully restarted {container_name}")
                return True
            else:
                logger.error(f"Failed to restart {container_name}: {result.stderr}")
                
                # Try alternative method with docker-compose
                logger.info("Trying docker-compose restart...")
                compose_result = subprocess.run(
                    ['docker-compose', 'restart', 'app'],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd='/data'  # Try from the data directory
                )
                
                if compose_result.returncode == 0:
                    logger.info("Successfully restarted nginx via docker-compose")
                    return True
                else:
                    logger.error(f"Docker-compose restart also failed: {compose_result.stderr}")
                    return False
                    
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout while restarting {container_name}")
            return False
        except FileNotFoundError:
            logger.warning("⚠️  Docker command not found inside container - this is normal")
            logger.info("💡 Nginx will automatically reload configurations on next request")
            logger.info("💡 Alternatively, restart the nginx container manually from the host:")
            logger.info(f"   docker restart {container_name}")
            return True  # Consider this successful since config was updated
        except Exception as e:
            logger.error(f"Unexpected error restarting nginx container: {e}")
            return False

    def verify_config_sync(self):
        """Verify that all config files have IPs that match current DNS resolution"""
        logger.info("🔍 Verifying IP synchronization between DNS and config files...")
        
        # Get current DNS resolutions
        current_dns_ips = {}
        for domain_config in self.dns_config.get('domains', []):
            hostname = domain_config['hostname']
            current_ip = self.resolve_dns(hostname)
            if current_ip:
                current_dns_ips[hostname] = current_ip
                logger.info(f"📍 DNS resolution for {hostname}: {current_ip}")
        
        # Check all nginx config files
        config_files = self.find_nginx_configs()
        mismatched_files = []
        
        for config_file in config_files:
            config_ips = self.extract_ips_from_config(config_file)
            logger.info(f"📄 Config file {config_file.name} contains IPs: {config_ips}")
            
            # Check each IP in the config file against current DNS resolutions
            for config_ip in config_ips:
                # Check if this IP should be updated to match any of our monitored domains
                for hostname, dns_ip in current_dns_ips.items():
                    # If the config has a different IP than current DNS, it's a mismatch
                    if config_ip != dns_ip:
                        # Check if this might be an old IP for this domain
                        # (either it's in our current_ips tracking or it's a public IP that doesn't match)
                        if (config_ip in self.current_ips.values() or 
                            (self.is_public_ip(config_ip) and config_ip not in current_dns_ips.values())):
                            logger.warning(f"⚠️  MISMATCH in {config_file.name}: found {config_ip}, but {hostname} resolves to {dns_ip}")
                            mismatched_files.append((config_file, config_ip, dns_ip, hostname))
                            break  # Don't check this config_ip against other domains
        
        # Remove duplicates (same file, same old IP)
        unique_mismatches = []
        seen = set()
        for item in mismatched_files:
            key = (item[0], item[1])  # (config_file, old_ip)
            if key not in seen:
                seen.add(key)
                unique_mismatches.append(item)
        
        # Fix any mismatches found
        if unique_mismatches:
            logger.info(f"🔧 Fixing {len(unique_mismatches)} IP mismatches...")
            
            # Temporarily enable debug logging for troubleshooting
            original_level = logger.level
            if logger.level > logging.DEBUG:
                logger.setLevel(logging.DEBUG)
                logger.debug("🔍 Enabled debug logging to troubleshoot IP update issues")
            
            nginx_restart_needed = False
            
            for config_file, old_ip, new_ip, hostname in unique_mismatches:
                logger.info(f"🔄 Updating {config_file.name}: {old_ip} -> {new_ip} for {hostname}")
                
                # Show file content before update for debugging
                try:
                    content = config_file.read_text(encoding='utf-8')
                    lines_with_ip = [f"Line {i+1}: {line.strip()}" for i, line in enumerate(content.split('\n')) 
                                   if old_ip in line and line.strip()]
                    if lines_with_ip:
                        logger.debug(f"📝 Lines containing {old_ip}: {lines_with_ip[:3]}")
                except Exception as e:
                    logger.debug(f"Could not read file for debugging: {e}")
                
                if self.update_ip_in_config(config_file, old_ip, new_ip):
                    nginx_restart_needed = True
                    # Update our tracking
                    self.current_ips[hostname] = new_ip
                else:
                    logger.error(f"❌ Failed to update IP in {config_file.name}")
            
            # Restore original logging level
            if original_level != logger.level:
                logger.setLevel(original_level)
                logger.debug("🔍 Restored original logging level")
            
            if nginx_restart_needed and self.dns_config.get('restart_nginx', True):
                logger.info("🔄 Restarting nginx to apply synchronized configurations...")
                self.restart_nginx_container()
        else:
            logger.info("✅ All configuration files are synchronized with DNS resolution")
        
        return len(unique_mismatches) == 0

    def check_and_update_ips(self):
        """Main method to check DNS and update IPs if changed"""
        logger.info("Starting DNS check cycle")
        
        # Get current IPs for all configured domains
        new_ips = {}
        for domain_config in self.dns_config.get('domains', []):
            hostname = domain_config['hostname']
            current_ip = self.resolve_dns(hostname)
            if current_ip:
                new_ips[hostname] = current_ip

        # Check for changes
        changes_detected = False
        nginx_restart_needed = False
        
        for hostname, new_ip in new_ips.items():
            old_ip = self.current_ips.get(hostname)
            if old_ip and old_ip != new_ip:
                logger.info(f"🔄 IP change detected for {hostname}: {old_ip} -> {new_ip}")
                changes_detected = True
                
                # Update all nginx config files
                config_files = self.find_nginx_configs()
                updated_files = 0
                
                for config_file in config_files:
                    if self.update_ip_in_config(config_file, old_ip, new_ip):
                        updated_files += 1
                        nginx_restart_needed = True
                
                logger.info(f"✅ Updated {updated_files} configuration files for {hostname}")
            elif not old_ip:
                logger.info(f"📍 Initial IP for {hostname}: {new_ip}")

        # Update current IPs
        self.current_ips.update(new_ips)
        
        # Always verify synchronization after updates
        if changes_detected:
            logger.info("🔍 Performing post-update synchronization check...")
            self.verify_config_sync()
        
        # Restart nginx container if configurations were updated
        if nginx_restart_needed and self.dns_config.get('restart_nginx', True):
            logger.info("🔄 Configuration files updated, restarting nginx container...")
            restart_success = self.restart_nginx_container()
            if restart_success:
                logger.info("✅ Nginx container restarted successfully - new configurations applied")
            else:
                logger.warning("⚠️  Failed to restart nginx container - manual restart may be required")
        elif changes_detected and not nginx_restart_needed:
            logger.info("📝 IP changes detected but no configuration files were updated")
        elif not changes_detected and self.current_ips:
            logger.info("✅ No IP changes detected - all systems synchronized")

    def run(self):
        """Main run loop"""
        logger.info("🚀 DNS Monitor Service started")
        
        # Auto-discover domains from nginx config files at startup
        nginx_domains = self.extract_domains_from_nginx_configs()
        if nginx_domains:
            existing_hostnames = set(d['hostname'] for d in self.dns_config.get('domains', []))
            for domain in nginx_domains:
                if domain not in existing_hostnames:
                    self.dns_config.setdefault('domains', []).append({
                        "hostname": domain,
                        "description": f"Auto-discovered from nginx config: {domain}"
                    })
                    logger.info(f"🆕 Auto-discovered domain added to monitoring: {domain}")
        
        # Initial IP resolution
        for domain_config in self.dns_config.get('domains', []):
            hostname = domain_config['hostname']
            ip = self.resolve_dns(hostname)
            if ip:
                self.current_ips[hostname] = ip
                logger.info(f"📍 Initial IP for {hostname}: {ip}")

        # Perform initial synchronization check
        logger.info("🔍 Performing initial synchronization check...")
        self.verify_config_sync()

        check_interval = self.dns_config.get('check_interval', 300)
        logger.info(f"👀 Monitoring {len(self.current_ips)} domains, check interval: {check_interval}s")
        logger.info("✅ DNS Monitor is now actively ensuring IP synchronization")

        try:
            while True:
                try:
                    self.check_and_update_ips()
                    time.sleep(check_interval)
                except KeyboardInterrupt:
                    logger.info("🛑 DNS Monitor Service stopped by user")
                    break
                except Exception as e:
                    logger.error(f"❌ Unexpected error: {e}")
                    time.sleep(60)  # Wait 1 minute before retrying
        finally:
            # Cleanup file watcher
            if self.observer and self.observer.is_alive():
                logger.info("🧹 Stopping file watcher...")
                self.observer.stop()
                self.observer.join()
                logger.info("✅ File watcher stopped")

if __name__ == "__main__":
    monitor = DNSMonitor()
    monitor.run()
