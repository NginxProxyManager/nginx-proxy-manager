#!/usr/bin/env python3
"""
DNS Monitor Management Script
Utility script for managing DNS monitor configuration and testing
"""

import json
import sys
import socket
import argparse
from pathlib import Path

def load_config(config_path='config/dns_config.json'):
    """Load DNS configuration"""
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Configuration file not found: {config_path}")
        return None

def save_config(config, config_path='config/dns_config.json'):
    """Save DNS configuration"""
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Configuration saved to {config_path}")

def add_domain(hostname, description=""):
    """Add a domain to monitor"""
    config = load_config()
    if not config:
        return
    
    # Check if domain already exists
    for domain in config['domains']:
        if domain['hostname'] == hostname:
            print(f"Domain {hostname} already exists in configuration")
            return
    
    # Add new domain
    config['domains'].append({
        'hostname': hostname,
        'description': description
    })
    
    save_config(config)
    print(f"Added domain: {hostname}")

def remove_domain(hostname):
    """Remove a domain from monitoring"""
    config = load_config()
    if not config:
        return
    
    original_count = len(config['domains'])
    config['domains'] = [d for d in config['domains'] if d['hostname'] != hostname]
    
    if len(config['domains']) < original_count:
        save_config(config)
        print(f"Removed domain: {hostname}")
    else:
        print(f"Domain {hostname} not found in configuration")

def list_domains():
    """List all configured domains"""
    config = load_config()
    if not config:
        return
    
    if not config['domains']:
        print("No domains configured")
        return
    
    print("Configured domains:")
    for i, domain in enumerate(config['domains'], 1):
        print(f"  {i}. {domain['hostname']}")
        if domain.get('description'):
            print(f"     Description: {domain['description']}")

def test_dns(hostname=None):
    """Test DNS resolution for configured domains or specific hostname"""
    if hostname:
        domains = [{'hostname': hostname, 'description': 'Test domain'}]
    else:
        config = load_config()
        if not config:
            return
        domains = config['domains']
    
    print("Testing DNS resolution:")
    for domain in domains:
        hostname = domain['hostname']
        try:
            ip = socket.gethostbyname(hostname)
            print(f"  ✓ {hostname} -> {ip}")
        except socket.gaierror as e:
            print(f"  ✗ {hostname} -> Failed: {e}")

def set_interval(interval):
    """Set check interval in seconds"""
    config = load_config()
    if not config:
        return
    
    config['check_interval'] = int(interval)
    save_config(config)
    print(f"Check interval set to {interval} seconds")

def toggle_nginx_restart(enable=None):
    """Enable or disable automatic nginx restart"""
    config = load_config()
    if not config:
        return
    
    if enable is None:
        # Toggle current setting
        current = config.get('restart_nginx', True)
        config['restart_nginx'] = not current
        status = "enabled" if not current else "disabled"
    else:
        config['restart_nginx'] = enable
        status = "enabled" if enable else "disabled"
    
    save_config(config)
    print(f"Automatic nginx restart {status}")

def set_nginx_container(container_name):
    """Set nginx container name"""
    config = load_config()
    if not config:
        return
    
    config['nginx_container_name'] = container_name
    save_config(config)
    print(f"Nginx container name set to: {container_name}")

def main():
    parser = argparse.ArgumentParser(description='DNS Monitor Management')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Add domain command
    add_parser = subparsers.add_parser('add', help='Add domain to monitor')
    add_parser.add_argument('hostname', help='Domain hostname (e.g., example.duckdns.org)')
    add_parser.add_argument('--description', '-d', default='', help='Domain description')
    
    # Remove domain command
    remove_parser = subparsers.add_parser('remove', help='Remove domain from monitoring')
    remove_parser.add_argument('hostname', help='Domain hostname to remove')
    
    # List domains command
    subparsers.add_parser('list', help='List all configured domains')
    
    # Test DNS command
    test_parser = subparsers.add_parser('test', help='Test DNS resolution')
    test_parser.add_argument('hostname', nargs='?', help='Specific hostname to test (optional)')
    
    # Set interval command
    interval_parser = subparsers.add_parser('interval', help='Set check interval')
    interval_parser.add_argument('seconds', type=int, help='Check interval in seconds')
    
    # Nginx restart commands
    restart_parser = subparsers.add_parser('restart', help='Manage nginx restart settings')
    restart_subparsers = restart_parser.add_subparsers(dest='restart_action', help='Restart actions')
    
    restart_subparsers.add_parser('enable', help='Enable automatic nginx restart')
    restart_subparsers.add_parser('disable', help='Disable automatic nginx restart')
    restart_subparsers.add_parser('toggle', help='Toggle automatic nginx restart')
    
    container_parser = restart_subparsers.add_parser('container', help='Set nginx container name')
    container_parser.add_argument('name', help='Container name (e.g., nginx-proxy)')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Create config directory if it doesn't exist
    Path('config').mkdir(exist_ok=True)
    
    if args.command == 'add':
        add_domain(args.hostname, args.description)
    elif args.command == 'remove':
        remove_domain(args.hostname)
    elif args.command == 'list':
        list_domains()
    elif args.command == 'test':
        test_dns(args.hostname)
    elif args.command == 'interval':
        set_interval(args.seconds)
    elif args.command == 'restart':
        if args.restart_action == 'enable':
            toggle_nginx_restart(True)
        elif args.restart_action == 'disable':
            toggle_nginx_restart(False)
        elif args.restart_action == 'toggle':
            toggle_nginx_restart()
        elif args.restart_action == 'container':
            set_nginx_container(args.name)
        else:
            print("Available restart commands: enable, disable, toggle, container")

if __name__ == '__main__':
    main()