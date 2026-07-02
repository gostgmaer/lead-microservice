import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

const getEncryptionKey = () => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-secure-encryption-key-32chars';
  // Hash the secret to ensure it is exactly 32 bytes
  return crypto.createHash('sha256').update(secret).digest();
};

export function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Return IV prepended to the ciphertext
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(text) {
  if (!text) return text;
  // If the text does not match the encrypted format (contains exactly one colon and hex characters), return as is
  if (!text.includes(':')) return text;
  try {
    const [ivHex, encryptedText] = text.split(':');
    if (!ivHex || !encryptedText) return text;
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedBytes = Buffer.from(encryptedText, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    // If decryption fails (e.g. if the field was not encrypted), return the raw text
    return text;
  }
}
