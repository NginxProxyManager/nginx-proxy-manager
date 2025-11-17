## Aide concernant les certificats

### Certificat HTTP

Un certificat HTTP validé signifie que les serveurs de Let's Encrypt tenteront d'accéder à vos domaines via HTTP (et non HTTPS !). En cas de succès, ils émettront votre certificat.

Pour cette méthode, vous devrez créer un serveur proxy pour votre ou vos domaines. Ce serveur proxy devra être accessible via HTTP et pointer vers cette installation Nginx. Une fois le certificat émis, vous pourrez modifier le serveur proxy pour qu'il utilise également ce certificat pour les connexions HTTPS. Cependant, le serveur proxy devra toujours être configuré pour l'accès HTTP afin que le certificat puisse être renouvelé.

Ce processus ne prend pas en charge les domaines génériques.

### Certificat DNS

Un certificat DNS validé nécessite l'utilisation d'un plugin de fournisseur DNS. Ce fournisseur DNS créera des enregistrements temporaires sur votre domaine. Let's Encrypt interrogera ensuite ces enregistrements pour vérifier que vous en êtes bien le propriétaire. En cas de succès, ils émettront votre certificat.

Il n'est pas nécessaire de créer un serveur proxy avant de demander ce type de certificat.

Il n'est pas non plus nécessaire de configurer votre serveur proxy pour l'accès HTTP.

Ce processus prend en charge les domaines génériques.

## Certificat personnalisé

Utilisez cette option pour importer votre propre certificat SSL, fourni par votre autorité de certification.
