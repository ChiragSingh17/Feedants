require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const competitionsRouter = require('./routes/competitions');
const userMiddleware = require('./middleware/user');

const app = express();
const PORT = process.env.PORT || 4000;

// Security & parsing
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL === '*' ? '*' : (process.env.CLIENT_URL || '*'), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(userMiddleware);

// Rate limit registrations to prevent abuse but allow concurrency test
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Routes
app.use('/api/competitions', competitionsRouter);
// Alias for limiter on register
app.use('/api/competitions/:slug/register', registerLimiter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

// In-memory seeding when DB unavailable (so app still works for demo)
function seedMemory() {
  const now = new Date();
  const registrationDeadline = new Date(now.getTime() + (1*24*3600 + 6*3600 + 28*60 + 32)*1000);
  const comp = {
    _id: 'mem-comp-001',
    slug: 'feedants-classical-dance',
    title: 'Feedants Classical Dance',
    category: 'Dance',
    tags: ['Multi-Win'],
    badge: 'Winners get certificate',
    prizePool: 1500,
    entryFee: 99,
    capacity: 20,
    bookedCount: 1,
    registrationDeadline,
    submissionStartsAt: new Date(now.getTime() + 2*24*3600*1000),
    submissionEndsAt: new Date(now.getTime() + 10*24*3600*1000),
    resultAt: new Date(now.getTime() + 12*24*3600*1000),
    status: 'open',
    judge: { name: 'Manju Dubey', role: 'Judge', bio: 'Professional Kathak Dancer', avatarUrl: 'https://i.pravatar.cc/300?img=32', introVideoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
    about: { short: 'This is an online classical dance competition open for all age groups.\nParticipate from anywhere and showcase your talent.\nExpress your passion through traditional dance.', long: 'Full details...' },
    judgingParameters: [
      { title: 'Technique & Form', description: 'Precision of steps' },
      { title: 'Expression', description: 'Emotional conveyance' },
    ],
    rules: ['One entry per participant', 'Video 2-4 minutes'],
    rewards: [
      { position: 1, label: '1st Winner', amount: 550 },
      { position: 2, label: '2nd Winner', amount: 300 },
      { position: 3, label: '3rd Winner', amount: 240 },
      { position: 4, label: '4th Winner', amount: 200 },
      { position: 5, label: '5th Winner', amount: 130 },
      { position: 6, label: '6th Winner', amount: 80 },
    ],
    previousWinners: [
      { name: 'Riya Shah', positionLabel: '1st Winner', rank: 1, avatarUrl: 'https://images.unsplash.com/photo-1518834107812-67b0b288f498?w=200', videoUrl: '' },
      { name: 'Aarav Mehta', positionLabel: '1st Winner', rank: 1, avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200', videoUrl: '' },
      { name: 'Neha Verma', positionLabel: '2nd Winner', rank: 2, avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', videoUrl: '' },
      { name: 'Ishita Cho', positionLabel: '3rd Winner', rank: 3, avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200', videoUrl: '' },
    ],
    referral: { baseUrl: 'https://feedants.com/r/referral123', rewardPerSignup: 10 },
    razorpayEnabled: true,
    computeLifecycle(nowParam = new Date()) {
      const n = nowParam.getTime();
      if (n > this.resultAt.getTime()) return 'completed';
      if (n > this.submissionEndsAt.getTime()) return 'judging';
      if (n > this.submissionStartsAt.getTime()) return 'submission';
      if (n > this.registrationDeadline.getTime()) return 'closed';
      return 'open';
    }
  };
  const mem = competitionsRouter._memory;
  mem.competitions.set(comp.slug, comp);
  if (!mem.participations) mem.participations = new Map();
  // Pre-register demo user to show Registered badge initially (optional)
  // Comment out to start as not registered; we keep it to demo both states via toggle.
  // mem.participations.set(`demo-user-001:${comp._id}`, { userId: 'demo-user-001', competitionId: comp._id, status: 'registered' });
  console.log('[Memory] Seeded competition', comp.slug);
}

async function start() {
  // Try DB, but don't crash if unavailable
  try {
    await connectDB();
  } catch (e) {
    console.warn('[Server] DB unavailable — seeding in-memory store. Run `npm run seed` after starting Mongo.');
    seedMemory();
  }
  // If DB connected but empty, seed memory check — ensure at least one comp exists
  if (mongoose.connection.readyState === 1) {
    try {
      const Competition = require('./models/Competition');
      const count = await Competition.countDocuments();
      if (count === 0) {
        console.log('[Server] No competitions in DB — run `npm run seed` to seed.');
        // Also seed memory as fallback for immediate demo
        seedMemory();
      }
    } catch (_) {}
  } else {
    if (competitionsRouter._memory.competitions.size === 0) seedMemory();
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
    console.log(`[Server] Competitions: http://localhost:${PORT}/api/competitions/feedants-classical-dance`);
  });
}

start();

module.exports = app;
