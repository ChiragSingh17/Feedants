const mongoose = require('mongoose');

const participationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  competitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },
  status: {
    type: String,
    enum: ['registered', 'payment_pending', 'cancelled', 'submitted'],
    default: 'registered',
  },
  submissionUrl: { type: String },
  submittedAt: { type: Date },
  paymentId: String,
  // idempotency key to handle retry / double tap
  idempotencyKey: { type: String, sparse: true },
}, { timestamps: true });

// Prevent duplicate participation per user per competition (except cancelled)
participationSchema.index({ userId: 1, competitionId: 1 }, { unique: true });

module.exports = mongoose.model('Participation', participationSchema);
