// public/js/auth.js

const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
  const token = localStorage.getItem('token');
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`
    };
  }

  const res = await originalFetch(url, options);

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    alert('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
    window.location.href = '/login';
  }

  return res;
};