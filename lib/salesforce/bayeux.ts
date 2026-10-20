/**
 * Minimal Bayeux (CometD) long-polling client for Salesforce streaming:
 * handshake -> subscribe (+replay) -> connect loop -> disconnect.
 * Hand-rolled on fetch (no dependency): long-polling only, one transport,
 * advice-driven reconnect with resubscribe. The UI owns lifecycle; the
 * transport is injected so tests run without a network.
 */

export interface BayeuxMessage {
  channel: string;
  clientId?: string;
  version?: string;
  minimumVersion?: string;
  supportedConnectionTypes?: string[];
  connectionType?: string;
  advice?: { timeout?: number; interval?: number; reconnect?: string };
  successful?: boolean;
  subscription?: string;
  error?: string;
  data?: unknown;
  event?: { replayId?: number };
  ext?: { replay?: Record<string, number> };
  id?: string | number;
  [key: string]: unknown;
}

/** -1 = new events only, -2 = stored in window, else an explicit replay id. */
export type ReplayPosition = number;

export interface ChannelSub {
  channel: string;
  replay: ReplayPosition;
}

export type BayeuxStatus =
  | { state: "connecting" }
  | { state: "connected"; clientId: string }
  | { state: "reconnecting"; attempt: number; message: string }
  | { state: "disconnected" }
  | { state: "failed"; message: string };

export type BayeuxPost = (messages: BayeuxMessage[]) => Promise<BayeuxMessage[]>;

export function handshakeMessages(): BayeuxMessage[] {
  return [
    {
      channel: "/meta/handshake",
      version: "1.0",
      minimumVersion: "1.0",
      supportedConnectionTypes: ["long-polling"],
      advice: { timeout: 60000, interval: 0 },
    },
  ];
}

export function connectMessage(clientId: string): BayeuxMessage {
  return { channel: "/meta/connect", clientId, connectionType: "long-polling" };
}

export function subscribeMessage(clientId: string, sub: ChannelSub): BayeuxMessage {
  return {
    channel: "/meta/subscribe",
    clientId,
    subscription: sub.channel,
    ext: { replay: { [sub.channel]: sub.replay } },
  };
}

export function unsubscribeMessage(clientId: string, channel: string): BayeuxMessage {
  return { channel: "/meta/unsubscribe", clientId, subscription: channel };
}

export function disconnectMessage(clientId: string): BayeuxMessage {
  return { channel: "/meta/disconnect", clientId };
}

export function parseHandshake(messages: BayeuxMessage[]): { clientId: string } | { error: string } {
  const reply = messages.find((m) => m.channel === "/meta/handshake");
  if (!reply) return { error: "No handshake reply" };
  if (reply.successful !== true) {
    const detail = typeof reply.error === "string" && reply.error ? `: ${reply.error}` : "";
    return { error: `Handshake refused${detail}` };
  }
  if (typeof reply.clientId !== "string" || !reply.clientId) return { error: "Handshake reply has no clientId" };
  return { clientId: reply.clientId };
}

/** True when the message carries an event payload for a subscribed channel. */
export function isEventDelivery(msg: BayeuxMessage): boolean {
  return (
    typeof msg.channel === "string" &&
    !msg.channel.startsWith("/meta/") &&
    Object.prototype.hasOwnProperty.call(msg, "data")
  );
}

