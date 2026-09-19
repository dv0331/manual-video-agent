import { CinematicGoal } from "@/components/cinematic-goal";
import { RecentJobs } from "@/components/recent-jobs";
import { UploadPanel } from "@/components/upload-panel";

const beats = [
  {
    n: "01",
    title: "Ingest the manual",
    body: "PDF pages stay the part reference. Nothing is invented from memory.",
  },
  {
    n: "02",
    title: "Plan the reel",
    body: "Eight-second scenes, ~20-word lines, a camera move, workshop sound.",
  },
  {
    n: "03",
    title: "Still, then motion",
    body: "Style-referenced start frame. Image-to-video with a quoted spoken line.",
  },
  {
    n: "04",
    title: "Judge and cut",
    body: "Cheap gate, scored critique, one rewrite. Audio fail retries the clip only.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <CinematicGoal />

      <div
        id="make-the-film"
        className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6"
      >
        <section className="max-w-3xl space-y-3">
          <p className="font-mono text-xs tracking-[0.2em] text-primary">
            MAKE THE FILM
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-pretty sm:text-4xl">
            Open a sample, or drop your own manual.
          </h2>
          <p className="text-base leading-7 text-muted-foreground sm:text-lg">
            The four sample kits already have a finished cut. Play one and the
            movie opens immediately. Your own PDF still walks the full reel:
            plan, still, spoken motion, judge, stitch.
          </p>
        </section>

        <UploadPanel />
        <RecentJobs />

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {beats.map((step) => (
            <div key={step.n} className="rounded-xl border border-border/80 bg-card p-4">
              <p className="font-mono text-xs text-primary">{step.n}</p>
              <h3 className="mt-2 text-sm font-medium">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
