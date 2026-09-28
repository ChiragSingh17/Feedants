require('dotenv').config();
const mongoose = require('mongoose');
const Competition = require('./models/Competition');
const User = require('./models/User');
const connectDB = require('./config/db');

// Seed data matching the design screenshot
async function seed() {
  const now = new Date();
  // Registration closes in ~1 day + 6h from now to match "01d : 06h : 28m : 32s" feel
  const registrationDeadline = new Date(now.getTime() + (1*24*3600 + 6*3600 + 28*60 + 32)*1000);
  // Keep lifecycle as "open" now; submission starts after registration, result after submission
  const submissionStartsAt = new Date(now.getTime() + 2*24*3600*1000); // +2 days
  const submissionEndsAt = new Date(now.getTime() + 10*24*3600*1000); // +10 days
  const resultAt = new Date(now.getTime() + 12*24*3600*1000); // +12 days

  const compData = {
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
    submissionStartsAt,
    submissionEndsAt,
    resultAt,
    status: 'open',
    judge: {
      name: 'Manju Dubey',
      role: 'Judge',
      bio: 'Professional Kathak Dancer',
      avatarUrl: 'https://i.pravatar.cc/300?img=32',
      introVideoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4',
    },
    about: {
      short: 'This is an online classical dance competition open for all age groups.\nParticipate from anywhere and showcase your talent.\nExpress your passion through traditional dance.',
      long: `This is an online classical dance competition open for all age groups. Participate from anywhere and showcase your talent. Express your passion through traditional dance.\n\nCategories: Kathak, Bharatnatyam, Odissi, Kuchipudi.\nJudging Criteria: Technique, Expression, Costume, Rhythm.\nEligibility: Open to all age groups. One entry per participant. Video duration 2-4 minutes.`,
    },
    judgingParameters: [
      { title: 'Technique & Form', description: 'Precision of steps and postures' },
      { title: 'Expression (Abhinaya)', description: 'Emotional conveyance' },
      { title: 'Rhythm & Timing', description: 'Sync with music' },
      { title: 'Costume & Presentation', description: 'Traditional attire' },
    ],
    rules: [
      'One entry per participant',
      'Video must be 2-4 minutes',
      'No editing or filters',
      'Traditional costume required',
      'Submission before deadline',
    ],
    rewards: [
      { position: 1, label: '1st Winner', amount: 550 },
      { position: 2, label: '2nd Winner', amount: 300 },
      { position: 3, label: '3rd Winner', amount: 240 },
      { position: 4, label: '4th Winner', amount: 200 },
      { position: 5, label: '5th Winner', amount: 130 },
      { position: 6, label: '6th Winner', amount: 80 },
    ],
    previousWinners: [
      { name: 'Riya Shah', positionLabel: '1st Winner', rank: 1, avatarUrl: 'https://images.unsplash.com/photo-1518834107812-67b0b288f498?w=200', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
      { name: 'Aarav Mehta', positionLabel: '1st Winner', rank: 1, avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
      { name: 'Neha Verma', positionLabel: '2nd Winner', rank: 2, avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
      { name: 'Ishita Cho', positionLabel: '3rd Winner', rank: 3, avatarUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
    ],
    referral: {
      baseUrl: 'https://feedants.com/r/referral123',
      rewardPerSignup: 10,
    },
    razorpayEnabled: true,
  };

  // Also try to connect; if fails, just log
  try {
    await connectDB();
    await Competition.deleteMany({ slug: compData.slug });
    const doc = await Competition.create(compData);
    console.log('[Seed] Competition created:', doc.slug, doc._id);

    // Demo user
    await User.deleteMany({ referralCode: 'DEMO123' });
    const demo = await User.create({ name: 'Demo User', referralCode: 'DEMO123', avatarUrl: 'https://i.pravatar.cc/150?img=68' });
    console.log('[Seed] Demo user:', demo._id.toString());

    // Register demo user for competition to showcase "Registered" state
    const Participation = require('./models/Participation');
    await Participation.deleteMany({ userId: demo._id, competitionId: doc._id });
    await Participation.create({ userId: demo._id, competitionId: doc._id, status: 'registered' });
    console.log('[Seed] Demo participation registered');

    console.log('[Seed] Done. Demo user id for x-user-id header:', demo._id.toString());
    await mongoose.connection.close();
  } catch (e) {
    console.error('[Seed] DB not available, printing data for memory seeding:');
    console.log(JSON.stringify(compData, null, 2));
    process.exit(1);
  }
}

seed();
