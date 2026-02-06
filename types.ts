export enum Role {
  USER = 'user',
  MODEL = 'model',
  TOOL = 'tool' // Represents a system/tool output in the UI
}

export interface StockDataPoint {
  date: string;
  price: number;
  volume: number;
}

export interface StockToolResult {
  symbol: string;
  currentPrice: number;
  changePercent: number;
  data: StockDataPoint[];
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  // Optional structured data for rendering widgets (like charts)
  stockData?: StockToolResult[]; 
  // For showing agent thought process
  metadata?: {
    isThinking?: boolean;
    toolCallName?: string;
  };
}

// Emulating a Graph State
export interface AgentState {
  messages: Message[];
  status: 'idle' | 'thinking' | 'executing_tool' | 'streaming';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}