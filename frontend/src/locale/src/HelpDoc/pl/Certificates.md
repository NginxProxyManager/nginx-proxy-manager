## Pomoc dotycząca certyfikatów

### Certyfikat HTTP

Certyfikat weryfikowany przez HTTP oznacza, że serwery Let's Encrypt będą próbowały połączyć się z twoimi domenami przez HTTP (nie HTTPS!) i jeśli się to powiedzie, wydadzą twój certyfikat.

W przypadku tej metody musisz mieć utworzony Host proxy dla swoich domen, który jest dostępny przez HTTP i wskazuje na tę instalację Nginx. 
Po otrzymaniu certyfikatu możesz zmodyfikować Host proxy, aby używał również tego certyfikatu do połączeń HTTPS. Jednak Host proxy nadal będzie musiał być skonfigurowany do dostępu przez HTTP, aby certyfikat mógł być odnawiany.

Ten proces nie obsługuje domen wieloznacznych (wildcard).

### Certyfikat DNS

Certyfikat weryfikowany przez DNS wymaga użycia wtyczki dostawcy DNS. Ten dostawca DNS zostanie użyty do utworzenia tymczasowych rekordów w twojej domenie, a następnie Let's Encrypt sprawdzi te rekordy, aby upewnić się, że jesteś właścicielem i jeśli się powiedzie, wydadzą twój certyfikat.

Nie musisz mieć utworzonego Hosta proxy przed wystąpieniem o ten typ certyfikatu. Nie musisz również mieć skonfigurowanego Hosta proxy do dostępu przez HTTP.

Ten proces obsługuje domeny wieloznaczne (wildcard).

### Własny certyfikat

Użyj tej opcji, aby przesłać własny certyfikat SSL, dostarczony przez twój własny urząd certyfikacji.
