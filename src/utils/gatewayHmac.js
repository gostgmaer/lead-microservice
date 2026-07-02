import crypto from 'crypto';

export function createFileServiceHmac({ userId, userEmail, userRole, secret }) {
  if (!secret) return '';
  const payload = [userId || '', userEmail || '', userRole || ''].join(':');
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
