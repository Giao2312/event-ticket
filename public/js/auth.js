// /public/js/auth.js
(function() {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options = {}) => {
        options.headers = new Headers(options.headers || {});
        const token = localStorage.getItem('token');
        const isAuthUrl = url.includes('/login') || url.includes('/register');
        
        if (token && !isAuthUrl) {
            options.headers.set('Authorization', `Bearer ${token}`);
        }

        const res = await originalFetch(url, options);

        if (res.status === 401 || res.status === 403) {
            performLogout();
        }
        return res;
    };

    async function performLogout() {
        try {
            await originalFetch('/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error("Lỗi:", err);
        } finally {
            localStorage.removeItem('token');
            globalThis.location.href = '/login';
        }
    }

    // Gán vào globalThis để gọi từ onclick trong HTML
    globalThis.handleLogout = performLogout;
    console.log("Auth.js loaded successfully"); // Để debug trong console
})();
