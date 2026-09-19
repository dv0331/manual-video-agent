import { appendFile } from "node:fs/promises";
import path from "node:path";

export async function logProduction(jobPath: string, message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await appendFile(path.join(jobPath, "production.log"), line).catch(() => undefined);
}
