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
| **workflow_run** | After **Docker image** succeeds on `develop` → deploy `:develop` |

Runs on `[self-hosted, linux, gen]` with Infisical OIDC (same secrets as image build):

| Infisical | Keys |
|-----------|------|
| `/Docker` | `docker.io-user`, `docker.io-token` |
| `/Ansible` | `ansible-ssh-private-key` |
| Signing project `fca9f329-3988-40f8-a695-89fde921fc4d` | `ssh-user-ca-private-key` |

SSH user: **`automation`** with short-lived certificate (principal `automation`).

## Target host requirements

- Rocky Linux / RHEL 9 family (`dnf`) — adjust role if the VM is Ubuntu
- `automation` user trusted via your SSH CA
- Reachable from **general-alexson** gen runners on the management network

## Inventory

Copy and edit if needed:

```bash
cp deploy/ansible/inventory/inventory.yml.example deploy/ansible/inventory/inventory.yml
```

## Local Ansible

```bash
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
ansible-playbook playbook.yml -i inventory/inventory.yml.example \
  --limit oci-test.eh168.alexson.org \
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
