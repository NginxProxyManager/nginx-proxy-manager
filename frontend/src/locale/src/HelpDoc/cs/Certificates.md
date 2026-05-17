## Pomoc s certifikáty

### Certifikát HTTP

Certifikát ověřený prostřednictvím protokolu HTTP znamená, že servery Let's Encrypt se
pokusí připojit k vašim doménám přes protokol HTTP (nikoli HTTPS!) a v případě úspěchu
vydají váš certifikát.

Pro tuto metodu budete muset mít pro své domény vytvořeného _Proxy Host_, který
je přístupný přes HTTP a směruje na tuto instalaci Nginx. Po vydání certifikátu
můžete změnit _Proxy Host_ tak, aby tento certifikát používal i pro HTTPS
připojení. _Proxy Host_ však bude stále potřeba nakonfigurovat pro přístup přes HTTP,
aby se certifikát mohl obnovit.

Tento proces _nepodporuje_ domény se zástupnými znaky.

### Certifikát DNS

Certifikát ověřený DNS vyžaduje použití pluginu DNS Provider. Tento DNS
Provider se použije na vytvoření dočasných záznamů ve vaší doméně a poté Let's
Encrypt ověří tyto záznamy, aby se ujistil, že jste vlastníkem, a pokud bude úspěšný,
vydá váš certifikát.

Před požádáním o tento typ certifikátu není potřeba vytvořit _Proxy Host_.
Není také potřeba mít _Proxy Host_ nakonfigurovaný pro přístup HTTP.

Tento proces _podporuje_ domény se zástupnými znaky.

### Vlastní certifikát

Tuto možnost použijte na nahrání vlastního SSL certifikátu, který vám poskytla vaše
certifikační autorita.
