const express = require('express');
const mongoose = require('mongoose');
const Joi = require('joi');
const Competition = require('../models/Competition');
const Participation = require('../models/Participation');
const { msUntil } = require('../utils/time');

const router = express.Router();

// Fallback in-memory store when Mongo not connected (dev/demo)
const memory = {
  competitions: new Map(), // slug -> competition object
};

// Helpers
function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function competitionToResponse(comp, userParticipation, now = new Date()) {
  const lifecycle = typeof comp.computeLifecycle === 'function' ? comp.computeLifecycle(now) : 'open';
  const spotsLeft = Math.max(0, (comp.capacity || 0) - (comp.bookedCount || 0));
  const msLeft = msUntil(comp.registrationDeadline, now);
  return {
    id: comp._id || comp.id || comp.slug,
    slug: comp.slug,
    title: comp.title,
    category: comp.category,
    tags: comp.tags,
    badge: comp.badge,
    prizePool: comp.prizePool,
    entryFee: comp.entryFee,
    capacity: comp.capacity,
    bookedCount: comp.bookedCount,
    spotsLeft,
    isFull: spotsLeft <= 0,
    lifecycle,
    status: comp.status,
    registrationDeadline: comp.registrationDeadline,
    registrationClosesInMs: msLeft,
    submissionStartsAt: comp.submissionStartsAt,
    submissionEndsAt: comp.submissionEndsAt,
    resultAt: comp.resultAt,
    judge: comp.judge,
    about: comp.about,
    judgingParameters: comp.judgingParameters,
    rules: comp.rules,
    rewards: comp.rewards,
    previousWinners: comp.previousWinners,
    referral: comp.referral,
    razorpayEnabled: comp.razorpayEnabled,
    userState: userParticipation ? {
      isRegistered: true,
      status: userParticipation.status,
      canSubmit: lifecycle === 'submission' && userParticipation.status === 'registered',
      canUpload: lifecycle === 'submission',
    } : {
      isRegistered: false,
      canRegister: lifecycle === 'open' && spotsLeft > 0,
      reason: spotsLeft <= 0 ? 'full' : lifecycle !== 'open' ? `lifecycle:${lifecycle}` : null,
    },
    serverTime: now.toISOString(),
  };
}

