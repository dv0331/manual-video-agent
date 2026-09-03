import { UploadPanel } from "@/components/upload-panel";

const steps = [
  {
    n: "01",
    title: "Ingest",
    body: "Rasterize pages, pull figures, and keep the source text.",
  },
  {
    n: "02",
    title: "Understand",
    body: "Build an assembly graph: BOM, tools, sequence, warnings.",
  },
  {
    n: "03",
    title: "Plan and evaluate",
    body: "Storyboard scenes, score frames, and retry anything that invents hardware.",
  },
  {
    n: "04",
    title: "Stitch",
    body: "Animate each figure, burn callouts, and chapter the video.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <section className="max-w-3xl space-y-4">
        <p className="font-mono text-xs tracking-[0.2em] text-primary">
          MECHANICAL ASSEMBLY AGENT
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-pretty sm:text-5xl">
          Turn an instruction manual into a step-by-step assembly video.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Mechanical engineers should not have to reconstruct a machine from
          prose. Upload the manual. The agent extracts the procedure from the
          figures you already have, evaluates every scene, and returns a
          chaptered video you can follow at the bench.
        </p>
      </section>

      <UploadPanel />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div key={step.n} className="rounded-xl border border-border/80 bg-card p-4">
            <p className="font-mono text-xs text-primary">{step.n}</p>
            <h2 className="mt-2 text-sm font-medium">{step.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
