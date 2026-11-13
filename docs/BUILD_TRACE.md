# Build trace — faster, clearer assembly films

Every step taken on the manuals-to-video pipeline, with the reason, the
evidence, and a review of the result. Newest steps are appended at the end.
Times are US Central.

Test manuals (from `C:\Users\wwwdo\Downloads\Ikea Manuals`):

| File | Pages | What it is |
| --- | --- | --- |
| BEKANT Table Frame Assembly Instructions.pdf | 12 | Wordless IKEA steps (only part numbers) |
| Bedside Table.pdf | 20 | IKEA GRÅFJÄLLET bedside table, warnings in many languages |
| Table Assembly Instructions.pdf | 20 | Same GRÅFJÄLLET manual, different export |
| 4420853-a34b835eb81bbe9fc917aa5f653ea75e.pdf | 4 | ManualsLib article on stacking KALLAX units safely (text, not steps) |

---

## Step 1 — Audit what broke (Nov 12, 11:20 PM)

**What:** Diffed the last good pipeline (`8fc7d56`) against the fast-cut
commits (`92cd9c7`, `c4c0576`) and read the Render logs from the stuck job.

**Findings — caused by the fast-cut change:**

1. `FAST_CUT=1` was on by default and replaced the real pipeline:
   - the photoreal still (OpenAI image model) was skipped; the raw manual page was used;
   - the OpenAI voice was replaced by local `espeak-ng` (robotic);
   - every clip was forced to 4 s while the narration was ~15 s, so `-t 4 -shortest`
     cut the voice off mid-sentence;
   - the judge and the one retry were skipped.
2. The encode dropped to 12 fps with `ultrafast`, then to a static page with no motion.

**Findings — already wrong before, and why the deployed tool never worked well:**

3. The OpenAI key on Render was expired, then invalid, so every model call fell back.
4. The Docker image had no `python3`, so PDF pages never rendered (fixed in `c4c0576` with `pdftoppm`).
5. The Render service is on the **free** plan: 0.1 CPU, 512 MB, no disk. Video encoding
   is 10–20× slower than one laptop core, and `data/jobs` is wiped on every restart.
6. Understanding sent only the first 2 page images. IKEA manuals are wordless, so the
   model never saw the step pages (the KALLAX job found "1 step, no BOM").
7. Scenes were mapped to figures by index (scene 1 → page 1 = the cover).
8. Narration was hard-cut at 20 words, so even the old sample films end lines mid-sentence
   ("…then thread each").
9. Stills used `quality=low`; the old KALLAX film is only ~320 kbit/s video.

**Review:** Items 1–2 are regressions to undo. Items 3–9 are why "faster and clearer"
needs real changes, not a revert.

## Step 2 — Check the new key and what it can use (11:22 PM)

**What:** `GET /v1/models` on `https://api.openai.com/v1` with the new key (key stored only in
`.env.local`, never printed).

**Result:** `200` in ~1.1 s. Available: text `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-4.1-mini`, …;
image `gpt-image-1.5`, `gpt-image-2`, `gpt-image-2.5-*`, `gpt-image-2.6-*`, `gpt-image-1-mini`;
speech `gpt-4o-mini-tts`, `tts-1-hd`; video `sora-2` and `sora-2-pro` (`GET /models/sora-2` → 200).

**Review:** Key is valid. Sora is enabled for this account.

## Step 3 — Local test bench in WSL (11:24 PM)

**What:** Installed `ffmpeg 6.1`, `poppler-utils`, `espeak-ng`, DejaVu fonts, and `npm ci` in WSL
(32 cores, 15 GB). Probed the old KALLAX film and the four PDFs.

**Result:** Old film: 1280×720, 25 fps, ~323 kbit/s video, AAC 44.1 kHz, 115 s.
PDF text: BEKANT 516 chars (part numbers only); GRÅFJÄLLET ~7.9k chars (mostly warning translations);
KALLAX article 2.4k chars.

**Review:** The text layer is useless for steps in 3 of 4 files. Understanding has to read the
drawings.

