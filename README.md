# open-appsec NPM Proxy Manager integration (beta)

This is the repository for the beta release of the new integration of open-appsec WAF with NGINX Proxy Manager.
This will allow NGINX Proxy Manager (NPM) users to protect their web applications and web APIs exposed by NGINX Proxy Manager by easily activating and configuring open-appsec protection for each of the configured Proxy Host objects in NPM directly from the NPM Web UI and monitor security events.

### NGINX Proxy Manager
Nginx Proxy Manager is a popular open-source project that simplifies the management of NGINX reverse proxy configurations, offering a user-friendly web-based interface for easy setup and maintenance. It was created by “jc21”.
This project is particularly useful for individuals and organizations looking to streamline the deployment of web applications and services by efficiently managing multiple domains and subdomains through a centralized interface.
With NGINX Proxy Manager, users can effortlessly create and manage SSL certificates, enabling secure HTTPS connections for their applications, while also providing advanced features such as Let's Encrypt integration for automated certificate renewal.
NGINX Proxy Manager (NPM) is based on NGINX and provided as a container image that can be easily deployed in containerized environments like Docker (typically using Docker Compose) or others.
NPM itself does not include any WAF solution for effective Threat Prevention against modern attacks or Zero-day attacks.

Website and Docs: https://nginxproxymanager.com  
Github: https://github.com/NginxProxyManager 

### open-appsec WAF:

open-appsec WAF provides automatic, preemptive threat prevention for reverse proxies like NGINX. It is machine learning based, which means it doesn’t require signatures (or updating them) at all. This enables it to provide state-of-the art threat prevention even for true zero-day attacks and to significantly reduce administrative effort while strongly reducing the amount of false-positives.
open-appsec is a perfect fit to provide advanced threat prevention to the services exposed by NGINX Proxy Manager.

Website: 			https://www.openappsec.io  
Github: 			https://github.com/openappsec  
Docs: 		    https://docs.openappsec.io 


### Integration of open-appsec WAF with NGINX Proxy Manager:
This new integration not only closes the security gap caused by the soon-end-of-life ModSecurity but provides a modern, strong protection alternative in the form of open-appsec, a preemptive, machine-learning-based, fully automatic WAF that does not rely on signatures at all.
While developing this integration we focused on maximum simplicity to maintain the low entry barrier of the NGINX proxy manager (NPM) project.
The actual deployment of NPM with open-appsec is performed using a slightly enhanced docker-compose file (see below) and configuring open-appsec can be done from an enhanced NPM Web UI interface to which the relevant configuration options for the open-appsec WAF, as well as an option to view the open-appsec logs, were added.

Documentation: https://docs.openappsec.io/integrations/nginx-proxy-manager-integration

# Deployment:
Before you start, make sure to have a Linux environment with Docker and Docker Compose available.
To deploy NGINX Proxy Manager with open-appsec integration follow the steps below:
1. Within the directory which you want to use for the deployment:
Create a folder appsec-localconfig which will hold the appsec declarative configuration file (this will be managed by the enhanced NPM WebUI)
```
mkdir ./appsec-localconfig
```
2.    Download the initial declarative configuration file for open-appsec into that folder.  
This will be managed from the NPM WebUI.
```
wget https://raw.githubusercontent.com/openappsec/open-appsec-npm/main/deployment/local_policy.yaml
 -O ./appsec-localconfig/local_policy.yaml
```
3.    Create a docker-compose.yaml file with the content below, it can be downloaded as follows:
```
wget https://raw.githubusercontent.com/openappsec/open-appsec-npm/main/deployment/docker-compose.yaml
docker-compose.yaml content:
version: '3.8'
# docker compose for npm open-appsec integration
services:
  appsec-npm:
    container_name: appsec-npm
    image: 'ghcr.io/openappsec/open-appsec-npm:latest'
    ipc: host
    restart: unless-stopped
    ports:
      - '80:80' # Public HTTP Port
      - '443:443' # Public HTTPS Port
      - '81:81' # Admin Web Port
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
      - ./appsec-logs:/ext/appsec-logs
      - ./appsec-localconfig:/ext/appsec

  appsec-agent:
    container_name: appsec-agent
    image: 'ghcr.io/openappsec/agent:latest'
    network_mode: service:appsec-npm
    ipc: host
    restart: unless-stopped
    environment:
      # adjust with your own email below
      - user_email=user@email.com
      - nginxproxymanager=true
      - autoPolicyLoad=true
    volumes:
      - ./appsec-config:/etc/cp/conf
      - ./appsec-data:/etc/cp/data
      - ./appsec-logs:/var/log/nano_agent
      - ./appsec-localconfig:/ext/appsec
    command: /cp-nano-agent --standalone
```
4. Run docker-compose up to start the deployment of all relevant containers:
```
docker-compose up
```
5. Check if the appsec-npm and the appsec-agent containers are up and running:
```
docker ps
```
Congratulations, now you are all set and you can login with your web browser to the WebUI of NGINX Proxy Manager with open-appsec integration as follows:
```
http://[hostname or IP of your host]:81
```

