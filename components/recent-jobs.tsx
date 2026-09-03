"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface JobSummary {
  id: string;
  createdAt: string;
  status: string;
  stageLabel: string;
  progress: number;
  sourceName: string;
  provider: string;
}

export function RecentJobs() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);

  useEffect(() => {
    void fetch("/api/jobs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: JobSummary[]) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]));
  }, []);

  if (!jobs?.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Recent videos</h2>
      <ul className="grid gap-2">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/jobs/${job.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card px-3 py-2 text-sm hover:border-primary/40"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{job.sourceName}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {job.id.slice(0, 8)} · {job.stageLabel}
                </span>
              </span>
              <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
                {job.status}
              </Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
