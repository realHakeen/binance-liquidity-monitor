import { useState, useEffect, useRef, useCallback } from 'react';

export interface DepthPoint {
  t: number;           // timestamp
  price: number;       // mid price
  bidCum: number;      // cumulative bid depth
  askCum: number;      // cumulative ask depth (positive)
  askCumNeg: number;   // negative for mirrored display
  mid: number;         // mid price
}

interface UseDepthStreamProps {
  market: 'spot' | 'futures';
  symbol: string;
}

interface UseDepthStreamReturn {
  data: DepthPoint[];
  loading: boolean;
  error: string | null;
  connected: boolean;
}

const MAX_POINTS = 1000;
const THROTTLE_MS = 500;

// Cache for last N points per symbol
const symbolCache = new Map<string, DepthPoint[]>();

export const useDepthStream = ({ market, symbol }: UseDepthStreamProps): UseDepthStreamReturn => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [, forceRefresh] = useState(0);

  // Ring buffer in ref (no re-renders)
  const bufferRef = useRef<DepthPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef(false);

  // Throttled update using rAF
  const scheduleUpdate = useCallback(() => {
    if (pendingUpdateRef.current) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < THROTTLE_MS) {
      pendingUpdateRef.current = true;
      rafRef.current = requestAnimationFrame(() => {
        pendingUpdateRef.current = false;
        lastUpdateRef.current = Date.now();
        forceRefresh(prev => prev + 1);
      });
      return;
    }

    lastUpdateRef.current = now;
    forceRefresh(prev => prev + 1);
  }, []);

  // Append point to ring buffer
  const appendPoint = useCallback((point: DepthPoint) => {
    const buffer = bufferRef.current;
    
    // Avoid duplicates by timestamp
    if (buffer.length > 0 && buffer[buffer.length - 1].t === point.t) {
      return;
    }

    buffer.push(point);

    // Trim to max size
    if (buffer.length > MAX_POINTS) {
      bufferRef.current = buffer.slice(buffer.length - MAX_POINTS);
    }

    scheduleUpdate();
  }, [scheduleUpdate]);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = `${market}_${symbol}`;

    // Restore from cache if available
    const cached = symbolCache.get(cacheKey);
    if (cached && cached.length > 0) {
      bufferRef.current = [...cached];
      setLoading(false);
      scheduleUpdate();
    }

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/depth?symbol=${symbol}&market=${market}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isMounted) {
        setConnected(true);
        setError(null);
        setLoading(false);
      }
    };

    ws.onmessage = (event) => {
      if (!isMounted) return;

      try {
        const point = JSON.parse(event.data) as DepthPoint;
        
        // Add negative ask depth for mirrored display
        point.askCumNeg = -point.askCum;
        
        appendPoint(point);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (_event) => {
      if (isMounted) {
        setError('WebSocket connection error');
        setConnected(false);
      }
    };

    ws.onclose = () => {
      if (isMounted) {
        setConnected(false);
      }
    };

    // Cleanup on unmount or symbol/market change
    return () => {
      isMounted = false;

      // Save to cache before cleanup
      if (bufferRef.current.length > 0) {
        const cachePoints = bufferRef.current.slice(-100); // Keep last 100 points
        symbolCache.set(cacheKey, cachePoints);
      }

      // Cancel pending RAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [market, symbol, appendPoint, scheduleUpdate]);

  // Stable array reference
  const data = bufferRef.current;

  return { data, loading, error, connected };
};

