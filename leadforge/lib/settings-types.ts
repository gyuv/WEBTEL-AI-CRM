export type ProviderId =
  | "osm" | "nominatim" | "brave" | "cse" | "searxng" | "places" | "directories" | "website" | "publicdata";
export type LlmId = "gemini" | "groq" | "openrouter" | "ollama";

export interface AppSettings {
  mockMode: boolean;
  providers: Record<ProviderId, boolean>;
  llmOrder: LlmId[];
  models: { gemini: string; groq: string; openrouter: string; ollama: string };
  ollamaUrl: string;
  searxngUrl: string;
  cseCx: string;
  placesDailyBudget: number;
  directories: string[];
  targets: { callsPerDay: number; emailsPerDay: number };
  coldAfterDays: number;
  userAgentContact: string;
  defaultCity: string;
  theme?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mockMode: true,
  providers: {
    osm: true, nominatim: true, brave: false, cse: false, searxng: false, places: false,
    directories: false, website: true, publicdata: true,
  },
  llmOrder: ["gemini", "groq", "openrouter", "ollama"],
  models: {
    gemini: "gemini-2.5-flash",
    groq: "llama-3.3-70b-versatile",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
    ollama: "llama3.1",
  },
  ollamaUrl: "http://localhost:11434",
  searxngUrl: "",
  cseCx: "",
  placesDailyBudget: 30,
  directories: [],
  targets: { callsPerDay: 40, emailsPerDay: 30 },
  coldAfterDays: 14,
  userAgentContact: "",
  defaultCity: "Chennai",
};

/** Approximate free-tier daily limits used by the usage meter (warn at 80%). */
export const FREE_LIMITS: Record<string, { daily: number; label: string; note: string }> = {
  gemini: { daily: 250, label: "Gemini (free)", note: "Flash free tier; varies by model" },
  groq: { daily: 1000, label: "Groq (free)", note: "Per-model daily request cap" },
  openrouter: { daily: 50, label: "OpenRouter :free", note: "50/day without credits" },
  ollama: { daily: Infinity, label: "Ollama (local)", note: "Unlimited" },
  osm: { daily: 10000, label: "OSM Overpass", note: "Fair use" },
  nominatim: { daily: 2000, label: "Nominatim", note: "1 req/s, no bulk" },
  brave: { daily: 66, label: "Brave Search", note: "~2,000/month" },
  cse: { daily: 100, label: "Google Programmable Search", note: "100/day free" },
  searxng: { daily: Infinity, label: "SearXNG (self-hosted)", note: "Unlimited" },
  places: { daily: 30, label: "Google Places", note: "30/day ≈ 900/month — stays inside Google's free monthly allowance" },
  website: { daily: Infinity, label: "Website crawl", note: "Polite, robots.txt respected" },
  gmail: { daily: 10000, label: "Gmail API", note: "Generous free quota" },
};
