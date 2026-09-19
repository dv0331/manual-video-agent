"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Scene } from "@/lib/agent/types";
import { SCENE_SECONDS } from "@/lib/agent/types";

export function AssemblyPlayer({
  videoUrl,
  vttUrl,
  captionsUrl,
  scenes,
}: {
  videoUrl: string;
  vttUrl?: string;
  captionsUrl?: string;
  scenes: Scene[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);

  function durations() {
    return scenes.map((scene) => scene.durationSeconds ?? SCENE_SECONDS);
  }

  function offsetAt(index: number) {
    return durations().slice(0, index).reduce((sum, n) => sum + n, 0);
  }

  function seekTo(index: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = offsetAt(index) + 0.05;
    void video.play().catch(() => setFailed(true));
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.9fr)]">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl border border-border/80 bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full"
            controls
            playsInline
            preload="auto"
            src={videoUrl}
            onPlay={(e) => {
              e.currentTarget.muted = false;
              e.currentTarget.volume = 1;
            }}
            onError={() => setFailed(true)}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              let cursor = 0;
              let index = 0;
              const lengths = durations();
              for (let i = 0; i < lengths.length; i++) {
                cursor += lengths[i];
                if (t < cursor) {
                  index = i;
                  break;
                }
                index = i;
              }
              setActive(index);
            }}
          >
            {vttUrl ? <track kind="chapters" src={vttUrl} /> : null}
            {captionsUrl ? (
              <track kind="captions" src={captionsUrl} srcLang="en" label="Narration" default />
            ) : null}
          </video>
        </div>
        <p className="text-xs text-muted-foreground">
          Sound on — each step is spoken. Captions follow the same script.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 font-medium text-primary-foreground"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = false;
              video.volume = 1;
              void video.play().catch(() => setFailed(true));
            }}
          >
            Play video
          </button>
          <a
            href={videoUrl}
            className="text-primary underline-offset-4 hover:underline"
          >
            Open MP4
          </a>
          {failed ? (
            <span className="text-destructive">
              Safari could not start playback. Use Open MP4.
            </span>
          ) : null}
        </div>
      </div>
      <ol className="flex max-h-[28rem] flex-col gap-2 overflow-auto lg:max-h-none">
        {scenes.length ? (
          scenes.map((scene, i) => (
            <li key={scene.id}>
              <button
                type="button"
                onClick={() => seekTo(i)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  i === active
                    ? "border-primary bg-primary/10"
                    : "border-border/80 bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-primary">
                    STEP {String(scene.index).padStart(2, "0")}
                  </span>
                  {scene.warnings.length ? (
                    <Badge variant="destructive">warning</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium">{scene.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {scene.narration}
                </p>
              </button>
            </li>
          ))
        ) : (
          <li className="rounded-lg border border-border/80 p-3 text-sm text-muted-foreground">
            No chapter list yet.
          </li>
        )}
      </ol>
    </section>
  );
}
