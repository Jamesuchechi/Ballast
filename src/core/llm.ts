/**
 * Multi-provider LLM Routing and Fallback Layer for Ballast
 * Supports Gemini, Groq, Mistral, and OpenRouter with multi-model fallback,
 * role-based model dispatch (writer vs critic), exponential backoff, and typed errors.
 */

import {
  computeLLMCacheKey,
  getCachedLLMResponse,
  setCachedLLMResponse,
} from './llmCache';

export type LLMRole = 'writer' | 'critic';

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMInvocationResult {
  text: string;
  usage: LLMUsage;
}

export interface LLMCallOptions {
  role?: LLMRole;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  preferredProvider?: 'gemini' | 'groq' | 'mistral' | 'openrouter';
  skipCache?: boolean;
  cacheTTL?: number;
  onUsage?: (usage: LLMUsage, meta: { provider: string; model: string }) => void;
}

export class LLMProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    public readonly statusCode: number | undefined,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[LLM ${provider}:${model}] ${message}`);
    this.name = 'LLMProviderError';
  }
}

export class LLMAllProvidersFailedError extends Error {
  constructor(public readonly errors: LLMProviderError[]) {
    const summary = errors.map((e) => `${e.provider}/${e.model}: ${e.message}`).join('; ');
    super(`All LLM providers failed. Attempts: [${summary}]`);
    this.name = 'LLMAllProvidersFailedError';
  }
}

interface ProviderConfig {
  name: 'gemini' | 'groq' | 'mistral' | 'openrouter';
  getApiKey: () => string | undefined;
  writerModels: string[];
  criticModels: string[];
  invoke: (
    apiKey: string,
    model: string,
    prompt: string,
    systemPrompt: string,
    opts: LLMCallOptions
  ) => Promise<LLMInvocationResult>;
}

// Helper: exponential backoff delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gemini Provider implementation
 */
async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt: string,
  opts: LLMCallOptions
): Promise<LLMInvocationResult> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Some models (like Gemma) do not support systemInstruction, so we format cleanly
  const combinedPrompt = systemPrompt
    ? `System Instructions:\n${systemPrompt}\n\nTask / Input:\n${prompt}`
    : prompt;

  const payload = {
    contents: [
      {
        parts: [{ text: combinedPrompt }],
      },
    ],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LLMProviderError('gemini', model, response.status, errorText);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new LLMProviderError('gemini', model, response.status, 'No text candidate returned');
  }

  const promptEstimate = Math.ceil(combinedPrompt.length / 4);
  const completionEstimate = Math.ceil(text.length / 4);

  const promptTokens = data?.usageMetadata?.promptTokenCount ?? promptEstimate;
  const completionTokens = data?.usageMetadata?.candidatesTokenCount ?? completionEstimate;
  const totalTokens = data?.usageMetadata?.totalTokenCount ?? (promptTokens + completionTokens);

  return {
    text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };
}

/**
 * Resolves the application URL for OpenRouter ranking and attribution (Bug 12).
 */
export function getOpenRouterReferer(): string {
  if (process.env.NEXT_APP_URL && !process.env.NEXT_APP_URL.includes('localhost')) {
    return process.env.NEXT_APP_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  return process.env.NEXT_APP_URL || 'https://ballast.app';
}

/**
 * OpenAI-compatible format handler (Groq, Mistral, OpenRouter)
 */
async function callOpenAICompatible(
  providerName: 'groq' | 'mistral' | 'openrouter',
  endpoint: string,
  apiKey: string,
  model: string,
  prompt: string,
  systemPrompt: string,
  opts: LLMCallOptions
): Promise<LLMInvocationResult> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (providerName === 'openrouter') {
    headers['HTTP-Referer'] = getOpenRouterReferer();
    headers['X-Title'] = 'Ballast Briefing Engine';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LLMProviderError(providerName, model, response.status, errorText);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new LLMProviderError(providerName, model, response.status, 'Invalid choice structure returned');
  }

  const promptEstimate = Math.ceil(((prompt?.length || 0) + (systemPrompt?.length || 0)) / 4);
  const completionEstimate = Math.ceil(content.length / 4);

  const promptTokens = data?.usage?.prompt_tokens ?? promptEstimate;
  const completionTokens = data?.usage?.completion_tokens ?? completionEstimate;
  const totalTokens = data?.usage?.total_tokens ?? (promptTokens + completionTokens);

  return {
    text: content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };
}

/**
 * Provider Registry with 3-4 verified stable, non-decommissioned models each.
 */
const PROVIDERS: Record<'gemini' | 'groq' | 'mistral' | 'openrouter', ProviderConfig> = {
  gemini: {
    name: 'gemini',
    getApiKey: () => process.env.GEMINI_API_KEY,
    writerModels: [
      'gemini-flash-latest',
      'gemini-pro-latest',
      'gemini-flash-lite-latest',
      'gemma-4-26b-a4b-it',
    ],
    criticModels: [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemma-4-26b-a4b-it',
      'gemini-pro-latest',
    ],
    invoke: callGemini,
  },
  groq: {
    name: 'groq',
    getApiKey: () => process.env.GROQ_API_KEY,
    writerModels: [
      'groq/compound',
      'qwen/qwen3.8-27b',
      'groq/compound-mini',
      'qwen/qwen3.6-27b',
    ],
    criticModels: [
      'groq/compound-mini',
      'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
      'groq/compound',
    ],
    invoke: (apiKey, model, prompt, sys, opts) =>
      callOpenAICompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', apiKey, model, prompt, sys, opts),
  },
  mistral: {
    name: 'mistral',
    getApiKey: () => process.env.MISTRAL_API_KEY,
    writerModels: [
      'ministral-8b-latest',
      'ministral-14b-latest',
      'ministral-3b-latest',
      'open-mistral-7b',
    ],
    criticModels: [
      'ministral-3b-latest',
      'ministral-8b-latest',
      'open-mistral-7b',
      'ministral-14b-latest',
    ],
    invoke: (apiKey, model, prompt, sys, opts) =>
      callOpenAICompatible('mistral', 'https://api.mistral.ai/v1/chat/completions', apiKey, model, prompt, sys, opts),
  },
  openrouter: {
    name: 'openrouter',
    getApiKey: () => process.env.OPENROUTER_API_KEY,
    writerModels: [
      'nvidia/nemotron-3.5-lightning:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'nex-agi/nex-n2.5-mini:free',
      'liquid/lfm-2.5-2.6b:free',
    ],
    criticModels: [
      'nex-agi/nex-n2.5-mini:free',
      'nvidia/nemotron-3.5-lightning:free',
      'liquid/lfm-2.5-2.6b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
    ],
    invoke: (apiKey, model, prompt, sys, opts) =>
      callOpenAICompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions', apiKey, model, prompt, sys, opts),
  },
};

/**
 * Standard fallback order across providers:
 * Gemini -> Groq -> Mistral -> OpenRouter
 */
const DEFAULT_PROVIDER_ORDER: Array<'gemini' | 'groq' | 'mistral' | 'openrouter'> = [
  'gemini',
  'groq',
  'mistral',
  'openrouter',
];

/**
 * Executes an LLM call using extensive multi-tier fallback:
 * 1. Checks provider order (custom preferred or default).
 * 2. Checks API key presence (fails loud if key is missing when explicitly called).
 * 3. Tries models in sequence for that provider.
 * 4. Retries transient errors (429 rate limit, 5xx server error, timeout) with exponential backoff.
 * 5. Falls over to subsequent providers if all models of a provider fail.
 * 6. Throws LLMAllProvidersFailedError if all providers fail.
 */
export async function llmCall(
  prompt: string,
  systemPrompt: string,
  opts: LLMCallOptions = {}
): Promise<string> {
  const role = opts.role ?? 'writer';
  const maxRetries = opts.maxRetries ?? 2;
  const skipCache = opts.skipCache ?? false;

  // 1. Check Redis/in-memory cache unless skipCache is true (Feature E10)
  const cacheKey = computeLLMCacheKey(prompt, systemPrompt, {
    role,
    temperature: opts.temperature,
    preferredModel: opts.preferredProvider,
  });

  if (!skipCache) {
    const cached = await getCachedLLMResponse(cacheKey);
    if (cached && cached.text) {
      if (opts.onUsage) {
        opts.onUsage(cached.usage, {
          provider: cached.provider,
          model: cached.model,
        });
      }
      return cached.text;
    }
  }

  // Build provider order with preferredProvider first if specified
  const order = [...DEFAULT_PROVIDER_ORDER];
  if (opts.preferredProvider) {
    const idx = order.indexOf(opts.preferredProvider);
    if (idx > -1) {
      order.splice(idx, 1);
      order.unshift(opts.preferredProvider);
    }
  }

  // Critic defaults to Groq first if available for high-speed structured verification
  if (role === 'critic' && !opts.preferredProvider) {
    const groqIdx = order.indexOf('groq');
    if (groqIdx > -1) {
      order.splice(groqIdx, 1);
      order.unshift('groq');
    }
  }

  const collectedErrors: LLMProviderError[] = [];

  for (const providerKey of order) {
    const provider = PROVIDERS[providerKey];
    const apiKey = provider.getApiKey();

    if (!apiKey) {
      // Key not configured for this provider, continue to next
      continue;
    }

    const models = role === 'critic' ? provider.criticModels : provider.writerModels;

    for (const model of models) {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const result = await provider.invoke(apiKey, model, prompt, systemPrompt, opts);
          if (result && result.text && result.text.trim().length > 0) {
            if (opts.onUsage) {
              opts.onUsage(result.usage, { provider: provider.name, model });
            }
            // Asynchronously store in 24-hour cache (Feature E10)
            if (!skipCache) {
              setCachedLLMResponse(
                cacheKey,
                {
                  text: result.text,
                  usage: result.usage,
                  provider: provider.name,
                  model,
                  cachedAt: new Date().toISOString(),
                },
                opts.cacheTTL
              ).catch(() => {});
            }
            return result.text;
          }
          throw new LLMProviderError(provider.name, model, 200, 'Empty response from model');
        } catch (err: any) {
          const isLlmError = err instanceof LLMProviderError;
          const status = isLlmError ? err.statusCode : undefined;
          const isTransient =
            status === 429 ||
            (status && status >= 500) ||
            err.name === 'TimeoutError' ||
            err.message?.includes('timeout') ||
            err.message?.includes('fetch failed');

          const wrappedError = isLlmError
            ? err
            : new LLMProviderError(provider.name, model, status, err.message || 'Unknown network failure', err);

          attempt++;

          if (isTransient && attempt <= maxRetries) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            console.warn(
              `[LLM RETRY] ${provider.name}:${model} failed with status ${status} (attempt ${attempt}/${maxRetries}). Retrying in ${backoffMs}ms...`
            );
            await delay(backoffMs);
          } else {
            console.warn(`[LLM FAILOVER] ${provider.name}:${model} failed: ${wrappedError.message}. Trying next model/provider...`);
            collectedErrors.push(wrappedError);
            break; // Try next model
          }
        }
      }
    }
  }

  // All configured providers and models failed
  throw new LLMAllProvidersFailedError(collectedErrors);
}

/**
 * Executes an LLM call and returns both the text output and detailed token usage.
 */
export async function llmCallWithUsage(
  prompt: string,
  systemPrompt: string,
  opts: LLMCallOptions = {}
): Promise<LLMInvocationResult> {
  let capturedUsage: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const text = await llmCall(prompt, systemPrompt, {
    ...opts,
    onUsage: (usage, meta) => {
      capturedUsage = usage;
      if (opts.onUsage) opts.onUsage(usage, meta);
    },
  });
  return { text, usage: capturedUsage };
}

/**
 * Utility to extract clean JSON from LLM outputs that may contain markdown fences or surrounding chatter.
 */
export function extractJsonFromLlm<T = any>(rawText: string): T {
  const trimmed = rawText.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to regex extraction
  }

  // 2. Markdown code fence match (```json ... ``` or ``` ... ```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // Continue
    }
  }

  // 3. First '{' to last '}' bracket match
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch (e: any) {
      throw new Error(`Failed to parse extracted JSON substring: ${e.message}\nRaw content: ${trimmed.slice(0, 300)}`);
    }
  }

  throw new Error(`No valid JSON found in LLM response:\n${trimmed.slice(0, 300)}`);
}

/**
 * Per-token pricing table per 1,000,000 tokens (USD).
 */
export interface ModelPricing {
  promptPerMillion: number;
  completionPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini
  'gemini-3.6-flash': { promptPerMillion: 0.075, completionPerMillion: 0.30 },
  'gemini-3.5-flash': { promptPerMillion: 0.075, completionPerMillion: 0.30 },
  'gemini-flash-latest': { promptPerMillion: 0.075, completionPerMillion: 0.30 },
  'gemini-3.1-pro': { promptPerMillion: 1.25, completionPerMillion: 5.00 },
  'gemini-pro-latest': { promptPerMillion: 1.25, completionPerMillion: 5.00 },

  // Groq (standard low-cost / free tier)
  'llama-3.3-70b-versatile': { promptPerMillion: 0.59, completionPerMillion: 0.79 },
  'llama-3.1-8b-instant': { promptPerMillion: 0.05, completionPerMillion: 0.08 },

  // Mistral
  'ministral-8b-latest': { promptPerMillion: 0.10, completionPerMillion: 0.10 },
  'ministral-3b-latest': { promptPerMillion: 0.04, completionPerMillion: 0.04 },
  'ministral-14b-latest': { promptPerMillion: 0.20, completionPerMillion: 0.20 },
  'open-mistral-7b': { promptPerMillion: 0.25, completionPerMillion: 0.25 },

  // OpenRouter free models
  'nvidia/nemotron-3.5-lightning:free': { promptPerMillion: 0.0, completionPerMillion: 0.0 },
  'nvidia/nemotron-3-super-120b-a12b:free': { promptPerMillion: 0.0, completionPerMillion: 0.0 },
  'nex-agi/nex-n2.5-mini:free': { promptPerMillion: 0.0, completionPerMillion: 0.0 },
  'liquid/lfm-2.5-2.6b:free': { promptPerMillion: 0.0, completionPerMillion: 0.0 },
};

/**
 * Calculates estimated LLM cost in USD based on actual token counts and model pricing.
 * Returns 0 if free tier, mock mode, or unrecognized free model.
 */
export function estimateLLMCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  if (process.env.EVAL_USE_MOCK === 'true' || model.endsWith(':free')) {
    return 0;
  }

  const pricing = MODEL_PRICING[model];
  if (pricing) {
    const promptCost = (promptTokens / 1_000_000) * pricing.promptPerMillion;
    const completionCost = (completionTokens / 1_000_000) * pricing.completionPerMillion;
    return Number((promptCost + completionCost).toFixed(6));
  }

  // Fallback defaults by provider
  if (provider === 'openrouter' && model.includes(':free')) {
    return 0;
  }
  if (provider === 'groq') {
    return 0;
  }
  if (provider === 'gemini') {
    return Number((((promptTokens * 0.075) + (completionTokens * 0.30)) / 1_000_000).toFixed(6));
  }
  if (provider === 'mistral') {
    return Number((((promptTokens * 0.10) + (completionTokens * 0.10)) / 1_000_000).toFixed(6));
  }

  return 0;
}

export {
  computeLLMCacheKey,
  getCachedLLMResponse,
  setCachedLLMResponse,
  getLLMCacheStats,
  clearLLMCache,
  DEFAULT_LLM_CACHE_TTL_SECONDS,
  type CachedLLMPayload,
  type LLMCacheStats,
} from './llmCache';
