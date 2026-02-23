import QRcode from 'qrcode';

export async function generateQR(data) {
    try {
      return await QRcode.toDataURL(JSON.stringify(data));
    } catch (error) {
      console.error('Error QR:', error);
      throw new Error('Không thể tạo QR code');
    }
}