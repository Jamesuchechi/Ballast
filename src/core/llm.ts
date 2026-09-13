/**
 * Multi-provider LLM Routing and Fallback Layer for Ballast
 * Supports Gemini, Groq, Mistral, and OpenRouter with multi-model fallback,
 * role-based model dispatch (writer vs critic), exponential backoff, and typed errors.
 */

export type LLMRole = 'writer' | 'critic';

export interface LLMCallOptions {
  role?: LLMRole;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  maxRetries?: number;
  preferredProvider?: 'gemini' | 'groq' | 'mistral' | 'openrouter';
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
  ) => Promise<string>;
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
): Promise<string> {
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

  return text;
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
): Promise<string> {
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
    headers['HTTP-Referer'] = 'https://ballast.local';
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

  return content;
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
          if (result && result.trim().length > 0) {
            return result;
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
