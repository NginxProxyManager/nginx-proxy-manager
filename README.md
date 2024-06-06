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

## Deployment Playgrounds (Virtual labs)
You can experiment with the integration of NGINX Proxy Manager and open-appsec using [Playgrounds](https://www.openappsec.io/playground)
![image](https://github.com/openappsec/open-appsec-npm/assets/126462046/f4fdd4ef-e20e-47b2-a1b5-07b5c4a63db6)


