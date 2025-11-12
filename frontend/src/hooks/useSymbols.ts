import { useState, useEffect } from 'react';
import axios from 'axios';

interface Symbol {
  symbol: string;
}

interface UseSymbolsReturn {
  symbols: Symbol[];
  loading: boolean;
  error: string | null;
}

export const useSymbols = (market: 'spot' | 'futures'): UseSymbolsReturn => {
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchSymbols = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await axios.get(`/api/symbols?market=${market}`);
        
        if (isMounted) {
          setSymbols(response.data || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load symbols');
          setSymbols([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchSymbols();

    return () => {
      isMounted = false;
    };
  }, [market]);

  return { symbols, loading, error };
};

