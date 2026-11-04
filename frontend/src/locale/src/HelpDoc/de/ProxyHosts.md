## Was ist ein Proxy-Host?

Ein Proxy-Host ist der eingehende Endpunkt für einen Webdienst, den Sie weiterleiten möchten.

Er bietet optionale SSL-Terminierung für Ihren Dienst, der möglicherweise keine integrierte SSL-Unterstützung hat.

Proxy-Hosts sind die häufigste Verwendung für den Nginx Proxy Manager.

## Status und benutzerdefinierte Locations

Die Statusspalte zeigt, ob nginx den Host tatsächlich ausliefert:

- **Online**: Die Konfiguration ist aktiv.
- **Warnung**: Der Host ist online, aber eine benutzerdefinierte Location braucht Aufmerksamkeit: nginx hat sie abgelehnt, daher wurde sie beiseitegelegt (nicht ausgeliefert), oder ihr Ziel-Host kann gerade nicht aufgelöst werden (sie bleibt aktiv und antwortet mit 502, bis der Name aufgelöst wird, danach funktioniert sie von selbst wieder), oder ein Ziel ist nicht erreichbar. Ein Klick auf den Status zeigt Details.
- **Fehler**: nginx konnte die Konfiguration dieses Hosts nicht laden, daher ist er offline. Ein Klick auf den Status zeigt den Grund.
- **Deaktiviert**: Der Host wurde ausgeschaltet.

Eine fehlerhafte benutzerdefinierte Location nimmt nicht mehr den ganzen Host offline: Eine Location, die nginx ablehnt, wird beiseitegelegt, der Rest des Hosts bleibt online, und der Editor zeigt den Grund (beheben und den Host speichern, um sie zurückzuholen). Eine Location, deren Ziel-Host nicht aufgelöst wird, wird nicht beiseitegelegt: Sie antwortet mit 502, bis der Host aufgelöst wird; nichts muss wieder aktiviert werden. Jede Location kann außerdem einzeln ausgeschaltet werden.

Die Felder für den Ziel-Host schlagen bereits verwendete Hosts und im Docker-Netzwerk gefundene Hosts vor. Um auch Docker-Container aufzulisten, `NPM_DOCKER_DISCOVERY=true` setzen und NPM Zugriff auf die Docker-API geben (empfohlen über einen Socket-Proxy, siehe Dokumentation).