// GET /api/competitions - list
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    if (!isDbReady()) {
      const list = Array.from(memory.competitions.values()).map(c => competitionToResponse(c, null, now));
      return res.json({ data: list });
    }
    const comps = await Competition.find({}).lean();
    // For list we don't fetch per-user participation (cheap), just lifecycle
    const data = comps.map(c => {
      // attach computeLifecycle via rehydrating doc method
      const doc = new Competition(c);
      return competitionToResponse(doc, null, now);
    });
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/competitions/:slug - detail with userState
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = new Date();
  try {
    let comp;
    if (!isDbReady()) {
      comp = memory.competitions.get(slug);
      if (!comp) return res.status(404).json({ error: 'Competition not found' });
      // participation memory lookup
      const key = `${req.userId}:${comp._id || comp.slug}`;
      const part = memory.participations?.get(key) || null;
      return res.json({ data: competitionToResponse(comp, part, now) });
    }
    comp = await Competition.findOne({ slug });
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    let participation = null;
    // only query participation if we have an ObjectId user
    try {
      if (mongoose.Types.ObjectId.isValid(String(req.userId))) {
        participation = await Participation.findOne({ userId: req.userId, competitionId: comp._id }).lean();
      } else {
        // Check in-memory participations for demo user
        const key = `${req.userId}:${comp._id}`;
        if (memory.participations?.has(key)) participation = memory.participations.get(key);
      }
    } catch (_) {}
    res.json({ data: competitionToResponse(comp, participation, now) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/competitions/:slug/register - atomic booking with concurrency control
router.post('/:slug/register', async (req, res) => {
  const { slug } = req.params;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey || null;
  const now = new Date();

  // Validate payload
  const schema = Joi.object({
    idempotencyKey: Joi.string().optional(),
  });
  const { error } = schema.validate(req.body || {});
  if (error) return res.status(400).json({ error: error.message });

  // Memory fallback
  if (!isDbReady()) {
    const comp = memory.competitions.get(slug);
    if (!comp) return res.status(404).json({ error: 'Competition not found' });
    const lifecycle = comp.computeLifecycle ? comp.computeLifecycle(now) : (now > new Date(comp.registrationDeadline) ? 'closed' : 'open');
    if (lifecycle !== 'open') return res.status(409).json({ error: `Registration closed (lifecycle: ${lifecycle})`, lifecycle });
    if (comp.bookedCount >= comp.capacity) return res.status(409).json({ error: 'Competition is full', spotsLeft: 0 });
    const key = `${req.userId}:${comp._id || comp.slug}`;
    if (!memory.participations) memory.participations = new Map();
    if (memory.participations.has(key)) {
      return res.json({ data: { message: 'Already registered', competition: competitionToResponse(comp, memory.participations.get(key), now) } });
    }
    // Simulate atomic increment
    comp.bookedCount += 1;
    const part = { userId: req.userId, competitionId: comp._id || comp.slug, status: 'registered', createdAt: now.toISOString() };
    memory.participations.set(key, part);
    return res.status(201).json({ data: { message: 'Registered successfully', competition: competitionToResponse(comp, part, now) } });
  }

  // DB path — try transaction if replica set, fallback to atomic single-doc for standalone Mongo
  let useTx = true;
  const session = await mongoose.startSession();
  let resultComp;
  let participation;
  let wasExisting = false;
  const doRegister = async (withSession) => {
    const comp = withSession ? await Competition.findOne({ slug }).session(session) : await Competition.findOne({ slug });
    if (!comp) {
      const err = new Error('Competition not found');
      err.status = 404;
      throw err;
    }
    const lifecycle = comp.computeLifecycle(now);
    if (lifecycle !== 'open') {
      const err = new Error(`Registration closed (lifecycle: ${lifecycle})`);
      err.status = 409;
      err.lifecycle = lifecycle;
      throw err;
    }
    const existing = withSession ? await Participation.findOne({ userId: req.userId, competitionId: comp._id }).session(session) : await Participation.findOne({ userId: req.userId, competitionId: comp._id });
    if (existing) {
      resultComp = comp;
      participation = existing;
      wasExisting = true;
      return;
    }
    const filter = { _id: comp._id, bookedCount: { $lt: comp.capacity }, registrationDeadline: { $gt: now } };
    const update = { $inc: { bookedCount: 1, version: 1 } };
    const opts = withSession ? { new: true, session } : { new: true };
    const updated = await Competition.findOneAndUpdate(filter, update, opts);
    if (!updated) {
      const fresh = withSession ? await Competition.findById(comp._id).session(session) : await Competition.findById(comp._id);
      if (fresh.bookedCount >= fresh.capacity) {
        const err = new Error('Competition is full');
        err.status = 409;
        throw err;
      }
      if (fresh.registrationDeadline <= now) {
        const err = new Error('Registration deadline passed');
        err.status = 409;
        throw err;
      }
      const err = new Error('Unable to register — please retry');
      err.status = 409;
      throw err;
    }
    resultComp = updated;
    try {
      if (withSession) {
        const arr = await Participation.create([{ userId: req.userId, competitionId: comp._id, status: 'registered', idempotencyKey: idempotencyKey || undefined }], { session });
        participation = arr[0];
      } else {
        participation = await Participation.create({ userId: req.userId, competitionId: comp._id, status: 'registered', idempotencyKey: idempotencyKey || undefined });
      }
    } catch (e) {
      if (e.code === 11000) {
        if (withSession) await Competition.findByIdAndUpdate(comp._id, { $inc: { bookedCount: -1 } }, { session });
        else await Competition.findByIdAndUpdate(comp._id, { $inc: { bookedCount: -1 } });
        participation = withSession ? await Participation.findOne({ userId: req.userId, competitionId: comp._id }).session(session) : await Participation.findOne({ userId: req.userId, competitionId: comp._id });
        resultComp = withSession ? await Competition.findById(comp._id).session(session) : await Competition.findById(comp._id);
      } else throw e;
    }
  };

  try {
    try {
      await session.withTransaction(async () => { await doRegister(true); }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (txErr) {
      if (txErr.message && txErr.message.includes('Transaction numbers are only allowed')) {
        // Fallback to non-transactional path (standalone Mongo)
        resultComp = null; participation = null;
        await doRegister(false);
      } else throw txErr;
    }
    if (!resultComp) return res.status(404).json({ error: 'Competition not found' });
    const freshComp = await Competition.findById(resultComp._id);
    const freshPart = await Participation.findOne({ userId: req.userId, competitionId: resultComp._id });
    return res.status(wasExisting ? 200 : 201).json({
      data: {
        message: wasExisting ? 'Already registered' : 'Registered successfully',
        competition: competitionToResponse(freshComp, freshPart, now),
      }
    });
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ error: e.message, lifecycle: e.lifecycle });
  } finally {
    await session.endSession();
  }
});

// POST /api/competitions/:slug/submit - upload submission (only during submission window and if registered)
router.post('/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const { submissionUrl } = req.body || {};
  const now = new Date();
  if (!submissionUrl || typeof submissionUrl !== 'string') {
    return res.status(400).json({ error: 'submissionUrl is required' });
  }
  if (!isDbReady()) {
    const comp = memory.competitions.get(slug);
    if (!comp) return res.status(404).json({ error: 'Not found' });
    const lifecycle = comp.computeLifecycle ? comp.computeLifecycle(now) : 'open';
    if (lifecycle !== 'submission') return res.status(409).json({ error: `Submissions not open (lifecycle: ${lifecycle})` });
    const key = `${req.userId}:${comp._id || comp.slug}`;
    const part = memory.participations?.get(key);
    if (!part) return res.status(403).json({ error: 'Not registered for this competition' });
    part.submissionUrl = submissionUrl;
    part.status = 'submitted';
    part.submittedAt = now.toISOString();
    return res.json({ data: { message: 'Submission uploaded', participation: part } });
  }
  try {
    const comp = await Competition.findOne({ slug });
    if (!comp) return res.status(404).json({ error: 'Not found' });
    if (comp.computeLifecycle(now) !== 'submission') return res.status(409).json({ error: 'Submission window closed' });
    const part = await Participation.findOne({ userId: req.userId, competitionId: comp._id });
    if (!part) return res.status(403).json({ error: 'Not registered' });
    part.submissionUrl = submissionUrl;
    part.status = 'submitted';
    part.submittedAt = now;
    await part.save();
    res.json({ data: { message: 'Submission uploaded', participation: part } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// For memory store initialization
router._memory = memory;

module.exports = router;
