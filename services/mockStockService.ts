import { StockToolResult, StockDataPoint } from '../types';

// Helper to generate random walk data for a graph
const generateStockData = (symbol: string, days: number = 30): StockToolResult => {
  const data: StockDataPoint[] = [];
  let currentPrice = Math.random() * 200 + 50; // Random start price between 50 and 250
  
  const now = new Date();
  
  for (let i = days; i > 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Random fluctuation between -2% and +2%
    const change = (Math.random() - 0.5) * 0.04;
    currentPrice = currentPrice * (1 + change);
    
    data.push({
      date: date.toISOString().split('T')[0],
      price: parseFloat(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000) + 500000,
    });
  }

  const lastPrice = data[data.length - 1].price;
  const prevPrice = data[data.length - 2].price;
  const changePercent = ((lastPrice - prevPrice) / prevPrice) * 100;

  return {
    symbol: symbol.toUpperCase(),
    currentPrice: parseFloat(lastPrice.toFixed(2)),
    changePercent: parseFloat(changePercent.toFixed(2)),
    data,
  };
};

export const getStockMarketData = async (symbol: string): Promise<StockToolResult> => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));
  return generateStockData(symbol);
};