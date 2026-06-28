import { AuditLog } from '../types';

/**
 * Audit Log System
 * Records immutable history of administrative actions.
 */
export class AuditService {
  static logAction(userId: string, userName: string, action: string, entityType: string, entityId: string, previousValue?: any, newValue?: any) {
    const log: AuditLog = {
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      entityType,
      entityId,
      previousValue,
      newValue
    };

    console.log('[Audit Log]', log);
    
    // In the future: write to WordPress database or specialized logging service
    // For now, it would be appended to the local store (useAppStore)
  }
}