# Configuration
To learn how to use NGINX Proxy Manager (NPM) please see project documentation, as NPM usage and configuration will not be explained here:
https://nginx-proxy-manager.com

Once you created a new Proxy Host within NGINX Proxy Manager WebUI you can now easily enable and configure open-appsec protection (see also screenshot below):
1. Enable open-appsec by flipping the “open-appsec” switch to enabled.
2. Select the Enforcement Mode, it can be either “Prevent-Learn” or “Detect-Learn”
3. Select the minimum confidence level for open-appsec to prevent an attack (only relevant when in prevent mode), it can be either “Critical”, “High” or “Medium” confidence.
4. Click “Save”

![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/2704d0dd-a4b6-44bd-adc0-3759c74bd702)

If you want to check out the open-appsec Logs click on the new menu option “Security Log” which allows you to view the open-appsec specific logs directly from the NPM Web UI:

[TBD ADD SCREENSHOT LOG VIEW]

This was just a very basic overview to get you started, there's many more things you can configure as part of the open-appsec NGINX Proxy Manager integration.

**You find the full documentation including FAQ here:  
https://docs.openappsec.io/integrations/nginx-proxy-manager-integration/**

# Compilation Instructions

**Important: In order to deploy and use the open-appsec NGINX Proxy Manager integration you do not have to compile the code yourself.**
We offer a pre-compiled ready-to-use "open-appsec-npm" container (see above in the "Deployment" section).

## Prerequisites
- Linux Machine
- Precompiled libraries for open-appsec Attachment for the specific version of NGINX Proxy Manager  
You find the detailed compilation instructions in this repo:
https://github.com/openappsec/attachment  
Make sure to compile the attachment using a container with the exact same OS version as used in the NPM container version you want to build the integration upon and provide also the NGINX version information from that container.
libngx_module.so  libosrc_compression_utils.so  libosrc_nginx_attachment_util.so  libosrc_shmem_ipc.so

## Preparations
Clone this repository to your local Linux machine:
```
git clone https://github.com/openappsec/open-appsec-npm.git
```

Change into the open-appsec-npm directory:
```
cd open-appsec-npm
```

Create a folder for the already compiled libraries for the open-appsec attachment:
```
mkdir -r /docker/lib
```

Copy the following already compiled Attachment files (see "Prerequisites" above) into the docker/lib/ folder:
```
libngx_module.so 
libosrc_nginx_attachment_util.so 
libosrc_compression_utils.so
libosrc_shmem_ipc.so 
```

Compilation - Build the Frontend: 
---
```
cd scripts/ci 
bash frontend-build
```

Build the open-appsec-npm Container Image: 
--
```
cd ../..
docker buildx build --load -t open-appsec-npm -f docker/Dockerfile . 
```

**Congratulations, you have successfully built your own open-appsec-npm container.**  
You can deploy it now by specifying it within the docker-compose.yaml file.
You find the deployment instructions above in the "Deployment" section.  
If you also want to build your own open-appsec Agent container you find the instructions in this repo:  
https://github.com/openappsec/openappsec

# Contributing
We welcome everyone that wishes to share their knowledge and expertise to enhance and expand this project.

Please see the [Contributing Guidelines](https://github.com/openappsec/openappsec/blob/main/CONTRIBUTING.md).

# License
open-appsec is open source and available under Apache 2.0 license.

The basic ML model is open source and available under Apache 2.0 license.

The advanced ML model is open source and available under Machine Learning Model license, available upon download in the tar file.

# Final notes

We hope this integration will be useful for you and provide you easy-to-configure yet highly effective protection based on open-appsec for your web services or web APIs against known and especially unknown, zero day attacks!

If you have any questions, feedback or need assistance with some issue you can
- contact us at info@openappsec.io 
- contact us using the chat on our project website https://www.openappsec.io
- open an issue in the GitHub project
