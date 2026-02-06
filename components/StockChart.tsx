import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { StockToolResult } from '../types';

interface StockChartProps {
  data: StockToolResult[];
}

// Distinct color palette for comparison
const CHART_COLORS = [
  '#0ea5e9', // Sky Blue
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#10b981', // Emerald
  '#f43f5e', // Rose
];

const StockChart: React.FC<StockChartProps> = ({ data }) => {
  // Merge data for Recharts (must be an array of objects with shared X-axis keys)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Create a map keyed by date to merge multiple stocks
    const dateMap = new Map<string, any>();

    data.forEach((stock) => {
      stock.data.forEach((point) => {
        if (!dateMap.has(point.date)) {
          dateMap.set(point.date, { date: point.date });
        }
        // Add specific stock price to the date object
        dateMap.get(point.date)[stock.symbol] = point.price;
      });
    });

    // Convert map to sorted array
    return Array.from(dateMap.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [data]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-4 shadow-xl w-full">
      {/* Header Summary for all stocks */}
      <div className="flex flex-wrap gap-4 mb-4">
        {data.map((stock, index) => {
          const isPositive = stock.changePercent >= 0;
          const color = CHART_COLORS[index % CHART_COLORS.length];
          return (
            <div key={stock.symbol} className="flex-1 min-w-[140px] bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
               <div className="flex items-center gap-2 mb-1">
                 <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                 <h3 className="text-sm font-bold text-slate-100">{stock.symbol}</h3>
               </div>
               <div className="flex items-baseline justify-between">
                 <p className="text-lg font-bold text-slate-100">${stock.currentPrice.toFixed(2)}</p>
                 <p className={`text-xs font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                   {isPositive ? '+' : ''}{stock.changePercent}%
                 </p>
               </div>
            </div>
          );
        })}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={chartData}
            margin={{ top: 10, right: 0, left: 0, bottom: 0 }} 
          >
            <defs>
              {data.map((stock, index) => {
                const color = CHART_COLORS[index % CHART_COLORS.length];
                return (
                  <linearGradient key={stock.symbol} id={`color-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              tick={{ fontSize: 10 }}
              tickFormatter={(val) => val.slice(5)} // Show MM-DD
              minTickGap={30}
            />
            <YAxis 
              stroke="#94a3b8" 
              domain={['auto', 'auto']}
              tick={{ fontSize: 10 }}
              tickFormatter={(val) => `$${val}`}
              width={25}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
              itemStyle={{ color: '#f1f5f9' }}
              labelFormatter={(label) => `日期: ${label}`}
            />
            <Legend 
               verticalAlign="top" 
               height={36} 
               iconType="circle"
               wrapperStyle={{ fontSize: '12px', paddingBottom: '10px' }}
            />
            {data.map((stock, index) => {
              const color = CHART_COLORS[index % CHART_COLORS.length];
              return (
                <Area
                  key={stock.symbol}
                  type="monotone"
                  dataKey={stock.symbol}
                  name={stock.symbol}
                  stroke={color}
                  fillOpacity={1}
                  fill={`url(#color-${stock.symbol})`}
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="text-right mt-2">
         <span className="text-[10px] text-slate-500">过去30天走势</span>
      </div>
    </div>
  );
};

export default StockChart;