## Step 4 — Benchmark the models on real BEKANT pages (11:30 PM)

**What:** Same BEKANT pages (12 × 1024 px JPEG), same prompt, models run in parallel.

| Task | Model | Time | Result |
| --- | --- | --- | --- |
| Voice | gpt-4o-mini-tts | 1.7–2.1 s | 25-word line |
| Read all pages | gpt-4.1-mini | 7.5 s | 16 steps, wrong part counts |
| Read all pages | gpt-5.4-mini (low) | 11.6 s | 17 steps, pages right |
| Read all pages | gpt-5.4 (low) | 21.3 s | 17 steps, best actions |
| Photo still (edit from page 6) | gpt-image-2.6-flare (medium) | 10.3 s | Matches the drawing: D-shaped frame upside down on the top |
| Photo still | gpt-image-2.5-flare (medium) | 11.0 s | Matches the drawing |
| Photo still | gpt-image-1.5 (old default) | 16.4 s | Wrong frame shape |
| Photo still | gpt-image-1-mini | 16.4 s | Wrong shape, copied the inset circle |
| Photo still | gpt-image-2 | 25.5 s | Right, but slow |

**Review:** The old image default was both slower and less faithful. Switch to
`gpt-image-2.6-flare`, falling back to `gpt-image-2.5-flare`, then `gpt-image-1.5`.

## Step 5 — Benchmark the encoder on one CPU core (11:36 PM)

**What:** 12 s, 1280×720 clip with title bar, voice, fades; `taskset -c 0` to mimic a 1-CPU server.

| Method | Time | Note |
| --- | --- | --- |
| `-loop 1` PNG + static frame | 18.7 s | ffmpeg re-decodes the PNG every frame |
| `-loop 1` + per-frame `scale` | 24.9 s | same decode cost plus scaling |
| One input frame + `zoompan` over a 2× still | **6.6 s** | smooth zoom, 2.4 Mbit/s |
| Same at 24 fps, `superfast` | 4.8 s | bitrate 4.2 Mbit/s |

Voice through `loudnorm` measured −16.0 LUFS in every variant (EBU R128 check).

**Review:** The old encoder was slow because of `-loop 1` on PNGs, not because of motion.
Feeding the still once and animating with `zoompan` is ~3× faster and moves.

## Step 6 — One vision call writes the whole storyboard (11:45 PM)

**What:** New `lib/agent/storyboard.ts`: all pages + their text layer, strict JSON schema, one
scene per page of steps, `page` + vertical `crop` for the reference drawing, complete spoken
narration (18–45 words, no part numbers read aloud), photo brief, callouts, warning.

| Manual | Model | Time | Scenes | Verdict |
| --- | --- | --- | --- | --- |
| BEKANT | gpt-5.4-mini (none) | 10.1 s | 10 | Merged steps across pages |
| BEKANT | gpt-5.4 (none) | 23.5 s | 11 | Mislabelled step 8 |
| BEKANT | gpt-5.6-luna (low) | 21.6 s | 11 | Dropped step 8 |
| BEKANT | **gpt-5.5 (low)** | 24.5 s | 12 | Both builds, right pages, half-page crops, doc id |
| GRÅFJÄLLET | **gpt-5.5 (low)** | 23.1 s | 12 | Real warnings (25 kg, no power screwdriver), skipped mirrored pages |
| KALLAX article | **gpt-5.5 (low)** | 10.5 s | 5 | Guide mode, follows the sections |

**Review:** `gpt-5.5` is the storyboard model; `gpt-5.4-mini` (no reasoning) is the fallback if
it fails or times out. One call replaces the old understand + plan pair.

## Step 7 — Sora is gone from the OpenAI API (11:50 PM)

**What:** `POST /v1/videos` with `sora-2` returned a bare `404` (no request id).

**Evidence:** OpenAI's video guide: "The Sora 2 models and Videos API were shut down on
September 24, 2026 and are no longer available. No one-to-one replacement API is available."
`GET /models/sora-2` still answers, but the model cannot be used.

