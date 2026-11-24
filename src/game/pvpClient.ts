import {
  FriendPresence,
  MatchInvitePayload,
  PvpLobbyStats,
  PvpMatchSnapshot,
  Vec3,
} from './types';

export interface OpponentShotEvent {
  playerId: string;
  rackIndex: number;
  ballIndex: number;
  isMoney: boolean;
  releasePos: Vec3;
  vel: Vec3;
}

export interface PvpClientHandlers {
  onConnected?: (connected: boolean) => void;
  onWelcome?: (playerId: string, name: string) => void;
  onLobbyStats?: (stats: PvpLobbyStats) => void;
  onQueueStatus?: (inQueue: boolean, leagueId?: string | null, leagueName?: string | null) => void;
  onMatchState?: (match: PvpMatchSnapshot) => void;
  onOpponentShot?: (shot: OpponentShotEvent) => void;
  onOpponentLeft?: () => void;
  onFriendStatuses?: (statuses: Record<string, FriendPresence>) => void;
  onMatchInviteSent?: (invite: MatchInvitePayload) => void;
  onMatchInviteReceived?: (invite: MatchInvitePayload) => void;
  onMatchInviteDeclined?: (info: { inviteId: string; byName: string; expired: boolean }) => void;
  onMatchInviteCancelled?: (info: { inviteId: string; reason: string }) => void;
  onError?: (message: string) => void;
}

class PvpClient {
  private ws: WebSocket | null = null;
  private handlers: PvpClientHandlers = {};
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  public playerId: string | null = null;
  public connected = false;

  public setHandlers(handlers: PvpClientHandlers): void {
    this.handlers = handlers;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.handlers.onConnected?.(true);
    };

    ws.onmessage = (ev) => {
      let msg: { type?: string; payload?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const p = msg.payload as Record<string, unknown>;
      switch (msg.type) {
        case 'pvp:welcome':
          this.playerId = String(p.playerId ?? '');
          this.handlers.onWelcome?.(this.playerId, String(p.name ?? 'Shooter'));
          break;
        case 'lobby:stats':
          this.handlers.onLobbyStats?.(p as unknown as PvpLobbyStats);
          break;
        case 'pvp:queue_status':
          this.handlers.onQueueStatus?.(
            Boolean(p.inQueue),
            typeof p.leagueId === 'string' ? p.leagueId : null,
            typeof p.leagueName === 'string' ? p.leagueName : null
          );
          break;
        case 'pvp:match_state':
          this.handlers.onMatchState?.(p as unknown as PvpMatchSnapshot);
          break;
        case 'pvp:opponent_shot':
          this.handlers.onOpponentShot?.(p as unknown as OpponentShotEvent);
          break;
        case 'pvp:opponent_left':
          this.handlers.onOpponentLeft?.();
          break;
        case 'pvp:friend_statuses':
          if (p.statuses && typeof p.statuses === 'object') {
            this.handlers.onFriendStatuses?.(p.statuses as Record<string, FriendPresence>);
          }
          break;
        case 'pvp:match_invite_sent':
          this.handlers.onMatchInviteSent?.(p as unknown as MatchInvitePayload);
          break;
        case 'pvp:match_invite_received':
          this.handlers.onMatchInviteReceived?.(p as unknown as MatchInvitePayload);
          break;
        case 'pvp:match_invite_declined':
          this.handlers.onMatchInviteDeclined?.({
            inviteId: String(p.inviteId ?? ''),
            byName: String(p.byName ?? 'Opponent'),
            expired: Boolean(p.expired),
          });
          break;
        case 'pvp:match_invite_cancelled':
          this.handlers.onMatchInviteCancelled?.({
            inviteId: String(p.inviteId ?? ''),
            reason: String(p.reason ?? 'CANCELLED'),
          });
          break;
        case 'pvp:error':
          this.handlers.onError?.(String(p.message ?? 'Connection error'));
          break;
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.handlers.onConnected?.(false);
      if (!this.intentionalClose && this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      // Handled via onclose
    };
  }

  public disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  public setProfile(
    name: string,
    moneyRack: number,
    record?: { wins: number; losses: number; draws: number },
    uid?: string | null,
    stats?: { bestScore: number; bestStreak: number; accuracyPct: number }
  ): void {
    const body: Record<string, unknown> = { name, moneyRack, record };
    if (uid !== undefined) body.uid = uid;
    if (stats) body.stats = stats;
    this.send('lobby:set_profile', body);
  }

  public watchFriends(uids: string[]): void {
    this.send('friends:watch', { uids });
  }

  public sendMatchInvite(params: {
    targetUid: string;
    targetName: string;
    isRematch?: boolean;
    leagueId?: string | null;
    leagueName?: string | null;
  }): void {
    this.send('pvp:match_invite_send', {
      targetUid: params.targetUid,
      targetName: params.targetName,
      isRematch: Boolean(params.isRematch),
      leagueId: params.leagueId ?? null,
      leagueName: params.leagueName ?? null,
    });
  }

  public respondMatchInvite(inviteId: string, accept: boolean): void {
    this.send('pvp:match_invite_respond', { inviteId, accept });
  }

  public cancelMatchInvite(inviteId: string): void {
    this.send('pvp:match_invite_cancel', { inviteId });
  }

  public joinQueue(league?: { id: string; name: string } | null): void {
    this.send(
      'pvp:queue_join',
      league ? { leagueId: league.id, leagueName: league.name } : {}
    );
  }

  public leaveQueue(): void {
    this.send('pvp:queue_leave');
  }

  public createRoom(league?: { id: string; name: string } | null): void {
    this.send(
      'pvp:room_create',
      league ? { leagueId: league.id, leagueName: league.name } : {}
    );
  }

  public joinRoom(code: string): void {
    this.send('pvp:room_join', { code });
  }

  public leaveRoom(): void {
    this.send('pvp:room_leave');
  }

  public sendShotReleased(
    rackIndex: number,
    ballIndex: number,
    isMoney: boolean,
    releasePos: Vec3,
    vel: Vec3
  ): void {
    this.send('pvp:shot_released', { rackIndex, ballIndex, isMoney, releasePos, vel });
  }

  public sendShotResolved(
    rackIndex: number,
    ballIndex: number,
    made: boolean,
    isSwish: boolean
  ): void {
    this.send('pvp:shot_resolved', { rackIndex, ballIndex, made, isSwish });
  }

  public requestRematch(): void {
    this.send('pvp:rematch');
  }
}

export const pvpClient = new PvpClient();
