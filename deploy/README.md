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

Admin UI after deploy: **http://oci-test.lab.eh168.alexson.org:81**

Bundled documentation: **http://oci-test.lab.eh168.alexson.org:81/documentation** (in-app) and **http://oci-test.lab.eh168.alexson.org:81/docs/** (static VitePress). Swagger “Try it out” works on that host without extra nginx because `/api` is the same origin.

To serve docs on a **different** hostname and proxy API calls, use [`nginx/docs-api-proxy.conf.example`](nginx/docs-api-proxy.conf.example).

Compose sets `DISABLE_IPV6=true` on the test host when the kernel has no IPv6.

## Secrets and SSH

Registry and deploy credentials are expected from your secret store (for example Infisical paths `/Docker` for `docker.io` login and `/Ansible` for SSH keys). Do not commit keys in the repo.

SSH user: **`automation`** using the **private key**. Ensure the matching **public key** is in `~automation/.ssh/authorized_keys` on the target host.

For automated runs you may set `ANSIBLE_CONFIG=ansible.ci.cfg` (see [`ansible/ansible.ci.cfg`](ansible/ansible.ci.cfg)); local runs against `oci_test` use the committed inventory SSH options.

## Target host requirements

- Rocky Linux / RHEL 9 family (`dnf`) — adjust role if the VM is Ubuntu
- `automation` user with your Ansible **public key** in `authorized_keys`
- Reachable from your management network (where you run Ansible)

## Inventory

Committed: [`deploy/ansible/inventory/hosts.yml`](ansible/inventory/hosts.yml)

| Inventory name | Connects to |
|----------------|-------------|
| `oci_test` | `oci-test.lab.eh168.alexson.org` (see `inventory/hosts.yml`) |

Use `--limit oci_test` (underscore), not the FQDN — hyphens in `--limit` are parsed as exclusion patterns by Ansible.

## Local Ansible

```bash
cd deploy/ansible
pip install "ansible-core>=2.17,<2.18"
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
