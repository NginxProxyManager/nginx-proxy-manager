## Hỗ trợ Chứng chỉ

### Chứng chỉ HTTP (HTTP Certificate)

Chứng chỉ được xác thực qua HTTP nghĩa là máy chủ của Let's Encrypt sẽ cố gắng truy cập vào tên miền của bạn thông qua HTTP (không phải HTTPS!). Nếu kiểm tra thành công, chứng chỉ sẽ được cấp.

Với phương thức này, bạn phải tạo trước một Proxy Host cho tên miền, có thể truy cập qua HTTP và trỏ về đúng cài đặt Nginx này.
Sau khi chứng chỉ được cấp, bạn có thể chỉnh sửa Proxy Host để sử dụng chứng chỉ đó cho kết nối HTTPS.

Tuy nhiên, Proxy Host vẫn phải hỗ trợ truy cập HTTP để việc gia hạn chứng chỉ diễn ra bình thường.

Phương thức này _không hỗ trợ_ wildcard domain.

### Chứng chỉ DNS (DNS Certificate)

Chứng chỉ được xác thực qua DNS yêu cầu bạn sử dụng plugin của DNS Provider.
Plugin này sẽ tạo các bản ghi tạm thời trong DNS của bạn để Let's Encrypt kiểm tra quyền sở hữu tên miền. Nếu hợp lệ, chứng chỉ sẽ được cấp.

Khi dùng phương thức này: Bạn không cần tạo sẵn Proxy Host trước và bạn không cần mở HTTP cho Proxy Host.

Phương thức DNS _có hỗ trợ_ wildcard domain.

### Chứng chỉ tùy chỉnh (Custom Certificate)

Tùy chọn này cho phép bạn tải lên chứng chỉ SSL của riêng mình, được cung cấp bởi Certificate Authority (CA) mà bạn tự chọn.
