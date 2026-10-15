## Sertifikatlar üzrə kömək

### HTTP Sertifikatı

HTTP ilə doğrulanmış sertifikat o deməkdir ki, Let's Encrypt serverləri domenlərinizə
HTTP (HTTPS deyil!) üzərindən çatmağa cəhd edəcək və uğurlu olarsa sertifikatınızı verəcək.

Bu üsul üçün domen(lər)iniz üçün HTTP ilə əlçatan olan və bu Nginx quraşdırmasına yönləndirilmiş bir
_Proksi Host_ yaratmalısınız. Sertifikat verildikdən sonra, _Proksi Host_-u HTTPS bağlantıları
üçün də bu sertifikatı istifadə etmək üzrə dəyişə bilərsiniz. Bununla belə, sertifikatın yenilənə bilməsi
üçün _Proksi Host_ hələ də HTTP girişi üçün konfiqurasiya edilmiş qalmalıdır.

Bu proses wildcard domenləri dəstəkləmir.

### DNS Sertifikatı

DNS ilə doğrulanmış sertifikat DNS Provayder plaginindən istifadə etməyinizi tələb edir. Bu DNS
Provayderi domeninizdə müvəqqəti qeydlər yaratmaq üçün istifadə olunacaq, sonra Let's
Encrypt sizin sahibi olduğunuzu təsdiqləmək üçün həmin qeydləri sorğulayacaq və uğurlu olarsa sertifikatınızı verəcək.

Bu tip sertifikatı sorğulamazdan əvvəl _Proksi Host_ yaratmağınıza ehtiyac yoxdur. Həmçinin
_Proksi Host_-unuzun HTTP girişi üçün konfiqurasiya edilməsinə də ehtiyac yoxdur.

Bu proses wildcard domenləri dəstəkləyir.

### Fərdi sertifikat

Öz Sertifikat Səlahiyyətinizin verdiyi öz SSL Sertifikatınızı yükləmək üçün bu seçimdən istifadə edin.
