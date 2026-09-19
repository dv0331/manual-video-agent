import { Badge } from "@/components/ui/badge";
import type { SerializedJob } from "@/lib/agent/serialize";

type Result = NonNullable<SerializedJob["sceneResults"]>[number];

export function Storyboard({ results }: { results: Result[] }) {
  if (!results.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No scenes have been evaluated yet.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Storyboard and evaluation</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => (
          <article
            key={result.scene.id}
            className="overflow-hidden rounded-xl border border-border/80 bg-card"
          >
            {result.frameUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.frameUrl}
                alt={result.scene.title}
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">
                Frame pending
              </div>
            )}
            <div className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {String(result.scene.index).padStart(2, "0")} · {result.scene.title}
                </h3>
                <Badge variant={result.evaluation.passed ? "secondary" : "destructive"}>
                  {result.evaluation.passed
                    ? "pass"
                    : result.evaluation.failureType ?? "retry"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{result.evaluation.critique}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <div>gate {(result.evaluation.cheapGate ?? result.evaluation.similarity ?? 0).toFixed(2)}</div>
                <div>parts {(result.evaluation.partIdentity ?? 0).toFixed(2)}</div>
                <div>{result.scene.cameraMotion ?? "camera"}</div>
                <div>
                  {result.motionSource} · {result.attempts}×
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
