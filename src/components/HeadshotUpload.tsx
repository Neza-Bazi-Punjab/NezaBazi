"use client";

/* Optional rider headshot: pick a photo, see it immediately, replace or remove
   it later. Used both during solo registration and on the account page.

   The file goes straight from the browser to Supabase Storage under the
   rider's own folder — storage policies pin the first path segment to
   auth.uid(), so the browser cannot write anywhere else however the path is
   constructed. The resulting path is then recorded in Auth user metadata,
   which is where the rest of the account already lives. */
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  HEADSHOT_ACCEPT,
  HEADSHOT_BUCKET,
  HEADSHOT_SIGNED_URL_SECONDS,
  HEADSHOT_UPLOAD_TYPE,
  buildHeadshotPath,
  describeHeadshotLimits,
  prepareHeadshot,
  validateHeadshotSource,
} from "@/lib/headshots";

type HeadshotUploadProps = {
  /* Path already stored in Auth metadata, if the rider has one. */
  initialPath?: string | null;
  /* Lets a parent form know the current path — the solo form saves it with
     the registration, the account page just reflects it back. */
  onPathChange?: (path: string | null) => void;
  label?: string;
  hint?: string;
};

export default function HeadshotUpload({
  initialPath = null,
  onPathChange,
  label = "Headshot (optional)",
  hint,
}: HeadshotUploadProps) {
  const [path, setPath] = useState<string | null>(initialPath);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const objectUrl = useRef<string | null>(null);

  /* Show whatever is already stored. The bucket is private, so this needs a
     signed URL rather than a public one. */
  useEffect(() => {
    let cancelled = false;

    if (!initialPath) {
      return;
    }

    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from(HEADSHOT_BUCKET)
        .createSignedUrl(initialPath, HEADSHOT_SIGNED_URL_SECONDS);

      if (!cancelled && data?.signedUrl) {
        setPreviewUrl(data.signedUrl);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [initialPath]);

  /* Release the local preview blob when this component goes away. */
  useEffect(
    () => () => {
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
      }
    },
    []
  );

  const applyPath = (next: string | null) => {
    setPath(next);
    onPathChange?.(next);
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const problem = validateHeadshotSource(file);

    if (problem) {
      setError(problem);
      event.target.value = "";
      return;
    }

    setError(null);
    setBusy(true);

    // Rotate, downscale and re-encode in the browser. A phone photo is
    // routinely 8-12 MB and an iPhone's is HEIC, neither of which belongs in
    // the bucket or on the check-in desk's connection.
    const prepared = await prepareHeadshot(file);

    if (!prepared) {
      setError(
        "This browser couldn't read that photo. Try taking one with the camera, or pick a JPG or PNG."
      );
      setBusy(false);
      event.target.value = "";
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session has expired. Log in again to upload a photo.");
      setBusy(false);
      return;
    }

    const nextPath = buildHeadshotPath(user.id);
    const { error: uploadError } = await supabase.storage
      .from(HEADSHOT_BUCKET)
      .upload(nextPath, prepared.blob, {
        contentType: HEADSHOT_UPLOAD_TYPE,
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setBusy(false);
      return;
    }

    const { error: metadataError } = await supabase.auth.updateUser({
      data: { headshot_path: nextPath },
    });

    if (metadataError) {
      // The object is already stored; leaving it orphaned would quietly eat
      // the rider's quota, so clean up rather than pretend this worked.
      await supabase.storage.from(HEADSHOT_BUCKET).remove([nextPath]);
      setError(metadataError.message);
      setBusy(false);
      return;
    }

    // Drop the previous object now that nothing points at it.
    if (path && path !== nextPath) {
      await supabase.storage.from(HEADSHOT_BUCKET).remove([path]);
    }

    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
    }

    // Preview the processed image, not the original — so what the rider sees
    // is exactly what was stored, rotation included.
    objectUrl.current = URL.createObjectURL(prepared.blob);
    setPreviewUrl(objectUrl.current);
    applyPath(nextPath);
    setBusy(false);
  };

  const removeHeadshot = async () => {
    if (!path) {
      return;
    }

    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { headshot_path: null },
    });

    if (metadataError) {
      setError(metadataError.message);
      setBusy(false);
      return;
    }

    await supabase.storage.from(HEADSHOT_BUCKET).remove([path]);

    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }

    setPreviewUrl(null);
    applyPath(null);

    if (fileInput.current) {
      fileInput.current.value = "";
    }

    setBusy(false);
  };

  return (
    <div>
      <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
        {label}
      </p>
      <p className="mt-1 text-sm text-brown/70">
        {hint ?? `Used to confirm it's you at check-in. ${describeHeadshotLimits()}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-bronze/40 bg-sand">
          {previewUrl ? (
            // A signed URL or a local blob — next/image would need either a
            // remote-pattern allowlist or an unoptimized escape hatch, and
            // neither helps for a 96px avatar.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Your headshot"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-2 text-center font-display text-[0.6rem] font-semibold uppercase leading-3 tracking-[0.12em] text-brown/50">
              No photo
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label
            className={`inline-flex cursor-pointer items-center rounded-lg border border-bronze/40 px-5 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown transition-colors hover:border-bronze hover:text-bronze ${
              busy ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {busy ? "Working…" : path ? "Replace Photo" : "Choose Photo"}
            <input
              ref={fileInput}
              type="file"
              accept={HEADSHOT_ACCEPT}
              onChange={handleFile}
              disabled={busy}
              className="sr-only"
            />
          </label>

          {path && (
            <button
              type="button"
              onClick={removeHeadshot}
              disabled={busy}
              className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown/70 underline transition-colors hover:text-bronze disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border-l-4 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
