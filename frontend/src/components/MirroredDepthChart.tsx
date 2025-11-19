import React, { useMemo, useCallback } from 'react';
import {
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
import { DepthPoint } from '../hooks/useDepthStream';

interface MirroredDepthChartProps {
  data: DepthPoint[];
  loading?: boolean;
}

export const MirroredDepthChart: React.FC<MirroredDepthChartProps> = ({ data, loading }) => {
  // Memoized formatters
  const formatYAxis = useCallback((value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) return `${(absValue / 1000000).toFixed(1)}M`;
    if (absValue >= 1000) return `${(absValue / 1000).toFixed(0)}K`;
    return absValue.toFixed(0);
  }, []);

  const formatTooltipValue = useCallback((value: number, name: string) => {
    const absValue = Math.abs(value);
    return [`$${absValue.toLocaleString()}`, name];
  }, []);

  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false
    });
  }, []);

  // Memoized chart
  const chart = useMemo(() => {
    if (data.length === 0) {
      return (
        <div className="depth-chart-empty">
          <div className="empty-icon">📊</div>
          <p>Waiting for depth data...</p>
          <span className="empty-hint">Data will appear once streaming starts</span>
        </div>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
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
            dataKey="t"
            tickFormatter={formatTime}
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
            labelFormatter={formatTime}
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
            label={{ value: 'Mid Price', fill: '#9ca3af', fontSize: 11 }}
          />
          
          <Area
            type="stepAfter"
            dataKey="bidCum"
            stroke="#10b981"
            fill="url(#colorBid)"
            strokeWidth={2}
            name="Buy Depth (Bids)"
            isAnimationActive={false}
          />
          
          <Area
            type="stepAfter"
            dataKey="askCumNeg"
            stroke="#ef4444"
            fill="url(#colorAsk)"
            strokeWidth={2}
            name="Sell Depth (Asks)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }, [data, formatYAxis, formatTooltipValue, formatTime]);

  return (
    <div className="mirrored-depth-chart">
      {loading && data.length === 0 ? (
        <div className="depth-chart-loading">
          <div className="spinner"></div>
          <p>Connecting to depth stream...</p>
        </div>
      ) : (
        chart
      )}
    </div>
  );
};

