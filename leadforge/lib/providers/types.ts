import type { SearchIntent } from "../leadgen/intent";

export interface RawLead {
  name: string;
  address?: string | null;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
  phones?: string[];
  emails?: string[];
  website?: string | null;
  category?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  mapsUrl?: string | null;
  socials?: Record<string, string>;
  yearEst?: number | null;
  sizeEstimate?: string | null;
  source: string;
  sourceUrl?: string | null;
}

export interface WebResult { title: string; url: string; snippet: string; source: string }

export interface DiscoveryOptions { intent: SearchIntent; limit: number; radiusKm: number; userId: string }
