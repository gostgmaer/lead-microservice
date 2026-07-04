import mongoose from "mongoose";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const counterSchema = new mongoose.Schema(
  { name: { type: String, required: true, unique: true, trim: true }, seq: { type: Number, default: 0, min: 0 } },
  { timestamps: true },
);

function toBase62(num) {
  if (num === 0) return "0";
  let result = "";
  while (num > 0) {
    result = BASE62[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

counterSchema.statics.nextSequence = async function (name) {
  const doc = await this.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return doc.seq;
};

counterSchema.statics.nextBase62 = async function (name) {
  const seq = await this.nextSequence(name);
  return toBase62(seq).padStart(8, "0");
};

/**
 * Generate Invoice Number
 *
 * Example:
 * EASY-INV-202607-0000000A
 */
counterSchema.statics.nextInvoiceNumber = async function () {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  // Separate counter every month
  const counterName = `invoice-${year}${month}`;
  const sequence = await this.nextBase62(counterName);
  return `EASY-INV-${year}${month}-${sequence}`;
};

/**
 * Generic document generator
 *
 * nextDocumentNumber("ORD")
 * nextDocumentNumber("PAY")
 * nextDocumentNumber("CUS")
 */
counterSchema.statics.nextDocumentNumber = async function (prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const counterName = `${prefix}-${year}${month}`;
  const sequence = await this.nextBase62(counterName);
  return `EASY-${prefix}-${year}${month}-${sequence}`;
};

export default mongoose.models.Counter || mongoose.model("Counter", counterSchema);
