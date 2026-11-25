## Docker-Erkennung

Auch ohne Einrichtung schlägt das Feld für den Ziel-Host Container vor, die ein Docker-Netzwerk
mit Nginx Proxy Manager teilen, sowie bereits verwendete Hosts.

Mit eingeschalteter **Docker-Erkennung** liest NPM zusätzlich die Docker-API. Das Feld für den
Ziel-Host listet dann deine Container mit Ports und Status. Wählst du einen Container mit
`npm.*`-Labels, füllt das die freien Felder eines neuen Proxy-Hosts aus: Domainnamen, Port,
Schema und die Schalter. Was du selbst eingetragen hast, wird nicht überschrieben, und
gespeichert wird erst, wenn du speicherst.

### 1. Einen Socket-Proxy-Container anlegen

Binde den Docker-Socket nicht in NPM ein: Zugriff darauf bedeutet Root-Zugriff auf deinen
Server, und `:ro` ändert daran nichts. Starte stattdessen einen kleinen Proxy, der nur das
Lesen von Containern und Netzwerken erlaubt. Mit Compose oder in der Weboberfläche deiner
Container-Verwaltung:

1. Einen Container aus dem Image `tecnativa/docker-socket-proxy` anlegen, z. B. mit dem Namen
   `socket-proxy`.
2. `/var/run/docker.sock` nach `/var/run/docker.sock` einbinden, schreibgeschützt.
3. Die Variablen `CONTAINERS=1` und `NETWORKS=1` setzen. Alles andere auf dem Standard lassen
   (verboten).
4. Keine Ports veröffentlichen. NPM erreicht den Proxy über ein Docker-Netzwerk.
5. Ihn in ein Netzwerk hängen, in dem auch der NPM-Container ist (oder eines anlegen und beide
   anhängen).
6. Optional: das Label `npm.hide=true` setzen, damit er nicht als Ziel-Host vorgeschlagen wird.

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      NETWORKS: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    labels:
      npm.hide: "true"
    networks:
      - socket-proxy

networks:
  socket-proxy:
    internal: true
```

Hier muss NPM zusätzlich am Netzwerk `socket-proxy` hängen.

### 2. Zwei Variablen am NPM-Container setzen

```
NPM_DOCKER_DISCOVERY=true
DOCKER_HOST=tcp://socket-proxy:2375
```

In `DOCKER_HOST` den Namen deines Proxy-Containers eintragen. Danach den NPM-Container neu
starten (oder neu erstellen).

### 3. Optional: Labels an deinen Containern

```yaml
labels:
  npm.domain: "app.example.com, www.app.example.com"
  npm.port: "8080"
  npm.scheme: "http"
  npm.websocket: "true"
```

- `npm.domain`: Domainnamen, getrennt durch Kommas oder Leerzeichen
- `npm.port`: Ziel-Port
- `npm.scheme`: `http` oder `https`
- `npm.websocket`: „Websockets Support“
- `npm.block_exploits`: „Gängige Exploits blockieren“
- `npm.caching`: „Cache Assets“
- `npm.http2`: „HTTP/2 Support“, eingeschaltet sobald du ein Zertifikat wählst
- `npm.hide`: diesen Container nie vorschlagen (auch nicht im Netzwerk-Scan, solange die
  Docker-Erkennung funktioniert)

Schalter nehmen `true` oder `false`. Docker liest Labels beim Erstellen eines Containers,
also den Container nach einer Änderung neu erstellen und dann die Vorschläge aktualisieren.

Die Domainnamen werden nur eingetragen, wenn das Feld noch leer ist. Verwendet schon ein
anderer Host eine davon, ist der Container in der Liste markiert und die Domains bleiben weg.

### Fehlersuche

Funktioniert die Erkennung nicht, zeigt die Vorschlagsliste den Grund. „Die Verbindung zur
Docker-API wurde abgelehnt“ heißt, unter der Adresse in `DOCKER_HOST` antwortet nichts (läuft der
Proxy, auf Port 2375?); „Der Hostname in DOCKER_HOST konnte nicht aufgelöst werden“ heißt, NPM und
der Proxy teilen kein Netzwerk oder der Name in `DOCKER_HOST` stimmt nicht.
„Die Docker-API hat die Anfrage abgelehnt“ heißt, der Proxy braucht `CONTAINERS=1` und `NETWORKS=1`.
Wenn du den Socket selbst einbindest und `PUID`/`PGID` setzt, kann NPM ihn meist nicht öffnen;
der Proxy umgeht das.

Mehr Details: [Upstream Discovery](https://nginxproxymanager.com/advanced-config/upstream-discovery)
