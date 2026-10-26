"use client";

// The one way every live surface (judges' panel, commentary panel, public
// scoreboard, stream overlays) reads scoring state.
//
// - Fetches `url` straight away and whenever something changes.
// - Subscribes (one channel) to Postgres changes on the three scoring tables
//   with the browser Supabase client; every event schedules a refetch,
//   debounced so a burst of row updates from one write costs one request.
//   That refetch carries `?v=<commit timestamp>`: /api/live/state is cached at
//   the edge for a second, so the plain URL would usually return the copy from
//   before the write. The key is the same for every viewer of the same event,
//   so the edge makes one origin request per write and serves everyone else
//   the fresh copy. Polls use the plain URL.
// - Polls every 4 s until the channel is SUBSCRIBED and every 20 s after
//   (belt and braces: realtime drops silently on venue Wi-Fi and phones).
// - Refetches when the tab becomes visible again and when the device comes
//   back online.
// - Keeps the last good payload when a request fails, and never throws into
//   render: failures surface as `error` and `connection: "offline"`.
// - Training mode (a URL carrying ?sample=1, answered from the server's
//   in-memory sample session): no realtime channel, because nothing in the
//   database changes when a trainee scores, and a poll every 2 s instead, so
//   the commentary demo and /live?sample=1 follow /judge/demo closely.
// - `setData` lets a panel apply the state returned by its own write at once
//   (the judges' panel never waits on realtime to show its own action); any
//   request already in flight when that happens is discarded as older.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/* The cache key for a realtime event: identical for every viewer who receives
   the same change. The commit timestamp first, then the row's own updated_at,
   then (should neither be present) the current second. */
export const realtimeCacheKey = (payload: unknown): string => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (typeof record.commit_timestamp === "string" && record.commit_timestamp) {
      return record.commit_timestamp;
    }

    const row = record.new;

    if (
      row &&
      typeof row === "object" &&
      typeof (row as Record<string, unknown>).updated_at === "string" &&
      (row as Record<string, unknown>).updated_at
    ) {
      return String((row as Record<string, unknown>).updated_at);
    }
  }

  return String(Math.floor(Date.now() / 1000) * 1000);
};

/* `url` with `v=<key>` appended, keeping any query it already has. */
export const withCacheKey = (url: string, key: string | null) =>
  key ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(key)}` : url;

export type LiveConnection = "live" | "polling" | "offline";

export type LiveStateHook<T> = {
  /* Last good payload, or null until the first one arrives. */
  data: T | null;
  /* Message from the most recent failed request; null after a success. */
  error: string | null;
  /* "live": realtime subscribed and the last request succeeded. "polling":
     realtime not (yet) subscribed, fresh data arrives by polling. "offline":
     the device is offline or the last request failed — data may be stale. */
  connection: LiveConnection;
  /* Epoch milliseconds of the last good payload. */
  lastUpdated: number | null;
  refetch: () => void;
  setData: (next: T) => void;
};

export const LIVE_SCORING_TABLES = [
  "scoring_runs",
  "scoring_live_state",
  "scoring_rounds",
] as const;
export const REALTIME_DEBOUNCE_MS = 150;
export const POLL_WHILE_UNSUBSCRIBED_MS = 4_000;
export const POLL_WHILE_SUBSCRIBED_MS = 20_000;
export const POLL_IN_TRAINING_MS = 2_000;

let channelSequence = 0;

const readErrorMessage = async (response: Response) => {
  try {
    const body: unknown = await response.json();

    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error.trim()
    ) {
      return body.error;
    }
  } catch {
    // Not JSON (an HTML error page from a proxy, say) — fall through.
  }

  return `The server answered ${response.status}. Retrying…`;
};

/* Local rehearsal: when the page itself was opened with ?sample=1, ask the
   server for its sample data too. The server honours that only while
   SCORING_SAMPLE_MODE is set in its environment, so on the live site this is
   a no-op and the public always sees real results. */
const SAMPLE_FLAG = /[?&]sample=1(?:&|$)/;

/* True for a URL that asks for training data. The training panels
   (/judge/demo, /commentary/demo) pass the flag explicitly. */
export const isSampleUrl = (url: string) => SAMPLE_FLAG.test(url);

const withSampleFlag = (url: string) => {
  if (typeof window === "undefined" || isSampleUrl(url)) {
    return url;
  }

  if (new URLSearchParams(window.location.search).get("sample") !== "1") {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}sample=1`;
};

