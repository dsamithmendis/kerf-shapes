import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface KerfConfig {
  out?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  padding?: number;
  facet?: number;
}

const CONFIG_FILENAME = "kerf.config.json";

export async function loadConfig(cwd: string = process.cwd()): Promise<KerfConfig> {
  const path = resolve(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as KerfConfig;
  } catch (err) {
    throw new Error(`Couldn't parse ${CONFIG_FILENAME}: ${(err as Error).message}`);
  }
}

export const DEFAULT_CONFIG_CONTENTS = `{
  "out": "./components/kerf",
  "fill": "currentColor",
  "padding": 0,
  "strokeWidth": 0
}
`;
