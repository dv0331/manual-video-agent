import { CinematicGoal } from "@/components/cinematic-goal";
import { RecentJobs } from "@/components/recent-jobs";
import { SavedFilms } from "@/components/saved-films";
import { UploadPanel } from "@/components/upload-panel";

const beats = [
  {
    n: "01",
    title: "Read every page",
    body: "The PDF's own drawings stay the reference for every part. Nothing is invented from memory.",
  },
  {
    n: "02",
    title: "Write the storyboard",
    body: "One model reads all the pages and writes each scene: the steps, the drawing, a complete spoken line.",
  },
  {
    n: "03",
    title: "Photo and voice",
    body: "All scenes at once: a photo made from each step's drawing, and the line read by one calm voice.",
  },
  {
    n: "04",
    title: "Check and cut",
    body: "A judge compares each photo with its drawing; a weak one gets one retake. The film is cut once and saved.",
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
            movie opens immediately. Your own PDF goes through the full
            pipeline: storyboard, photos, voice, check, cut.
          </p>
        </section>

        <UploadPanel />
        <SavedFilms />
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
