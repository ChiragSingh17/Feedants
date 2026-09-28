const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  position: { type: Number, required: true }, // 1..6
  label: { type: String, required: true },
  amount: { type: Number, required: true },
}, { _id: false });

const competitionSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true }, // "Feedants Classical Dance"
  category: { type: String, default: 'Dance' },
  tags: [{ type: String }], // e.g. Multi-Win
  badge: { type: String, default: 'Winners get certificate' },

  prizePool: { type: Number, required: true },
  entryFee: { type: Number, required: true },

  capacity: { type: Number, required: true, min: 1 }, // total spots e.g. 20
  bookedCount: { type: Number, default: 0, min: 0 },

  // Lifecycle dates — stored as UTC Date
  registrationDeadline: { type: Date, required: true },
  submissionStartsAt: { type: Date, required: true },
  submissionEndsAt: { type: Date, required: true },
  resultAt: { type: Date, required: true },

  status: {
    type: String,
    enum: ['draft', 'open', 'upcoming', 'closed', 'submission', 'judging', 'completed', 'cancelled'],
    default: 'open',
  },

  judge: {
    name: String,
    role: String,
    bio: String,
    avatarUrl: String,
    introVideoUrl: String,
  },

  about: {
    short: String,
    long: String,
  },
  judgingParameters: [{ title: String, description: String }],
  rules: [{ type: String }],

  rewards: [rewardSchema],

  previousWinners: [{
    name: String,
    positionLabel: String, // "1st Winner"
    rank: Number,
    avatarUrl: String,
    videoUrl: String,
  }],

  referral: {
    baseUrl: String,
    rewardPerSignup: { type: Number, default: 10 },
  },

  razorpayEnabled: { type: Boolean, default: true },

  // For optimistic concurrency / versioning
  version: { type: Number, default: 0 },

}, { timestamps: true });

// Virtuals for derived state
competitionSchema.virtual('spotsLeft').get(function () {
  return Math.max(0, this.capacity - this.bookedCount);
});

competitionSchema.virtual('isFull').get(function () {
  return this.bookedCount >= this.capacity;
});

competitionSchema.methods.computeLifecycle = function (now = new Date()) {
  const n = now.getTime();
  if (this.status === 'cancelled' || this.status === 'draft') return this.status;
  if (n > this.resultAt.getTime()) return 'completed';
  if (n > this.submissionEndsAt.getTime()) return 'judging';
  if (n > this.submissionStartsAt.getTime() && n <= this.submissionEndsAt.getTime()) return 'submission';
  if (n > this.registrationDeadline.getTime()) return 'closed';
  return 'open';
};

// Ensure toJSON includes virtuals
competitionSchema.set('toJSON', { virtuals: true });
competitionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Competition', competitionSchema);
