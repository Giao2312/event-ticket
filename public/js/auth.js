// /public/js/auth.js
// ============================================================
// AUTH INTERCEPTOR - Sử dụng HTTP-Only Cookie thay vì localStorage
//
// HTTP-Only Cookie được tự động gửi kèm mọi request đến cùng domain
// JavaScript KHÔNG THỂ đọc được token (ngăn XSS tấn công)
// Cần dùng interceptor để:
// 1. Xử lý 401/403 - tự động logout khi token hết hạn
// 2. Redirect về login khi chưa đăng nhập
// ============================================================
(function() {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        options.headers = new Headers(options.headers || {});

        // HTTP-Only Cookie sẽ được browser tự động gửi kèm
        // KHÔNG cần đọc token từ localStorage nữa
        // Chỉ cần thiết lập Content-Type cho POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase())) {
            options.headers.set('Content-Type', 'application/json');
        }

        const res = await originalFetch(url, options);

        // Xử lý khi token hết hạn hoặc không hợp lệ
        if (res.status === 401 || res.status === 403) {
            performLogout();
        }
        return res;
    };

    async function performLogout() {
        try {
            // Gọi logout API - cookie sẽ được xóa ở server
            await originalFetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error("Lỗi logout:", err);
        } finally {
            // Không cần xóa localStorage vì KHÔNG lưu token ở đó
            // Chỉ redirect về trang login
            globalThis.location.href = '/login';
        }
    }

    // Gán vào globalThis để gọi từ onclick trong HTML
    globalThis.handleLogout = performLogout;
    console.log("Auth.js loaded - HTTP-Only Cookie authentication");
})();
