import { ChevronDown, ExternalLink } from "lucide-react";
import { demoSearchUrl, exercisePhotos } from "@/data/library/exercise-media";

/**
 * Tap an exercise's name to jog your memory (Phase 14): start and end
 * photos where we have them, the form cues, and a demo search. A native
 * <details>, so it opens instantly with no JS and works offline once
 * the photos are cached.
 */
export function ExerciseGuide({
  name,
  libraryExerciseId,
  cues,
  note,
}: {
  name: string;
  libraryExerciseId: string | null;
  cues: string | null;
  note: string | null;
}) {
  const photos = exercisePhotos(libraryExerciseId);
  // The plan's note is often the library cue itself; don't say it twice.
  const showCues = cues && cues !== note;

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium leading-snug">{name}</span>
        <ChevronDown
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="sr-only">Show how it&apos;s done</span>
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {photos && (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((src, index) => (
              <figure key={src} className="overflow-hidden rounded-md bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny static webp, no optimiser needed */}
                <img
                  src={src}
                  alt={`${name} — ${index === 0 ? "start" : "finish"}`}
                  width={360}
                  height={240}
                  loading="lazy"
                  className="aspect-[3/2] w-full object-cover"
                />
                <figcaption className="bg-background px-1.5 py-1 text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
                  {index === 0 ? "Start" : "Finish"}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {showCues && <p className="text-xs leading-relaxed text-muted-foreground">{cues}</p>}
        <a
          href={demoSearchUrl(name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Watch a demo <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </details>
  );
}
