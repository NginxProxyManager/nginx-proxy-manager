## Trợ giúp về chứng chỉ

### Chứng chỉ HTTP

Chứng chỉ xác thực qua HTTP nghĩa là máy chủ của Let's Encrypt sẽ truy cập vào tên miền của bạn qua HTTP (không phải HTTPS!). Nếu kiểm tra thành công, chứng chỉ sẽ được cấp.

Với phương thức này, bạn phải tạo trước một _máy chủ proxy_ cho tên miền, truy cập được qua HTTP và trỏ về máy chủ Nginx này.
Sau khi chứng chỉ được cấp, bạn có thể chỉnh sửa _máy chủ proxy_ để dùng chứng chỉ đó cho kết nối HTTPS.
Tuy nhiên, _máy chủ proxy_ vẫn phải truy cập được qua HTTP thì chứng chỉ mới gia hạn được.

Phương thức này _không hỗ trợ_ tên miền wildcard (ví dụ `*.example.com`).

### Chứng chỉ DNS

Chứng chỉ xác thực qua DNS yêu cầu bạn dùng plugin của nhà cung cấp DNS.
Plugin sẽ tạo các bản ghi tạm thời cho tên miền của bạn, sau đó Let's Encrypt truy vấn các bản ghi này để xác nhận bạn là chủ sở hữu. Nếu hợp lệ, chứng chỉ sẽ được cấp.

Bạn không cần tạo _máy chủ proxy_ trước khi yêu cầu loại chứng chỉ này, cũng không cần cấu hình _máy chủ proxy_ cho truy cập HTTP.

Phương thức này _có hỗ trợ_ tên miền wildcard.

### Chứng chỉ tùy chỉnh

Dùng tùy chọn này để tải lên chứng chỉ SSL của riêng bạn, do tổ chức cấp chứng chỉ (CA) của bạn cung cấp.
