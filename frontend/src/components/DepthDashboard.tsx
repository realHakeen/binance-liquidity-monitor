import React, { useState, useEffect, useMemo } from 'react';
import { useSymbols } from '../hooks/useSymbols';
import { useDepthStream } from '../hooks/useDepthStream';
import { MirroredDepthChart } from './MirroredDepthChart';
import './DepthDashboard.css';

const STORAGE_KEY = 'depth_dashboard_state';

interface DashboardState {
  market: 'spot' | 'futures';
  symbol: string;
}

export const DepthDashboard: React.FC = () => {
  // Load state from localStorage
  const [state, setState] = useState<DashboardState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load saved state:', err);
    }
    return { market: 'spot', symbol: 'BTCUSDT' };
  });

  const [searchTerm, setSearchTerm] = useState('');

  // Save state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }, [state]);

  // Fetch symbols for current market
  const { symbols, loading: symbolsLoading, error: symbolsError } = useSymbols(state.market);

  // Stream depth data
  const { data, loading: streamLoading, error: streamError, connected } = useDepthStream({
    market: state.market,
    symbol: state.symbol
  });

  // Filter symbols by search term
  const filteredSymbols = useMemo(() => {
    if (!searchTerm) return symbols;
    const term = searchTerm.toLowerCase();
    return symbols.filter(s => s.symbol.toLowerCase().includes(term));
  }, [symbols, searchTerm]);

  const handleMarketChange = (market: 'spot' | 'futures') => {
    setState(prev => ({
      market,
      symbol: prev.symbol // Keep same symbol if available
    }));
  };

  const handleSymbolChange = (symbol: string) => {
    setState(prev => ({ ...prev, symbol }));
    setSearchTerm(''); // Clear search after selection
  };

  return (
    <div className="depth-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <h2>📊 Mirrored Depth Chart</h2>
        <div className="connection-status">
          <span className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢 Live' : '🔴 Disconnected'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="dashboard-controls">
        {/* Market Tabs */}
        <div className="market-tabs">
          <button
            className={`tab ${state.market === 'spot' ? 'active' : ''}`}
            onClick={() => handleMarketChange('spot')}
          >
            Spot
          </button>
          <button
            className={`tab ${state.market === 'futures' ? 'active' : ''}`}
            onClick={() => handleMarketChange('futures')}
          >
            Futures
          </button>
        </div>

        {/* Symbol Selector */}
        <div className="symbol-selector">
          <label htmlFor="symbol-search">Symbol:</label>
          <div className="symbol-search-wrapper">
            <input
              id="symbol-search"
              type="text"
              className="symbol-search"
              placeholder="Search symbols..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={symbolsLoading}
            />
            {searchTerm && (
              <button
                className="clear-search"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Symbol Dropdown */}
          {searchTerm && filteredSymbols.length > 0 && (
            <div className="symbol-dropdown">
              {filteredSymbols.map(s => (
                <button
                  key={s.symbol}
                  className={`symbol-option ${s.symbol === state.symbol ? 'selected' : ''}`}
                  onClick={() => handleSymbolChange(s.symbol)}
                >
                  {s.symbol}
                  {s.symbol === state.symbol && ' ✓'}
                </button>
              ))}
            </div>
          )}

          {/* Current Symbol Display */}
          {!searchTerm && (
            <div className="current-symbol">
              <span className="symbol-badge">{state.symbol}</span>
              <button
                className="change-symbol-btn"
                onClick={() => setSearchTerm(state.symbol)}
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Data Info */}
        <div className="data-info">
          <span className="info-item">
            📈 Points: <strong>{data.length}</strong>
          </span>
          {data.length > 0 && (
            <span className="info-item">
              💰 Mid: <strong>${data[data.length - 1]?.mid.toFixed(2)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Error States */}
      {symbolsError && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>Failed to load symbols: {symbolsError}</span>
        </div>
      )}

      {streamError && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>Stream error: {streamError}</span>
        </div>
      )}

      {/* Chart */}
      <div className="chart-container">
        <MirroredDepthChart 
          data={data} 
          loading={streamLoading}
        />
      </div>

      {/* Info Footer */}
      <div className="dashboard-footer">
        <div className="info-cards">
          <div className="info-card">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <div className="card-title">Mirrored Layout</div>
              <div className="card-text">Buy depth above, sell depth below zero</div>
            </div>
          </div>
          <div className="info-card">
            <div className="card-icon">⚡</div>
            <div className="card-content">
              <div className="card-title">Real-Time Stream</div>
              <div className="card-text">WebSocket updates every ~500ms</div>
            </div>
          </div>
          <div className="info-card">
            <div className="card-icon">🎯</div>
            <div className="card-content">
              <div className="card-title">Step Chart</div>
              <div className="card-text">Cumulative depth visualization</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

