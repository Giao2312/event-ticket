import checkoutNodeJssdk from '@paypal/checkout-server-sdk';

// Cấu hình môi trường (SandBox cho test, Live cho thực tế)
const environment = new checkoutNodeJssdk.core.SandboxEnvironment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
);
const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

const paypalService = {
  createOrder: async (amount) => {
    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: (amount / 25000).toFixed(2) // Giả định tỉ giá 1 USD = 25,000 VND
        }
      }]
    });

    const response = await client.execute(request);
    return response.result;
  },

  capturePayment: async (orderId) => {
    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});
    
    const response = await client.execute(request);
    return response.result;
  },

  completeOrderAndGenerateTickets : async (orderId, session) =>  {
    const order = await order.findById(orderId);
    
    // Kiểm tra nếu đơn hàng đã được xử lý trước đó (tránh trùng lặp do user F5 trang)
    if (!order || order.status === 'PAID') return order;

    // 1. Cập nhật trạng thái đơn hàng
    order.status = 'PAID';
    order.paidAt = new Date();
    await order.save({ session }); // Dùng session để đảm bảo tính toàn vẹn dữ liệu (Transaction)

    // 2. Logic tạo vé & QR Code
    const ticketsToCreate = [];
    for (const item of order.items) {
        for (let i = 0; i < item.quantity; i++) {
            const qrData = `Ticket:${order._id}-${item.ticketTypeId}-${Date.now()}-${i}`;
            ticketsToCreate.push({
                orderId: order._id,
                ticketTypeId: item.ticketTypeId,
                userId: order.userId,
                qrCode: await qrcode.toDataURL(qrData),
                code: qrData
            });
        }
    }

    await Ticket.insertMany(ticketsToCreate, { session });
    return order;
}
};


export default paypalService;
