## Sertifika Yardımı

### HTTP Sertifikası

Bir HTTP doğrulanmış sertifika, Let's Encrypt sunucularının
alan adlarınıza HTTP (HTTPS değil!) üzerinden ulaşmaya çalışacağı ve başarılı olursa,
sertifikanızı verecekleri anlamına gelir.

Bu yöntem için, alan adlarınız için HTTP ile erişilebilir ve bu Nginx kurulumuna işaret eden bir _Proxy Host_ oluşturulmuş olmalıdır. Bir sertifika
verildikten sonra, _Proxy Host_'u HTTPS
bağlantıları için de bu sertifikayı kullanacak şekilde değiştirebilirsiniz. Ancak, sertifikanın yenilenmesi için _Proxy Host_'un hala HTTP erişimi için yapılandırılmış olması gerekecektir.

Bu işlem joker karakter alan adlarını _desteklemez_.

### DNS Sertifikası

Bir DNS doğrulanmış sertifika, bir DNS Sağlayıcı eklentisi kullanmanızı gerektirir. Bu DNS
Sağlayıcı, alan adınızda geçici kayıtlar oluşturmak için kullanılacak ve ardından Let's
Encrypt bu kayıtları sorgulayarak sahibi olduğunuzdan emin olacak ve başarılı olursa,
sertifikanızı verecektir.

Bu tür bir sertifika talep etmeden önce bir _Proxy Host_ oluşturulmasına gerek yoktur. Ayrıca _Proxy Host_'unuzun HTTP erişimi için yapılandırılmasına da gerek yoktur.

Bu işlem joker karakter alan adlarını _destekler_.

### Özel Sertifika

Kendi Sertifika Otoriteniz tarafından sağlanan kendi SSL Sertifikanızı yüklemek için bu seçeneği kullanın.

