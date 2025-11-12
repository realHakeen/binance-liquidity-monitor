import React, { useState, useEffect, useCallback } from 'react';
import { LiquidityTable } from './components/LiquidityTable';
import { StatusBar } from './components/StatusBar';
import { DepthMonitor } from './components/DepthMonitor';
import { liquidityAPI, LiquidityData, ApiStatus } from './services/api';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState<'liquidity' | 'depth'>('liquidity');
  const [liquidityData, setLiquidityData] = useState<LiquidityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [dataSource, setDataSource] = useState<string>('');
  const [subscriptions, setSubscriptions] = useState<number>(0);

  const fetchData = useCallback(async () => {
    try {
      // 只在第一次加载时显示 loading
      if (liquidityData.length === 0) {
        setLoading(true);
      }
      setError(null);
      
      const response = await liquidityAPI.getLiquidityData();
      
      if (response.success) {
        setLiquidityData(response.data);
        setLastUpdate(new Date(response.timestamp));
        setApiStatus(response.apiStatus);
        setDataSource(response.dataSource || 'unknown');
        setSubscriptions(response.subscriptions || 0);
        
        if (response.message) {
          // 如果有消息（比如系统正在初始化），显示为提示而不是错误
          console.log(response.message);
        }
        
        if (response.errors && response.errors.length > 0) {
          console.warn('部分数据获取失败:', response.errors);
        }
      } else {
        setError(response.error || '获取数据失败');
        setApiStatus(response.apiStatus);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  }, [liquidityData.length]);

  const handleReset = async () => {
    try {
      await liquidityAPI.resetStatus();
      setError(null);
      alert('API状态已重置');
      fetchData();
    } catch (err) {
      alert('重置失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 首次加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自动刷新 - WebSocket数据每3秒轮询一次
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 3000); // 3秒刷新一次，因为是从内存读取，不会有限流问题

    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="App">
      <header className="app-header">
        <div className="header-content">
          <h1>Binance 流动性监控系统</h1>
          
          {/* 导航标签 */}
          <nav className="nav-tabs">
            <button 
              className={`nav-tab ${currentView === 'liquidity' ? 'active' : ''}`}
              onClick={() => setCurrentView('liquidity')}
            >
              📊 流动性概览
            </button>
            <button 
              className={`nav-tab ${currentView === 'depth' ? 'active' : ''}`}
              onClick={() => setCurrentView('depth')}
            >
              📈 深度变化
            </button>
          </nav>

          <div className="header-info">
            <div className="info-item">
              {lastUpdate && currentView === 'liquidity' && (
                <>
                  <span className="label">最后更新:</span>
                  <span className="value">{lastUpdate.toLocaleTimeString()}</span>
                  {dataSource === 'websocket' && (
                    <span className="live-badge">🟢 实时</span>
                  )}
                  {subscriptions > 0 && (
                    <span className="subscription-count">
                      {subscriptions} 个订阅
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {currentView === 'liquidity' && (
        <StatusBar 
          apiStatus={apiStatus} 
          onReset={handleReset}
        />
      )}

      {error && currentView === 'liquidity' && (
        <div className="error-message">
          <span className="error-text">{error}</span>
        </div>
      )}

      <main className="app-main">
        {currentView === 'liquidity' && (
          <>
            <div className="info-panel">
              <div className="info-card">
                <h3>数据说明</h3>
                <ul>
                  <li><strong>实时更新:</strong> 通过WebSocket自动更新订单簿（100ms级别）</li>
                  <li><strong>档位:</strong> BTC/ETH使用500档深度，其他币种使用100档</li>
                  <li><strong>深度:</strong> 显示指定档位内的总交易额(USDT)</li>
                  <li><strong>价差:</strong> 最佳买价与卖价之间的差额百分比</li>
                  <li><strong>10K滑点:</strong> 买入/卖出$10,000时的平均价格偏离</li>
                  <li><strong>不平衡:</strong> 买盘与卖盘的深度差异，正值表示买盘更深</li>
                  <li><strong>评分:</strong> 综合流动性评分(0-100)，考虑深度和价差</li>
                </ul>
              </div>

              <div className="info-card">
                <h3>系统说明</h3>
                <ul>
                  <li><strong>自动订阅:</strong> 服务器启动时自动订阅Top 10交易对</li>
                  <li><strong>数据来源:</strong> REST API快照 + WebSocket增量更新</li>
                  <li><strong>存储方式:</strong> 内存（主存储）+ Redis（备份）</li>
                  <li><strong>更新频率:</strong> 页面每3秒轮询一次内存数据</li>
                </ul>
              </div>
            </div>

            <LiquidityTable data={liquidityData} loading={loading} />
          </>
        )}
        
        {currentView === 'depth' && <DepthMonitor />}
      </main>

      <footer className="app-footer">
        <p>
          数据来源: <a href="https://www.binance.com" target="_blank" rel="noopener noreferrer">Binance API</a>
          {' · '}
          监控币种: 前10大交易量的USDT交易对
          {' · '}
          更新模式: WebSocket实时推送（自动订阅）
        </p>
      </footer>
    </div>
  );
}

export default App;

