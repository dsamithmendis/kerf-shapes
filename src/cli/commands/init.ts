import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_CONFIG_CONTENTS } from "../config.js";

export async function runInit(force = false): Promise<string> {
  const path = resolve(process.cwd(), "kerf.config.json");
  if (existsSync(path) && !force) {
    throw new Error("kerf.config.json already exists — pass --force to overwrite it.");
  }
  await writeFile(path, DEFAULT_CONFIG_CONTENTS, "utf8");
  return path;
}
