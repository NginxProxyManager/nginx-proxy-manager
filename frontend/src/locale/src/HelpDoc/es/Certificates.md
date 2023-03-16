# Ayuda con Certificados

## Certificado HTTP

Un certificado validado por HTTP significa que la Autoridad de Certificación (CA)
intentará llegar a sus dominios a través de HTTP (¡no HTTPS!) y, si tiene éxito, 
la CA emitirá su certificado.

Para este método, deberá tener un _Host_ creado para su(s) dominio(s) que sea 
accesible con HTTP. Después de que se le haya otorgado un certificado, puede 
modificar el _Host_ para que también use este certificado para conexiones HTTPS.
Sin embargo, el _Host_ todavía deberá estar configurado para el acceso HTTP para 
que el certificado se renueve.

## Certificado DNS

Un certificado validado por DNS requiere que cree un proveedor de DNS. Este 
proveedor de DNS se utilizará para crear registros temporales en su dominio y 
luego la CA consultará esos registros para asegurarse de que usted es el 
propietario y, si tiene éxito, la CA emitirá su certificado.

No necesita que se cree un _Host_ antes de solicitar este tipo de certificado. 
Tampoco necesita que su _Host_ esté configurado para el acceso HTTP.

## Certificado Personalizado

Use esta opción para cargar su propio certificado SSL, proporcionado por su 
propia Autoridad de Certificación.

## Certificado MKCert

Esta opción creará un certificado autofirmado para uso en desarrollo. Al ver
un _Host_ que utiliza un Certificado MKCert, el navegador mostrará errores.

## Elección de una Autoridad de Certificación

Si no está seguro, use **ZeroSSL.**
