import AuditLog from '../models/auditlog.models.js';

export const logAction = async (adminId, action, targetId, targetModel, details = {}) => {
  try {
    await AuditLog.create({
      adminId,
      action,
      targetId,
      targetModel,
      details
    });
  } catch (err) {
    console.error('Lỗi khi ghi Audit Log:', err);
  }
};