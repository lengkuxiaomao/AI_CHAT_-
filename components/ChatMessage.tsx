import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message, Role } from '../types';
import StockChart from './StockChart';
import { Bot, User, Cpu } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === Role.USER;
  const isTool = message.role === Role.TOOL;
  const hasChart = message.stockData && message.stockData.length > 0;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${
        // Expand width if chart is present, otherwise keep chat bubble tight
        hasChart ? 'w-full max-w-full' : 'max-w-[85%] md:max-w-[70%]'
      }`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600' : isTool ? 'bg-purple-600' : 'bg-emerald-600'
        }`}>
          {isUser ? <User size={20} /> : isTool ? <Cpu size={20} /> : <Bot size={20} />}
        </div>

        {/* Content Bubble */}
        <div className={`flex flex-col flex-1 min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`p-4 rounded-2xl shadow-md ${
            isUser 
              ? 'bg-blue-600 text-white rounded-tr-none' 
              : isTool
                ? 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
                : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none'
          }`}>
            <div className="text-sm md:text-base leading-relaxed overflow-hidden">
              <ReactMarkdown
                components={{
                  p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                  li: ({node, ...props}) => <li className="ml-1" {...props} />,
                  strong: ({node, ...props}) => <strong className="font-bold text-white/90" {...props} />,
                  b: ({node, ...props}) => <b className="font-bold text-white/90" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-2 mt-4" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2 mt-3" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-base font-bold mb-1 mt-2" {...props} />,
                  code: ({node, ...props}) => (
                     <code className="bg-black/20 rounded px-1 py-0.5 text-xs font-mono" {...props} />
                  ),
                  pre: ({node, ...props}) => (
                    <pre className="bg-black/30 rounded p-3 overflow-x-auto my-2 text-xs font-mono" {...props} />
                  ),
                  table: ({node, ...props}) => (
                    <div className="overflow-x-auto my-3 border border-slate-600 rounded">
                      <table className="min-w-full divide-y divide-slate-600" {...props} />
                    </div>
                  ),
                  thead: ({node, ...props}) => <thead className="bg-slate-700/50" {...props} />,
                  tbody: ({node, ...props}) => <tbody className="divide-y divide-slate-700/50" {...props} />,
                  tr: ({node, ...props}) => <tr className="" {...props} />,
                  th: ({node, ...props}) => <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase tracking-wider" {...props} />,
                  td: ({node, ...props}) => <td className="px-3 py-2 whitespace-nowrap text-sm text-slate-200" {...props} />,
                  a: ({node, ...props}) => <a className="text-blue-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Render Stock Chart if data exists */}
          {hasChart && (
            <div className="w-full mt-2 animate-fade-in-up">
              <StockChart data={message.stockData!} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;