import React from 'react';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

export default function StatsCard({
    title,
    value,
    change,
    changeType = 'neutral',
    icon: Icon,
    trend = []
}) {
    const formatValue = (val) => {
        if (typeof val === 'number') {
            return val.toLocaleString('en-IN', {
                maximumFractionDigits: 2
            });
        }
        return val;
    };

    const getChangeColor = () => {
        if (changeType === 'positive') return 'text-green-600';
        if (changeType === 'negative') return 'text-red-600';
        return 'text-gray-600';
    };

    const TrendIcon = change > 0 ? FiTrendingUp : FiTrendingDown;

    return (
        <div className="stats-card">
            <div className="stats-card-header">
                <div className="stats-card-title">
                    {Icon && <Icon className="stats-icon" />}
                    <span>{title}</span>
                </div>
            </div>

            <div className="stats-card-body">
                <div className="stats-value">{formatValue(value)}</div>

                {change !== undefined && change !== null && (
                    <div className={`stats-change ${getChangeColor()}`}>
                        <TrendIcon className="inline mr-1" />
                        <span>{Math.abs(change)}%</span>
                        <span className="text-gray-500 text-sm ml-1">vs last period</span>
                    </div>
                )}
            </div>

            {trend && trend.length > 0 && (
                <div className="stats-sparkline">
                    <svg width="100%" height="40" className="sparkline-svg">
                        <polyline
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            points={trend.map((val, idx) => {
                                const x = (idx / (trend.length - 1)) * 100;
                                const max = Math.max(...trend);
                                const min = Math.min(...trend);
                                const y = 40 - ((val - min) / (max - min)) * 30;
                                return `${x},${y}`;
                            }).join(' ')}
                        />
                    </svg>
                </div>
            )}
        </div>
    );
}
