import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const bin = existsSync("/tmp/cloudflared") ? "/tmp/cloudflared" : "cloudflared";
const target = process.env.PUBLIC_TARGET ?? "http://127.0.0.1:43127";

const child = spawn(bin, ["tunnel", "--url", target, "--no-autoupdate"], {
  stdio: ["ignore", "pipe", "pipe"],
});

function scan(chunk) {
  const text = chunk.toString();
  process.stderr.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    process.stdout.write(`\nPUBLIC_URL=${match[0]}\n`);
  }
}

child.stdout.on("data", scan);
child.stderr.on("data", scan);
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
