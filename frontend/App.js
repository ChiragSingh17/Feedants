import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { fetchCompetition, registerCompetition, submitEntry } from './src/api';
import { DEMO_USER_ID } from './src/config';

// Palette matched to Feedants design
const TEAL = '#0E6B7A';
const TEAL_DARK = '#0A4F5B';
const TEAL_LIGHT = '#E6F2F3';
const BG = '#F6F8F9';
const CARD = '#FFFFFF';
const TEXT = '#1A2B33';
const MUTED = '#6B7B86';
const BORDER = '#E6EEF0';
const GOLD = '#C8A84E';

function pad2(n) { return String(n).padStart(2, '0'); }

function formatCountdown(ms) {
  if (ms <= 0) return '00d : 00h : 00m : 00s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(d)}d : ${pad2(h)}h : ${pad2(m)}m : ${pad2(sec)}s`;
}

function formatDate(dStr) {
  if (!dStr) return '--';
  const d = new Date(dStr);
  // Desired: "10 Aug 26\n11:50 PM" — IST
  const dd = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' });
  const tt = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  return { date: dd, time: tt };
}

export default function App() {
  const [userId] = useState(DEMO_USER_ID);
  const [comp, setComp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState('about'); // about | judging | rules
  const [showMore, setShowMore] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lang, setLang] = useState('ENG');

  // tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchCompetition(userId);
      setComp(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // polling every 15s for spots/lifecycle consistency (multi-user)
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleRegister = async () => {
    if (!comp) return;
    if (comp.userState?.isRegistered) {
      Alert.alert('Already registered', 'You are already registered for this competition.');
      return;
    }
    if (comp.isFull) { Alert.alert('Full', 'No spots left'); return; }
    if (comp.lifecycle !== 'open') { Alert.alert('Registration closed', `Status: ${comp.lifecycle}`); return; }
    setActionLoading(true);
    try {
      const key = `${userId}:${Date.now()}`;
      await registerCompetition(userId, key);
      await load();
      Alert.alert('Success', 'Registered successfully! Upload your submission during the submission window.');
    } catch (e) {
      Alert.alert('Registration failed', e.message);
    } finally { setActionLoading(false); }
  };

  const handleUpload = async () => {
    if (!comp?.userState?.isRegistered) {
      Alert.alert('Not registered', 'Please register first');
      return;
    }
    if (comp.lifecycle !== 'submission') {
      Alert.alert('Submissions not open', `Submissions open: ${formatDate(comp.submissionStartsAt).date} - ${formatDate(comp.submissionEndsAt).date}`);
      return;
    }
    // In real app open file picker / video upload. Here we simulate with a dummy URL.
    Alert.prompt?.('Upload submission', 'Paste video URL (mp4 / drive link)', async (url) => {
      if (!url) return;
      setActionLoading(true);
      try {
        await submitEntry(userId, url);
        Alert.alert('Uploaded', 'Submission received!');
        await load();
      } catch (e) { Alert.alert('Upload failed', e.message); }
      finally { setActionLoading(false); }
    });
    // Fallback for Android where Alert.prompt not available: just use dummy
    if (Platform.OS === 'android') {
      const dummy = `https://example.com/submission/${Date.now()}.mp4`;
      setActionLoading(true);
      try {
        await submitEntry(userId, dummy);
        Alert.alert('Uploaded (demo)', dummy);
        await load();
      } catch (e) { Alert.alert('Upload failed', e.message); }
      finally { setActionLoading(false); }
    }
  };

  const copyReferral = async () => {
    const link = comp?.referral?.baseUrl || 'https://feedants.com/r/referral123';
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', link);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={{ marginTop: 12, color: MUTED }}>Loading competition...</Text>
      </View>
    );
  }

  if (error && !comp) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#B91C1C', textAlign: 'center', paddingHorizontal: 24 }}>{error}</Text>
        <Text style={{ color: MUTED, marginTop: 8, textAlign: 'center', paddingHorizontal: 24, fontSize: 12 }}>
          Backend not reachable. Start backend: cd backend && npm run dev (port 4000). For device, set LAN IP in src/config.js
        </Text>
        <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={[styles.btnPrimary, { marginTop: 16 }]}>
          <Text style={styles.btnPrimaryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const regDeadline = comp?.registrationDeadline ? new Date(comp.registrationDeadline).getTime() : 0;
  const msLeft = regDeadline - now;
  const spotsLeft = comp?.spotsLeft ?? 0;
  const booked = comp?.bookedCount ?? 0;
  const capacity = comp?.capacity ?? 20;
  const progress = capacity ? booked / capacity : 0;

  const regLabel = comp?.userState?.isRegistered ? 'Registered' : comp?.isFull ? 'Full' : comp?.lifecycle !== 'open' ? 'Closed' : 'Register Now';
  const canRegister = comp?.userState?.canRegister ?? (!comp?.userState?.isRegistered && comp?.lifecycle === 'open' && !comp?.isFull);
  const canUpload = comp?.userState?.isRegistered && comp?.lifecycle === 'submission';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backRow} onPress={() => Alert.alert('Go back', 'Back navigation (demo)')}>
          <Text style={styles.backArrow}>←</Text>
          <Text style={styles.backText}>Go back</Text>
        </TouchableOpacity>
        <View style={styles.langSwitch}>
          <TouchableOpacity onPress={() => setLang('ENG')} style={[styles.langBtn, lang === 'ENG' && styles.langActive]}><Text style={[styles.langText, lang === 'ENG' && styles.langTextActive]}>ENG</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setLang('हिंदी')} style={[styles.langBtn, lang === 'हिंदी' && styles.langActive]}><Text style={[styles.langText, lang === 'हिंदी' && styles.langTextActive]}>हिंदी</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TEAL]} />}
      >
        {/* Header card */}
        <View style={styles.card}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{comp?.title || 'Feedants Classical Dance'}</Text>
              <View style={{ flexDirection: 'row', marginTop: 6, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={styles.chip}><Text style={styles.chipText}>{comp?.category || 'Dance'}</Text></View>
                {(comp?.tags || ['Multi-Win']).map(t => (
                  <View key={t} style={[styles.chip, { backgroundColor: '#EFF6F7' }]}><Text style={[styles.chipText, { color: TEAL }]}>{t}</Text></View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: TEAL }}>🏆</Text>
                  <Text style={{ color: TEAL, fontSize: 12, fontWeight: '600' }}>{comp?.badge || 'Winners get certificate'}</Text>
                </View>
              </View>
            </View>
            {/* Registered badge / Register CTAs */}
            {comp?.userState?.isRegistered ? (
              <View style={styles.registeredBadge}>
                <View style={styles.checkCircle}><Text style={{ color: '#fff', fontSize: 10 }}>✓</Text></View>
                <Text style={styles.registeredText}>Registered</Text>
              </View>
            ) : (
              <TouchableOpacity disabled={!canRegister || actionLoading} onPress={handleRegister} style={[styles.registerBtn, (!canRegister && styles.registerBtnDisabled)]}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.registerBtnText}>{regLabel}</Text>}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Prize Pool</Text>
              <Text style={styles.statValueTeal}>₹ {comp?.prizePool?.toLocaleString('en-IN') || '1,500'}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Entry Fee</Text>
              <Text style={styles.statValue}>₹ {comp?.entryFee || 99}</Text>
            </View>
            <View style={[styles.stat, { flex: 1.2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: TEAL }}>👥</Text>
                <Text style={{ color: TEAL, fontWeight: '700', fontSize: 12 }}>Only {spotsLeft} spots left</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{booked} / {capacity} Booked</Text>
            </View>
          </View>
          {!canRegister && !comp?.userState?.isRegistered ? (
            <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 6 }}>
              {comp?.isFull ? 'Competition is full' : `Registration ${comp?.lifecycle} (${comp?.lifecycle})`}
            </Text>
          ) : null}
        </View>

        {/* Judge card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Image source={{ uri: comp?.judge?.avatarUrl || 'https://i.pravatar.cc/300?img=32' }} style={styles.judgeAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.judgeRole}>{comp?.judge?.role || 'Judge'}</Text>
              <Text style={styles.judgeName}>{comp?.judge?.name || 'Manju Dubey'}</Text>
              <Text style={styles.judgeBio}>{comp?.judge?.bio || 'Professional Kathak Dancer'}</Text>
              <Text style={styles.judgeBio}>12+ Years of Experience</Text>
            </View>
            <TouchableOpacity onPress={() => comp?.judge?.introVideoUrl && Linking.openURL(comp.judge.introVideoUrl)} style={styles.introBtn}>
              <View style={styles.playCircle}><Text style={{ color: TEAL, marginLeft: 2 }}>▶</Text></View>
              <Text style={styles.introText}>Intro Video</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Registration countdown */}
        <View style={[styles.card, { backgroundColor: TEAL_LIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text>⏳</Text>
            <Text style={styles.countdownLabel}>Registration closes in</Text>
          </View>
          <Text style={styles.countdownValue}>{formatCountdown(msLeft)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text>⏱️</Text>
            <Text style={{ color: TEAL, fontWeight: '700', fontSize: 12 }}>Hurry up!</Text>
          </View>
        </View>

        {/* Important Dates 2x2 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Important Dates</Text>
          <View style={styles.datesGrid}>
            {[
              { icon: '📅', label: 'Register Before', ...formatDate(comp?.registrationDeadline) },
              { icon: '✈️', label: 'Submission Starts', ...formatDate(comp?.submissionStartsAt) },
              { icon: '⬆️', label: 'Submission Ends', ...formatDate(comp?.submissionEndsAt) },
              { icon: '🏆', label: 'Result Date', ...formatDate(comp?.resultAt) },
            ].map((d, i) => (
              <View key={i} style={styles.dateCell}>
                <Text style={styles.dateIcon}>{d.icon}</Text>
                <View>
                  <Text style={styles.dateLabel}>{d.label}</Text>
                  <Text style={styles.dateValue}>{d.date}</Text>
                  <Text style={styles.dateTime}>{d.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Previous Winners */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Previous Winners</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 8 }}>
            {(comp?.previousWinners || []).map((w, idx) => (
              <View key={idx} style={styles.winnerCard}>
                <Image source={{ uri: w.avatarUrl }} style={styles.winnerImg} />
                <View style={styles.winnerPlay}><Text style={{ color: '#fff', fontSize: 10 }}>▶</Text></View>
                <Text style={styles.winnerName} numberOfLines={1}>{w.name}</Text>
                <Text style={styles.winnerRank}>{w.positionLabel}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Tabs */}
        <View style={styles.card}>
          <View style={styles.tabRow}>
            {[
              { k: 'about', l: 'About Competition' },
              { k: 'judging', l: 'Judging Parameters' },
              { k: 'rules', l: 'Rules & Eligibility' },
            ].map(t => (
              <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} style={[styles.tab, tab === t.k && styles.tabActive]}>
                <Text style={[styles.tabText, tab === t.k && styles.tabTextActive]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            {tab === 'about' && (
              <>
                <Text style={styles.bodyText}>{comp?.about?.short || 'This is an online classical dance competition...'}</Text>
                {showMore && <Text style={styles.bodyText}>{comp?.about?.long || ''}</Text>}
                <TouchableOpacity onPress={() => setShowMore(!showMore)} style={{ alignSelf: 'center', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ color: TEAL, fontWeight: '700', fontSize: 13 }}>{showMore ? 'View less' : 'View more'}</Text>
                  <Text style={{ color: TEAL }}>{showMore ? '▲' : '▼'}</Text>
                </TouchableOpacity>
              </>
            )}
            {tab === 'judging' && (
              <View style={{ gap: 10 }}>
                {(comp?.judgingParameters || []).map((j, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL, marginTop: 6 }} />
                    <View>
                      <Text style={{ fontWeight: '700', color: TEXT, fontSize: 13 }}>{j.title}</Text>
                      <Text style={{ color: MUTED, fontSize: 12 }}>{j.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {tab === 'rules' && (
              <View style={{ gap: 8 }}>
                {(comp?.rules || []).map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={{ color: TEAL }}>•</Text><Text style={styles.bodyText}>{r}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Rewards */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rewards <Text style={{ fontWeight: '400', color: MUTED, fontSize: 11 }}> (All Positions)</Text></Text>
          <View style={{ marginTop: 8, gap: 6 }}>
            {(comp?.rewards || []).map((r) => (
              <View key={r.position} style={styles.rewardRow}>
                <Text style={styles.rewardIcon}>{r.position === 1 ? '🏆' : r.position <= 3 ? '🥈' : '⭐'}</Text>
                <Text style={styles.rewardLabel}>{r.label}</Text>
                <Text style={styles.rewardAmount}>₹ {r.amount}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.infoIcon}>ⓘ</Text>
          <Text style={styles.disclaimerText}><Text style={{ fontWeight: '800' }}>Disclaimer:</Text> Only contributions from paid participants will be considered for judging.</Text>
        </View>

        {/* Prize money / Razorpay */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12 }}>
          <View style={[styles.card, { flex: 1 }]}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View style={styles.playBox}><Text style={{ color: TEAL }}>▶</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', fontSize: 12, color: TEXT }}>How will you receive prize money?</Text>
                <Text style={{ fontSize: 11, color: MUTED }}>Watch video to know more</Text>
              </View>
            </View>
          </View>
          <View style={[styles.card, { flex: 1, gap: 6 }]}>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Text>🛡️</Text><Text style={{ fontSize: 11, color: TEXT }}>Refund policy</Text></View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Text>🛡️</Text><Text style={{ fontSize: 10, color: MUTED }}>Secure payments powered by</Text>
              <Text style={{ fontWeight: '800', color: '#0A3D62', fontSize: 11 }}>Razorpay</Text>
            </View>
          </View>
        </View>

        {/* Refer & Earn */}
        <View style={[styles.card, { backgroundColor: '#EAF7EF', borderColor: '#C8EAD8' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 22 }}>📢</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: TEXT, fontSize: 13 }}>Refer & Earn more discount</Text>
                <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center', gap: 6 }}>
                  <Text style={styles.referLink} numberOfLines={1}>{comp?.referral?.baseUrl || 'https://feedants.com/r/referral123'}</Text>
                  <TouchableOpacity onPress={copyReferral} style={styles.copyBtn}><Text style={styles.copyText}>Copy Link</Text></TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={{ marginLeft: 12, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => Alert.alert('Refer', 'Share via WhatsApp / contacts (demo)')} style={styles.referNow}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Refer Now</Text></TouchableOpacity>
              <Text style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>You earn <Text style={{ fontWeight: '800', color: TEAL }}>₹10</Text> for every signup</Text>
            </View>
          </View>
        </View>

        {/* Hear from users */}
        <TouchableOpacity onPress={() => Alert.alert('Reviews', 'Participant testimonials (demo)')} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Text>💬</Text>
              <View>
                <Text style={{ fontWeight: '700', color: TEXT }}>Hear From Our Users</Text>
                <Text style={{ fontSize: 11, color: MUTED }}>See what participants say about Feedants</Text>
              </View>
            </View>
            <Text style={{ color: TEXT }}>›</Text>
          </View>
        </TouchableOpacity>

        {/* Ad */}
        <View style={styles.adBox}>
          <Text>📢</Text><Text style={{ color: MUTED, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>Ad Here</Text>
        </View>

        {/* Error banner if any */}
        {error ? <Text style={{ textAlign: 'center', color: '#B91C1C', fontSize: 11, marginTop: 8 }}>{error}</Text> : null}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={styles.sticky}>
        <TouchableOpacity
          disabled={actionLoading}
          onPress={canUpload ? handleUpload : comp?.userState?.isRegistered ? () => Alert.alert('Registered', 'Wait for submission window to upload') : handleRegister}
          style={[styles.uploadBtn, comp?.userState?.isRegistered && !canUpload ? { backgroundColor: TEAL } : {}]}
        >
          {actionLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.uploadText}>{canUpload ? 'Upload Submission' : comp?.userState?.isRegistered ? 'Registered — Upload during submission' : `Register — ₹${comp?.entryFee || 99}`}</Text>
              <Text style={styles.uploadSub}>{comp?.userState?.isRegistered ? 'Registered' : `${spotsLeft} spots left • ${formatCountdown(msLeft).slice(0, 11)}`}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Bottom nav */}
      <View style={styles.bottomNav}>
        {[
          { icon: '⌂', label: 'Home', active: false },
          { icon: '⌕', label: 'Explore', active: false },
          { icon: '+', label: '', active: false, isFab: true },
          { icon: '🏆', label: 'Competitions', active: true },
          { icon: '◉', label: 'Profile', active: false },
        ].map((t, i) => (
          <TouchableOpacity key={i} style={styles.navItem} onPress={() => !t.isFab && Alert.alert(t.label, 'Navigation (demo)')}>
            {t.isFab ? (
              <View style={styles.fab}><Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>+</Text></View>
            ) : (
              <>
                <Text style={[styles.navIcon, t.active && { color: TEAL }]}>{t.icon}</Text>
                <Text style={[styles.navLabel, t.active && { color: TEAL, fontWeight: '800' }]}>{t.label}</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingTop: Platform.OS === 'android' ? 28 : 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, paddingTop: 60 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10, backgroundColor: BG },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backArrow: { fontSize: 20, color: TEXT },
  backText: { fontSize: 15, fontWeight: '700', color: TEXT },
  langSwitch: { flexDirection: 'row', backgroundColor: '#E9EFF1', borderRadius: 20, padding: 2, gap: 2 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  langActive: { backgroundColor: TEAL },
  langText: { fontSize: 12, fontWeight: '700', color: MUTED },
  langTextActive: { color: '#fff' },

  card: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginHorizontal: 12, marginTop: 10, borderWidth: 1, borderColor: BORDER, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  title: { fontSize: 17, fontWeight: '800', color: TEXT },
  chip: { backgroundColor: '#F0F4F5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  chipText: { fontSize: 11, fontWeight: '600', color: MUTED },
  registeredBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF7EF', borderWidth: 1, borderColor: '#C8EAD8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  checkCircle: { width: 16, height: 16, borderRadius: 8, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center' },
  registeredText: { color: TEAL, fontWeight: '700', fontSize: 12 },
  registerBtn: { backgroundColor: TEAL, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  registerBtnDisabled: { backgroundColor: '#9CAEB5' },
  registerBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stat: { flex: 1 },
  statLabel: { fontSize: 11, color: MUTED },
  statValueTeal: { fontSize: 20, fontWeight: '800', color: TEAL, marginTop: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: TEXT, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: '#E6EEF0', borderRadius: 6, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: TEAL, borderRadius: 6 },
  progressLabel: { fontSize: 11, color: MUTED, marginTop: 4 },

  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },

  judgeAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E6EEF0' },
  judgeRole: { fontSize: 11, color: MUTED },
  judgeName: { fontSize: 14, fontWeight: '800', color: TEXT },
  judgeBio: { fontSize: 11, color: MUTED },
  introBtn: { alignItems: 'center', gap: 4 },
  playCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: TEAL_LIGHT, alignItems: 'center', justifyContent: 'center' },
  introText: { fontSize: 11, color: TEAL, fontWeight: '600' },

  countdownLabel: { fontSize: 12, fontWeight: '700', color: TEXT },
  countdownValue: { fontSize: 13, fontWeight: '800', color: TEAL },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: TEXT },
  datesGrid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: BORDER, borderRadius: 10, overflow: 'hidden', marginTop: 10 },
  dateCell: { width: '50%', flexDirection: 'row', gap: 10, padding: 12, borderWidth: 0.5, borderColor: BORDER, alignItems: 'center' },
  dateIcon: { fontSize: 18, color: TEAL },
  dateLabel: { fontSize: 11, color: MUTED },
  dateValue: { fontSize: 13, fontWeight: '700', color: TEAL },
  dateTime: { fontSize: 12, fontWeight: '600', color: TEXT },

  winnerCard: { width: 96, alignItems: 'center' },
  winnerImg: { width: 96, height: 96, borderRadius: 12, backgroundColor: '#E6EEF0' },
  winnerPlay: { position: 'absolute', top: 36, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(14,107,122,0.85)', alignItems: 'center', justifyContent: 'center' },
  winnerName: { fontSize: 12, fontWeight: '700', color: TEXT, marginTop: 6 },
  winnerRank: { fontSize: 11, color: TEAL },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: TEAL },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tabTextActive: { color: TEAL, fontWeight: '800' },
  bodyText: { fontSize: 12, color: MUTED, lineHeight: 18 },

  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  rewardIcon: { width: 18, textAlign: 'center' },
  rewardLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: TEXT },
  rewardAmount: { fontSize: 13, fontWeight: '800', color: TEAL },

  disclaimer: { flexDirection: 'row', gap: 8, backgroundColor: '#EAF2F4', marginHorizontal: 12, marginTop: 10, borderRadius: 10, padding: 10, alignItems: 'center' },
  infoIcon: { width: 18, height: 18, borderRadius: 9, backgroundColor: TEAL, color: '#fff', textAlign: 'center', fontSize: 11, lineHeight: 18, overflow: 'hidden' },
  disclaimerText: { flex: 1, fontSize: 11, color: TEXT },

  playBox: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#D6EEE8', alignItems: 'center', justifyContent: 'center' },
  referLink: { fontSize: 11, color: TEAL, flex: 1 },
  copyBtn: { borderWidth: 1, borderColor: TEAL, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#fff' },
  copyText: { fontSize: 11, fontWeight: '700', color: TEAL },
  referNow: { backgroundColor: TEAL, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },

  adBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 10, padding: 12, marginHorizontal: 12, marginTop: 10, backgroundColor: CARD },

  sticky: { position: 'absolute', bottom: 54, left: 0, right: 0, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'transparent' },
  uploadBtn: { backgroundColor: TEAL_DARK, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  uploadText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  uploadSub: { color: '#C8EAD8', fontSize: 11, marginTop: 2 },

  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 54, flexDirection: 'row', backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, alignItems: 'center' },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { fontSize: 18, color: MUTED },
  navLabel: { fontSize: 10, color: MUTED },
  fab: { width: 44, height: 44, borderRadius: 12, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
});
