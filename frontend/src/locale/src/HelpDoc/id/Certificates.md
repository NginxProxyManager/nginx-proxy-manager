## Bantuan Sertifikat

### Sertifikat HTTP

Sertifikat yang divalidasi HTTP berarti server Let's Encrypt akan
mencoba menjangkau domain Anda melalui HTTP (bukan HTTPS!) dan jika berhasil, mereka
akan menerbitkan sertifikat Anda.

Untuk metode ini, Anda harus membuat _Host Proxy_ untuk domain Anda yang
dapat diakses dengan HTTP dan mengarah ke instalasi Nginx ini. Setelah sertifikat
diberikan, Anda dapat mengubah _Host Proxy_ agar juga menggunakan sertifikat ini untuk HTTPS
koneksi. Namun, _Host Proxy_ tetap perlu dikonfigurasi untuk akses HTTP
agar sertifikat dapat diperpanjang.

Proses ini _tidak_ mendukung domain wildcard.

### Sertifikat DNS

Sertifikat yang divalidasi DNS mengharuskan Anda menggunakan plugin Penyedia DNS. Penyedia DNS ini
akan digunakan untuk membuat record sementara pada domain Anda dan kemudian Let's
Encrypt akan menanyakan record tersebut untuk memastikan Anda pemiliknya dan jika berhasil, mereka
akan menerbitkan sertifikat Anda.

Anda tidak perlu membuat _Host Proxy_ sebelum meminta jenis sertifikat ini.
Anda juga tidak perlu mengonfigurasi _Host Proxy_ untuk akses HTTP.

Proses ini _mendukung_ domain wildcard.

### Sertifikat Kustom

Gunakan opsi ini untuk mengunggah Sertifikat SSL Anda sendiri, sebagaimana disediakan oleh
Certificate Authority Anda.
