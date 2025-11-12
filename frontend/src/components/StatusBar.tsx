import React from 'react';
import { ApiStatus } from '../services/api';

interface Props {
  apiStatus: ApiStatus | null;
  onReset: () => void;
}

export const StatusBar: React.FC<Props> = ({ apiStatus, onReset }) => {
  if (!apiStatus) return null;

  const getWeightPercent = () => {
    return (apiStatus.usedWeight / 6000) * 100;
  };

  const getWeightClass = () => {
    const percent = getWeightPercent();
    if (percent > 80) return 'danger';
    if (percent > 50) return 'warning';
    return 'safe';
  };

  const getTimeUntilReset = () => {
    const seconds = Math.max(0, Math.ceil((apiStatus.weightResetTime - Date.now()) / 1000));
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  const getTimeUntilUnpause = () => {
    if (!apiStatus.rateLimitPauseUntil) return null;
    const seconds = Math.max(0, Math.ceil((apiStatus.rateLimitPauseUntil - Date.now()) / 1000));
    return seconds;
  };

  return (
    <div className={`status-bar ${apiStatus.isBlocked ? 'blocked' : apiStatus.isPaused ? 'paused' : ''}`}>
      <div className="status-section">
        <h3>API 状态</h3>
        <div className="status-items">
          {apiStatus.isBlocked && (
            <div className="status-item blocked">
              <span className="status-text">IP已被封禁 (418)</span>
              <button onClick={onReset} className="btn-small">重置</button>
            </div>
          )}
          
          {apiStatus.isPaused && !apiStatus.isBlocked && (
            <div className="status-item paused">
              <span className="status-text">
                触发限流 (429) - 等待 {getTimeUntilUnpause()}秒
              </span>
            </div>
          )}
          
          {!apiStatus.isBlocked && !apiStatus.isPaused && (
            <div className="status-item active">
              <span className="status-text">正常运行</span>
            </div>
          )}
        </div>
      </div>

      <div className="status-section">
        <h3>请求权重</h3>
        <div className="weight-info">
          <div className="weight-bar-container">
            <div 
              className={`weight-bar ${getWeightClass()}`}
              style={{ width: `${Math.min(100, getWeightPercent())}%` }}
            ></div>
          </div>
          <div className="weight-text">
            {apiStatus.usedWeight} / 6000 ({getWeightPercent().toFixed(1)}%)
            <span className="reset-time">重置于 {getTimeUntilReset()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

