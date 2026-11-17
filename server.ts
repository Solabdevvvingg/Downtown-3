import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const CONTEST_SECONDS = 60;
const RACKS_COUNT = 5;
const BALLS_PER_RACK = 5;
const TOTAL_BALLS = RACKS_COUNT * BALLS_PER_RACK;

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
}

interface MatchRoom {
  id: string;
  code: string | null;
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
  name: string;
  ws: WebSocket;
  roomId: string | null;
  inQueue: boolean;
  moneyRack: number;
  record: PvpRecord;
}

const sessions = new Map<string, ClientSession>();
const rooms = new Map<string, MatchRoom>();
const roomByCode = new Map<string, string>();
const quickQueue: string[] = [];

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
    for (let b = 0; b < BALLS_PER_RACK; b++) {
      list.push({
        status: 'PENDING',
        isMoney: r === moneyRack || b === BALLS_PER_RACK - 1,
        pointsAwarded: 0,
      });
    }
  }
  return list;
}

function createPvpPlayer(session: ClientSession, isHost: boolean): PvpPlayer {
  return {
    id: session.id,
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
  };
}

function sendJson(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function broadcastLobbyStats(): void {
  const activeMatches = Array.from(rooms.values()).filter(
    (r) => r.status === 'COUNTDOWN' || r.status === 'PLAYING'
  ).length;
  const stats = {
    onlinePlayers: sessions.size,
    queuedPlayers: quickQueue.length,
    activeMatches,
  };
  for (const s of sessions.values()) {
    sendJson(s.ws, 'lobby:stats', stats);
  }
}

function serializePlayer(p: PvpPlayer) {
  return {
    id: p.id,
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
  };
}

function broadcastMatchState(room: MatchRoom): void {
  const payload = {
    roomId: room.id,
    code: room.code,
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
}

function startMatchLoop(room: MatchRoom): void {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }

  room.status = 'COUNTDOWN';
  room.countdownLeft = 3;
  room.timeLeft = CONTEST_SECONDS;
  room.finishGraceLeft = 2.2;
  room.winnerId = null;
  room.isTie = false;
  room.forfeitById = null;

  broadcastMatchState(room);
  broadcastLobbyStats();

  let tickAccum = 0;
  room.timerInterval = setInterval(() => {
    if (room.status === 'COUNTDOWN') {
      tickAccum += 0.25;
      if (tickAccum >= 0.65) {
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
  const s = sessions.get(sessionId);
  if (s) s.inQueue = false;
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
}

function tryMatchmake(): void {
  while (quickQueue.length >= 2) {
    const id1 = quickQueue.shift();
    const id2 = quickQueue.shift();
    if (!id1 || !id2) break;

    const s1 = sessions.get(id1);
    const s2 = sessions.get(id2);
    if (!s1 || !s2) {
      if (s1) quickQueue.unshift(s1.id);
      if (s2) quickQueue.unshift(s2.id);
      continue;
    }

    s1.inQueue = false;
    s2.inQueue = false;
    leaveCurrentRoom(s1);
    leaveCurrentRoom(s2);

    const roomId = genId('room');
    const room: MatchRoom = {
      id: roomId,
      code: null,
      status: 'WAITING',
      players: [createPvpPlayer(s1, true), createPvpPlayer(s2, false)],
      countdownLeft: 3,
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
  broadcastLobbyStats();
}

async function bootstrap() {
  const app = express();
  const server = createServer(app);

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const id = genId('player');
    const session: ClientSession = {
      id,
      name: `Shooter ${id.slice(-3).toUpperCase()}`,
      ws,
      roomId: null,
      inQueue: false,
      moneyRack: 4,
      record: { wins: 0, losses: 0, draws: 0 },
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
        const name = String(payload.name ?? '').trim().slice(0, 16);
        if (name) session.name = name;
        const mr = Number(payload.moneyRack);
        if (Number.isInteger(mr) && mr >= 0 && mr < RACKS_COUNT) {
          session.moneyRack = mr;
        }
        const rec = payload.record as Partial<PvpRecord> | undefined;
        if (rec && typeof rec === 'object') {
          session.record = {
            wins: Math.max(0, Math.round(Number(rec.wins) || 0)),
            losses: Math.max(0, Math.round(Number(rec.losses) || 0)),
            draws: Math.max(0, Math.round(Number(rec.draws) || 0)),
          };
        }
        return;
      }

      if (type === 'pvp:queue_join') {
        leaveCurrentRoom(session);
        if (!session.inQueue) {
          session.inQueue = true;
          quickQueue.push(session.id);
          sendJson(ws, 'pvp:queue_status', { inQueue: true });
          tryMatchmake();
        }
        return;
      }

      if (type === 'pvp:queue_leave') {
        removeFromQueue(session.id);
        sendJson(ws, 'pvp:queue_status', { inQueue: false });
        broadcastLobbyStats();
        return;
      }

      if (type === 'pvp:room_create') {
        removeFromQueue(session.id);
        leaveCurrentRoom(session);

        const code = genRoomCode();
        const roomId = genId('room');
        const room: MatchRoom = {
          id: roomId,
          code,
          status: 'WAITING',
          players: [createPvpPlayer(session, true), null],
          countdownLeft: 3,
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
          ballIndex >= BALLS_PER_RACK
        ) {
          return;
        }

        const slotIdx = rackIndex * BALLS_PER_RACK + ballIndex;
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

        // Check if all 25 balls resolved
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
            ...createPvpPlayer({ ...session, id: p1.id, name: p1.name, ws: p1.ws, roomId: room.id, inQueue: false, moneyRack: p1.moneyRack, record: s1?.record ?? p1.record }, true),
          };
          room.players[1] = {
            ...createPvpPlayer({ ...session, id: p2.id, name: p2.name, ws: p2.ws, roomId: room.id, inQueue: false, moneyRack: p2.moneyRack, record: s2?.record ?? p2.record }, false),
          };
          startMatchLoop(room);
        } else {
          broadcastMatchState(room);
        }
      }
    });

    ws.on('close', () => {
      removeFromQueue(session.id);
      leaveCurrentRoom(session);
      sessions.delete(session.id);
      broadcastLobbyStats();
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
