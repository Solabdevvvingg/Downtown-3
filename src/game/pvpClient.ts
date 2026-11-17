import { PvpLobbyStats, PvpMatchSnapshot, Vec3 } from './types';

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
  onQueueStatus?: (inQueue: boolean) => void;
  onMatchState?: (match: PvpMatchSnapshot) => void;
  onOpponentShot?: (shot: OpponentShotEvent) => void;
  onOpponentLeft?: () => void;
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
          this.handlers.onQueueStatus?.(Boolean(p.inQueue));
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
    record?: { wins: number; losses: number; draws: number }
  ): void {
    this.send('lobby:set_profile', { name, moneyRack, record });
  }

  public joinQueue(): void {
    this.send('pvp:queue_join');
  }

  public leaveQueue(): void {
    this.send('pvp:queue_leave');
  }

  public createRoom(): void {
    this.send('pvp:room_create');
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
