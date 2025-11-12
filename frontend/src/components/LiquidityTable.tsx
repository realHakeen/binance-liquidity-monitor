import React, { useState } from 'react';
import { LiquidityData } from '../services/api';

interface Props {
  data: LiquidityData[];
  loading: boolean;
}

export const LiquidityTable: React.FC<Props> = ({ data, loading }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无数据</p>
      </div>
    );
  }

  const getScoreClass = (score: number): string => {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  };

  const formatNumber = (num: number, decimals: number = 2): string => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  const formatUSD = (num: number): string => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    }
    return `$${(num / 1000).toFixed(0)}K`;
  };

  const formatSlippage = (slippage: number): string => {
    if (slippage === 999) return '深度不足';
    return `${slippage.toFixed(4)}%`;
  };

  const toggleRow = (symbol: string, type: string) => {
    const key = `${symbol}-${type}`;
    setExpandedRow(expandedRow === key ? null : key);
  };

  const renderDetailedAnalysis = (item: LiquidityData, type: 'spot' | 'futures') => {
    const metrics = type === 'spot' ? item.spot : item.futures;
    if (!metrics) return null;

    const key = `${item.symbol}-${type}`;
    const isExpanded = expandedRow === key;

    if (!isExpanded) return null;

    // 检查是否有新的分析数据
    const hasSlippageAnalysis = metrics.slippageAnalysis;
    const hasDepthAnalysis = metrics.depthAnalysis;

    if (!hasSlippageAnalysis && !hasDepthAnalysis) {
      return (
        <tr className="detail-row">
          <td colSpan={13} className="detail-cell">
            <div className="detail-content">
              <p className="detail-note">详细分析数据正在加载中...</p>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr className="detail-row">
        <td colSpan={13} className="detail-cell">
          <div className="detail-content">
            <div className="detail-section">
              <h4>多规模滑点分析</h4>
              <div className="detail-grid">
                <div className="detail-column">
                  <h5>买入滑点 (消耗卖单)</h5>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>规模</th>
                        <th>滑点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasSlippageAnalysis && Object.entries(metrics.slippageAnalysis.buy).map(([size, slippage]) => (
                        <tr key={size}>
                          <td><strong>${size.toUpperCase()}</strong></td>
                          <td className={slippage > 0.1 ? 'warning' : ''}>{formatSlippage(slippage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="detail-column">
                  <h5>卖出滑点 (消耗买单)</h5>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>规模</th>
                        <th>滑点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasSlippageAnalysis && Object.entries(metrics.slippageAnalysis.sell).map(([size, slippage]) => (
                        <tr key={size}>
                          <td><strong>${size.toUpperCase()}</strong></td>
                          <td className={slippage > 0.1 ? 'warning' : ''}>{formatSlippage(slippage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="detail-section">
              <h4>价格偏离深度分析</h4>
              <div className="detail-grid">
                <div className="detail-column">
                  <h5>买盘深度 (价格向下偏离)</h5>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>偏离</th>
                        <th>深度 (USDT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasDepthAnalysis && Object.entries(metrics.depthAnalysis.bid).map(([deviation, depth]) => (
                        <tr key={deviation}>
                          <td><strong>-{deviation}</strong></td>
                          <td>{formatUSD(depth)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="detail-column">
                  <h5>卖盘深度 (价格向上偏离)</h5>
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>偏离</th>
                        <th>深度 (USDT)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasDepthAnalysis && Object.entries(metrics.depthAnalysis.ask).map(([deviation, depth]) => (
                        <tr key={deviation}>
                          <td><strong>+{deviation}</strong></td>
                          <td>{formatUSD(depth)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="liquidity-table-container">
      <div className="table-wrapper">
        <table className="liquidity-table">
          <thead>
            <tr>
              <th rowSpan={2}>交易对</th>
              <th rowSpan={2}>市场</th>
              <th rowSpan={2}>档位</th>
              <th rowSpan={2}>24h涨跌</th>
              <th colSpan={2}>最佳价格</th>
              <th rowSpan={2}>价差 (%)</th>
              <th colSpan={2}>深度 (USDT)</th>
              <th rowSpan={2}>总深度</th>
              <th rowSpan={2}>10K滑点</th>
              <th rowSpan={2}>不平衡</th>
              <th rowSpan={2}>评分</th>
            </tr>
            <tr>
              <th>买价</th>
              <th>卖价</th>
              <th>买盘</th>
              <th>卖盘</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <React.Fragment key={item.symbol}>
                {/* 现货行 */}
                <tr className="spot-row" onClick={() => toggleRow(item.symbol, 'spot')} style={{ cursor: 'pointer' }}>
                  <td rowSpan={item.futures ? 2 : 1} className="symbol-cell">
                    <strong>{item.symbol}</strong>
                    <div className="volume-info">
                      {item.spotVolume && (
                        <div className="volume-item">
                          <span className="volume-label">现货:</span>
                          <span className="volume-value">{formatUSD(item.spotVolume)}</span>
                        </div>
                      )}
                      {item.futuresVolume && (
                        <div className="volume-item">
                          <span className="volume-label">永续:</span>
                          <span className="volume-value">{formatUSD(item.futuresVolume)}</span>
                        </div>
                      )}
                      {!item.spotVolume && !item.futuresVolume && (
                        <div className="volume-item">
                          <span className="volume-value">-</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="market-type">
                    现货 {expandedRow === `${item.symbol}-spot` ? '▼' : '▶'}
                  </td>
                  <td className="levels">{item.spot.levels}</td>
                  <td className={`price-change ${item.priceChange && item.priceChange >= 0 ? 'positive' : 'negative'}`}>
                    {item.priceChange ? `${item.priceChange >= 0 ? '+' : ''}${item.priceChange.toFixed(2)}%` : '-'}
                  </td>
                  <td className="price">{formatNumber(item.spot.bestBid, 4)}</td>
                  <td className="price">{formatNumber(item.spot.bestAsk, 4)}</td>
                  <td className="spread">{item.spot.spreadPercent.toFixed(4)}%</td>
                  <td className="depth">{formatUSD(item.spot.bidDepth)}</td>
                  <td className="depth">{formatUSD(item.spot.askDepth)}</td>
                  <td className="total-depth">{formatUSD(item.spot.totalDepth)}</td>
                  <td className="slippage">
                    {formatSlippage(item.spot.slippage10k)}
                  </td>
                  <td className={`imbalance ${item.spot.imbalance > 0 ? 'positive' : 'negative'}`}>
                    {(item.spot.imbalance * 100).toFixed(1)}%
                  </td>
                  <td>
                    <span className={`score score-${getScoreClass(item.spot.liquidityScore)}`}>
                      {item.spot.liquidityScore}
                    </span>
                  </td>
                </tr>
                {renderDetailedAnalysis(item, 'spot')}
                
                {/* 永续合约行 */}
                {item.futures && (
                  <>
                    <tr className="futures-row" onClick={() => toggleRow(item.symbol, 'futures')} style={{ cursor: 'pointer' }}>
                      <td className="market-type">
                        永续 {expandedRow === `${item.symbol}-futures` ? '▼' : '▶'}
                      </td>
                      <td className="levels">{item.futures.levels}</td>
                      <td>-</td>
                      <td className="price">{formatNumber(item.futures.bestBid, 4)}</td>
                      <td className="price">{formatNumber(item.futures.bestAsk, 4)}</td>
                      <td className="spread">{item.futures.spreadPercent.toFixed(4)}%</td>
                      <td className="depth">{formatUSD(item.futures.bidDepth)}</td>
                      <td className="depth">{formatUSD(item.futures.askDepth)}</td>
                      <td className="total-depth">{formatUSD(item.futures.totalDepth)}</td>
                      <td className="slippage">
                        {formatSlippage(item.futures.slippage10k)}
                      </td>
                      <td className={`imbalance ${item.futures.imbalance > 0 ? 'positive' : 'negative'}`}>
                        {(item.futures.imbalance * 100).toFixed(1)}%
                      </td>
                      <td>
                        <span className={`score score-${getScoreClass(item.futures.liquidityScore)}`}>
                          {item.futures.liquidityScore}
                        </span>
                      </td>
                    </tr>
                    {renderDetailedAnalysis(item, 'futures')}
                  </>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
