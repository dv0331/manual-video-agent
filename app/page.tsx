import { RecentJobs } from "@/components/recent-jobs";
import { UploadPanel } from "@/components/upload-panel";

const steps = [
  {
    n: "01",
    title: "Ingest",
    body: "Read the PDF — IKEA pages, manufacturing manuals, or a kit you upload.",
  },
  {
    n: "02",
    title: "Understand",
    body: "Build an assembly graph: BOM, tools, sequence, warnings.",
  },
  {
    n: "03",
    title: "Human assembly",
    body: "Each scene is a person performing the step. Frames stay faithful to the manual parts.",
  },
  {
    n: "04",
    title: "Stitch",
    body: "Motion clips, spoken step audio, burned-in callouts, and chapter markers.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
      <section className="max-w-3xl space-y-4">
        <p className="font-mono text-xs tracking-[0.2em] text-primary">
          HUMAN ASSEMBLY AGENT
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-pretty sm:text-5xl">
          Turn an instruction manual into a video of someone assembling the product.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Open an IKEA sample or drop your own PDF. The agent extracts the
          procedure, then Generate video produces a chaptered how-to of a person
          fitting the real parts, with spoken instructions for each step.
        </p>
      </section>

      <UploadPanel />
      <RecentJobs />

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
