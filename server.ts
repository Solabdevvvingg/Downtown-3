import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const CONTEST_SECONDS = 70;
const PRE_MATCH_INTRO_SECONDS = 15;
const RACK_BALL_COUNTS = [5, 5, 5, 1, 5, 5] as const;
const RACKS_COUNT = RACK_BALL_COUNTS.length;
const HALF_COURT_RACK_INDEX = 3;
const DEFAULT_MONEY_RACK_INDEX = 5;
const TOTAL_BALLS = RACK_BALL_COUNTS.reduce((sum, n) => sum + n, 0);

function getRackBallCount(rackIndex: number): number {
  return RACK_BALL_COUNTS[rackIndex] ?? 0;
}

function getSlotIndex(rackIndex: number, ballIndex: number): number {
  let start = 0;
  for (let r = 0; r < rackIndex && r < RACKS_COUNT; r++) {
    start += RACK_BALL_COUNTS[r];
  }
  return start + ballIndex;
}
const MATCH_INVITE_TTL_MS = 45_000;

type FriendPresence = 'ONLINE' | 'IN_MATCH' | 'QUEUED' | 'OFFLINE';

interface PvpBallRecord {
  status: 'PENDING' | 'MADE' | 'MISSED';
  isMoney: boolean;
  pointsAwarded: number;
}

interface PvpRecord {
  wins: number;
  losses: number;
  draws: number;
}

interface PvpPlayer {
  id: string;
  uid: string | null;
  name: string;
  ws: WebSocket;
  isHost: boolean;
  moneyRack: number;
  score: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  madeCount: number;
  attemptsCount: number;
  swishCount: number;
  currentRack: number;
  currentBall: number;
  balls: PvpBallRecord[];
  rematchReady: boolean;
  finishedShooting: boolean;
  record: PvpRecord;
  profileBestScore: number;
  profileBestStreak: number;
  profileAccuracyPct: number;
}

interface MatchRoom {
  id: string;
  code: string | null;
  leagueId: string | null;
  leagueName: string | null;
  status: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED';
  players: [PvpPlayer, PvpPlayer | null];
  countdownLeft: number;
  timeLeft: number;
  finishGraceLeft: number;
  winnerId: string | null;
  isTie: boolean;
  forfeitById: string | null;
  timerInterval: NodeJS.Timeout | null;
}

interface ClientSession {
  id: string;
  uid: string | null;
  name: string;
  ws: WebSocket;
  roomId: string | null;
  inQueue: boolean;
  queueLeagueId: string | null;
  queueLeagueName: string | null;
  moneyRack: number;
  record: PvpRecord;
  profileBestScore: number;
  profileBestStreak: number;
  profileAccuracyPct: number;
  watchedFriendUids: string[];
}

interface ServerMatchInvite {
  inviteId: string;
  fromUid: string;
  fromSessionId: string;
  fromName: string;
  toUid: string;
  toName: string;
  isRematch: boolean;
  leagueId: string | null;
  leagueName: string | null;
  expiresAtMs: number;
  timeout: NodeJS.Timeout;
}

const sessions = new Map<string, ClientSession>();
const rooms = new Map<string, MatchRoom>();
const roomByCode = new Map<string, string>();
const quickQueue: string[] = [];
const leagueQueues = new Map<string, string[]>();
const pendingInvites = new Map<string, ServerMatchInvite>();

