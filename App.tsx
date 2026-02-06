import React, { useState, useRef, useEffect } from 'react';
import { Message, Role } from './types';
import { StockAgent } from './services/agent';
import ChatMessage from './components/ChatMessage';
import { Send, Activity, Sparkles, TrendingUp } from 'lucide-react';

const agent = new StockAgent();

const statusMap: Record<string, string> = {
  idle: '空闲',
  thinking: '思考中',
  analyzing_tool_data: '分析数据中',
  executing_tool: '获取数据中'
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: Role.MODEL,
      content: "你好！我是你的金融智能助手。我可以分析股市、可视化趋势并提供专业见解。试着问我“苹果股价”或“对比特斯拉和福特”。"
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'analyzing_tool_data' | 'executing_tool'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || status !== 'idle') return;

    const userText = inputValue;
    setInputValue('');
    
    // Add User Message immediately
    const userMsg: Message = { id: Date.now().toString(), role: Role.USER, content: userText };
    setMessages(prev => [...prev, userMsg]);
    setStatus('thinking');

    try {
      // Run the Agent Loop
      const agentResponses = await agent.runConversation(userText, (newStatus) => {
        // Safe mapping to state types
        setStatus(newStatus as any);
      });
      
      setMessages(prev => [...prev, ...agentResponses]);
    } catch (error) {
      console.error("Failed to run agent", error);
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 font-sans">
      
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/50">
            <TrendingUp className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Gemini 股市助手</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              基于 Gemini 3.0 Pro
            </p>
          </div>
        </div>
        
        {/* Status Indicator */}
        {status !== 'idle' && (
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 animate-pulse">
            <Activity size={14} className="text-blue-400" />
            <span className="text-xs font-medium text-blue-200">
              {statusMap[status] || status}...
            </span>
          </div>
        )}
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 container mx-auto max-w-4xl">
        <div className="space-y-2">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {status !== 'idle' && (
             <div className="flex justify-start w-full mb-6">
               <div className="flex items-center gap-2 ml-14 text-slate-500 text-sm italic">
                  <Sparkles size={16} className="animate-spin-slow" />
                  智能体正在处理您的请求...
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-slate-900 border-t border-slate-800 p-4 sticky bottom-0">
        <div className="container mx-auto max-w-4xl">
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="询问股价、趋势或进行对比..."
              className="w-full bg-slate-950 text-slate-100 border border-slate-700 rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-600 shadow-inner"
              disabled={status !== 'idle'}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || status !== 'idle'}
              className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
            >
              <Send size={20} />
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-slate-500">
              AI生成的内容可能不准确。市场数据仅为演示模拟。
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;