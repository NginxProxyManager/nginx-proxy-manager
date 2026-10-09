## Ayuda de Certificados

### Certificado HTTP

Un certificado validado por HTTP significa que los servidores de Let's Encrypt
intentarán acceder a tus dominios a través de HTTP (¡no HTTPS!) y, si tienen éxito,
emitirán tu certificado.

Para este método, deberás tener un _Host Proxy_ creado para tu(s) dominio(s) que
sea accesible por HTTP y que apunte a esta instalación de Nginx. Después de que se
haya emitido un certificado, puedes modificar el _Host Proxy_ para que también use
este certificado para conexiones HTTPS. Sin embargo, el _Host Proxy_ seguirá
necesitando estar configurado para acceso HTTP para que el certificado se renueve.

Este proceso _no_ admite dominios comodín.

### Certificado DNS

Un certificado validado por DNS requiere que uses un complemento de Proveedor de DNS.
Este Proveedor de DNS se usará para crear registros temporales en tu dominio y luego
Let's Encrypt consultará esos registros para asegurarse de que eres el propietario y,
si tiene éxito, emitirá tu certificado.

No necesitas tener un _Host Proxy_ creado antes de solicitar este tipo de certificado.
Tampoco necesitas tener tu _Host Proxy_ configurado para acceso HTTP.

Este proceso _sí_ admite dominios comodín.

### Certificado Personalizado

Usa esta opción para cargar tu propio Certificado SSL, proporcionado por tu propia
Autoridad de Certificación.