**Review:** Sora cannot be part of the pipeline. Motion comes from the encoder. Remove the
Sora code path so it cannot stall a job.

## Architecture v2 (decided after steps 1–7)

Steps 8–15 changed parts of this plan; **Pipeline as built** at the end is what runs now.

1. **Cache:** SHA-256 of the uploaded PDF. A saved film for the same file opens instantly.
2. **Ingest (~1 s):** `pdftoppm` all pages (max 24) at 1400 px; text layer per page.
3. **Storyboard (~10–25 s):** one `gpt-5.5` vision call over every page.
4. **Scenes, all in parallel (~12–20 s):** per scene, crop the reference drawing; photo still with
   `gpt-image-2.6-flare` from that drawing; voice with `gpt-4o-mini-tts`; quick judge with
   `gpt-4.1-mini`; one retake only on a hard miss.
5. **Encode as each scene lands:** one decoded frame → `zoompan` over a 2× still with eased
   motion, manual drawing inset, title/step/callout overlay, dip-to-black fades, voice
   loudness-normalised to −16 LUFS, 48 kHz AAC, 720p25 x264 CRF 21. The clip is as long as the
   narration plus padding, so no line is cut.
6. **Stitch (~1 s):** concat with video stream-copy, captions embedded as a soft subtitle track.
7. **Save:** every finished film is copied to a library keyed by the PDF hash; the four IKEA
   films are baked into the repo so the deployed tool has them after every restart.

## Step 8 — Build v2 and run it on the manuals locally (Nov 13, 12:10–12:50 AM)

