"use client";

import { useEffect, useState } from "react";
import { Pause, Play, SkipForward } from "lucide-react";

type Featured = {
  videoUrl?: string;
  sourceName: string;
  scenes?: Array<{ title: string; narration: string }>;
} | null;

const REELS = [
  {
    id: "goal",
    chapter: "00",
    title: "The finished film",
    line: "A chaptered movie of a person assembling the real parts — spoken steps, no invented hardware.",
    image: "/sample-manual/fig-06.png",
    isGoal: true,
  },
  {
    id: "manual",
    chapter: "01",
    title: "Start with the manual",
    line: "IKEA pages or a kit PDF stay the source of truth. The agent reads figures, not guesses.",
    image: "/sample-manuals/kallax.png",
  },
  {
    id: "plan",
    chapter: "02",
    title: "Lock the scene plan",
    line: "Each beat is ~20 words for eight seconds, a camera move, and a workshop sound — planned before any pixels.",
    image: "/sample-manual/fig-01.png",
  },
  {
    id: "still",
    chapter: "03",
    title: "The start frame",
    line: "A 16:9 still of adult hands at the bench, styled from the manual figure. Same workshop every scene.",
    image: "/sample-manual/fig-03.png",
  },
  {
    id: "motion",
    chapter: "04",
    title: "Motion and a spoken line",
    line: "Image-to-video with quoted narration. Audio fail retries the clip. Visual fail remakes the still.",
    image: "/sample-manual/fig-04.png",
  },
  {
    id: "judge",
    chapter: "05",
    title: "Judge, then rewrite",
    line: "Cheap alignment first, then a scored critique. One prompt rewrite. A person still signs off on warnings.",
    image: "/sample-manual/fig-05.png",
  },
  {
    id: "stitch",
    chapter: "06",
    title: "Cut the movie",
    line: "Clips concat in order. Captions and chapters ride along. That is the film you opened with.",
    image: "/sample-manual/fig-06.png",
  },
] as const;

export function CinematicGoal() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [featured, setFeatured] = useState<Featured>(null);

  useEffect(() => {
    void fetch("/api/jobs?featured=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { featured: null }))
      .then((data: { featured?: Featured }) => setFeatured(data.featured ?? null))
      .catch(() => setFeatured(null));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      setIndex((i) => (i + 1) % REELS.length);
    }, index === 0 ? 7000 : 5200);
    return () => window.clearTimeout(timer);
  }, [index, playing]);

  const reel = REELS[index];
  const showVideo = Boolean(reel.id === "goal" && featured?.videoUrl);

  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 bg-black text-white">
      <div className="mx-auto flex min-h-[min(92vh,52rem)] w-full max-w-6xl flex-col justify-end px-4 pb-8 pt-6 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.35em] text-primary">
          FEATURE PRESENTATION
        </p>
        <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-pretty sm:text-6xl">
          The goal is the movie.
        </h1>
        <p className="mt-3 max-w-2xl text-base text-white/70 sm:text-lg">
          Watch the finished assembly film first. Then the reel that gets you
          there — one scene at a time, the way the course agent cuts a picture.
        </p>

        <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-black" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-black" />
          <div className="film-grain pointer-events-none absolute inset-0 z-10 opacity-30" />

          <div className="relative aspect-video w-full overflow-hidden">
            {showVideo ? (
              <video
                key={featured?.videoUrl}
                className="h-full w-full object-cover"
                src={featured?.videoUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={reel.image}
                src={reel.image}
                alt=""
                className="ken-still h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
            <div className="absolute bottom-12 left-0 right-0 z-30 px-5 sm:px-8">
              <p className="font-mono text-[11px] tracking-[0.28em] text-primary">
                CH {reel.chapter} / 06
              </p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-4xl">{reel.title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/75 sm:text-base">
                {showVideo
                  ? `Now playing: ${featured?.sourceName}. Sound is on the job page — this preview stays muted so the reel can continue.`
                  : reel.line}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Pause reel" : "Play reel"}
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % REELS.length)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-4 text-sm text-white hover:bg-white/10"
            >
              <SkipForward className="size-4" />
              Next beat
            </button>
            <a
              href="#make-the-film"
              className="inline-flex min-h-10 items-center rounded-full border border-white/20 px-4 text-sm text-white hover:bg-white/10"
            >
              Make this film
            </a>
          </div>
          <ol className="flex flex-wrap gap-1.5">
            {REELS.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={item.title}
                  onClick={() => {
                    setIndex(i);
                    setPlaying(false);
                  }}
                  className={`h-1.5 w-8 rounded-full transition ${
                    i === index ? "bg-primary" : "bg-white/25 hover:bg-white/50"
                  }`}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
