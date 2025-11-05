## Hilfe zu Zertifikaten

### HTTP-Zertifikat

Ein HTTP-validiertes Zertifikat bedeutet, dass Let's Encrypt-Server
versuchen, Ihre Domains über HTTP (nicht HTTPS!) zu erreichen, und wenn dies erfolgreich ist,
stellen sie Ihr Zertifikat aus.

Für diese Methode müssen Sie einen _Proxy-Host_ für Ihre Domain(s) erstellen, der
über HTTP zugänglich ist und auf diese Nginx-Installation verweist. Nachdem ein Zertifikat
ausgestellt wurde, können Sie den _Proxy-Host_ so ändern, dass dieses Zertifikat auch für HTTPS-Verbindungen
verwendet wird. Der _Proxy-Host_ muss jedoch weiterhin für den HTTP-Zugriff konfiguriert sein,
 damit das Zertifikat erneuert werden kann.

Dieser Prozess unterstützt keine Wildcard-Domains.

### DNS-Zertifikat

Für ein DNS-validiertes Zertifikat müssen Sie ein DNS-Provider-Plugin verwenden. Dieser DNS-
Provider wird verwendet, um temporäre Einträge auf Ihrer Domain zu erstellen. Anschließend fragt Let's
Encrypt diese Einträge ab, um sicherzustellen, dass Sie der Eigentümer sind. Bei Erfolg wird
Ihr Zertifikat ausgestellt.

Sie müssen vor der Beantragung dieser Art von Zertifikat keinen _Proxy-Host_ erstellen.
Sie müssen Ihren _Proxy-Host_ auch nicht für den HTTP-Zugriff konfigurieren.

Dieser Prozess unterstützt Wildcard-Domains.

### Benutzerdefiniertes Zertifikat

Verwenden Sie diese Option, um Ihr eigenes SSL-Zertifikat hochzuladen, das Ihnen von Ihrer eigenen
Zertifizierungsstelle bereitgestellt wurde.
