import {
  ApiError,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";
import type { CallAnalysis } from "./agent.types";
import {
  CallAnalysisSchema,
  LlmError,
  type ChatMessage,
  type GenerateRequest,
  type GenerateResult,
  type LlmClient,
} from "./llm.types";
import type { ToolDeclaration } from "./tools";

export interface GeminiClientOptions {
  apiKey?: string;
  model: string;
  /** Injected in tests; defaults to a real SDK client built from `apiKey`. */
  ai?: Pick<GoogleGenAI, "models">;
  /** Back-off before the single retry on 429/5xx (PRD §8.1: 500 ms). */
  retryDelayMs?: number;
}

const ANALYSIS_PROMPT =
  "You analyse a finished customer-care phone call from an online store. Reply with JSON only. " +
  "sentiment is the customer's overall mood; objection is their main reason for not completing the order " +
  "(NONE if they gave none); intent is whether they will complete the order, are undecided, or declined; " +
  "summary is one plain sentence of at most 200 characters.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;
  const named = err as { name?: string; status?: unknown; message?: string } | null;
  if (named?.name === "AbortError") return new LlmError("TIMEOUT", "Gemini request timed out", err);
  const status = err instanceof ApiError ? err.status : named?.status;
  if (typeof status === "number") {
    if (status === 429) return new LlmError("RATE_LIMIT", "Gemini rate limit", err);
    if (status >= 500) return new LlmError("SERVER", `Gemini server error ${status}`, err);
    return new LlmError("BAD_RESPONSE", `Gemini rejected the request (${status})`, err);
  }
  // Network failures (offline, DNS, reset) are retried like a server error.
  return new LlmError("SERVER", named?.message ?? "Gemini request failed", err);
}

function toFunctionDeclarations(tools: ToolDeclaration[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      required: tool.parameters.required,
      properties: Object.fromEntries(
        Object.entries(tool.parameters.properties).map(([key, prop]) => [
          key,
          {
            type: prop.type === "integer" ? Type.INTEGER : Type.STRING,
            description: prop.description,
            ...(prop.enum ? { enum: prop.enum } : {}),
          },
        ]),
      ),
    },
  }));
}

function toContents(history: ChatMessage[]): Content[] {
  return history.map((m) => {
    // The provider's own content (with thought signatures) is replayed untouched.
    if (m.raw) return m.raw as Content;
    const parts: Part[] = [];
    if (m.text) parts.push({ text: m.text });
    for (const fc of m.functionCalls ?? []) {
      parts.push({
        functionCall: { name: fc.name, args: fc.args, ...(fc.id ? { id: fc.id } : {}) },
      });
    }
    for (const fr of m.functionResponses ?? []) {
      parts.push({
        functionResponse: { name: fr.name, response: fr.response, ...(fr.id ? { id: fr.id } : {}) },
      });
    }
    return { role: m.role, parts };
  });
}

function textOf(parts: Part[]): string | undefined {
  const text = parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
  return text || undefined;
}

export class GeminiLlmClient implements LlmClient {
  private ai: Pick<GoogleGenAI, "models">;
  private model: string;
  private retryDelayMs: number;

  constructor(opts: GeminiClientOptions) {
    if (!opts.ai && !opts.apiKey) throw new Error("GeminiLlmClient needs an apiKey");
    this.ai = opts.ai ?? new GoogleGenAI({ apiKey: opts.apiKey! });
    this.model = opts.model;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const response = await this.callWithRetry(
      {
        model: this.model,
        contents: toContents(req.history),
        config: {
          systemInstruction: req.systemPrompt,
          tools: [{ functionDeclarations: toFunctionDeclarations(req.tools) }],
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      },
      req.timeoutMs,
    );
    const content = response.candidates?.[0]?.content;
    if (!content) throw new LlmError("BAD_RESPONSE", "Gemini returned no candidate content");
    const parts = content.parts ?? [];
    return {
      text: textOf(parts),
      functionCalls: parts
        .filter((p) => p.functionCall)
        .map((p) => ({
          name: p.functionCall!.name ?? "",
          args: p.functionCall!.args ?? {},
          ...(p.functionCall!.id ? { id: p.functionCall!.id } : {}),
        })),
      raw: content,
    };
  }

  async analyze(req: { transcript: string; timeoutMs: number }): Promise<CallAnalysis> {
    const response = await this.callWithRetry(
      {
        model: this.model,
        contents: [{ role: "user", parts: [{ text: req.transcript }] }],
        config: {
          systemInstruction: ANALYSIS_PROMPT,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["sentiment", "objection", "intent", "summary"],
            properties: {
              sentiment: { type: Type.STRING, enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
              objection: {
                type: Type.STRING,
                enum: [
                  "SHIPPING_COST",
                  "PRICE",
                  "TRUST",
                  "TIMING",
                  "CHANGED_MIND",
                  "OTHER",
                  "NONE",
                ],
              },
              intent: { type: Type.STRING, enum: ["WILL_PURCHASE", "UNDECIDED", "DECLINED"] },
              summary: { type: Type.STRING },
            },
          },
        },
      },
      req.timeoutMs,
    );
    const text = textOf(response.candidates?.[0]?.content?.parts ?? []);
    if (!text) throw new LlmError("BAD_RESPONSE", "Gemini returned no analysis text");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new LlmError("BAD_RESPONSE", "Analysis was not valid JSON", err);
    }
    const parsed = CallAnalysisSchema.safeParse(json);
    if (!parsed.success)
      throw new LlmError("BAD_RESPONSE", "Analysis had unexpected fields", parsed.error);
    return parsed.data;
  }

  /** One retry, only for 429 and 5xx (and network failures), per PRD §8.1. */
  private async callWithRetry(
    params: GenerateContentParameters,
    timeoutMs: number,
  ): Promise<GenerateContentResponse> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.callOnce(params, timeoutMs);
      } catch (err) {
        const error = toLlmError(err);
        const retryable = error.kind === "RATE_LIMIT" || error.kind === "SERVER";
        if (attempt === 1 && retryable) {
          await sleep(this.retryDelayMs);
          continue;
        }
        throw error;
      }
    }
  }

  private async callOnce(
    params: GenerateContentParameters,
    timeoutMs: number,
  ): Promise<GenerateContentResponse> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LlmError("TIMEOUT", `Gemini did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        this.ai.models.generateContent({
          ...params,
          config: { ...params.config, abortSignal: controller.signal },
        }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
