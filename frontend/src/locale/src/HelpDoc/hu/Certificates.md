## Tanúsítványok súgó

### HTTP tanúsítvány

A HTTP érvényes tanúsítvány azt jelenti, hogy a Certbot szerverek megpróbálják elérni a domaineket HTTP-n keresztül (nem HTTPS-en!), és ha sikerül, kiállítják a tanúsítványt.

Ehhez a módszerhez létre kell hoznod egy _Proxy Kiszolgáló_-t a domain(ek)hez, amely HTTP-n keresztül elérhető és erre az Nginx telepítésre mutat. Miután a tanúsítvány megérkezett, módosíthatod a _Proxy Kiszolgáló_-t, hogy ezt a tanúsítványt használja a HTTPS kapcsolatokhoz is. Azonban a _Proxy Kiszolgáló_-nak továbbra is konfigurálva kell lennie HTTP hozzáféréshez, hogy a tanúsítvány megújulhasson.

Ez a folyamat _nem_ támogatja a helyettesítő karakteres domaineket.

### DNS tanúsítvány

A DNS érvényes tanúsítvány megköveteli, hogy DNS szolgáltató plugint használj. Ez a DNS szolgáltató ideiglenes rekordokat hoz létre a domainen, majd a Certbot lekérdezi ezeket a rekordokat, hogy megbizonyosodjon a tulajdonjogról, és ha sikeres, kiállítják a tanúsítványt.

Nem szükséges előzetesen _Proxy Kiszolgáló_-t létrehozni az ilyen típusú tanúsítvány igényléséhez. Nem is kell a _Proxy Kiszolgáló_-t HTTP hozzáférésre konfigurálni.

Ez a folyamat _támogatja_ a helyettesítő karakteres domaineket.

### Egyéni tanúsítvány

Ezt az opciót használd a saját TLS tanúsítvány feltöltéséhez, amelyet a saját tanúsítványkibocsátód biztosított.
