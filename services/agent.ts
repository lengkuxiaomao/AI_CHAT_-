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
  // Switching to Flash prevents 429 errors more effectively for this demo, 
  // while still being capable of tool use.
  // If strict reasoning is needed, we can revert to 'gemini-3-pro-preview' 
  // but Flash is safer for quota.
  private modelName = 'gemini-3-flash-preview'; 
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
   * We approximate the API Content structure from the UI Message structure.
   */
  setHistory(messages: Message[]) {
    this.history = messages
      .filter(m => m.role !== Role.TOOL) // Skip tool UI messages for direct API history context to simplify
      .map(m => {
        if (m.role === Role.USER) {
          return { role: 'user', parts: [{ text: m.content }] };
        } else {
          // Model role
          return { role: 'model', parts: [{ text: m.content }] };
        }
      });
  }

  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wraps generateContent with exponential backoff for 429 errors
   */
  private async generateContentWithRetry(
    contents: Content[], 
    tools: any[], 
    systemInstruction: string,
    attempt = 1
  ): Promise<GenerateContentResponse> {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 2000;

    try {
      return await this.ai.models.generateContent({
        model: this.modelName,
        contents: contents,
        config: {
          tools: tools,
          systemInstruction: systemInstruction,
        }
      });
    } catch (error: any) {
      // Check for 429 (Resource Exhausted)
      // The error object structure might vary, checking code and status
      const isRateLimit = error.status === 429 || 
                          error.code === 429 || 
                          (error.message && error.message.includes('429')) ||
                          (error.message && error.message.includes('quota'));

      if (isRateLimit && attempt <= MAX_RETRIES) {
        const delayTime = BASE_DELAY * Math.pow(2, attempt - 1);
        console.warn(`[Agent] Rate limit hit (429). Retrying in ${delayTime}ms... (Attempt ${attempt}/${MAX_RETRIES})`);
        await this.delay(delayTime);
        return this.generateContentWithRetry(contents, tools, systemInstruction, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * runs the "Agent Loop":
   * 1. Send user message to model.
   * 2. Model decides: Text OR ToolCall.
   * 3. If ToolCall -> Execute Tool -> Send result back to model -> Goto 2.
   * 4. If Text -> Return final response.
   */
  async runConversation(
    userMessage: string, 
    onStatusUpdate: (status: string) => void
  ): Promise<Message[]> {
    const newMessages: Message[] = [];
    
    // 1. Add User Message to History
    this.history.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    let turnComplete = false;
    let iteration = 0;
    const MAX_ITERATIONS = 5; // Prevent infinite loops

    while (!turnComplete && iteration < MAX_ITERATIONS) {
      iteration++;
      onStatusUpdate(iteration === 1 ? 'thinking' : 'analyzing_tool_data');

      try {
        // 2. Call Gemini with Retry
        const result = await this.generateContentWithRetry(
          this.history,
          [{ functionDeclarations: [getStockDataFunctionDeclaration] }],
          `你是一个专业的金融分析智能体。
          在给出建议之前，请务必使用可用工具验证市场数据。
          收到股票数据后，请深入分析趋势。
          如果用户要求图表，只需获取数据，UI 会负责渲染图表。
          保持回答简洁、专业且有见地。
          请始终使用中文回复。`
        );

        const responseContent = result.candidates?.[0]?.content;
        
        if (!responseContent) {
          throw new Error("No content received from model");
        }

        // Add model turn to history
        this.history.push(responseContent);

        const parts = responseContent.parts || [];
        const toolCalls = parts.filter(p => p.functionCall);
        const textParts = parts.filter(p => p.text).map(p => p.text).join('');

        if (toolCalls.length > 0) {
           onStatusUpdate('executing_tool');
           const functionResponsesParts: Part[] = [];
           const toolResultsForUI: StockToolResult[] = [];

           // Execute all requested tools
           for (const call of toolCalls) {
             const fc = call.functionCall;
             if (!fc) continue;

             const fnName = fc.name;
             const fnArgs = fc.args as any;
             
             console.log(`[Agent] Calling Tool: ${fnName}`, fnArgs);

             if (toolsImplementation[fnName]) {
               // Execute local function
               const toolResult = await toolsImplementation[fnName](fnArgs.symbol);
               
               // Store for UI rendering (Side Effect)
               toolResultsForUI.push(toolResult);

               // Create API response part
               functionResponsesParts.push({
                 functionResponse: {
                   name: fnName,
                   id: fc.id, 
                   response: { result: toolResult }
                 }
               });
             }
           }

           // Add Tool Response to History
           // We need to append the function response to the history specifically so the model sees it in the next loop.
           this.history[this.history.length - 1] = responseContent; // Ensure the toolCall is saved in history
           
           this.history.push({
             parts: functionResponsesParts
           });

           // Add an intermediate message to UI if needed
           if (toolResultsForUI.length > 0) {
             newMessages.push({
               id: Date.now().toString() + '-tool',
               role: Role.TOOL,
               content: `已获取 ${toolResultsForUI.map(t => t.symbol).join(', ')} 的数据`,
               stockData: toolResultsForUI // Pass all results for comparison
             });
           }

        } else {
          // No tools called, this is the final answer
          turnComplete = true;
          newMessages.push({
            id: Date.now().toString(),
            role: Role.MODEL,
            content: textParts || "我已处理该请求。"
          });
        }

      } catch (error: any) {
        console.error("Agent Error:", error);
        turnComplete = true;
        
        let errorMessage = "处理您的请求时遇到错误。";
        
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
          errorMessage = "API 请求过于频繁（429）。目前使用的是免费配额，请稍后重试。";
        } else if (error.message && error.message.includes('quota')) {
          errorMessage = "API 配额已耗尽。请检查您的 Google AI Studio 账单设置或稍后重试。";
        }

        newMessages.push({
          id: Date.now().toString(),
          role: Role.MODEL,
          content: errorMessage
        });
      }
    }

    return newMessages;
  }
}