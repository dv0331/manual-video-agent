import type { SerializedJob } from "@/lib/agent/serialize";

const BEATS = [
  { id: "ingest", label: "Manual" },
  { id: "understand", label: "Graph" },
  { id: "plan", label: "Scene plan" },
  { id: "generate", label: "Still + motion" },
  { id: "evaluate", label: "Judge" },
  { id: "stitch", label: "Cut" },
  { id: "done", label: "Film" },
] as const;

export function ProductionReel({ job }: { job: SerializedJob }) {
  const active =
    job.stage === "queued"
      ? "ingest"
      : job.stage === "evaluate"
        ? "evaluate"
        : job.stage;
  const idx = BEATS.findIndex((b) => b.id === active);

  return (
    <ol className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {BEATS.map((beat, i) => {
        const state = i < idx ? "done" : i === idx ? "now" : "wait";
        return (
          <li
            key={beat.id}
            className={`rounded-lg border px-2 py-2 text-center ${
              state === "now"
                ? "border-primary bg-primary/10"
                : state === "done"
                  ? "border-border/80 bg-card"
                  : "border-border/50 text-muted-foreground"
            }`}
          >
            <p className="font-mono text-[10px] tracking-wider text-primary">
              {String(i).padStart(2, "0")}
            </p>
            <p className="mt-1 text-[11px] font-medium sm:text-xs">{beat.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
