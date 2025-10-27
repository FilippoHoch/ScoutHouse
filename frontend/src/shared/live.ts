import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "./auth";
import { API_URL } from "./http";

export type LiveMode = "idle" | "sse" | "polling";

interface LiveState {
  mode: LiveMode;
}

const POLLING_INTERVAL_MS = 15_000;

function isValidEventId(eventId: number | null | undefined): eventId is number {
  return typeof eventId === "number" && Number.isFinite(eventId);
}

export function useEventLive(eventId: number | null | undefined): LiveState {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<LiveMode>("idle");
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (typeof window !== "undefined" && pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isValidEventId(eventId)) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (typeof window !== "undefined" && pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      setMode("idle");
      return;
    }

    const stopPolling = () => {
      if (typeof window !== "undefined" && pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const startPolling = () => {
      if (typeof window === "undefined") {
        queryClient.invalidateQueries({ queryKey: ["event", eventId] });
        queryClient.invalidateQueries({ queryKey: ["event-summary", eventId] });
        setMode("polling");
        return;
      }

      if (pollingRef.current !== null) {
        setMode("polling");
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["event-summary", eventId] });
      pollingRef.current = window.setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["event", eventId] });
        queryClient.invalidateQueries({ queryKey: ["event-summary", eventId] });
      }, POLLING_INTERVAL_MS);
      setMode("polling");
    };

    if (!accessToken || typeof EventSource === "undefined") {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      startPolling();
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    stopPolling();

    const url = `${API_URL}/api/v1/events/${eventId}/live?access_token=${encodeURIComponent(accessToken)}`;
    const source = new EventSource(url);
    eventSourceRef.current = source;

    source.onopen = () => {
      setMode("sse");
    };

    source.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data ?? "{}");
        if (!data || typeof data !== "object") {
          return;
        }

        const eventType = typeof data.type === "string" ? data.type : "";
        if (eventType === "keepalive") {
          return;
        }

        if (data.event_id !== eventId) {
          return;
        }

        if (
          eventType === "candidate_updated" ||
          eventType === "task_updated" ||
          eventType === "summary_updated"
        ) {
          queryClient.invalidateQueries({ queryKey: ["event", eventId] });
          queryClient.invalidateQueries({ queryKey: ["event-summary", eventId] });
        }
      } catch (error) {
        console.warn("Unable to parse live update payload", error);
      }
    };

    source.onerror = () => {
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
      source.close();
      startPolling();
    };

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [accessToken, eventId, queryClient]);

  return { mode };
}
