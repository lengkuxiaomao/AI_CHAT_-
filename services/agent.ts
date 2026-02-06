import { 
  GoogleGenAI, 
  Type, 
  FunctionDeclaration, 
  Content,
  Part,
  GenerateContentResponse
} from "@google/genai";
import { getStockMarketData } from "./mockStockService";
import { Message, Role, StockToolResult } from "../types";

// Define the Tool Schema
const getStockDataFunctionDeclaration: FunctionDeclaration = {
  name: 'get_stock_market_data',
  description: 'Fetches real-time stock market data, historical prices, and volume for a given stock symbol.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      symbol: {
        type: Type.STRING,
        description: 'The stock ticker symbol (e.g., AAPL, TSLA, GOOGL).',
      },
    },
    required: ['symbol'],
  },
};

// Map tool names to implementation
const toolsImplementation: Record<string, Function> = {
  'get_stock_market_data': getStockMarketData
};

export class StockAgent {
  private ai: GoogleGenAI;
  
  // Model Priority List:
  // 1. gemini-2.0-flash: Newest, fastest, high limits.
  // 2. gemini-1.5-flash: Reliable fallback, usually has a separate quota bucket in free tier.
  private models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  
  private history: Content[] = [];

  constructor() {
    if (!process.env.API_KEY) {
      console.error("API_KEY is missing");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Clears the current conversation history.
   */
  reset() {
    this.history = [];
  }

  /**
   * Restores conversation history from UI messages.
   */
  setHistory(messages: Message[]) {
    this.history = messages
      .filter(m => m.role !== Role.TOOL)
      .map(m => {
        if (m.role === Role.USER) {
          return { role: 'user', parts: [{ text: m.content }] };
        } else {
          return { role: 'model', parts: [{ text: m.content }] };
        }
      });
  }

  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Tries to generate content using models in priority order.
   * If a model hits a rate limit (429) or overload (503), it falls back to the next model.
   */
  private async generateContentWithFallback(
    contents: Content[], 
    tools: any[], 
    systemInstruction: string
  ): Promise<{ response: GenerateContentResponse, modelUsed: string }> {
    
    let lastError: any = null;

    for (const model of this.models) {
      try {
        // console.log(`[Agent] Attempting with model: ${model}`);
        const result = await this.ai.models.generateContent({
          model: model,
          contents: contents,
          config: {
            tools: tools,
            systemInstruction: systemInstruction,
          }
        });
        
        return { response: result, modelUsed: model };

      } catch (error: any) {
        lastError = error;
        
        // Analyze if error is related to quota or capacity
        const isRateLimit = error.status === 429 || 
                            error.code === 429 || 
                            (error.message && error.message.includes('429')) ||
                            (error.message && error.message.includes('quota'));
        
        const isOverloaded = error.status === 503 || 
                             (error.message && error.message.includes('503'));

        // If it's a capacity issue and we have more models to try, continue loop
        if ((isRateLimit || isOverloaded) && model !== this.models[this.models.length - 1]) {
          console.warn(`[Agent] Model ${model} failed (Quota/Load). Switching to fallback...`);
          await this.delay(1000); // Small cool-down before switching
          continue; 
        }

        // Otherwise throw the error (e.g. invalid request, or all models exhausted)
        throw error;
      }
    }

    throw lastError || new Error("All models failed");
  }

  /**
   * runs the "Agent Loop"
   */
  async runConversation(
    userMessage: string, 
    onStatusUpdate: (status: string) => void,
    signal?: AbortSignal
  ): Promise<Message[]> {
    const newMessages: Message[] = [];
    
    this.history.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    let turnComplete = false;
    let iteration = 0;
    const MAX_ITERATIONS = 5;

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    while (!turnComplete && iteration < MAX_ITERATIONS) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      iteration++;
      onStatusUpdate(iteration === 1 ? 'thinking' : 'analyzing_tool_data');

      try {
        // Use the Fallback Mechanism
        const { response: result, modelUsed } = await this.generateContentWithFallback(
          this.history,
          [{ functionDeclarations: [getStockDataFunctionDeclaration] }],
          `你是一个专业的金融分析智能体。
          在给出建议之前，请务必使用可用工具验证市场数据。
          收到股票数据后，请深入分析趋势。
          如果用户要求图表，只需获取数据，UI 会负责渲染图表。
          保持回答简洁、专业且有见地。
          请始终使用中文回复。`
        );

        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        const responseContent = result.candidates?.[0]?.content;
        
        if (!responseContent) {
          throw new Error("No content received from model");
        }

        this.history.push(responseContent);

        const parts = responseContent.parts || [];
        const toolCalls = parts.filter(p => p.functionCall);
        const textParts = parts.filter(p => p.text).map(p => p.text).join('');

        if (toolCalls.length > 0) {
           onStatusUpdate('executing_tool');
           const functionResponsesParts: Part[] = [];
           const toolResultsForUI: StockToolResult[] = [];

           for (const call of toolCalls) {
             if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

             const fc = call.functionCall;
             if (!fc) continue;

             const fnName = fc.name;
             const fnArgs = fc.args as any;
             
             console.log(`[Agent] Calling Tool: ${fnName}`, fnArgs);

             if (toolsImplementation[fnName]) {
               const toolResult = await toolsImplementation[fnName](fnArgs.symbol);
               toolResultsForUI.push(toolResult);

               functionResponsesParts.push({
                 functionResponse: {
                   name: fnName,
                   id: fc.id, 
                   response: { result: toolResult }
                 }
               });
             }
           }

           this.history[this.history.length - 1] = responseContent; 
           
           this.history.push({
             parts: functionResponsesParts
           });

           if (toolResultsForUI.length > 0) {
             newMessages.push({
               id: Date.now().toString() + '-tool',
               role: Role.TOOL,
               content: `已获取 ${toolResultsForUI.map(t => t.symbol).join(', ')} 的数据`,
               stockData: toolResultsForUI, 
               shouldAnimate: false 
             });
           }

        } else {
          turnComplete = true;
          newMessages.push({
            id: Date.now().toString(),
            role: Role.MODEL,
            content: textParts || "我已处理该请求。",
            shouldAnimate: true 
          });
        }

      } catch (error: any) {
        if (error.name === 'AbortError') throw error;

        console.error("Agent Error:", error);
        turnComplete = true;
        
        let errorMessage = "处理您的请求时遇到错误。";
        
        // More descriptive error messages based on fallback failure
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
          errorMessage = "所有可用模型的免费配额均已耗尽。请稍后再试（Gemini 2.0 & 1.5）。";
        } else if (error.message && error.message.includes('quota')) {
          errorMessage = "API 配额已耗尽。请稍后再试。";
        } else if (error.status === 404) {
          errorMessage = "配置的模型不可用。";
        }

        newMessages.push({
          id: Date.now().toString(),
          role: Role.MODEL,
          content: errorMessage,
          shouldAnimate: true
        });
      }
    }

    return newMessages;
  }
}