**What:** Wrote the v2 pipeline: `storyboard.ts` (one call), `reference.ts` (crop the drawing the
storyboard named), parallel scenes with a judge and one retake, `voice-track.ts` (one loudness
measurement and one encode for the whole film), stream-copy stitch, `library.ts` (films keyed by
the PDF's SHA-256). Deleted `fast.ts` and the Sora path.

**Result** on the 32-core WSL machine:

| Manual | Scenes | Film | Job time | Stages (ingest / storyboard / scenes / stitch) |
| --- | --- | --- | --- | --- |
| KALLAX article | 5 | 68 s | 41.5 s | 0.6 / 12.0 / 25.4 / 3.6 s |
| BEKANT | 12 | 155 s | 51.6 s | 0.7 / 21.8 / 28.8 / 0.3 s |
| Bedside table | 12 | 157 s | 64.7 s | 1.7 / 26.2 / 31.4 / 5.4 s |

**Review:** On a large host a job takes about as long as its OpenAI calls (storyboard, slowest
photo, one retake). The BEKANT film was mixed to −19 LUFS in a stereo track, 3 dB too quiet;
step 13 fixes the mix and the film is regenerated.

## Step 9 — Reproduce Render's free plan locally (Nov 13)

**What:** A cgroup with `cpu.max 10000 100000` (0.1 CPU) and `memory.max 512M` runs `next start`
on the production build. An end-to-end script uploads a manual and polls like the browser.

**Run 1** (v2 as first built: each scene encoded to its own 25 fps clip, 48 kHz stereo voice),
`Table Assembly Instructions.pdf`: **351.3 s**.

**Review:** At 0.1 CPU every CPU-second costs ten seconds of waiting. Encoding was the long pole.

## Step 10 — One held picture per scene, film encoded once (Nov 13)

**What:** Below 4 CPUs (`motionMode`), each scene becomes one finished 720p picture (photo plus
labels, JPEG q95, 4:4:4). The stitch encodes the whole film once from an ffconcat list with each
scene's duration: variable frame rate (one frame per scene), every frame a keyframe, CRF 16,
`-tune stillimage`. On 4+ CPUs scenes keep the eased camera move.

| Video encode at 0.1 CPU, 152 s film | CPU-seconds |
| --- | --- |
| 5 fps constant frame rate, one pass | 5.41 |
| One frame per scene (variable frame rate) | **0.72** |

Picture quality against the source pictures (PSNR): CRF 21 45.7 dB, CRF 18 46.5 dB,
**CRF 16 47.0 dB**. Chrome played the file correctly: 24 of 24 seeks landed on the right scene,
and the picture changes exactly at each cut.

**Run 2:** **223.7 s**.

**Review:** Same picture (47 dB is visually lossless) for a seventh of the encode work. The free
plan trades the camera move for time; hosts with 4+ CPUs keep it.

## Step 11 — Network timeouts at 0.1 CPU (Nov 13)

**What:** OpenAI calls failed with `ETIMEDOUT`. Node 22 tries a host's addresses with 250 ms per
attempt; on a throttled CPU the timer fires before the event loop sees the finished TCP
handshake. `instrumentation-node.ts` puts IPv4 first and allows 5 s per attempt.

**Review:** Runs 3–5 had no network errors.

## Step 12 — Stay inside 512 MB (Nov 13)

**What:** OpenAI returns photos as JPEG q92 (a tenth of the PNG bytes); sharp's cache is off
below 1 GiB; `MALLOC_ARENA_MAX=2`; voice lengths come from the WAV header instead of 11 parallel
`ffprobe` processes. The judge no longer counts small fittings (it retook good photos over screw
counts).

**Run 3:** **162.5 s** — pages 24.6 s, storyboard 30.1 s, scenes 98.7 s, stitch 8.8 s. Server
memory peaked at 282 MB, no out-of-memory kill.

**Review:** The voice-track encode (72 s at 0.1 CPU) was now the critical path.

## Step 13 — Mono voice track at the voice's own rate (Nov 13)

**What:** The TTS voice is 24 kHz mono, so the film keeps 24 kHz mono AAC at 96 kbit/s. The
target is −19 LUFS mono, which plays as loud as −16 LUFS stereo: players send a mono track to
both speakers (AES TD1004).

| Audio encode at 0.1 CPU, 152 s voice | CPU-seconds | SNR vs. the voice |
| --- | --- | --- |
| 48 kHz stereo, 160 kbit/s | 4.57 | 41.2 dB |
| 24 kHz stereo, 128 kbit/s | 2.43 | 39.9 dB |
| **24 kHz mono, 96 kbit/s** | **1.27–1.38** | 37.0 dB |

**Review:** A third of the audio work. 37 dB SNR is transparent for speech, and the film plays at
the same loudness as before.

## Step 14 — Read the text layer with poppler (Nov 13, 1:50 AM)

**What:** `pdftotext` in a child process replaces pdf.js (`unpdf`), which ran inside the server
and blocked it while parsing. Both return the same 20 pages; 98% of the words match (pdftotext
writes part number 100092 as "100 092"). pdf.js stays as the fallback.

| Ingest step at 0.1 CPU, 20 pages | CPU-seconds | Wall time |
| --- | --- | --- |
| unpdf text | 1.25 | 12.7 s |
| **pdftotext** | **0.15** | **1.4 s** |
| pdftoppm, 1400 px | 0.79 | 7.9 s |
| pdftoppm, 1024 px | 0.64 | 6.4 s |

**Run 4:** **145.6 s** — pages 13.6 s, storyboard 31.4 s, scenes 89.2 s, stitch 10.9 s. Audio:
AAC 24 kHz mono, −19.1 LUFS.

**Review:** Rendering pages smaller saves almost nothing, so pages stay at 1400 px for sharp
references.

## Step 15 — Where the free plan's CPU goes (Nov 13, 2:06 AM)

**What:** Per-thread CPU of the server and the cgroup total, before and after one job, plus CPU
use per second (run 5).

**Run 5:** **140.4 s**. The job used 12.5 CPU-seconds and kept the 0.1 CPU budget saturated for
121 of its 144 seconds.

| Where the CPU went | CPU-seconds |
| --- | --- |
| Image work (sharp / libvips threads) | 4.2 |
| ffmpeg and poppler | 3.7 |
| Server main thread (requests, status polls, loudness math) | 2.1 |
| V8 helper threads (garbage collection, compiling) | 1.3 |
| libuv workers (file I/O, driving sharp) | 1.2 |

Per scene, the costliest image step is the final 720p picture (67 ms of CPU), then the drawing
crop (33 ms) and the label overlay (26 ms).

The judge listed "shows a different moment of the step" as a problem on a photo it scored 1.00,
which forced a retake on the slowest scene. The prompt now says that is never a problem; the
score already covers it.

**Review:** On the free plan a job is limited by CPU, not by OpenAI: 12.5 CPU-seconds of real
work is at least 125 s at 0.1 CPU. With 0.5 CPU the same work is about 25 s and the OpenAI calls
(about 60 s) become the limit; with 4+ CPUs a job takes 45–65 s and keeps the camera move
(step 8).

## Step 16 — Ship v2 to Render and time it there (Nov 13)

**What:** Pushed `0067810` to GitHub with Windows git (the WSL checkout's remote is Cursor
Origin, which this service does not deploy from) and started the deploy through Render's API:
pushes do not start deploys on this service. Render now has the new OpenAI key,
`OPENAI_BASE_URL=https://api.openai.com/v1`, the model names from `.env.example`, and the
sign-in (`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`). Values are not recorded here.

**Live run on the free plan, `Table Assembly Instructions.pdf`:** **84.6 s** — pages 5.0 s,
storyboard 27.9 s, scenes 47.1 s, stitch 4.6 s. 10 scenes, 2:42 of film, 5.1 MB, H.264 720p held
pictures, AAC 24 kHz mono at −19.1 LUFS. One OpenAI rate-limit retry (the local films in step 17
were using the same key at the time).

**Review:** Faster than the 0.1-CPU model of step 15 (140 s): Render's free instances get more
than 0.1 CPU while the host has spare capacity, so about 1.5 minutes is typical, not guaranteed.
The contact sheet of the live film is clean: sharp photos, step badges, captions, cautions,
drawing insets. The storyboard chose a dark finish for the table this time and white in earlier
runs; the manual is line art, so the finish is the model's pick.

## Step 17 — Final films for the four manuals, saved (Nov 13, 2:30 AM)

**What:** Ran the four manuals one after another on all CPUs (camera-move films), through the
same API the site uses.

| Manual | Made in | Scenes | Film | Size | Retakes |
| --- | --- | --- | --- | --- | --- |
| BEKANT Table Frame | 44.0 s | 11 | 2:32 | 22.1 MB | 1 |
| Table Assembly Instructions | 55.3 s | 10 | 2:20 | 14.9 MB | 3 |
| Bedside Table | 47.5 s | 12 | 2:34 | 18.2 MB | 3 |
| KALLAX stacking article | 30.9 s | 5 | 1:04 | 6.0 MB | 1 |

All four: 1280×720 H.264; AAC 24 kHz mono, about 90 kbit/s; −19.1 LUFS integrated, true peak
−1.2 to −1.4 dBTP; captions as a soft subtitle track.

Each film is saved three ways:

- the runtime library (`data/library`, not committed);
- committed in `content/films/<id>/`: film, captions, chapters, 1280 px pictures and drawing
  crops, 68 MB for the four; not the PDFs, which stay IKEA's;
- `Downloads\Ikea Manuals\<manual>.mp4`, next to each PDF.

**Review:** Re-uploading any of the four PDFs opens its film without generating anything (27 ms
measured, step 18). Every re-bake adds the MP4s to git history again, so re-bake only when a
film gets better.

## Step 18 — Saved films, downloads and sign-in on the site (Nov 13, 2:45 AM)

**What:**

- **Home page:** a **Saved films** section: thumbnail, scenes, runtime, **Play**,
  **Download MP4**.
- **Job page:** how long the film took, by stage; **Download MP4** (named after the manual);
  **Open in a new tab**; **Make a fresh cut**, which reruns the pipeline even when a saved film
  exists. A committed film opened from Saved films has no PDF, so a fresh cut of it answers
  "upload the PDF" and leaves the film as it is (it used to reset the job and fail).
- **Storyboard:** says "held picture" or "camera move" and the number of takes per scene, and
  overlays the manual drawing each photo was made from.
- **Copy:** removed the claims about Sora clips, eight-second scenes and workshop sound; the
  pages describe the pipeline that runs.
- **Sign-in:** `middleware.ts` is now `proxy.ts` (Next.js 16 renamed it). The session cookie
  used to hold the user name and password in base64, readable by anyone who saw the cookie; it
  now holds a SHA-256 digest of them, and every check compares in constant time. The login page no longer shows a "local default" password; none exists, and
  the sign-in comes only from environment variables. Everyone signs in once more after this
  deploy.
- **Home preview:** plays the newest saved step-by-step film (the bedside table on a fresh
  server) instead of an older KALLAX sample cut, with no letterbox bars or film grain over it;
  the bars hid the film's step badge.
- **Player:** shows the first scene's photo before playback. The film opens on black, which
  looked like a failed load. Camera moves read "slow zoom in", not `slow_zoom_in`.
- **Fonts:** `globals.css` set `--font-sans: var(--font-sans)`, a variable that refers to itself,
  so every page fell back to Times New Roman. It now points at Geist. The full-width film section
  (`100vw`, which includes the scrollbar) no longer causes an 8 px sideways scroll.
- **Build:** the four Turbopack "dynamic filesystem access" warnings in
  `lib/sample-manual/films.ts` are gone.

**Checks:** typecheck clean; production build with no warnings. Smoke test
(`/root/mva-work/smoke.mjs`), 25 of 25, against the production build with an empty runtime
library — what a fresh Render instance has:

- signed out, pages redirect to sign-in and the API answers 401;
- a wrong user, wrong password, forged cookie or wrong Basic auth is refused;
- sign-in sets a 64-character HttpOnly digest cookie that does not contain the password;
- Basic auth still works and sets the same cookie;
- the four committed films are listed with thumbnails, and each **Download MP4** is an
  attachment named after the manual;
- a saved film opens as a finished job and its video streams;
- a fresh cut of a film without its PDF is refused, and the film stays;
- uploading the BEKANT PDF opens its committed film in 27 ms.

**Review:** The cookie is the same for everyone with the same sign-in, so changing
`BASIC_AUTH_PASSWORD` on Render is how to sign everyone out.

## Step 19 — Deploy and check the live site (Nov 13, 2:56 AM)

**What:** Pushed `75a9911` to GitHub and deployed it through Render's API (68 s). Ran the step 18
smoke test against https://assemble-81fm.onrender.com: **25 of 25 pass**. The four committed
films are listed and download under their manuals' names, and uploading the BEKANT PDF opened its
committed film in 1.4 s, upload included, with nothing generated.

**Review:** Sessions from before this deploy ended because the cookie changed; sign in once
more. A film made on the live site is saved only until the instance restarts (free instances
have no disk); the four committed films are always there.

## Pipeline as built

1. **Cache:** SHA-256 of the PDF. A film saved for the same file (runtime library, or the films
   committed in `content/films`) opens instantly.
2. **Ingest:** `pdftoppm` (up to 32 pages, 1400 px JPEG), `pdftotext`, `pdfinfo`.
3. **Storyboard:** one `gpt-5.5` call (low reasoning effort) over every page at 1024 px.
4. **Scenes, all at once:** crop the drawing → `gpt-image-2.6-flare` photo (JPEG) →
   `gpt-4.1-mini` judge → one retake if weak. Each scene's voice (`gpt-4o-mini-tts`, "cedar")
   starts at the same time.
5. **Voice track:** one timeline, BS.1770 loudness to −19 LUFS mono, peak limiter, AAC 24 kHz
   mono 96 kbit/s, encoded once.
6. **Film:** below 4 CPUs, one held 720p picture per scene encoded once (CRF 16); with 4+ CPUs,
   an eased camera move per scene (CRF 21) and a stream-copied concat. The voice is copied in,
   captions ride as a soft subtitle track, chapters as WebVTT.
7. **Save:** the film, its pictures and its storyboard go to the runtime library, which Render's
   free plan loses on every restart; the four IKEA films are committed in `content/films`.
