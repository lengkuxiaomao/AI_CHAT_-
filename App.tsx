import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Message, Role, ChatSession } from './types';
import { StockAgent } from './services/agent';
import ChatMessage, { ChatMessageRef } from './components/ChatMessage';
import { Send, Activity, Sparkles, TrendingUp, Menu, Plus, MessageSquare, Trash2, X, Square } from 'lucide-react';

const agent = new StockAgent();

const statusMap: Record<string, string> = {
  idle: '空闲',
  thinking: '思考中',
  analyzing_tool_data: '分析数据中',
  executing_tool: '获取数据中',
  typing: '输出中'
};

const STORAGE_KEY = 'gemini_stock_agent_sessions';

const App: React.FC = () => {
  // Session Management State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'thinking' | 'analyzing_tool_data' | 'executing_tool' | 'typing'>('idle');
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Ref to the currently typing message component to access partial content on stop
  const activeMessageRef = useRef<ChatMessageRef | null>(null);

  // Load sessions from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSessions(parsed);
        // Load the most recent session if available, otherwise start new
        if (parsed.length > 0) {
          loadSession(parsed[0]);
        } else {
          startNewSession();
        }
      } catch (e) {
        console.error("Failed to parse sessions", e);
        startNewSession();
      }
    } else {
      startNewSession();
    }
  }, []);

  // Save sessions whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      // Ensure we don't save the 'shouldAnimate' state to localStorage, 
      // so when we reload, text appears instantly.
      const sessionsToSave = sessions.map(s => ({
        ...s,
        messages: s.messages.map(m => {
          const { shouldAnimate, ...rest } = m;
          return rest as Message;
        })
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsToSave));
    }
  }, [sessions]);

  // Update current session in the list when messages change
  useEffect(() => {
    if (!currentSessionId) return;

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        // Auto-generate title from first user message if it's the default "New Chat"
        let title = session.title;
        if (title === '新对话' && messages.length > 1) {
           const firstUserMsg = messages.find(m => m.role === Role.USER);
           if (firstUserMsg) {
             title = firstUserMsg.content.slice(0, 20) + (firstUserMsg.content.length > 20 ? '...' : '');
           }
        }
        return {
          ...session,
          messages,
          title,
          updatedAt: Date.now()
        };
      }
      return session;
    }));
  }, [messages, currentSessionId]);

  // Handle Scroll Event to detect if user is at bottom
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    
    // Check if user is near the bottom.
    // We use a small threshold (10px) to allow the user to easily scroll up and disable auto-scroll.
    // If the threshold is too large (e.g. 50px), the user has to scroll significantly to "break free",
    // which feels like the scrollbar is fighting them.
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10;
    shouldAutoScrollRef.current = isAtBottom;
  };

  const scrollToBottom = (instant = false) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: instant ? 'instant' : 'smooth'
      });
      shouldAutoScrollRef.current = true;
    }
  };

  // Smart scroll used by typewriter effect
  const handleSmartScroll = useCallback(() => {
    if (shouldAutoScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'instant' // Instant is better for typing to avoid lag
      });
    }
  }, []);

  // Force scroll when messages change (e.g., new message added)
  // But strictly rely on shouldAutoScroll logic unless it's a brand new message from user
  useEffect(() => {
     // If a new message just arrived (list length changed), and it's the start of generation,
     // we typically want to snap to bottom.
     // However, to keep it simple: if autoScroll was on, keep it on.
     if (shouldAutoScrollRef.current) {
        scrollToBottom();
     }
  }, [messages.length, status]);

  const startNewSession = () => {
    // Abort current generation if any when switching sessions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus('idle');
    }

    const newId = Date.now().toString();
    const welcomeMsg: Message = {
      id: 'welcome',
      role: Role.MODEL,
      content: "你好！我是你的金融智能助手。我可以分析股市、可视化趋势并提供专业见解。试着问我“苹果股价”或“对比特斯拉和福特”。",
      shouldAnimate: false // Welcome message is instant
    };
    
    const newSession: ChatSession = {
      id: newId,
      title: '新对话',
      messages: [welcomeMsg],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([welcomeMsg]);
    agent.reset();
    setShowSidebar(false); 
    // Wait for render then scroll
    setTimeout(() => scrollToBottom(true), 0);
  };

  const loadSession = (session: ChatSession) => {
    // Abort current generation if any when switching sessions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus('idle');
    }

    setCurrentSessionId(session.id);
    
    // When loading history, ensure no animation
    const historyMessages = session.messages.map(m => ({
      ...m,
      shouldAnimate: false
    }));

    setMessages(historyMessages);
    agent.setHistory(historyMessages);
    setShowSidebar(false);
    setTimeout(() => scrollToBottom(true), 0);
  };

  const deleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    // LocalStorage update handled by useEffect
    
    if (currentSessionId === sessionId) {
      if (newSessions.length > 0) {
        loadSession(newSessions[0]);
      } else {
        startNewSession();
      }
    }
  };

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault();
    if (status === 'typing') {
      // User cancelled during animation: TRUNCATE content to what is currently visible
      if (activeMessageRef.current) {
        const currentContent = activeMessageRef.current.getCurrentContent();
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0) {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: currentContent + " ... (已停止)", // Update content to partial text
              shouldAnimate: false // Stop animation
            };
          }
          return newMessages;
        });
      }
      setStatus('idle');
    } else if (abortControllerRef.current) {
      // User cancelled during network request/thinking
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStatus('idle');
    }
  };

  const handleAnimationComplete = useCallback(() => {
    // Transition from typing to idle
    setStatus((prev) => prev === 'typing' ? 'idle' : prev);
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || status !== 'idle') return;

    const userText = inputValue;
    setInputValue('');
    
    // Add User Message immediately
    const userMsg: Message = { id: Date.now().toString(), role: Role.USER, content: userText };
    setMessages(prev => [...prev, userMsg]);
    setStatus('thinking');
    
    // User sent a message, force scroll to bottom and enable auto-scroll
    setTimeout(() => scrollToBottom(), 0);

    // Setup AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Run the Agent Loop with AbortSignal
      const agentResponses = await agent.runConversation(
        userText, 
        (newStatus) => setStatus(newStatus as any),
        controller.signal
      );
      
      setMessages(prev => [...prev, ...agentResponses]);

      // Determine if we are entering 'typing' mode for the last message
      const lastMsg = agentResponses[agentResponses.length - 1];
      if (lastMsg && lastMsg.shouldAnimate) {
        setStatus('typing');
      } else {
        setStatus('idle');
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
         // Handle manual stop (during fetch)
         setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: Role.MODEL,
            content: "🚫 *已停止生成*",
            shouldAnimate: false
         }]);
         setStatus('idle');
      } else {
         console.error("Failed to run agent", error);
         setStatus('idle');
      }
    } finally {
      // Clean up controller, but DO NOT unconditionally set status to idle 
      // because we might be in 'typing' state which needs to persist until animation completes.
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar Overlay (Mobile) */}
      {showSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-30 h-full w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out
        ${showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
           <h2 className="font-bold text-slate-200">历史记录</h2>
           <button 
             onClick={() => setShowSidebar(false)}
             className="md:hidden text-slate-400 hover:text-white"
           >
             <X size={20} />
           </button>
        </div>

        <div className="p-4">
          <button 
            onClick={startNewSession}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg transition-colors font-medium shadow-lg shadow-emerald-900/20"
          >
            <Plus size={18} />
            <span>开启新对话</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => loadSession(session)}
              className={`
                group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                ${currentSessionId === session.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}
              `}
            >
              <MessageSquare size={18} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{session.title}</p>
                <p className="text-xs opacity-60">
                  {new Date(session.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button 
                onClick={(e) => deleteSession(e, session.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-500/20 hover:text-rose-400 rounded transition-all"
                title="删除会话"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
             <div className="text-center text-slate-500 mt-10 text-sm">
               暂无历史记录
             </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full w-full relative">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-4 bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <Menu size={24} />
            </button>
            
            <div className="h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/50">
              <TrendingUp className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white hidden md:block">股市助手</h1>
              <h1 className="text-lg font-bold tracking-tight text-white md:hidden">股市助手</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Gemini 3.0 Pro
              </p>
            </div>
          </div>
          
          {/* Status Indicator */}
          {status !== 'idle' && (
            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 animate-pulse">
              <Activity size={14} className="text-blue-400" />
              <span className="text-xs font-medium text-blue-200 hidden sm:inline">
                {statusMap[status] || status}...
              </span>
              <span className="text-xs font-medium text-blue-200 sm:hidden">
                运行中...
              </span>
            </div>
          )}
        </header>

        {/* Chat Area */}
        <main 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-6 container mx-auto max-w-4xl w-full"
        >
          <div className="space-y-2 pb-4">
            {messages.map((msg, idx) => (
              <ChatMessage 
                key={msg.id} 
                message={msg}
                // Pass ref to the last message if it's the one currently typing
                ref={idx === messages.length - 1 && status === 'typing' ? activeMessageRef : null}
                onContentUpdate={handleSmartScroll}
                // Only track completion for the last message to reset status
                onAnimationComplete={idx === messages.length - 1 ? handleAnimationComplete : undefined}
              />
            ))}
            {/* Show "Processing" indicator only if not yet typing. Once typing, the text itself is the indicator. */}
            {status !== 'idle' && status !== 'typing' && (
               <div className="flex justify-start w-full mb-6">
                 <div className="flex items-center gap-2 ml-14 text-slate-500 text-sm italic">
                    <Sparkles size={16} className="animate-spin-slow" />
                    智能体正在处理您的请求...
                 </div>
               </div>
            )}
          </div>
        </main>

        {/* Input Area */}
        <footer className="bg-slate-900 border-t border-slate-800 p-4 sticky bottom-0 z-20">
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
              {status === 'idle' ? (
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20"
                >
                  <Send size={20} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="absolute right-2 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-lg shadow-rose-900/20 animate-pulse"
                >
                  <Square size={20} fill="currentColor" />
                </button>
              )}
            </form>
            <div className="text-center mt-2">
              <p className="text-[10px] text-slate-500">
                AI生成仅供参考。
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;