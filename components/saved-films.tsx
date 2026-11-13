"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { FilmSummary } from "@/lib/agent/library";
import { downloadUrl } from "@/lib/download-url";

function runtime(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function SavedFilms() {
  const router = useRouter();
  const [films, setFilms] = useState<FilmSummary[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/films", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: FilmSummary[]) => setFilms(Array.isArray(rows) ? rows : []))
      .catch(() => setFilms([]));
  }, []);

  async function open(filmId: string) {
    setOpening(filmId);
    setError(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "film", filmId }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Could not open the film");
      router.push(`/jobs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the film");
      setOpening(null);
    }
  }

  if (!films?.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Saved films</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every finished film is kept here. Uploading the same PDF again opens its saved film.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {films.map((film) => (
          <li key={film.id} className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <div
              className="aspect-video bg-muted bg-cover bg-center"
              style={film.thumbUrl ? { backgroundImage: `url('${film.thumbUrl}')` } : undefined}
            />
            <div className="space-y-2 p-3">
              <p className="truncate text-sm font-medium" title={film.title}>
                {film.title}
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground" title={film.sourceName}>
                {film.sourceName} · {film.scenes} scenes · {runtime(film.durationSeconds)}
              </p>
              <div className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => void open(film.id)}
                  disabled={opening !== null}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
                >
                  {opening === film.id ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  Play
                </button>
                <a
                  href={downloadUrl(`/api/films/${film.id}/assets/output.mp4`, film.sourceName)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Download MP4
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