export function extractReplayId(msg: BayeuxMessage): number | null {
  const id = msg.event?.replayId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/** Channel path builders + loose validation (custom paths pass through). */
export const platformEventChannel = (apiName: string): string => `/event/${apiName.trim()}`;
export const changeEventChannel = (apiName: string): string => `/data/${apiName.trim()}ChangeEvent`;
export const topicChannel = (name: string): string => `/topic/${name.trim()}`;

export function isChannelPath(text: string): boolean {
  const t = text.trim();
  return t.startsWith("/") && !/\s/.test(t) && t.length > 1;
}

let subSeq = 0;

/**
 * One streaming session: handshake, subscribe all channels, then a connect
 * loop until stop(). A failed connect re-handshakes and resubscribes every
 * channel from its last seen replay id (no gaps, minimal dupes).
 */
export class BayeuxClient {
  private clientId: string | null = null;
  private stopped = true;
  private lastReplay = new Map<string, number>();
  private attempt = 0;
  private subs: ChannelSub[] = [];

  constructor(
    private post: BayeuxPost,
    private onEvent: (channel: string, data: unknown, replayId: number | null) => void,
    private onStatus: (s: BayeuxStatus) => void
  ) {}

  get running(): boolean {
    return !this.stopped;
  }

  /**
   * True when the handshake + subscriptions landed and the connect loop is
   * running. False when establish failed (status already reports it) - the
   * caller must not record the subscription in that case.
   */
  async start(subs: ChannelSub[]): Promise<boolean> {
    if (!this.stopped) return true;
    if (subs.length === 0) throw new Error("Subscribe to at least one channel");
    this.stopped = false;
    this.attempt = 0;
    this.subs = [...subs];
    try {
      await this.establish();
    } catch (err) {
      this.stopped = true;
      this.onStatus({ state: "failed", message: err instanceof Error ? err.message : "Connect failed" });
      return false;
    }
    void this.loop();
    return true;
  }

  /** Subscribe more channels on the live connection (no re-handshake). */
  async addChannels(subs: ChannelSub[]): Promise<void> {
    if (this.stopped || !this.clientId) throw new Error("Not connected");
    for (const sub of subs) {
      if (this.subs.some((s) => s.channel === sub.channel)) continue;
      const replay = this.lastReplay.get(sub.channel) ?? sub.replay;
      const replies = await this.post([subscribeMessage(this.clientId, { channel: sub.channel, replay })]);
      const reply = replies.find((m) => m.channel === "/meta/subscribe");
      if (reply && reply.successful === false) {
        const detail = typeof reply.error === "string" && reply.error ? `: ${reply.error}` : "";
        throw new Error(`Subscribe refused for ${sub.channel}${detail}`);
      }
      this.subs.push(sub);
    }
  }

  /** Drop one channel; the connection stays up for the rest. */
  async removeChannel(channel: string): Promise<void> {
    this.subs = this.subs.filter((s) => s.channel !== channel);
    if (this.stopped || !this.clientId) return;
    try {
      await this.post([unsubscribeMessage(this.clientId, channel)]);
    } catch {
      /* goodbye is best-effort */
    }
  }

  get channels(): string[] {
    return this.subs.map((s) => s.channel);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const id = this.clientId;
    this.clientId = null;
    this.onStatus({ state: "disconnected" });
    if (id) {
      void this.post([disconnectMessage(id)]).catch(() => {
        /* goodbye is best-effort */
      });
    }
  }

  private async establish(): Promise<void> {
    const hs = await this.post(handshakeMessages());
    const parsed = parseHandshake(hs);
    if ("error" in parsed) throw new Error(parsed.error);
    this.clientId = parsed.clientId;
    for (const sub of this.subs) {
      const replay = this.lastReplay.get(sub.channel) ?? sub.replay;
      const replies = await this.post([subscribeMessage(parsed.clientId, { channel: sub.channel, replay })]);
      const reply = replies.find((m) => m.channel === "/meta/subscribe");
      if (reply && reply.successful === false) {
        const detail = typeof reply.error === "string" && reply.error ? `: ${reply.error}` : "";
        throw new Error(`Subscribe refused for ${sub.channel}${detail}`);
      }
    }
    this.onStatus({ state: "connected", clientId: parsed.clientId });
  }

  private async loop(): Promise<void> {
    while (!this.stopped && this.clientId) {
      const id = this.clientId;
      let replies: BayeuxMessage[];
      try {
        replies = await this.post([connectMessage(id)]);
      } catch (err) {
        if (this.stopped) return;
        await this.backoff(err);
        continue;
      }
      for (const m of replies) {
        if (this.stopped) return;
        if (m.channel === "/meta/connect" && m.successful === false) {
          await this.backoff(new Error(typeof m.error === "string" && m.error ? m.error : "Connect refused"));
          break;
        }
        if (isEventDelivery(m)) {
          const replayId = extractReplayId(m);
          if (replayId !== null) this.lastReplay.set(m.channel, replayId);
          this.onEvent(m.channel, m.data, replayId);
        }
      }
    }
  }

  private async backoff(err: unknown): Promise<void> {
    this.attempt += 1;
    this.onStatus({
      state: "reconnecting",
      attempt: this.attempt,
      message: err instanceof Error ? err.message : "Connection lost",
    });
    await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (this.attempt - 1), 15000)));
    if (this.stopped) return;
    try {
      this.clientId = null;
      await this.establish();
      this.attempt = 0;
    } catch (e) {
      await this.backoff(e);
    }
  }
}

export function nextSubId(): string {
  subSeq += 1;
  return `sub-${subSeq}`;
}
