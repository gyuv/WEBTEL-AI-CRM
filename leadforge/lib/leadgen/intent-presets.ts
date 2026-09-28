import { CATEGORY_MAP } from "./intent";
export const CATEGORY_PRESETS = [...new Set(CATEGORY_MAP.map((c) => c.category))];
