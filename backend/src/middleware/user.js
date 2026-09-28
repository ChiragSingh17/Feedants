// Simple header-based user identity for demo.
// Client sends x-user-id. If missing, a deterministic demo user is used.
// In production this would be JWT auth.
const mongoose = require('mongoose');
const User = require('../models/User');

// Fixed demo ObjectId for demo-user-001 so that Participation (ObjectId ref) works
const DEMO_OID = new mongoose.Types.ObjectId('000000000000000000000001');
const DEMO_STRING_ID = 'demo-user-001';

let demoUserEnsured = false;
async function ensureDemoUser() {
  if (demoUserEnsured) return;
  if (mongoose.connection.readyState !== 1) return;
  try {
    const exists = await User.findById(DEMO_OID);
    if (!exists) {
      await User.create({ _id: DEMO_OID, name: 'Demo User', referralCode: 'DEMO123', avatarUrl: 'https://i.pravatar.cc/150?img=68' });
      console.log('[User] Created demo user', DEMO_OID.toString());
    }
    demoUserEnsured = true;
  } catch (_) {}
}

async function userMiddleware(req, res, next) {
  const headerId = req.headers['x-user-id'];

  // Ensure demo user exists in DB if possible
  ensureDemoUser().catch(() => {});

  if (!headerId) {
    req.user = { _id: DEMO_OID, name: 'Demo User' };
    req.userId = DEMO_OID;
    return next();
  }

  if (headerId === DEMO_STRING_ID) {
    req.user = { _id: DEMO_OID, name: 'Demo User' };
    req.userId = DEMO_OID;
    return next();
  }

  // If header looks like ObjectId try to fetch
  try {
    if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(headerId)) {
      const u = await User.findById(headerId).lean();
      if (u) {
        req.user = u;
        req.userId = u._id;
        return next();
      }
      // valid OID but not found: treat as that OID (will create participation)
      req.user = { _id: new mongoose.Types.ObjectId(headerId), name: 'User ' + String(headerId).slice(-4) };
      req.userId = new mongoose.Types.ObjectId(headerId);
      return next();
    }
  } catch (_) {}

  // Fallback: hash string to deterministic OID? Use DEMO_OID for any non-OID string for demo
  // Create a deterministic OID from string hash (simple)
  let hash = 0;
  for (let i = 0; i < headerId.length; i++) hash = ((hash << 5) - hash + headerId.charCodeAt(i)) | 0;
  const hex = Math.abs(hash).toString(16).padStart(24, '0').slice(0, 24);
  try {
    const oid = new mongoose.Types.ObjectId(hex);
    req.user = { _id: oid, name: headerId };
    req.userId = oid;
  } catch {
    req.user = { _id: DEMO_OID, name: headerId };
    req.userId = DEMO_OID;
  }
  next();
}

module.exports = userMiddleware;
module.exports.DEMO_OID = DEMO_OID;
