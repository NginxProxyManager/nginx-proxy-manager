<p align="center">
	<img src="https://nginxproxymanager.com/github.png">
	<br><br>
	<img src="https://img.shields.io/badge/version-2.9.18-green.svg?style=for-the-badge">
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/stars/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://hub.docker.com/repository/docker/jc21/nginx-proxy-manager">
		<img src="https://img.shields.io/docker/pulls/jc21/nginx-proxy-manager.svg?style=for-the-badge">
	</a>
	<a href="https://gitter.im/nginx-proxy-manager/community">
		<img alt="Gitter" src="https://img.shields.io/gitter/room/nginx-proxy-manager/community?style=for-the-badge">
	</a>
	<a href="https://reddit.com/r/nginxproxymanager">
		<img alt="Reddit" src="https://img.shields.io/reddit/subreddit-subscribers/nginxproxymanager?label=Reddit%20Community&style=for-the-badge">
	</a>
</p>

This project comes as a pre-built docker image that enables you to easily forward to your websites
running at home or otherwise, including free SSL, without having to know too much about Nginx or Letsencrypt.

- [Quick Setup](#quick-setup)
- [Full Setup](https://nginxproxymanager.com/setup/)
- [Screenshots](https://nginxproxymanager.com/screenshots/)

## Project Goal

I created this project to fill a personal need to provide users with a easy way to accomplish reverse
proxying hosts with SSL termination and it had to be so easy that a monkey could do it. This goal hasn't changed.
While there might be advanced options they are optional and the project should be as simple as possible
so that the barrier for entry here is low.

<a href="https://www.buymeacoffee.com/jc21" target="_blank"><img src="http://public.jc21.com/github/by-me-a-coffee.png" alt="Buy Me A Coffee" style="height: 51px !important;width: 217px !important;" ></a>


## Features

- Beautiful and Secure Admin Interface based on [Tabler](https://tabler.github.io/)
- Easily create forwarding domains, redirections, streams and 404 hosts without knowing anything about Nginx
- Free SSL using Let's Encrypt or provide your own custom SSL certificates
- Access Lists and basic HTTP Authentication for your hosts
- Advanced Nginx configuration available for super users
- User management, permissions and audit log


## Hosting your home network

I won't go in to too much detail here but here are the basics for someone new to this self-hosted world.

1. Your home router will have a Port Forwarding section somewhere. Log in and find it
2. Add port forwarding for port 80 and 443 to the server hosting this project
3. Configure your domain name details to point to your home, either with a static ip or a service like DuckDNS or [Amazon Route53](https://github.com/jc21/route53-ddns)
4. Use the Nginx Proxy Manager as your gateway to forward to your other web based services

## Quick Setup

1. Install Docker and Docker-Compose

- [Docker Install documentation](https://docs.docker.com/install/)
- [Docker-Compose Install documentation](https://docs.docker.com/compose/install/)

2. Create a docker-compose.yml file similar to this:

```yml
version: '3'
services:
  app:
    image: 'jc21/nginx-proxy-manager:latest'
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

3. Bring up your stack by running

```bash
docker-compose up -d
```

4. Log in to the Admin UI

When your docker container is running, connect to it on port `81` for the admin interface.
Sometimes this can take a little bit because of the entropy of keys.

[http://127.0.0.1:81](http://127.0.0.1:81)

Default Admin User:
```
Email:    admin@example.com
Password: changeme
```

Immediately after logging in with this default user you will be asked to modify your details and change your password.


## Contributors

Special thanks to the following contributors:

<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
	<tr>
		<td align="center">
			<a href="https://github.com/chaptergy">
				<img src="https://avatars2.githubusercontent.com/u/26956711?s=460&u=7d9adebabb6b4e7af7cb05d98d751087a372304b&v=4" width="80" alt=""/>
				<br /><sub><b>chaptergy</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Indemnity83">
				<img src="https://avatars3.githubusercontent.com/u/35218?s=460&u=7082004ff35138157c868d7d9c683ccebfce5968&v=4" width="80" alt=""/>
				<br /><sub><b>Kyle Klaus</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/theraw">
				<img src="https://avatars1.githubusercontent.com/u/32969774?s=460&u=6b359971e15685fb0359e6a8c065a399b40dc228&v=4" width="80" alt=""/>
				<br /><sub><b>ƬHE ЯAW</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/spalger">
				<img src="https://avatars2.githubusercontent.com/u/1329312?s=400&u=565223e38f1c052afb4c5dcca3fcf1c63ba17ae7&v=4" width="80" alt=""/>
				<br /><sub><b>Spencer</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Xantios">
				<img src="https://avatars3.githubusercontent.com/u/1507836?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Xantios Krugor</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/dpanesso">
				<img src="https://avatars2.githubusercontent.com/u/2687121?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>David Panesso</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/IronTooch">
				<img src="https://avatars3.githubusercontent.com/u/27360514?s=460&u=69bf854a6647c55725f62ecb8d39249c6c0b2602&v=4" width="80" alt=""/>
				<br /><sub><b>IronTooch</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/damianog">
				<img src="https://avatars1.githubusercontent.com/u/2786682?s=460&u=76c6136fae797abb76b951cd8a246dcaecaf21af&v=4" width="80" alt=""/>
				<br /><sub><b>Damiano</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/tfmm">
				<img src="https://avatars3.githubusercontent.com/u/6880538?s=460&u=ce0160821cc4aa802df8395200f2d4956a5bc541&v=4" width="80" alt=""/>
				<br /><sub><b>Russ</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/margaale">
				<img src="https://avatars3.githubusercontent.com/u/20794934?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Marcelo Castagna</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Steven-Harris">
				<img src="https://avatars2.githubusercontent.com/u/7720242?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Steven Harris</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/jlesage">
				<img src="https://avatars0.githubusercontent.com/u/1791123?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Jocelyn Le Sage</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/cmer">
				<img src="https://avatars0.githubusercontent.com/u/412?s=460&u=67dd8b2e3661bfd6f68ec1eaa5b9821bd8a321cd&v=4" width="80" alt=""/>
				<br /><sub><b>Carl Mercier</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/the1ts">
				<img src="https://avatars1.githubusercontent.com/u/84956?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Paul Mansfield</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/OhHeyAlan">
				<img src="https://avatars0.githubusercontent.com/u/11955126?s=460&u=fbaa5a1a4f73ef8960132c703349bfd037fe2630&v=4" width="80" alt=""/>
				<br /><sub><b>OhHeyAlan</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/dogmatic69">
				<img src="https://avatars2.githubusercontent.com/u/94674?s=460&u=ca7647de53145c6283b6373ade5dc94ba99347db&v=4" width="80" alt=""/>
				<br /><sub><b>Carl Sutton</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/tg44">
				<img src="https://avatars0.githubusercontent.com/u/31839?s=460&u=ad32f4cadfef5e5fb09cdfa4b7b7b36a99ba6811&v=4" width="80" alt=""/>
				<br /><sub><b>Gergő Törcsvári</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/vrenjith">
				<img src="https://avatars3.githubusercontent.com/u/2093241?s=460&u=96ce93a9bebabdd0a60a2dc96cd093a41d5edaba&v=4" width="80" alt=""/>
				<br /><sub><b>vrenjith</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/duhruh">
				<img src="https://avatars2.githubusercontent.com/u/1133969?s=460&u=c0691e6131ec6d516416c1c6fcedb5034f877bbe&v=4" width="80" alt=""/>
				<br /><sub><b>David Rivera</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/jipjan">
				<img src="https://avatars2.githubusercontent.com/u/1384618?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Jaap-Jan de Wit</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/jmwebslave">
				<img src="https://avatars2.githubusercontent.com/u/6118262?s=460&u=7db409c47135b1e141c366bbb03ed9fae6ac2638&v=4" width="80" alt=""/>
				<br /><sub><b>James Morgan</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/Subv">
				<img src="https://avatars1.githubusercontent.com/u/357072?s=460&u=d8adcdc91d749ae53e177973ed9b6bb6c4c894a3&v=4" width="80" alt=""/>
				<br /><sub><b>Sebastian Valle</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Philip-Mooney">
				<img src="https://avatars0.githubusercontent.com/u/48624631?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Philip Mooney</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/WaterCalm">
				<img src="https://avatars1.githubusercontent.com/u/23502129?s=400&v=4" width="80" alt=""/>
				<br /><sub><b>WaterCalm</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/lebrou34">
				<img src="https://avatars1.githubusercontent.com/u/16373103?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>lebrou34</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/lightglitch">
				<img src="https://avatars0.githubusercontent.com/u/196953?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Mário Franco</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/klutchell">
				<img src="https://avatars3.githubusercontent.com/u/20458272?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Kyle Harding</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ahgraber">
				<img src="https://avatars.githubusercontent.com/u/24922003?s=460&u=8376c9f00af9b6057ba4d2fb03b4f1b20a75277f&v=4" width="80" alt=""/>
				<br /><sub><b>Alex Graber</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/MooBaloo">
				<img src="https://avatars.githubusercontent.com/u/9493496?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>MooBaloo</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Shuro">
				<img src="https://avatars.githubusercontent.com/u/944030?s=460&v=4" width="80" alt=""/>
				<br /><sub><b>Shuro</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/lorisbergeron">
				<img src="https://avatars.githubusercontent.com/u/51918567?s=460&u=778e4ff284b7d7304450f98421c99f79298371fb&v=4" width="80" alt=""/>
				<br /><sub><b>Loris Bergeron</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/hepelayo">
				<img src="https://avatars.githubusercontent.com/u/8243119?v=4" width="80" alt=""/>
				<br /><sub><b>hepelayo</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/jonasled">
				<img src="https://avatars.githubusercontent.com/u/46790650?v=4" width="80" alt=""/>
				<br /><sub><b>Jonas Leder</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/stegmannb">
				<img src="https://avatars.githubusercontent.com/u/12850482?v=4" width="80" alt=""/>
				<br /><sub><b>Bastian Stegmann</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Stealthii">
				<img src="https://avatars.githubusercontent.com/u/998920?v=4" width="80" alt=""/>
				<br /><sub><b>Stealthii</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/thegamingninja">
				<img src="https://avatars.githubusercontent.com/u/8020534?v=4" width="80" alt=""/>
				<br /><sub><b>THEGamingninja</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/italobb">
				<img src="https://avatars.githubusercontent.com/u/1801687?v=4" width="80" alt=""/>
				<br /><sub><b>Italo Borssatto</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/GurjinderSingh">
				<img src="https://avatars.githubusercontent.com/u/3470709?v=4" width="80" alt=""/>
				<br /><sub><b>Gurjinder Singh</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/phantomski77">
				<img src="https://avatars.githubusercontent.com/u/69464125?v=4" width="80" alt=""/>
				<br /><sub><b>David Dosoudil</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ijaron">
				<img src="https://avatars.githubusercontent.com/u/5156472?v=4" width="80" alt=""/>
				<br /><sub><b>ijaron</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/nielscil">
				<img src="https://avatars.githubusercontent.com/u/9073152?v=4" width="80" alt=""/>
				<br /><sub><b>Niels Bouma</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ogarai">
				<img src="https://avatars.githubusercontent.com/u/2949572?v=4" width="80" alt=""/>
				<br /><sub><b>Orko Garai</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/baruffaldi">
				<img src="https://avatars.githubusercontent.com/u/36949?v=4" width="80" alt=""/>
				<br /><sub><b>Filippo Baruffaldi</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/bikram990">
				<img src="https://avatars.githubusercontent.com/u/6782131?v=4" width="80" alt=""/>
				<br /><sub><b>Bikramjeet Singh</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/razvanstoica89">
				<img src="https://avatars.githubusercontent.com/u/28236583?v=4" width="80" alt=""/>
				<br /><sub><b>Razvan Stoica</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/psharma04">
				<img src="https://avatars.githubusercontent.com/u/22587474?v=4" width="80" alt=""/>
				<br /><sub><b>RBXII3</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/demize">
				<img src="https://avatars.githubusercontent.com/u/264914?v=4" width="80" alt=""/>
				<br /><sub><b>demize</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/PUP-Loki">
				<img src="https://avatars.githubusercontent.com/u/75944209?v=4" width="80" alt=""/>
				<br /><sub><b>PUP-Loki</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/DSorlov">
				<img src="https://avatars.githubusercontent.com/u/8133650?v=4" width="80" alt=""/>
				<br /><sub><b>Daniel Sörlöv</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/Theyooo">
				<img src="https://avatars.githubusercontent.com/u/58510131?v=4" width="80" alt=""/>
				<br /><sub><b>Theyooo</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/mrdink">
				<img src="https://avatars.githubusercontent.com/u/514751?v=4" width="80" alt=""/>
				<br /><sub><b>Justin Peacock</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ChrisTracy">
				<img src="https://avatars.githubusercontent.com/u/58871574?v=4" width="80" alt=""/>
				<br /><sub><b>Chris Tracy</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/Fuechslein">
				<img src="https://avatars.githubusercontent.com/u/15112818?v=4" width="80" alt=""/>
				<br /><sub><b>Fuechslein</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/nightah">
				<img src="https://avatars.githubusercontent.com/u/3339418?v=4" width="80" alt=""/>
				<br /><sub><b>Amir Zarrinkafsh</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/gabbe">
				<img src="https://avatars.githubusercontent.com/u/156397?v=4" width="80" alt=""/>
				<br /><sub><b>gabbe</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/bmbvenom">
				<img src="https://avatars.githubusercontent.com/u/20530371?v=4" width="80" alt=""/>
				<br /><sub><b>bmbvenom</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/FMeinicke">
				<img src="https://avatars.githubusercontent.com/u/42121639?v=4" width="80" alt=""/>
				<br /><sub><b>Florian Meinicke</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ssrahul96">
				<img src="https://avatars.githubusercontent.com/u/15570570?v=4" width="80" alt=""/>
				<br /><sub><b>Rahul Somasundaram</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/BjoernAkAManf">
				<img src="https://avatars.githubusercontent.com/u/833043?v=4" width="80" alt=""/>
				<br /><sub><b>Björn Heinrichs</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/realJoshByrnes">
				<img src="https://avatars.githubusercontent.com/u/204185?v=4" width="80" alt=""/>
				<br /><sub><b>Josh Byrnes</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/bergi9">
				<img src="https://avatars.githubusercontent.com/u/5556750?v=4" width="80" alt=""/>
				<br /><sub><b>bergi9</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/luoweihua7">
				<img src="https://avatars.githubusercontent.com/u/3157520?v=4" width="80" alt=""/>
				<br /><sub><b>luoweihua7</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/TobiasKneidl">
				<img src="https://avatars.githubusercontent.com/u/26301707?v=4" width="80" alt=""/>
				<br /><sub><b>Tobias Kneidl</b></sub>
			</a>
		</td>
	</tr>
	<tr>
		<td align="center">
			<a href="https://github.com/piuswalter">
				<img src="https://avatars.githubusercontent.com/u/64539242?v=4" width="80" alt=""/>
				<br /><sub><b>Pius Walter</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/troykelly">
				<img src="https://avatars.githubusercontent.com/u/4564803?v=4" width="80" alt=""/>
				<br /><sub><b>Troy Kelly</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/ivankristianto">
				<img src="https://avatars.githubusercontent.com/u/656006?v=4" width="80" alt=""/>
				<br /><sub><b>Ivan Kristianto</b></sub>
			</a>
		</td>
		<td align="center">
			<a href="https://github.com/omercnet">
				<img src="https://avatars.githubusercontent.com/u/639682?v=4" width="80" alt=""/>
				<br /><sub><b>Omer Cohen</b></sub>
			</a>
		</td>
	</tr>
</table>
<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