export function useLiveState<T>(url: string): LiveStateHook<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  /* Every request takes a ticket; a response is applied only when its ticket
     is newer than the last one applied, so a slow poll can never overwrite a
     newer payload (including one handed to setData). */
  const ticketCounter = useRef(0);
  const appliedTicket = useRef(0);
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    let isSubscribed = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    const training = isSampleUrl(withSampleFlag(url));

    const schedulePoll = () => {
      clearTimeout(pollTimer);

      if (disposed) {
        return;
      }

      pollTimer = setTimeout(
        () => void load(),
        training
          ? POLL_IN_TRAINING_MS
          : isSubscribed
            ? POLL_WHILE_SUBSCRIBED_MS
            : POLL_WHILE_UNSUBSCRIBED_MS
      );
    };

    /* `cacheKey` is set only for a refetch caused by a realtime event. */
    const load = async (cacheKey: string | null = null) => {
      if (disposed) {
        return;
      }

      clearTimeout(pollTimer);
      inFlight?.abort();

      const controller = new AbortController();
      const ticket = ++ticketCounter.current;
      inFlight = controller;

      try {
        const response = await fetch(withCacheKey(withSampleFlag(url), cacheKey), {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await readErrorMessage(response);

          if (!disposed && ticket > appliedTicket.current) {
            setError(message);
            setFailed(true);
          }

          return;
        }

        const payload = (await response.json()) as T;

        if (disposed || ticket <= appliedTicket.current) {
          return;
        }

        appliedTicket.current = ticket;
        setDataState(payload);
        setError(null);
        setFailed(false);
        setLastUpdated(Date.now());
      } catch {
        if (disposed || controller.signal.aborted) {
          return;
        }

        if (ticket > appliedTicket.current) {
          setError("Connection lost. Retrying…");
          setFailed(true);
        }
      } finally {
        if (inFlight === controller) {
          inFlight = null;
          schedulePoll();
        }
      }
    };

    /* The newest event's key wins when several arrive inside the debounce. */
    let pendingCacheKey: string | null = null;

    const scheduleRefetch = (cacheKey: string | null = null) => {
      clearTimeout(debounceTimer);

      if (disposed) {
        return;
      }

      pendingCacheKey = cacheKey ?? pendingCacheKey;
      debounceTimer = setTimeout(() => {
        const key = pendingCacheKey;
        pendingCacheKey = null;
        void load(key);
      }, REALTIME_DEBOUNCE_MS);
    };

    refetchRef.current = () => void load();

    /* Realtime is an accelerator, not a dependency: if the client cannot be
       created (missing env, old browser) the hook simply keeps polling. */
    let supabase: ReturnType<typeof createClient> | null = null;
    let channel: RealtimeChannel | null = null;

    /* Training data lives in the server's memory, not the database: there
       is nothing to subscribe to, so training only polls. */
    if (!training) {
      try {
        supabase = createClient();
        channel = supabase.channel(`live-scoring-${++channelSequence}`);

        for (const table of LIVE_SCORING_TABLES) {
          channel.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            (payload) => scheduleRefetch(realtimeCacheKey(payload))
          );
        }

        channel.subscribe((status) => {
          if (disposed) {
            return;
          }

          const nowSubscribed = status === "SUBSCRIBED";

          /* Repeated errors while realtime retries must not keep pushing the
             next poll back, so only a real change of status re-arms it. */
          if (nowSubscribed === isSubscribed) {
            return;
          }

          isSubscribed = nowSubscribed;
          setSubscribed(nowSubscribed);

          if (nowSubscribed) {
            // Catch up on anything that changed while the channel was joining.
            scheduleRefetch();
          } else if (!inFlight) {
            // Dropped: poll at the faster interval from now on.
            schedulePoll();
          }
        });
      } catch {
        channel = null;
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };
    const onOnline = () => void load();
    const onOffline = () => {
      setFailed(true);
      setError("This device is offline. Showing the last update.");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void load();

    return () => {
      disposed = true;
      clearTimeout(pollTimer);
      clearTimeout(debounceTimer);
      inFlight?.abort();
      refetchRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);

      if (supabase && channel) {
        void supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [url]);

  const refetch = useCallback(() => refetchRef.current(), []);

  const setData = useCallback((next: T) => {
    appliedTicket.current = ++ticketCounter.current;
    setDataState(next);
    setError(null);
    setFailed(false);
    setLastUpdated(Date.now());
  }, []);

  const connection: LiveConnection = failed ? "offline" : subscribed ? "live" : "polling";

  return { data, error, connection, lastUpdated, refetch, setData };
}
