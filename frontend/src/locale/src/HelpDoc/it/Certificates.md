## Guida sui Certificati

### Certificato HTTP

Un certificato convalidato HTTP significa che i server Let's Encrypttenteranno di raggiungere i tuoi domini tramite HTTP (non HTTPS!) e, in caso di esito positivo, emetteranno il tuo certificato.

Per questo metodo, dovrai creare un _Proxy Host_ per i tuoi domini chesia accessibile con HTTP e che punti a questa installazione Nginx.
Dopo che il certificato è stato rilasciato, puoi modificare il _Proxy Host_ per utilizzare questo certificato anche per le connessioni HTTPS.
Tuttavia, il _Proxy Host_ dovrà comunque essere configurato per l'accesso HTTP affinché il certificato possa essere rinnovato.

Questo processo _non_ supporta i domini wildcard.

### Certificato DNS

Un certificato convalidato dal DNS richiede l'uso di un plugin DNS Provider. Questo DNS Provider verrà utilizzato per creare record temporanei sul tuo dominio,
quindi Let's Encrypt interrogherà tali record per assicurarsi che tu sia il proprietario e, in caso di esito positivo,rilascerà il tuo certificato.

Non è necessario creare un _Proxy Host_ prima di richiedere questo tipo di certificato. Non è nemmeno necessario configurare il tuo _proxy host_ per l'accesso HTTP.

Questo processo _supporta_ i domini wildcard.

### Certificato personalizzato

Utilizza questa opzione per caricare il tuo certificato SSL, fornito dalla tua autorità di certificazione.
