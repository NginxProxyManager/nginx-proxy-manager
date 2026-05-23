## Pomoc s certifikátmi

### Certifikát HTTP

Certifikát overený protokolom HTTP znamená, že servery Let's Encrypt sa
pokúsia pripojiť k vašim doménam cez protokol HTTP (nie HTTPS!) a v prípade úspechu
vydajú váš certifikát.

Pre túto metódu budete musieť mať pre svoje domény vytvorený _Proxy Host_, ktorý
je prístupný cez HTTP a smeruje na túto inštaláciu Nginx. Po vydaní certifikátu
môžete zmeniť _Proxy Host_ tak, aby tento certifikát používal aj pre HTTPS
pripojenia. _Proxy Host_ však bude stále potrebné nakonfigurovať pre prístup cez HTTP,
aby sa certifikát mohol obnoviť.

Tento proces _nepodporuje_ domény s divokými kartami.

### Certifikát DNS

Certifikát overený DNS vyžaduje použitie pluginu DNS Provider. Tento DNS
Provider sa použije na vytvorenie dočasných záznamov vo vašej doméne a potom Let's
Encrypt overí tieto záznamy, aby sa uistil, že ste vlastníkom, a ak bude úspešný,
vydá váš certifikát.

Pred požiadaním o tento typ certifikátu nie je potrebné vytvoriť _Proxy Host_.
Tiež nie je potrebné mať _Proxy Host_ nakonfigurovaný pre prístup HTTP.

Tento proces _podporuje_ domény s divokými kartami.

### Vlastný certifikát

Túto možnosť použite na nahratie vlastného SSL certifikátu, ktorý vám poskytla vaša
certifikačná autorita.
