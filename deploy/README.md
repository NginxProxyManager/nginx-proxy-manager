# Deploy — NPM test server

Ansible deployment for **`oci-test.eh168.alexson.org`** (image testing): install **Docker Engine**, pull **`docker.io/salexson/nginx-proxy-manager`**, and run it under **systemd** via Docker Compose.

## What gets installed

| Item | Path / name |
|------|-------------|
| Install root | `/opt/nginx-proxy-manager-test` |
| Compose file | `docker-compose.yml` |
| systemd unit | `nginx-proxy-manager-test.service` |
| Data | `./data`, `./letsencrypt` under install root |
| Ports | 80, 81, 443 (firewalld if enabled) |

Admin UI after deploy: **http://oci-test.eh168.alexson.org:81**

## GitHub Actions

Workflow: [`.github/workflows/deploy-test-server.yml`](../.github/workflows/deploy-test-server.yml)

| Trigger | When |
|---------|------|
| **workflow_dispatch** | Manual — choose host, image tag, tags, check mode |
| **workflow_run** | After **Docker image** succeeds on `develop` (runs only when `docker/Dockerfile` changed or manual/tag build) → deploy `:develop` |

Runs on `[self-hosted, linux, gen]` with Infisical OIDC (same secrets as image build):

| Infisical | Keys |
|-----------|------|
| `/Docker` | `docker.io-user`, `docker.io-token` |
| `/Ansible` | `ansible-ssh-private-key`, `ansible-ssh-public-key` (public optional; derived from private if omitted) |

SSH user: **`automation`** using the **private key** (no SSH CA certificates yet). Ensure the matching **public key** is in `~automation/.ssh/authorized_keys` on the target host.

## Target host requirements

- Rocky Linux / RHEL 9 family (`dnf`) — adjust role if the VM is Ubuntu
- `automation` user with your Ansible **public key** in `authorized_keys`
- Reachable from **general-alexson** gen runners on the management network

## Inventory

Committed: [`deploy/ansible/inventory/hosts.yml`](ansible/inventory/hosts.yml)

| Inventory name | Connects to |
|----------------|-------------|
| `oci_test` | `oci-test.eh168.alexson.org` |

Use `--limit oci_test` (underscore), not the FQDN — hyphens in `--limit` are parsed as exclusion patterns by Ansible.

## Local Ansible

```bash
cd deploy/ansible
pip install "ansible>=9,<11"
ansible-playbook playbook.yml -i inventory/hosts.yml \
  --limit oci_test \
  -e ansible_user=automation \
  -e npm_test_image=docker.io/salexson/nginx-proxy-manager:develop \
  --ask-become-pass
```

Tags: `--tags docker` (Docker only), `--tags npm` (app + systemd only).

## Operations on the server

```bash
sudo systemctl status nginx-proxy-manager-test
sudo systemctl restart nginx-proxy-manager-test
cd /opt/nginx-proxy-manager-test && sudo docker compose pull && sudo docker compose up -d
```
