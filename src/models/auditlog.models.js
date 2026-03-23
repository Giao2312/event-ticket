import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  adminId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  }, // Admin thực hiện thao tác
  action: { 
    type: String, 
    required: true 
  }, // Ví dụ: 'DELETE_EVENT', 'BLOCK_USER', 'UPDATE_CONFIG'
  targetId: { 
    type: mongoose.Schema.Types.ObjectId, 
    required: true 
  }, // ID của đối tượng bị tác động
  targetModel: { 
    type: String, 
    required: true 
  }, // Ví dụ: 'Event', 'User', 'Order'
  details: { 
    type: Object 
  }, // Lưu thông tin cũ/mới để đối chiếu
  ipAddress: String,
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;


