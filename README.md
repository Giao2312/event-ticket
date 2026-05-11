# Event Ticket

Backend cho he thong quan ly va ban ve su kien, su dung Node.js, Express, MongoDB va Pug.

## Yeu cau moi truong

- Node.js 18 tro len duoc khuyen nghi
- npm
- MongoDB local hoac MongoDB Atlas
- Tai khoan Cloudinary neu can test upload anh
- Tai khoan sandbox cua MoMo, VNPay, PayPal neu can test thanh toan

## Cai dat du an

```bash
git clone https://github.com/Giao2312/event-ticket.git
cd event-ticket
npm install
```

## Cau hinh `.env`

Tao file `.env` tai thu muc goc du an.

### Bien toi thieu de chay du an

```env
PORT=3000
NODE_ENV=development
DB_URL=mongodb://127.0.0.1:27017/event-ticket
JWT_SECRET=replace_with_a_secure_secret
JWT_REFRESH_SECRET=replace_with_a_secure_refresh_secret
QR_SECRET=replace_with_a_secure_qr_secret
```

### Bien cho upload anh voi Cloudinary

```env
CLOUDINARY_NAME=
CLOUDINARY_KEY=
CLOUDINARY_SECRET=
```

### Bien cho PayPal

```env
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
```

### Bien cho VNPay

```env
VNPAY_TMN_CODE=
VNPAY_SECRET=
VNPAY_HOST=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3000/payment/vnpay_return
```

### Bien cho MoMo

```env
MOMO_ACCESS_KEY=
MOMO_SECRET_KEY=
MOMO_PARTNER_CODE=
MOMO_API_URL=https://test-payment.momo.vn/v2/gateway/api/create
MOMO_RETURN_URL=http://localhost:3000/payment/momo-return
```

## Chay du an

### Chay o che do phat trien

```bash
npm run dev
```

### Chay o che do thong thuong

```bash
npm start
```

Sau khi server khoi dong, mo trinh duyet tai:

```text
http://localhost:3000
```

Ung dung web duoc render qua Pug tai `/`, va cac API JSON chinh nam duoi:

- `/api/events`
- `/api/orders`
- `/api/payment`
- `/api/notifications`

## Seed du lieu mau

### Seed toan bo du lieu demo

```bash
npm run seed
```

Script nay ket noi vao `DB_URL`, xoa du lieu trong cac collection `Event`, `Order`, `Withdrawal`, `Settlement`, sau do tao lai du lieu demo. Khong nen chay tren database production.

Tai khoan demo co san sau khi seed:

- Admin: `admin@demo.com` / `admin123`
- Organizer: `organizer1@demo.com` / `organizer123`
- User: `customer1@demo.com` / `user123`

### Seed nhanh user co ban

```bash
node seed-users.js
```

Lenh nay phu hop khi chi can tao nhanh mot bo tai khoan test co ban.

## Scripts huu ich

- `npm run dev`: chay server bang nodemon
- `npm start`: chay server bang Node.js
- `npm run seed`: seed du lieu demo
- `npm test`: chay test voi Jest
- `npm run test:watch`: chay test o watch mode

## Luu y

- Entry point dung de khoi dong du an la `server.js`. Script `npm run app` hien chi chay `app.js`, file nay khong goi `listen()`, nen khong phai cach chuan de start server.
- Neu chua cau hinh `DB_URL`, ung dung se khong ket noi duoc MongoDB va se dung khi khoi dong.
- Neu goi tinh nang upload anh hoac thanh toan khi cac bien moi truong lien quan chua duoc cau hinh, request se co kha nang bi loi.
- Callback thanh toan cua MoMo va VNPay thuong can URL public. Khi test local, nen dung tunnel nhu ngrok hoac Cloudflare Tunnel.
- `npm run lint` va `npm run format` co trong `package.json`, nhung repo hien chua khai bao `eslint` va `prettier` trong `devDependencies`.
