import React, { useState, useEffect, useMemo } from 'react';
import { DepthChart } from './DepthChart';
import { liquidityAPI } from '../services/api';
import axios from 'axios';

const STORAGE_KEY = 'depth_monitor_state';

interface Symbol {
  symbol: string;
}

export const DepthMonitor: React.FC = () => {
  // 从 localStorage 加载状态
  const [selectedType, setSelectedType] = useState<'spot' | 'futures'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved).type || 'spot';
      }
    } catch (err) {
      console.error('Failed to load saved state:', err);
    }
    return 'spot';
  });

  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved).symbol || 'BTCUSDT';
      }
    } catch (err) {
      console.error('Failed to load saved state:', err);
    }
    return 'BTCUSDT';
  });

  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // 保存状态到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        type: selectedType,
        symbol: selectedSymbol
      }));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }, [selectedType, selectedSymbol]);

  // 获取交易对列表
  useEffect(() => {
    fetchSymbols();
  }, [selectedType]);

  const fetchSymbols = async () => {
    try {
      setLoading(true);
      setError(null);

      // 从 Binance 直接获取交易对列表
      const baseUrl = selectedType === 'futures'
        ? 'https://fapi.binance.com/fapi/v1'
        : 'https://api.binance.com/api/v3';

      const response = await axios.get(`${baseUrl}/exchangeInfo`);

      // 过滤 USDT 交易对
      const usdtSymbols = response.data.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => ({ symbol: s.symbol }))
        .sort((a: Symbol, b: Symbol) => a.symbol.localeCompare(b.symbol));

      setSymbols(usdtSymbols);
    } catch (err) {
      console.error('获取交易对列表失败:', err);
      setError('获取交易对列表失败');
      setSymbols([]);
    } finally {
      setLoading(false);
    }
  };

  // 过滤交易对
  const filteredSymbols = useMemo(() => {
    if (!searchTerm) return symbols;
    const term = searchTerm.toLowerCase();
    return symbols.filter(s => s.symbol.toLowerCase().includes(term));
  }, [symbols, searchTerm]);

  // 处理市场切换
  const handleMarketChange = (type: 'spot' | 'futures') => {
    setSelectedType(type);
    setSearchTerm('');
    setShowDropdown(false);
  };

  // 处理交易对选择
  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSearchTerm('');
    setShowDropdown(false);
  };

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.symbol-selector')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showDropdown]);

  return (
    <div className="depth-monitor">
      <div className="depth-controls">
        {/* 市场选择标签 */}
        <div className="market-tabs">
          <button
            className={`market-tab ${selectedType === 'spot' ? 'active' : ''}`}
            onClick={() => handleMarketChange('spot')}
          >
            现货 Spot
          </button>
          <button
            className={`market-tab ${selectedType === 'futures' ? 'active' : ''}`}
            onClick={() => handleMarketChange('futures')}
          >
            永续 Futures
          </button>
        </div>

        {/* 交易对选择器 */}
        <div className="symbol-selector-container">
          <label>选择交易对:</label>
          <div className="symbol-selector">
            <div className="selected-symbol" onClick={() => setShowDropdown(!showDropdown)}>
              <span className="symbol-text">{selectedSymbol}</span>
              <span className="dropdown-arrow">{showDropdown ? '▲' : '▼'}</span>
            </div>

            {showDropdown && (
              <div className="symbol-dropdown">
                <div className="dropdown-search">
                  <input
                    type="text"
                    placeholder="搜索交易对..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                </div>
                <div className="dropdown-list">
                  {loading ? (
                    <div className="dropdown-loading">加载中...</div>
                  ) : filteredSymbols.length === 0 ? (
                    <div className="dropdown-empty">未找到交易对</div>
                  ) : (
                    filteredSymbols.slice(0, 100).map(s => (
                      <div
                        key={s.symbol}
                        className={`dropdown-item ${s.symbol === selectedSymbol ? 'active' : ''}`}
                        onClick={() => handleSymbolSelect(s.symbol)}
                      >
                        {s.symbol}
                        {s.symbol === selectedSymbol && <span className="check-mark">✓</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 信息显示 */}
        <div className="info-display">
          <span className="info-item">
            📊 {selectedType === 'spot' ? '现货' : '永续'}
          </span>
          <span className="info-item">
            💰 {selectedSymbol}
          </span>
          <span className="info-item">
            📝 共 {symbols.length} 个交易对
          </span>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* 图表区域 */}
      <div className="chart-container">
        <DepthChart symbol={selectedSymbol} type={selectedType} />
      </div>
    </div>
  );
};