let nextIdSeq = 1;
function genId(prefix: string): string {
  nextIdSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${nextIdSeq}`;
}

function genRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (roomByCode.has(code)) return genRoomCode();
  return code;
}

function createBallRecords(moneyRack: number): PvpBallRecord[] {
  const list: PvpBallRecord[] = [];
  for (let r = 0; r < RACKS_COUNT; r++) {
    const count = getRackBallCount(r);
    for (let b = 0; b < count; b++) {
      list.push({
        status: 'PENDING',
        isMoney: r === HALF_COURT_RACK_INDEX || r === moneyRack || b === count - 1,
        pointsAwarded: 0,
      });
    }
  }
  return list;
}

function createPvpPlayer(session: ClientSession, isHost: boolean): PvpPlayer {
  return {
    id: session.id,
    uid: session.uid,
    name: session.name,
    ws: session.ws,
    isHost,
    moneyRack: session.moneyRack,
    score: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    madeCount: 0,
    attemptsCount: 0,
    swishCount: 0,
    currentRack: 0,
    currentBall: 0,
    balls: createBallRecords(session.moneyRack),
    rematchReady: false,
    finishedShooting: false,
    record: { ...session.record },
    profileBestScore: session.profileBestScore,
    profileBestStreak: session.profileBestStreak,
    profileAccuracyPct: session.profileAccuracyPct,
  };
}

function sendJson(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function getSessionsByUid(uid: string): ClientSession[] {
  const matches: ClientSession[] = [];
  for (const s of sessions.values()) {
    if (s.uid === uid && s.ws.readyState === WebSocket.OPEN) {
      matches.push(s);
    }
  }
  return matches;
}

function getUidPresence(uid: string): FriendPresence {
  const userSessions = getSessionsByUid(uid);
  if (userSessions.length === 0) return 'OFFLINE';

  for (const s of userSessions) {
    if (s.roomId) {
      const room = rooms.get(s.roomId);
      if (room && room.status !== 'FINISHED') {
        return 'IN_MATCH';
      }
    }
  }
  for (const s of userSessions) {
    if (s.inQueue) return 'QUEUED';
  }
  return 'ONLINE';
}

function sendFriendStatuses(session: ClientSession): void {
  if (session.watchedFriendUids.length === 0) return;
  const statuses: Record<string, FriendPresence> = {};
  for (const fUid of session.watchedFriendUids) {
    statuses[fUid] = getUidPresence(fUid);
  }
  sendJson(session.ws, 'pvp:friend_statuses', { statuses });
}

function notifyWatchersOfUid(uid: string | null): void {
  if (!uid) return;
  for (const s of sessions.values()) {
    if (s.watchedFriendUids.includes(uid)) {
      sendFriendStatuses(s);
    }
  }
}

function serializeInvite(inv: ServerMatchInvite) {
  return {
    inviteId: inv.inviteId,
    fromUid: inv.fromUid,
    fromSessionId: inv.fromSessionId,
    fromName: inv.fromName,
    toUid: inv.toUid,
    toName: inv.toName,
    isRematch: inv.isRematch,
    leagueId: inv.leagueId,
    leagueName: inv.leagueName,
    expiresAtMs: inv.expiresAtMs,
  };
}

function cancelInvitesForSession(sessionId: string, reason: 'CANCELLED' | 'DISCONNECTED'): void {
  for (const [inviteId, inv] of pendingInvites.entries()) {
    if (inv.fromSessionId === sessionId) {
      clearTimeout(inv.timeout);
      pendingInvites.delete(inviteId);
      for (const targetSession of getSessionsByUid(inv.toUid)) {
        sendJson(targetSession.ws, 'pvp:match_invite_cancelled', {
          inviteId,
          reason,
        });
      }
    }
  }
}

function broadcastLobbyStats(): void {
  const activeMatches = Array.from(rooms.values()).filter(
    (r) => r.status === 'COUNTDOWN' || r.status === 'PLAYING'
  ).length;
  const leagueQueued: Record<string, number> = {};
  let totalLeagueQueued = 0;
  for (const [lId, q] of leagueQueues.entries()) {
    if (q.length > 0) {
      leagueQueued[lId] = q.length;
      totalLeagueQueued += q.length;
    }
  }
  const onlineShooters = Array.from(sessions.values())
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.roomId ? ('IN_MATCH' as const) : s.inQueue ? ('QUEUED' as const) : ('LOBBY' as const),
      record: s.record,
      isSignedIn: Boolean(s.uid),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order = { QUEUED: 0, LOBBY: 1, IN_MATCH: 2 };
        return order[a.status] - order[b.status];
      }
      if (a.isSignedIn !== b.isSignedIn) return a.isSignedIn ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 24)
    .map(({ id, name, status, record }) => ({ id, name, status, record }));

  const stats = {
    onlinePlayers: sessions.size,
    queuedPlayers: quickQueue.length + totalLeagueQueued,
    activeMatches,
    leagueQueued,
    onlineShooters,
  };
  for (const s of sessions.values()) {
    sendJson(s.ws, 'lobby:stats', stats);
  }
}

function serializePlayer(p: PvpPlayer) {
  return {
    id: p.id,
    uid: p.uid,
    name: p.name,
    isHost: p.isHost,
    moneyRack: p.moneyRack,
    score: p.score,
    streak: p.streak,
    bestStreak: p.bestStreak,
    multiplier: p.multiplier,
    madeCount: p.madeCount,
    attemptsCount: p.attemptsCount,
    swishCount: p.swishCount,
    currentRack: p.currentRack,
    currentBall: p.currentBall,
    balls: p.balls,
    rematchReady: p.rematchReady,
    finishedShooting: p.finishedShooting,
    record: p.record,
    profileBestScore: p.profileBestScore,
    profileBestStreak: p.profileBestStreak,
    profileAccuracyPct: p.profileAccuracyPct,
  };
}

function broadcastMatchState(room: MatchRoom): void {
  const payload = {
    roomId: room.id,
    code: room.code,
    leagueId: room.leagueId,
    leagueName: room.leagueName,
    status: room.status,
    countdownLeft: room.countdownLeft,
    timeLeft: Number(room.timeLeft.toFixed(1)),
    winnerId: room.winnerId,
    isTie: room.isTie,
    forfeitById: room.forfeitById,
    players: room.players.filter((p): p is PvpPlayer => p !== null).map(serializePlayer),
  };

  for (const p of room.players) {
    if (p) sendJson(p.ws, 'pvp:match_state', payload);
  }
}

function finalizeMatch(room: MatchRoom): void {
  if (room.status === 'FINISHED') return;
  room.status = 'FINISHED';
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  const p1 = room.players[0];
  const p2 = room.players[1];
  if (p1 && p2) {
    if (room.forfeitById) {
      room.winnerId = room.forfeitById === p1.id ? p2.id : p1.id;
      room.isTie = false;
    } else if (p1.score > p2.score) {
      room.winnerId = p1.id;
      room.isTie = false;
    } else if (p2.score > p1.score) {
      room.winnerId = p2.id;
      room.isTie = false;
    } else {
      room.winnerId = null;
      room.isTie = true;
    }
  }
  broadcastMatchState(room);
  broadcastLobbyStats();
  if (p1?.uid) notifyWatchersOfUid(p1.uid);
  if (p2?.uid) notifyWatchersOfUid(p2.uid);
}

function startMatchLoop(room: MatchRoom): void {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  room.status = 'COUNTDOWN';
  room.countdownLeft = PRE_MATCH_INTRO_SECONDS;
  room.timeLeft = CONTEST_SECONDS;
  room.finishGraceLeft = 2.2;
  room.winnerId = null;
  room.isTie = false;
  room.forfeitById = null;

  broadcastMatchState(room);
  broadcastLobbyStats();
  if (room.players[0]?.uid) notifyWatchersOfUid(room.players[0].uid);
  if (room.players[1]?.uid) notifyWatchersOfUid(room.players[1].uid);

  let tickAccum = 0;
  room.timerInterval = setInterval(() => {
    if (room.status === 'COUNTDOWN') {
      tickAccum += 0.25;
      if (tickAccum >= 1.0) {
        tickAccum = 0;
        room.countdownLeft -= 1;
        if (room.countdownLeft <= 0) {
          room.status = 'PLAYING';
          room.countdownLeft = 0;
        }
        broadcastMatchState(room);
      }
      return;
    }

    if (room.status === 'PLAYING') {
      if (room.timeLeft > 0) {
        room.timeLeft = Math.max(0, room.timeLeft - 0.25);
        const bothDone =
          room.players[0].finishedShooting &&
          (room.players[1]?.finishedShooting ?? true);
        if (bothDone) {
          room.finishGraceLeft -= 0.25;
          if (room.finishGraceLeft <= 0) {
            finalizeMatch(room);
            return;
          }
        }
        // Broadcast every 0.5s or when <= 10s every 0.25s
        if (room.timeLeft <= 10 || Math.round(room.timeLeft * 4) % 2 === 0) {
          broadcastMatchState(room);
        }
      } else {
        room.finishGraceLeft -= 0.25;
        if (room.finishGraceLeft <= 0) {
          finalizeMatch(room);
        }
      }
    }
  }, 250);
}

function removeFromQueue(sessionId: string): void {
  const idx = quickQueue.indexOf(sessionId);
  if (idx !== -1) quickQueue.splice(idx, 1);
  for (const [lId, q] of leagueQueues.entries()) {
    const lIdx = q.indexOf(sessionId);
    if (lIdx !== -1) q.splice(lIdx, 1);
    if (q.length === 0) leagueQueues.delete(lId);
  }
  const s = sessions.get(sessionId);
  if (s) {
    const wasQueued = s.inQueue;
    s.inQueue = false;
    s.queueLeagueId = null;
    s.queueLeagueName = null;
    if (wasQueued && s.uid) notifyWatchersOfUid(s.uid);
  }
}

function leaveCurrentRoom(session: ClientSession): void {
  if (!session.roomId) return;
  const room = rooms.get(session.roomId);
  session.roomId = null;
  if (!room) return;

  const p1 = room.players[0];
  const p2 = room.players[1];

  if (room.status === 'COUNTDOWN' || room.status === 'PLAYING') {
    room.forfeitById = session.id;
    finalizeMatch(room);
    if (p1 && p1.id !== session.id) {
      const otherSession = sessions.get(p1.id);
      if (otherSession) otherSession.roomId = null;
    }
    if (p2 && p2.id !== session.id) {
      const otherSession = sessions.get(p2.id);
      if (otherSession) otherSession.roomId = null;
    }
  } else {
    // Waiting or finished
    if (p1 && p1.id === session.id && !p2) {
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.code) roomByCode.delete(room.code);
      rooms.delete(room.id);
    } else {
      const remaining = p1.id === session.id ? p2 : p1;
      if (remaining) {
        sendJson(remaining.ws, 'pvp:opponent_left', { roomId: room.id });
        const remSession = sessions.get(remaining.id);
        if (remSession) remSession.roomId = null;
      }
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.code) roomByCode.delete(room.code);
      rooms.delete(room.id);
    }
  }
  broadcastLobbyStats();
  if (session.uid) notifyWatchersOfUid(session.uid);
  if (p1?.uid && p1.uid !== session.uid) notifyWatchersOfUid(p1.uid);
  if (p2?.uid && p2.uid !== session.uid) notifyWatchersOfUid(p2.uid);
}

function matchQueueList(
  queue: string[],
  leagueId: string | null,
  leagueName: string | null
): void {
  while (queue.length >= 2) {
    const id1 = queue.shift();
    const id2 = queue.shift();
    if (!id1 || !id2) break;

    const s1 = sessions.get(id1);
    const s2 = sessions.get(id2);
    if (!s1 || !s2) {
      if (s1) queue.unshift(s1.id);
      if (s2) queue.unshift(s2.id);
      continue;
    }

    const chosenLeagueName = leagueName ?? s1.queueLeagueName ?? s2.queueLeagueName ?? null;
    s1.inQueue = false;
    s1.queueLeagueId = null;
    s1.queueLeagueName = null;
    s2.inQueue = false;
    s2.queueLeagueId = null;
    s2.queueLeagueName = null;
    leaveCurrentRoom(s1);
    leaveCurrentRoom(s2);

    const roomId = genId('room');
    const room: MatchRoom = {
      id: roomId,
      code: null,
      leagueId,
      leagueName: chosenLeagueName,
      status: 'WAITING',
      players: [createPvpPlayer(s1, true), createPvpPlayer(s2, false)],
      countdownLeft: PRE_MATCH_INTRO_SECONDS,
      timeLeft: CONTEST_SECONDS,
      finishGraceLeft: 2.2,
      winnerId: null,
      isTie: false,
      forfeitById: null,
      timerInterval: null,
    };
    rooms.set(roomId, room);
    s1.roomId = roomId;
    s2.roomId = roomId;

    startMatchLoop(room);
  }
}

function tryMatchmake(targetLeagueId: string | null = null): void {
  if (targetLeagueId) {
    const lQueue = leagueQueues.get(targetLeagueId);
    if (lQueue) {
      matchQueueList(lQueue, targetLeagueId, null);
      if (lQueue.length === 0) leagueQueues.delete(targetLeagueId);
    }
  } else {
    matchQueueList(quickQueue, null, null);
  }
  broadcastLobbyStats();
}

async function bootstrap() {
  const app = express();
  const server = createServer(app);

  let firebaseAppletConfig: Record<string, string> = {};
  try {
    const rawConfig = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    firebaseAppletConfig = JSON.parse(rawConfig) as Record<string, string>;
  } catch (err) {
    console.warn('Could not read firebase-applet-config.json for auth proxy:', err);
  }

  const upstreamAuthHost = firebaseAppletConfig.authDomain || '';

  app.get('/__/firebase/init.json', (req, res) => {
    const host = req.get('x-forwarded-host') || req.get('host');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...firebaseAppletConfig,
      authDomain: host || firebaseAppletConfig.authDomain || '',
    });
  });

  app.all('/__/auth/*', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!upstreamAuthHost) {
      res.status(500).send('Firebase authDomain is not configured.');
      return;
    }

    try {
      const targetUrl = `https://${upstreamAuthHost}${req.originalUrl}`;
      const forwardHeaders: Record<string, string> = {
        host: upstreamAuthHost,
        'accept-encoding': 'identity',
      };

      const passthroughHeaders = ['accept', 'accept-language', 'content-type', 'cookie', 'user-agent'];
      for (const name of passthroughHeaders) {
        const value = req.get(name);
        if (value) forwardHeaders[name] = value;
      }

      const hasBody =
        req.method !== 'GET' &&
        req.method !== 'HEAD' &&
        Buffer.isBuffer(req.body) &&
        req.body.length > 0;

      const upstreamRes = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: hasBody ? new Uint8Array(req.body) : undefined,
        redirect: 'manual',
      });

      res.status(upstreamRes.status);

      const safeResHeaders = [
        'content-type',
        'cache-control',
        'pragma',
        'expires',
        'x-content-type-options',
        'referrer-policy',
      ];
      for (const name of safeResHeaders) {
        const val = upstreamRes.headers.get(name);
        if (val) res.setHeader(name, val);
      }

      const location = upstreamRes.headers.get('location');
      if (location) {
        const currentProto = req.get('x-forwarded-proto') || req.protocol || 'https';
        const currentHost = req.get('x-forwarded-host') || req.get('host');
        const rewritten = currentHost
          ? location.replace(`https://${upstreamAuthHost}`, `${currentProto}://${currentHost}`)
          : location;
        res.setHeader('location', rewritten);
      }

      const getSetCookie = (upstreamRes.headers as Headers & { getSetCookie?: () => string[] })
        .getSetCookie;
      if (typeof getSetCookie === 'function') {
        const cookies = getSetCookie.call(upstreamRes.headers).map((cookie) =>
          cookie.replace(/;\s*Domain=[^;]+/gi, '')
        );
        if (cookies.length > 0) {
          res.setHeader('set-cookie', cookies);
        }
      }

      const payload = Buffer.from(await upstreamRes.arrayBuffer());
      res.send(payload);
    } catch (err) {
      console.error('Firebase auth proxy error:', err);
      res.status(502).send('Upstream Firebase Auth handler could not be reached.');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const id = genId('player');
    const session: ClientSession = {
      id,
      uid: null,
      name: `Shooter ${id.slice(-3).toUpperCase()}`,
      ws,
      roomId: null,
      inQueue: false,
      queueLeagueId: null,
      queueLeagueName: null,
      moneyRack: DEFAULT_MONEY_RACK_INDEX,
      record: { wins: 0, losses: 0, draws: 0 },
      profileBestScore: 0,
      profileBestStreak: 0,
      profileAccuracyPct: 0,
      watchedFriendUids: [],
    };
    sessions.set(id, session);

    sendJson(ws, 'pvp:welcome', { playerId: id, name: session.name });
    broadcastLobbyStats();

    ws.on('message', (raw) => {
      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      const type = msg.type;
      const payload = msg.payload ?? {};

      if (type === 'lobby:set_profile') {
        const prevUid = session.uid;
        const name = String(payload.name ?? '').trim().slice(0, 16);
        if (name) session.name = name;
        const mr = Number(payload.moneyRack);
        if (Number.isInteger(mr) && mr >= 0 && mr < RACKS_COUNT && mr !== HALF_COURT_RACK_INDEX) {
          session.moneyRack = mr;
        }
        if (payload.uid === null) {
          session.uid = null;
        } else if (typeof payload.uid === 'string' && payload.uid.trim()) {
          session.uid = payload.uid.trim().slice(0, 128);
        }
        const rec = payload.record as Partial<PvpRecord> | undefined;
        if (rec && typeof rec === 'object') {
          session.record = {
            wins: Math.max(0, Math.round(Number(rec.wins) || 0)),
            losses: Math.max(0, Math.round(Number(rec.losses) || 0)),
            draws: Math.max(0, Math.round(Number(rec.draws) || 0)),
          };
        }
        const stats = payload.stats as
          | { bestScore?: unknown; bestStreak?: unknown; accuracyPct?: unknown }
          | undefined;
        if (stats && typeof stats === 'object') {
          session.profileBestScore = Math.max(0, Math.round(Number(stats.bestScore) || 0));
          session.profileBestStreak = Math.max(0, Math.round(Number(stats.bestStreak) || 0));
          session.profileAccuracyPct = Math.max(
            0,
            Math.min(100, Math.round(Number(stats.accuracyPct) || 0))
          );
        }
        if (prevUid && prevUid !== session.uid) notifyWatchersOfUid(prevUid);
        if (session.uid) notifyWatchersOfUid(session.uid);
        broadcastLobbyStats();
        return;
      }

      if (type === 'friends:watch') {
        const rawUids = Array.isArray(payload.uids) ? payload.uids : [];
        const cleanUids: string[] = [];
        for (const item of rawUids) {
          if (typeof item === 'string') {
            const trimmed = item.trim().slice(0, 128);
            if (trimmed && !cleanUids.includes(trimmed)) {
              cleanUids.push(trimmed);
            }
          }
          if (cleanUids.length >= 100) break;
        }
        session.watchedFriendUids = cleanUids;
        sendFriendStatuses(session);
        return;
      }

      if (type === 'pvp:match_invite_send') {
        if (!session.uid) {
          sendJson(ws, 'pvp:error', {
            message: 'Sign in with a shooter handle to send match requests.',
          });
          return;
        }
        const targetUid =
          typeof payload.targetUid === 'string' ? payload.targetUid.trim().slice(0, 128) : '';
        const targetName =
          typeof payload.targetName === 'string' && payload.targetName.trim()
            ? payload.targetName.trim().slice(0, 24)
            : 'Rival';
        if (!targetUid || targetUid === session.uid) {
          sendJson(ws, 'pvp:error', { message: 'Invalid match request target.' });
          return;
        }

        const targetSessions = getSessionsByUid(targetUid);
        if (targetSessions.length === 0) {
          sendJson(ws, 'pvp:error', {
            message: `@${targetName} is offline — create a private room code to invite them.`,
          });
          return;
        }

        const targetInLiveMatch = targetSessions.some((s) => {
          if (!s.roomId) return false;
          const r = rooms.get(s.roomId);
          return Boolean(r && r.status !== 'FINISHED');
        });
        if (targetInLiveMatch) {
          sendJson(ws, 'pvp:error', {
            message: `@${targetName} is currently in another live match.`,
          });
          return;
        }

        const leagueId =
          typeof payload.leagueId === 'string' && payload.leagueId.trim()
            ? payload.leagueId.trim().slice(0, 64)
            : null;
        const leagueName =
          leagueId && typeof payload.leagueName === 'string' && payload.leagueName.trim()
            ? payload.leagueName.trim().slice(0, 28)
            : null;
        const isRematch = Boolean(payload.isRematch);

        // Cancel any previous outbound challenge from this socket
        cancelInvitesForSession(session.id, 'CANCELLED');

        const inviteId = genId('inv');
        const expiresAtMs = Date.now() + MATCH_INVITE_TTL_MS;
        const timeout = setTimeout(() => {
          const expired = pendingInvites.get(inviteId);
          if (!expired) return;
          pendingInvites.delete(inviteId);
          const sender = sessions.get(expired.fromSessionId);
          if (sender) {
            sendJson(sender.ws, 'pvp:match_invite_declined', {
              inviteId,
              byName: expired.toName,
              expired: true,
            });
          }
          for (const ts of getSessionsByUid(expired.toUid)) {
            sendJson(ts.ws, 'pvp:match_invite_cancelled', {
              inviteId,
              reason: 'EXPIRED',
            });
          }
        }, MATCH_INVITE_TTL_MS);

        const invite: ServerMatchInvite = {
          inviteId,
          fromUid: session.uid,
          fromSessionId: session.id,
          fromName: session.name,
          toUid: targetUid,
          toName: targetName,
          isRematch,
          leagueId,
          leagueName,
          expiresAtMs,
          timeout,
        };
        pendingInvites.set(inviteId, invite);

        const serialized = serializeInvite(invite);
        sendJson(ws, 'pvp:match_invite_sent', serialized);
        for (const ts of targetSessions) {
          sendJson(ts.ws, 'pvp:match_invite_received', serialized);
        }
        return;
      }

      if (type === 'pvp:match_invite_respond') {
        const inviteId = typeof payload.inviteId === 'string' ? payload.inviteId : '';
        const accept = Boolean(payload.accept);
        const inv = pendingInvites.get(inviteId);
        if (!inv) {
          if (accept) {
            sendJson(ws, 'pvp:error', {
              message: 'Match request expired or was cancelled.',
            });
          }
          return;
        }
        if (!session.uid || inv.toUid !== session.uid) return;

        clearTimeout(inv.timeout);
        pendingInvites.delete(inviteId);

        const senderSession = sessions.get(inv.fromSessionId);
        if (!accept) {
          if (senderSession) {
            sendJson(senderSession.ws, 'pvp:match_invite_declined', {
              inviteId,
              byName: session.name,
              expired: false,
            });
          }
          return;
        }

        if (!senderSession || senderSession.ws.readyState !== WebSocket.OPEN) {
          sendJson(ws, 'pvp:error', {
            message: 'Challenger disconnected before the match could start.',
          });
          return;
        }
        const senderRoom = senderSession.roomId ? rooms.get(senderSession.roomId) : undefined;
        if (senderRoom && (senderRoom.status === 'COUNTDOWN' || senderRoom.status === 'PLAYING')) {
          sendJson(ws, 'pvp:error', {
            message: 'Challenger already entered another match.',
          });
          return;
        }

        // Clear any remaining pending invites for both players
        cancelInvitesForSession(senderSession.id, 'CANCELLED');
        cancelInvitesForSession(session.id, 'CANCELLED');
        removeFromQueue(senderSession.id);
        removeFromQueue(session.id);
        leaveCurrentRoom(senderSession);
        leaveCurrentRoom(session);

        const roomId = genId('room');
        const room: MatchRoom = {
          id: roomId,
          code: null,
          leagueId: inv.leagueId,
          leagueName: inv.leagueName,
          status: 'WAITING',
          players: [createPvpPlayer(senderSession, true), createPvpPlayer(session, false)],
          countdownLeft: PRE_MATCH_INTRO_SECONDS,
          timeLeft: CONTEST_SECONDS,
          finishGraceLeft: 2.2,
          winnerId: null,
          isTie: false,
          forfeitById: null,
          timerInterval: null,
        };
        rooms.set(roomId, room);
        senderSession.roomId = roomId;
        session.roomId = roomId;

        startMatchLoop(room);
        return;
      }

      if (type === 'pvp:match_invite_cancel') {
        const inviteId = typeof payload.inviteId === 'string' ? payload.inviteId : '';
        const inv = pendingInvites.get(inviteId);
        if (!inv || inv.fromSessionId !== session.id) return;
        clearTimeout(inv.timeout);
        pendingInvites.delete(inviteId);
        for (const ts of getSessionsByUid(inv.toUid)) {
          sendJson(ts.ws, 'pvp:match_invite_cancelled', {
            inviteId,
            reason: 'CANCELLED',
          });
        }
        return;
      }

      if (type === 'pvp:queue_join') {
        removeFromQueue(session.id);
        leaveCurrentRoom(session);
        const leagueId =
          typeof payload.leagueId === 'string' && payload.leagueId.trim()
            ? payload.leagueId.trim().slice(0, 64)
            : null;
        const leagueName =
          leagueId && typeof payload.leagueName === 'string' && payload.leagueName.trim()
            ? payload.leagueName.trim().slice(0, 28)
            : null;

        session.inQueue = true;
        session.queueLeagueId = leagueId;
        session.queueLeagueName = leagueName;

        if (leagueId) {
          const lQueue = leagueQueues.get(leagueId) ?? [];
          lQueue.push(session.id);
          leagueQueues.set(leagueId, lQueue);
        } else {
          quickQueue.push(session.id);
        }

        sendJson(ws, 'pvp:queue_status', {
          inQueue: true,
          leagueId,
          leagueName,
        });
        if (session.uid) notifyWatchersOfUid(session.uid);
        tryMatchmake(leagueId);
        return;
      }

      if (type === 'pvp:queue_leave') {
        removeFromQueue(session.id);
        sendJson(ws, 'pvp:queue_status', {
          inQueue: false,
          leagueId: null,
          leagueName: null,
        });
        broadcastLobbyStats();
        return;
      }

      if (type === 'pvp:room_create') {
        removeFromQueue(session.id);
        leaveCurrentRoom(session);

        const leagueId =
          typeof payload.leagueId === 'string' && payload.leagueId.trim()
            ? payload.leagueId.trim().slice(0, 64)
            : null;
        const leagueName =
          leagueId && typeof payload.leagueName === 'string' && payload.leagueName.trim()
            ? payload.leagueName.trim().slice(0, 28)
            : null;

        const code = genRoomCode();
        const roomId = genId('room');
        const room: MatchRoom = {
          id: roomId,
          code,
          leagueId,
          leagueName,
          status: 'WAITING',
          players: [createPvpPlayer(session, true), null],
          countdownLeft: PRE_MATCH_INTRO_SECONDS,
          timeLeft: CONTEST_SECONDS,
          finishGraceLeft: 2.2,
          winnerId: null,
          isTie: false,
          forfeitById: null,
          timerInterval: null,
        };
        rooms.set(roomId, room);
        roomByCode.set(code, roomId);
        session.roomId = roomId;

        broadcastMatchState(room);
        broadcastLobbyStats();
        if (session.uid) notifyWatchersOfUid(session.uid);
        return;
      }

      if (type === 'pvp:room_join') {
        const code = String(payload.code ?? '').trim().toUpperCase();
        const targetRoomId = roomByCode.get(code);
        const room = targetRoomId ? rooms.get(targetRoomId) : undefined;
        if (!room || room.status !== 'WAITING' || room.players[1] !== null) {
          sendJson(ws, 'pvp:error', {
            message: 'Room not found or already in progress.',
          });
          return;
        }
        if (room.players[0].id === session.id) return;

        removeFromQueue(session.id);
        leaveCurrentRoom(session);

        room.players[1] = createPvpPlayer(session, false);
        session.roomId = room.id;
        startMatchLoop(room);
        return;
      }

      if (type === 'pvp:room_leave') {
        removeFromQueue(session.id);
        leaveCurrentRoom(session);
        return;
      }

      if (type === 'pvp:shot_released') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.status !== 'PLAYING') return;
        const player = room.players.find((p) => p?.id === session.id);
        const opponent = room.players.find((p) => p && p.id !== session.id);
        if (!player || !opponent) return;

        const rackIndex = Number(payload.rackIndex);
        const ballIndex = Number(payload.ballIndex);
        if (Number.isInteger(rackIndex)) player.currentRack = rackIndex;
        if (Number.isInteger(ballIndex)) player.currentBall = ballIndex;

        sendJson(opponent.ws, 'pvp:opponent_shot', {
          playerId: player.id,
          rackIndex,
          ballIndex,
          isMoney: Boolean(payload.isMoney),
          releasePos: payload.releasePos,
          vel: payload.vel,
        });
        return;
      }

      if (type === 'pvp:shot_resolved') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || (room.status !== 'PLAYING' && room.status !== 'FINISHED')) return;
        const player = room.players.find((p) => p?.id === session.id);
        if (!player) return;

        const rackIndex = Number(payload.rackIndex);
        const ballIndex = Number(payload.ballIndex);
        const made = Boolean(payload.made);
        const isSwish = Boolean(payload.isSwish);

        if (
          !Number.isInteger(rackIndex) ||
          !Number.isInteger(ballIndex) ||
          rackIndex < 0 ||
          rackIndex >= RACKS_COUNT ||
          ballIndex < 0 ||
          ballIndex >= getRackBallCount(rackIndex)
        ) {
          return;
        }

        const slotIdx = getSlotIndex(rackIndex, ballIndex);
        const slot = player.balls[slotIdx];
        if (!slot || slot.status !== 'PENDING') return; // Idempotent guard

        player.attemptsCount += 1;
        if (made) {
          const basePts = slot.isMoney ? 2 : 1;
          const pts = basePts * player.multiplier;
          player.score += pts;
          player.streak += 1;
          if (player.streak > player.bestStreak) player.bestStreak = player.streak;
          player.multiplier += 1;
          player.madeCount += 1;
          if (isSwish) player.swishCount += 1;
          slot.status = 'MADE';
          slot.pointsAwarded = pts;
        } else {
          player.streak = 0;
          player.multiplier = 1;
          slot.status = 'MISSED';
          slot.pointsAwarded = 0;
        }

        // Check if all 26 balls resolved
        if (player.attemptsCount >= TOTAL_BALLS) {
          player.finishedShooting = true;
        }

        broadcastMatchState(room);
        return;
      }

      if (type === 'pvp:rematch') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.status !== 'FINISHED') return;
        const player = room.players.find((p) => p?.id === session.id);
        if (!player) return;

        player.rematchReady = true;
        const p1 = room.players[0];
        const p2 = room.players[1];
        if (p1 && p2 && p1.rematchReady && p2.rematchReady) {
          const s1 = sessions.get(p1.id);
          const s2 = sessions.get(p2.id);
          room.players[0] = {
            ...createPvpPlayer(
              {
                ...session,
                id: p1.id,
                uid: s1?.uid ?? p1.uid,
                name: p1.name,
                ws: p1.ws,
                roomId: room.id,
                inQueue: false,
                moneyRack: p1.moneyRack,
                record: s1?.record ?? p1.record,
                profileBestScore: s1?.profileBestScore ?? p1.profileBestScore,
                profileBestStreak: s1?.profileBestStreak ?? p1.profileBestStreak,
                profileAccuracyPct: s1?.profileAccuracyPct ?? p1.profileAccuracyPct,
              },
              true
            ),
          };
          room.players[1] = {
            ...createPvpPlayer(
              {
                ...session,
                id: p2.id,
                uid: s2?.uid ?? p2.uid,
                name: p2.name,
                ws: p2.ws,
                roomId: room.id,
                inQueue: false,
                moneyRack: p2.moneyRack,
                record: s2?.record ?? p2.record,
                profileBestScore: s2?.profileBestScore ?? p2.profileBestScore,
                profileBestStreak: s2?.profileBestStreak ?? p2.profileBestStreak,
                profileAccuracyPct: s2?.profileAccuracyPct ?? p2.profileAccuracyPct,
              },
              false
            ),
          };
          startMatchLoop(room);
        } else {
          broadcastMatchState(room);
        }
      }
    });

    ws.on('close', () => {
      const closedUid = session.uid;
      cancelInvitesForSession(session.id, 'DISCONNECTED');
      removeFromQueue(session.id);
      leaveCurrentRoom(session);
      sessions.delete(session.id);
      broadcastLobbyStats();
      if (closedUid) notifyWatchersOfUid(closedUid);
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Downtown 3 server listening on http://localhost:${PORT}`);
  });
}

bootstrap();
