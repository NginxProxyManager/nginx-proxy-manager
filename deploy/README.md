# Optional Ansible deployment

Example playbook to install **Docker Engine**, run **`jc21/nginx-proxy-manager`** with Docker Compose, and enable a **systemd** unit on a test or staging host.

## What gets installed

| Item | Path / name |
|------|-------------|
| Install root | `/opt/nginx-proxy-manager` (configurable) |
| Compose file | `docker-compose.yml` |
| systemd unit | `nginx-proxy-manager.service` |
| Data | `./data`, `./letsencrypt` under install root |
| Ports | 80, 81, 443 (firewalld if enabled) |

After deploy, open the admin UI at **`http://<your-host>:81`**. Bundled documentation is at **`/documentation`** and **`/docs/`** on the same host. Swagger “Try it out” works without extra nginx when `/api` is on the same origin.

To serve docs on another hostname, see [`nginx/docs-api-proxy.conf.example`](nginx/docs-api-proxy.conf.example).

## Prerequisites

- Rocky Linux / RHEL 9 family (`dnf`) or adjust the role for your distribution
- SSH access with sudo (or become) for the target user
- Docker Hub pull access for `jc21/nginx-proxy-manager`

## Inventory

Copy [`ansible/inventory/inventory.yml.example`](ansible/inventory/inventory.yml.example) to `inventory/hosts.yml` and set `ansible_host` to your server. Use an inventory group name **without hyphens** in `--limit` (for example `npm_hosts`), because Ansible treats hyphens in limit patterns specially.

Provide registry credentials and SSH keys via your secret store or Ansible vault — do not commit secrets to the repository.

## Run the playbook

```bash
cd deploy/ansible
pip install "ansible-core>=2.17,<2.18"
ansible-playbook playbook.yml -i inventory/hosts.yml \
  --limit npm_hosts \
  -e ansible_user=your_ssh_user \
  -e npm_test_image=jc21/nginx-proxy-manager:latest \
  --ask-become-pass
```

Tags: `--tags docker` (Docker only), `--tags npm` (application + systemd).

## Operations on the server

```bash
sudo systemctl status nginx-proxy-manager
sudo systemctl restart nginx-proxy-manager
cd /opt/nginx-proxy-manager && sudo docker compose pull && sudo docker compose up -d
```

Variable names and paths are defined under [`ansible/roles/npm_test/`](ansible/roles/npm_test/) and [`ansible/group_vars/all.yml`](ansible/group_vars/all.yml).
