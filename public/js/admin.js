// /public/js/admin.js
// Admin order and withdrawal handlers

(function () {
    // Attach click handlers to all approve buttons
    document.addEventListener('DOMContentLoaded', function () {
        // ========== ORDER APPROVE ==========
        const approveOrderButtons = document.querySelectorAll('.approve-order-btn');
        approveOrderButtons.forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const orderId = this.getAttribute('data-order-id');
                if (!orderId) return;

                if (!confirm('Xác nhận duyệt đơn hàng này và cấp vé cho khách?')) {
                    return;
                }

                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Đang xử lý...</span>';

                try {
                    const res = await fetch(`/admin/orders/${orderId}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const data = await res.json();

                    if (data.success) {
                        alert('Đã duyệt đơn hàng và cấp vé thành công!');
                        window.location.reload();
                    } else {
                        alert('Lỗi: ' + (data.message || 'Không thể duyệt đơn hàng'));
                        this.disabled = false;
                        this.innerHTML = '<i class="fas fa-check"></i><span>Duyệt & cấp vé</span>';
                    }
                } catch (err) {
                    console.error('Approve order error:', err);
                    alert('Lỗi kết nối server');
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-check"></i><span>Duyệt & cấp vé</span>';
                }
            });
        });

        // ========== WITHDRAWAL APPROVE ==========
        const approveWithdrawalButtons = document.querySelectorAll('.approve-withdrawal-btn');
        approveWithdrawalButtons.forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const withdrawalId = this.getAttribute('data-withdrawal-id');
                if (!withdrawalId) return;

                const adminNote = prompt('Ghi chú (không bắt buộc):');
                if (adminNote === null) return; // User cancelled

                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    const res = await fetch(`/admin/withdrawals/${withdrawalId}/approve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ adminNote: adminNote || '' })
                    });

                    const data = await res.json();

                    if (data.success) {
                        alert('Đã duyệt yêu cầu rút tiền!');
                        window.location.reload();
                    } else {
                        alert('Lỗi: ' + (data.message || 'Không thể duyệt yêu cầu'));
                        this.disabled = false;
                        this.innerHTML = '<i class="fas fa-check"></i><span>Duyệt</span>';
                    }
                } catch (err) {
                    console.error('Approve withdrawal error:', err);
                    alert('Lỗi kết nối server');
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-check"></i><span>Duyệt</span>';
                }
            });
        });

        // ========== WITHDRAWAL REJECT ==========
        const rejectWithdrawalButtons = document.querySelectorAll('.reject-withdrawal-btn');
        rejectWithdrawalButtons.forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const withdrawalId = this.getAttribute('data-withdrawal-id');
                if (!withdrawalId) return;

                const reason = prompt('Lý do từ chối:');
                if (reason === null) return; // User cancelled

                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                try {
                    const res = await fetch(`/admin/withdrawals/${withdrawalId}/reject`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason })
                    });

                    const data = await res.json();

                    if (data.success) {
                        alert('Đã từ chối yêu cầu rút tiền!');
                        window.location.reload();
                    } else {
                        alert('Lỗi: ' + (data.message || 'Không thể từ chối yêu cầu'));
                        this.disabled = false;
                        this.innerHTML = '<i class="fas fa-xmark"></i><span>Từ chối</span>';
                    }
                } catch (err) {
                    console.error('Reject withdrawal error:', err);
                    alert('Lỗi kết nối server');
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-xmark"></i><span>Từ chối</span>';
                }
            });
        });
    });
})();
