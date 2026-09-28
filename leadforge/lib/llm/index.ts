import "server-only";
import { z } from "zod";
import { cacheGet, cacheSet, getApiKey, getSettings, trackUsage, usageToday } from "../server/core";
import { hashString } from "../utils";
import { FREE_LIMITS, type LlmId } from "../settings-types";

export class RateLimitError extends Error {}

interface CallArgs { system: string; prompt: string; model: string; key: string | null; baseUrl?: string }

async function fetchJson(url: string, init: RequestInit, timeoutMs = 45000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 429 || res.status === 503) throw new RateLimitError(`${res.status} ${url}`);
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const adapters: Record<LlmId, (a: CallArgs) => Promise<{ text: string; tokens: number }>> = {
  async gemini({ system, prompt, model, key }) {
    const j = await fetchJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      },
    );
    return { text: j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "", tokens: j.usageMetadata?.totalTokenCount ?? 0 };
  },
  async groq(a) { return openAiCompat("https://api.groq.com/openai/v1/chat/completions", a); },
  async openrouter(a) { return openAiCompat("https://openrouter.ai/api/v1/chat/completions", a); },
  async ollama({ system, prompt, model, baseUrl }) {
    const j = await fetchJson(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, stream: false, format: "json", messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    }, 120000);
    return { text: j.message?.content ?? "", tokens: (j.eval_count ?? 0) + (j.prompt_eval_count ?? 0) };
  },
};

async function openAiCompat(url: string, { system, prompt, model, key }: CallArgs) {
  const j = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}`, "HTTP-Referer": "https://leadforge.local", "X-Title": "LeadForge" },
    body: JSON.stringify({
      model, temperature: 0.4, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    }),
  });
  return { text: j.choices?.[0]?.message?.content ?? "", tokens: j.usage?.total_tokens ?? 0 };
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("LLM returned non-JSON");
  }
}

export interface GenerateOpts<T> {
  task: string;
  system?: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Deterministic evidence-based fallback used in mock mode or when every provider fails. */
  fallback: () => T | Promise<T>;
  userId?: string;
  cacheTtl?: number;
  noCache?: boolean;
}

export interface GenerateResult<T> { data: T; model: string; cached: boolean; warnings: string[] }

const BASE_SYSTEM =
  "You are LeadForge, a B2B sales research assistant for a salesperson in Chennai, India. " +
  "Use ONLY the evidence provided. Never invent facts, people, numbers, or URLs. " +
  "If evidence is thin, say 'insufficient data'. Respond with a single JSON object matching the requested shape.";

export async function generate<T>(opts: GenerateOpts<T>): Promise<GenerateResult<T>> {
  const userId = opts.userId ?? "owner";
  const settings = await getSettings(userId);
  const warnings: string[] = [];
  const key = `llm:${opts.task}:${hashString(opts.prompt)}`;

  if (!settings.mockMode && !opts.noCache) {
    const hit = await cacheGet<{ data: T; model: string }>(key);
    if (hit) {
      const ok = opts.schema.safeParse(hit.data);
      if (ok.success) return { data: ok.data, model: hit.model, cached: true, warnings };
    }
  }

  if (!settings.mockMode) {
    for (const id of settings.llmOrder) {
      const apiKey = id === "ollama" ? null : await getApiKey(id, userId);
      if (id !== "ollama" && !apiKey) continue;
      if (id === "ollama" && !process.env.OLLAMA_URL && settings.ollamaUrl === "http://localhost:11434" && process.env.VERCEL) continue;
      const limit = FREE_LIMITS[id]?.daily ?? Infinity;
      if ((await usageToday(id, userId)) >= limit) { warnings.push(`${id}: daily free limit reached, skipped`); continue; }
      try {
        const { text, tokens } = await adapters[id]({
          system: `${BASE_SYSTEM}\n${opts.system ?? ""}`,
          prompt: `${opts.prompt}\n\nReturn JSON only.`,
          model: settings.models[id],
          key: apiKey,
          baseUrl: process.env.OLLAMA_URL ?? settings.ollamaUrl,
        });
        await trackUsage(id, 1, tokens, userId);
        const parsed = opts.schema.safeParse(parseJson(text));
        if (!parsed.success) { warnings.push(`${id}: invalid JSON shape, trying next`); continue; }
        const model = `${id}:${settings.models[id]}`;
        await cacheSet("llm", key, { data: parsed.data, model }, opts.cacheTtl ?? 60 * 60 * 24 * 30);
        return { data: parsed.data, model, cached: false, warnings };
      } catch (e) {
        warnings.push(`${id}: ${e instanceof RateLimitError ? "rate limited" : (e as Error).message.slice(0, 120)}`);
      }
    }
    if (!warnings.length) warnings.push("No LLM provider configured; used rule-based engine");
  }
  const data = opts.schema.parse(await opts.fallback());
  return { data, model: settings.mockMode ? "mock:rules" : "rules", cached: false, warnings };
}

export async function llmAvailable(userId = "owner") {
  const s = await getSettings(userId);
  if (s.mockMode) return false;
  for (const id of s.llmOrder) if (id === "ollama" || (await getApiKey(id, userId))) return true;
  return false;
}
