import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { liquidityAPI } from '../services/api';

interface DepthHistoryPoint {
  timestamp: number;
  time: string;
  bidDepth: number;
  askDepth: number;
  totalDepth: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  imbalance?: number;
}

interface Props {
  symbol: string;
  type?: 'spot' | 'futures';
}

const MAX_POINTS = {
  '15m': 100,
  '1h': 200,
  '6h': 360,
  '24h': 500,
  'all': 2000,
} as const;

export const DepthChart: React.FC<Props> = ({ symbol, type = 'spot' }) => {
  // Ring buffer stored in ref (doesn't trigger re-renders)
  const dataBufferRef = useRef<DepthHistoryPoint[]>([]);
  const lastTimestampRef = useRef<number>(0);
  const isInitializedRef = useRef(false);
  
  // Lightweight refresh signal
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'15m' | '1h' | '6h' | '24h' | 'all'>('1h');
  const [chartType, setChartType] = useState<'depth' | 'spread' | 'imbalance'>('depth');

  // Memoized formatters (never recreate) - absolute values for mirrored layout
  const formatYAxis = useCallback((value: number) => {
    const absValue = Math.abs(value);
    if (chartType === 'depth') {
      if (absValue >= 1000000) return `${(absValue / 1000000).toFixed(1)}M`;
      if (absValue >= 1000) return `${(absValue / 1000).toFixed(0)}K`;
      return absValue.toFixed(0);
    } else if (chartType === 'spread') {
      return `${value.toFixed(4)}%`;
    } else {
      return value.toFixed(3);
    }
  }, [chartType]);

  const formatTooltipValue = useCallback((value: number, name: string) => {
    if (chartType === 'depth') {
      const absValue = Math.abs(value);
      return [`$${absValue.toLocaleString()}`, name];
    } else if (chartType === 'spread') {
      return [`${value.toFixed(4)}%`, name];
    } else {
      return [value.toFixed(3), name];
    }
  }, [chartType]);

  // Transform raw data point with negative ask depth for mirrored layout
  const transformDataPoint = useCallback((item: any): DepthHistoryPoint => {
    const date = new Date(item.timestamp);
    const spread = item.bestAsk && item.bestBid ? 
      ((item.bestAsk - item.bestBid) / item.bestBid * 100) : 0;
    const imbalance = item.bidDepth && item.askDepth ?
      ((item.bidDepth - item.askDepth) / (item.bidDepth + item.askDepth)) : 0;

    return {
      timestamp: item.timestamp,
      time: date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      bidDepth: item.bidDepth || 0,
      askDepth: -(item.askDepth || 0), // Negative for mirrored layout
      totalDepth: (item.bidDepth || 0) + (item.askDepth || 0),
      bestBid: item.bestBid || 0,
      bestAsk: item.bestAsk || 0,
      spread: spread,
      imbalance: imbalance
    };
  }, []);

  // Append new points to ring buffer
  const appendToBuffer = useCallback((newPoints: DepthHistoryPoint[]) => {
    const maxPoints = MAX_POINTS[timeRange];
    const buffer = dataBufferRef.current;
    
    // Filter only truly new points
    const filtered = newPoints.filter(p => p.timestamp > lastTimestampRef.current);
    
    if (filtered.length === 0) return false;
    
    // Append new points
    buffer.push(...filtered);
    
    // Trim to max size (ring buffer behavior)
    if (buffer.length > maxPoints) {
      dataBufferRef.current = buffer.slice(buffer.length - maxPoints);
    }
    
    // Update last timestamp
    lastTimestampRef.current = Math.max(...filtered.map(p => p.timestamp));
    
    return true;
  }, [timeRange]);

  // Initial data load or full refresh
  const fetchHistoryData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);

      const count = MAX_POINTS[timeRange];
      const response = await liquidityAPI.getRecentHistory(symbol, type, {
        count: count,
        includeAdvanced: true
      });

      if (response.success && response.data) {
        const dataSource = response.data.advanced || response.data.core || [];
        
        if (dataSource.length === 0) {
          if (isInitial) {
            setError('暂无历史数据，请等待系统收集数据');
            dataBufferRef.current = [];
          }
          return;
        }

        const formattedData = dataSource.map(transformDataPoint);

        if (isInitial || !isInitializedRef.current) {
          // Initial load: replace buffer
          dataBufferRef.current = formattedData;
          lastTimestampRef.current = formattedData[formattedData.length - 1]?.timestamp || 0;
          isInitializedRef.current = true;
          setRefreshKey(prev => prev + 1);
        } else {
          // Incremental update: append only new points
          const hasNew = appendToBuffer(formattedData);
          if (hasNew) {
            setRefreshKey(prev => prev + 1); // Lightweight signal
          }
        }
      } else {
        setError(response.error || '暂无历史数据');
        if (isInitial) dataBufferRef.current = [];
      }
    } catch (err) {
      console.error('获取历史数据失败:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
      if (isInitial) dataBufferRef.current = [];
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [symbol, type, timeRange, transformDataPoint, appendToBuffer]);

  // Reset on symbol/type/timeRange change
  useEffect(() => {
    isInitializedRef.current = false;
    lastTimestampRef.current = 0;
    fetchHistoryData(true);
  }, [symbol, type, timeRange, fetchHistoryData]);

  // Polling for incremental updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (isInitializedRef.current) {
        fetchHistoryData(false); // Incremental update only
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchHistoryData]);

  // Stable reference to current data (only updates when refreshKey changes)
  const displayData = useMemo(() => dataBufferRef.current, [refreshKey]);

  // Memoized chart components (avoid recreation) - Mirrored layout
  const depthChartMemo = useMemo(() => (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={displayData}>
        <defs>
          <linearGradient id="colorBid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
          </linearGradient>
          <linearGradient id="colorAsk" x1="0" y1="1" x2="0" y2="0">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
        <XAxis 
          dataKey="time" 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={{ stroke: '#4b5563' }}
        />
        <YAxis 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatYAxis}
          axisLine={{ stroke: '#4b5563' }}
        />
        <Tooltip 
          formatter={formatTooltipValue}
          contentStyle={{ 
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            color: '#f3f4f6'
          }}
          labelStyle={{ color: '#9ca3af' }}
          isAnimationActive={false}
        />
        <Legend 
          wrapperStyle={{ color: '#9ca3af' }}
          iconType="square"
        />
        <ReferenceLine 
          y={0} 
          stroke="#6b7280" 
          strokeWidth={2}
          strokeDasharray="0"
        />
        <Area
          type="monotone"
          dataKey="bidDepth"
          stroke="#10b981"
          fill="url(#colorBid)"
          strokeWidth={2}
          name="买盘深度 (Bids)"
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="askDepth"
          stroke="#ef4444"
          fill="url(#colorAsk)"
          strokeWidth={2}
          name="卖盘深度 (Asks)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  ), [displayData, formatYAxis, formatTooltipValue]);

  const spreadChartMemo = useMemo(() => (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={displayData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
        <XAxis 
          dataKey="time" 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={{ stroke: '#4b5563' }}
        />
        <YAxis 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatYAxis}
          axisLine={{ stroke: '#4b5563' }}
        />
        <Tooltip 
          formatter={formatTooltipValue}
          contentStyle={{ 
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            color: '#f3f4f6'
          }}
          labelStyle={{ color: '#9ca3af' }}
          isAnimationActive={false}
        />
        <Legend 
          wrapperStyle={{ color: '#9ca3af' }}
          iconType="square"
        />
        <Line
          type="monotone"
          dataKey="spread"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          name="买卖价差"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  ), [displayData, formatYAxis, formatTooltipValue]);

  const imbalanceChartMemo = useMemo(() => (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={displayData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
        <XAxis 
          dataKey="time" 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={{ stroke: '#4b5563' }}
        />
        <YAxis 
          stroke="#9ca3af"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickFormatter={formatYAxis}
          domain={[-1, 1]}
          axisLine={{ stroke: '#4b5563' }}
        />
        <Tooltip 
          formatter={formatTooltipValue}
          contentStyle={{ 
            backgroundColor: 'rgba(31, 41, 55, 0.95)',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            color: '#f3f4f6'
          }}
          labelStyle={{ color: '#9ca3af' }}
          isAnimationActive={false}
        />
        <Legend 
          wrapperStyle={{ color: '#9ca3af' }}
          iconType="square"
        />
        <ReferenceLine 
          y={0} 
          stroke="#6b7280" 
          strokeWidth={2}
          strokeDasharray="0"
        />
        <Line
          type="monotone"
          dataKey="imbalance"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          name="深度不平衡"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  ), [displayData, formatYAxis, formatTooltipValue]);

  const renderChart = () => {
    if (loading) {
      return (
        <div className="chart-loading">
          <div className="spinner"></div>
          <p>加载历史数据中...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="chart-error">
          <p>⚠️ {error}</p>
          <button onClick={() => fetchHistoryData(true)} className="retry-button">重试</button>
        </div>
      );
    }

    if (displayData.length === 0) {
      return (
        <div className="chart-empty">
          <p>📊 暂无历史数据</p>
          <p className="hint">请等待系统收集数据（通常需要1-2分钟）</p>
        </div>
      );
    }

    // Return memoized charts
    if (chartType === 'depth') return depthChartMemo;
    if (chartType === 'spread') return spreadChartMemo;
    if (chartType === 'imbalance') return imbalanceChartMemo;

    return null;
  };

  return (
    <div className="depth-chart-container">
      <div className="chart-controls">
        <div className="control-group">
          <label>时间范围:</label>
          <div className="button-group">
            <button 
              className={timeRange === '15m' ? 'active' : ''}
              onClick={() => setTimeRange('15m')}
            >
              15分钟
            </button>
            <button 
              className={timeRange === '1h' ? 'active' : ''}
              onClick={() => setTimeRange('1h')}
            >
              1小时
            </button>
            <button 
              className={timeRange === '6h' ? 'active' : ''}
              onClick={() => setTimeRange('6h')}
            >
              6小时
            </button>
            <button 
              className={timeRange === '24h' ? 'active' : ''}
              onClick={() => setTimeRange('24h')}
            >
              24小时
            </button>
            <button 
              className={timeRange === 'all' ? 'active' : ''}
              onClick={() => setTimeRange('all')}
            >
              全部
            </button>
          </div>
        </div>

        <div className="control-group">
          <label>图表类型:</label>
          <div className="button-group">
            <button 
              className={chartType === 'depth' ? 'active' : ''}
              onClick={() => setChartType('depth')}
            >
              📊 深度
            </button>
            <button 
              className={chartType === 'spread' ? 'active' : ''}
              onClick={() => setChartType('spread')}
            >
              📈 价差
            </button>
            <button 
              className={chartType === 'imbalance' ? 'active' : ''}
              onClick={() => setChartType('imbalance')}
            >
              ⚖️ 不平衡
            </button>
          </div>
        </div>
      </div>

      <div className="chart-content">
        {renderChart()}
      </div>

      {!loading && !error && displayData.length > 0 && (
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label">数据点数:</span>
            <span className="stat-value">{displayData.length}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">最新更新:</span>
            <span className="stat-value">
              {new Date(displayData[displayData.length - 1]?.timestamp || 0).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

