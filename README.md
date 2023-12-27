# open-appsec NPM Proxy Manager integration (beta)

This is the repository for the beta release of the new integration of open-appsec WAF with NGINX Proxy Manager.
This will allow NGINX Proxy Manager (NPM) users to protect their web applications and web APIs exposed by NGINX Proxy Manager by easily activating and configuring open-appsec protection for each of the configured Proxy Host objects in NPM directly from the NPM Web UI and also to monitor security events.
This new integration of open-appsec WAF with NGINX Proxy Manager not only closes the security gap caused by the soon end-of-life ModSecurity WAF, but provides a modern, strong protection alternative in form of open-appsec, a preemptive, machine-learning based, fully automatic WAF that does not rely on signatures at all.

### NGINX Proxy Manager
Nginx Proxy Manager is a popular open-source project that simplifies the management of NGINX reverse proxy configurations, offering a user-friendly web-based interface for easy setup and maintenance. It was created by “jc21” (https://www.jc21.com).
This project is particularly useful for individuals and organizations looking to streamline the deployment of web applications and services by efficiently managing multiple domains and subdomains through a centralized interface.
With NGINX Proxy Manager, users can effortlessly create and manage SSL certificates, enabling secure HTTPS connections for their applications, while also providing advanced features such as Let's Encrypt integration for automated certificate renewal.
NGINX Proxy Manager (NPM) is based on NGINX and provided as a container image that can be easily deployed in containerized environments like Docker (typically using Docker Compose) or others.
NPM itself does not include any WAF solution for effective Threat Prevention against modern attacks or Zero-day attacks.

Website and Docs: https://nginxproxymanager.com  
Github:           https://github.com/NginxProxyManager 

### open-appsec WAF:

open-appsec WAF provides automatic, preemptive threat prevention for reverse proxies like NGINX. It is machine learning based, which means it doesn’t require signatures (or updating them) at all. This enables it to provide state-of-the-art threat prevention even for true zero-day attacks while significantly reducing both, administrative effort as well as the amount of false-positives.
open-appsec therefore is a great fit to provide advanced threat prevention to the services exposed by NGINX Proxy Manager.

Website: 	     		https://www.openappsec.io  
Github: 			      https://github.com/openappsec  
Docs: 		         https://docs.openappsec.io 

### Integration of open-appsec WAF with NGINX Proxy Manager:

With this integration we are focusing on maximum simplicity for the user to maintain the low entry barrier as a key design principle of the NGINX proxy manager (NPM) project, which we want in the same way to apply also to the addition of open-appsec.

The actual deployment of NPM with open-appsec is performed using a slightly enhanced docker compose file (see below) which also adds the open-appsec agent container to it, which will perform the actual security inspection.
The NGINX proxy manager container deployed as part of the docker compose is using the “open-appsec-npm” image, provided by the open-appsec team, which is based on the regular NPM code but also adds the open-appsec attachment to it as an NGINX module. This attachment enables the connection between the NGINX and the open-appsec agent and provides the HTTP data for inspection to the Agent.
The “open-appsec-npm” container also contains various NPM WebUI enhancements and the integration logic allowing the configuration, administration and monitoring of open-appsec.

You can read more about open-appsec’s Technology here:
https://www.openappsec.io/tech 

After successful deployment you can then activate and configure open-appsec directly from the enhanced NPM Web UI interface to which the most relevant configuration options for the open-appsec WAF as well as an option to view the open-appsec logs have been added.

The resulting architecture with the open-appsec Agent container and the NGINX Proxy Manager container then looks like this:

![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/db4af2d7-c298-4370-899a-0d1d48504d6d)

Documentation: https://docs.openappsec.io/integrations/nginx-proxy-manager-integration

# Deployment Step-by-Step:
Before you start, make sure to have a Linux environment with Docker and Docker Compose suitable with version 3.3 available.
To deploy NGINX Proxy Manager with open-appsec integration follow the steps below:
1. Within the directory which you want to use for the deployment:
Create a folder appsec-localconfig which will hold the appsec declarative configuration file (this will be managed by the enhanced NPM WebUI)
```
mkdir ./appsec-localconfig
```
2.    Download the initial declarative configuration file for open-appsec into that folder.  
This will be managed from the NPM WebUI.
```
wget https://raw.githubusercontent.com/openappsec/open-appsec-npm/main/deployment/local_policy.yaml -O ./appsec-localconfig/local_policy.yaml
```
3.    Create a docker-compose.yaml file with the content below, it can be downloaded as follows:
```
wget https://raw.githubusercontent.com/openappsec/open-appsec-npm/main/deployment/docker-compose.yaml
```
4. Edit the docker-compose.yaml file and replace "user@email.com" with your own email address, so we can provide assistance in case of any issues with the specific deployment in the future and provide information proactively regarding open-appsec.
This is an optional parameter and can be removed. If we send automatic emails there will also be an opt-out option included for receiving similar communication in the future."

6. Run docker-compose up to start the deployment of all relevant containers:
```
docker-compose up -d
```
6. Check if the nginx-proxy-manager-attachment and the appsec-agent containers are up and running:
```
docker ps
```
Congratulations, now you are all set and you can login with your web browser to the WebUI of NGINX Proxy Manager with open-appsec integration as follows:
```
http://[hostname or IP of your host]:81
```
![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/685d8f60-4dc3-4a83-9844-1b52d5d5062e)


At first login please use the following default administrator user credentials:

E-mail address: 	admin@example.com  
Password:		changeme

You will then be prompted to provide your own user details and asked to change the password, before being presented with the NGINX Proxy Manager Dashboard view:

![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/077536bb-9764-48d5-a1ac-50fc593db402)

# Configuration
To learn how to use NGINX Proxy Manager (NPM) please see project documentation, as NPM usage and configuration will not be explained here:
https://nginx-proxy-manager.com

Once you created a new Proxy Host within NGINX Proxy Manager WebUI you can now easily enable and configure open-appsec protection (see also screenshot below):
1. Enable open-appsec by flipping the “open-appsec” switch to enabled.
2. Select the Enforcement Mode, it can be either “Prevent-Learn” or “Detect-Learn”
3. Select the minimum confidence level for open-appsec to prevent an attack (only relevant when in prevent mode), it can be either “Critical”, “High” or “Medium” confidence.
4. Click “Save”
   
![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/d9b6d6b6-0ae5-414f-9546-b78d8a061a53)

This screenshot for example shows a “Proxy Host” reverse proxy configuration in NPM that will listen to inbound traffic for hostnames “100.25.161.101”, “localhost” or “my.webserver.com”.
This “Proxy Host” has open-appsec enabled in “Prevent-Learn” mode and therefore will prevent incoming http or https requests when there’s a minimum confidence level of “High” or higher, as configured for the “Minimum confidence for prevent” setting.
Non-malicious traffic will then be proxied using “http” protocol to the configured backend webserver with the IP address “192.168.160.2” on port “80”.

Note: Changes in the open-appsec configuration performed and saved in the NPM Web UI can take up to 30 seconds before they become effective.

This was just a very basic overview to get you started, there's many more things you can configure as part of the open-appsec NGINX Proxy Manager integration.

If you want to check out the open-appsec Security Logs click on the new menu option “Security Log” which allows you to view the open-appsec specific logs directly from the NPM Web UI:
![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/c30a9f27-9d27-47ab-b9e5-901b332f81fa)

**You find the full documentation including FAQ here:  
https://docs.openappsec.io/integrations/nginx-proxy-manager-integration/**

# Compilation Instructions

**Important: In order to deploy and use the open-appsec NGINX Proxy Manager integration you do not have to compile the code yourself.**
We offer a pre-compiled ready-to-use "open-appsec-npm" container (see above in the "Deployment" section).

## Prerequisites 
- Linux Machine with Docker engine deployed

## Additional perquisites for compiling against other NGINX Proxy Manager version 
Precompiled libraries for open-appsec Attachment for the specific version of NGINX Proxy Manager you want to compile agasint. 
You find the detailed compilation instructions in this repo: https://github.com/openappsec/attachment  

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
### If you are compiling against other NGINX proxy Manager version 
Replace the files in the ```docker/lib``` folder with the libraries you've precompiled. 

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

Please see the [Contributing Guidelines](https://github.com/openappsec/openappsec-npm/blob/main/CONTRIBUTING.md).

# Final notes

We hope this integration will be useful for you and provide you easy-to-configure yet highly effective protection based on open-appsec for your web services or web APIs against known and especially unknown, zero day attacks!

If you have any questions, feedback or need assistance with some issue you can
- contact us at info@openappsec.io 
- contact us using the chat on our project website https://www.openappsec.io
- open an issue in the GitHub project
