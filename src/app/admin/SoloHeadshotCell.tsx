"use client";

/* The Photo column on the admin Solo riders list and Teams list
   (RiderHeadshotCell; `kind` says which, so the photo reaches the right row).

   A rider with a photo shows a small round thumbnail; clicking it opens the
   photo in a pop-up over the page, with Replace photo and Remove photo. A
   rider without one shows an add button that opens a pop-up with three ways
   in: drop a picture on it, take a photo, or choose a file (the button itself
   also takes a dropped picture). Replace offers files or camera. On a phone or tablet "Take
   photo" opens the device camera directly; on a computer it opens the webcam
   in a pop-up. Either way the photo is rotated, downscaled and re-encoded in
   the browser exactly as a rider's own upload is, then stored as that rider's
   headshot — for a solo rider on the account only for the account holder's
   own registration, otherwise on the registration itself; for a team rider
   always on their row in team_members (see /api/admin/headshots). */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  HEADSHOT_ACCEPT,
  prepareHeadshot,
  validateHeadshotSource,
} from "@/lib/headshots";

/* `target`: the row the photo belongs to when it is not the row the cell
   sits in (a rider's solo entry and team place share one photo). */
export type RiderHeadshotState = {
  url: string | null;
  target?: { kind: RiderKind; id: string };
};
export type SoloHeadshotState = RiderHeadshotState;

/* Which list the cell sits in: a solo registration or a team rider's row. */
export type RiderKind = "solo" | "team";

/* Matches the pop-ups' transition length, so they finish fading before they
   leave the page. */
const CLOSE_MS = 180;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/* Phones and tablets: a file input with `capture` opens the camera itself. */
const isTouchDevice = () =>
  typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/* A pop-up over the whole page that fades and scales in, and out again before
   it is removed. Rendered into <body> so the table's scrolling can't clip it.
   Esc or a click on the dimmed backdrop closes it. */
function Overlay({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(() => {
    setLeaving(true);
    setShown(false);
  }, []);

  /* Removed only once the fade-out has played. */
  useEffect(() => {
    if (!leaving) {
      return;
    }

    const timer = setTimeout(onClose, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onClose]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown((was) => was || !leaving));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [close, leaving]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm transition-opacity duration-[180ms] ease-out ${
        shown ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`relative transition-transform duration-[180ms] ease-out ${
          shown ? "scale-100" : "scale-95"
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-cream text-lg leading-none text-ink shadow-md transition-colors hover:bg-parchment"
        >
          ×
        </button>
        {children(close)}
      </div>
    </div>,
    document.body
  );
}

/* The computer's webcam, for "Take photo" on a device without a built-in
   camera picker. Shows a live preview, then the shot with Retake / Use photo. */
function WebcamCapture({
  riderName,
  onCapture,
  onUnavailable,
  close,
}: {
  riderName: string;
  onCapture: (file: File) => void;
  onUnavailable: (message: string) => void;
  close: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ file: File; preview: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable("This browser can't use a camera. Choose a file instead.");
      close();
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((error: unknown) => {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        onUnavailable(
          denied
            ? "Camera access was blocked. Allow it in the browser's address bar, or choose a file instead."
            : "No camera was found. Choose a file instead."
        );
        close();
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [close, onUnavailable]);

  useEffect(() => () => {
    if (shot) {
      URL.revokeObjectURL(shot.preview);
    }
  }, [shot]);

  const takeShot = () => {
    const video = videoRef.current;

    if (!video || !video.videoWidth) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    // The preview is mirrored like a mirror; the saved photo is mirrored the
    // same way, so it matches what the admin saw when they pressed the button.
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], "camera.jpg", { type: "image/jpeg" });
          setShot({ file, preview: URL.createObjectURL(blob) });
        }
      },
      "image/jpeg",
      0.92
    );
  };

  const buttonClass =
    "rounded-lg px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60";

  return (
    <div className="w-[min(92vw,560px)] overflow-hidden rounded-2xl bg-cream shadow-2xl">
      <div className="relative aspect-[4/3] bg-ink">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          className={`h-full w-full -scale-x-100 object-cover ${shot ? "hidden" : ""}`}
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={shot.preview} alt="" className="h-full w-full object-cover" />
        )}
        {!ready && !shot && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-cream/80">
            Starting camera…
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-sm text-brown">Photo of {riderName}</p>
        <div className="flex shrink-0 gap-2">
          {shot ? (
            <>
              <button
                type="button"
                onClick={() => setShot(null)}
                className={`${buttonClass} border border-bronze/20 text-bronze-dark hover:border-bronze/40`}
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => {
                  onCapture(shot.file);
                  close();
                }}
                className={`${buttonClass} bg-bronze-deep text-cream hover:bg-bronze`}
              >
                Use photo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={takeShot}
              disabled={!ready}
              className={`${buttonClass} bg-bronze-deep text-cream hover:bg-bronze`}
            >
              Take photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* The picture in a drop: the first image among the dropped files, or a clear
   message for the admin. An empty type (some HEIC files) is let through and
   left to the decoder, as the file picker does. */
const pickDroppedImage = (
  dropped: FileList
): { file: File } | { error: string } => {
  const files = Array.from(dropped);
  const file = files.find((each) => each.type.startsWith("image/")) ?? files[0];

  if (!file) {
    return { error: "Drop a photo file (JPG or PNG) to add it." };
  }

  if (file.type !== "" && !file.type.startsWith("image/")) {
    return { error: `"${file.name}" isn't an image. Drop a photo (JPG or PNG) instead.` };
  }

  return { file };
};

/* The pop-up the add button opens: a drop zone for a picture dragged in from
   the computer, Take photo, and Choose file. It closes on Esc, a click outside
   it, or once the photo is saved. */
function AddPhotoPopup({
  riderName,
  busy,
  error,
  onFile,
  onRejected,
  onWebcam,
  close,
}: {
  riderName: string;
  busy: boolean;
  error: string | null;
  /* Uploads through the cell's one path; true once saved. */
  onFile: (file: File) => Promise<boolean>;
  onRejected: (message: string) => void;
  /* A computer's webcam opens in its own pop-up. */
  onWebcam: () => void;
  close: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const send = async (file: File) => {
    if (await onFile(file)) {
      close();
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      void send(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (busy || !Array.from(event.dataTransfer.types).includes("Files")) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);

    if (busy) {
      return;
    }

    const picked = pickDroppedImage(event.dataTransfer.files);

    if ("error" in picked) {
      onRejected(picked.error);
      return;
    }

    void send(picked.file);
  };

  const takePhoto = () => {
    if (isTouchDevice()) {
      cameraInputRef.current?.click();
    } else {
      close();
      onWebcam();
    }
  };

  const buttonClass =
    "flex-1 rounded-lg px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    /* The whole card takes the drop, so a near miss on the zone still lands
       here instead of the browser opening the picture. */
    <div
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
      className="w-[min(92vw,420px)] rounded-2xl bg-cream p-4 shadow-2xl sm:p-5"
    >
      <p className="pr-6 font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
        Add a photo
      </p>
      <p className="mt-0.5 truncate text-sm text-brown">{riderName}</p>

      <div
        data-photo-drop
        data-drop-active={dragOver || undefined}
        className={`mt-4 flex min-h-36 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? "border-solid border-bronze bg-parchment ring-4 ring-bronze/25"
            : "border-bronze/40 bg-parchment/40"
        }`}
      >
        {busy ? (
          <>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-bronze/30 border-t-bronze" />
            <span className="mt-2 text-sm text-brown">Saving photo…</span>
          </>
        ) : (
          <>
            <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-bronze-dark">
              {dragOver ? "Drop to add" : "Drag a photo here"}
            </span>
            <span className="text-xs text-brown/70">JPG or PNG, from your computer</span>
          </>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={takePhoto}
          disabled={busy}
          className={`${buttonClass} border border-bronze/20 text-bronze-dark hover:border-bronze/40`}
        >
          Take photo
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className={`${buttonClass} bg-bronze-deep text-cream hover:bg-bronze`}
        >
          Choose file
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-800">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept={HEADSHOT_ACCEPT}
        onChange={handleInput}
        className="hidden"
      />
      {/* Phones and tablets: the back camera, as the admin photographs the rider. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInput}
        className="hidden"
      />
    </div>
  );
}

/* The pop-up for a rider's photo: the photo, their name, Replace photo (files
   or camera) and Remove photo (asks once more before removing
   it, so a stray tap can't). */
function PhotoViewer({
  url,
  riderName,
  registrationId,
  kind,
  onRemoved,
  onReplace,
  close,
}: {
  url: string;
  riderName: string;
  registrationId: string;
  kind: RiderKind;
  /* The photo to show next: usually none. */
  onRemoved: (nextUrl: string | null) => void;
  /* Opens the file picker or the camera; called inside the click itself, so
     the browser allows the picker to open. */
  onReplace: (source: "files" | "camera") => void;
  close: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "replacing" | "confirming">("idle");
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setRemoving(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/headshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, kind }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "The photo couldn't be removed.");
        return;
      }

      onRemoved(result.url ?? null);
      close();
    } catch {
      setError("The photo couldn't be removed. Check the connection and try again.");
    } finally {
      setRemoving(false);
    }
  };

  const replace = (source: "files" | "camera") => {
    onReplace(source);
    close();
  };

  const buttonClass =
    "rounded-lg px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60";
  const quietButtonClass = `${buttonClass} border border-bronze/20 text-bronze-dark hover:border-bronze/40`;

  return (
    <figure className="min-w-[min(92vw,380px)] overflow-hidden rounded-2xl bg-cream shadow-2xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket */}
      <img
        src={url}
        alt={`${riderName}'s photo`}
        className="mx-auto block max-h-[75vh] w-auto max-w-[92vw] object-contain"
      />
      <figcaption className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
          {riderName}
        </span>
        {mode === "confirming" ? (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-brown">Remove this photo?</span>
            <button
              type="button"
              onClick={() => setMode("idle")}
              disabled={removing}
              className={quietButtonClass}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className={`${buttonClass} bg-red-800 text-cream hover:bg-red-700`}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          </span>
        ) : mode === "replacing" ? (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => replace("files")} className={quietButtonClass}>
              Choose from files
            </button>
            <button type="button" onClick={() => replace("camera")} className={quietButtonClass}>
              Take photo
            </button>
            <button type="button" onClick={() => setMode("idle")} className={quietButtonClass}>
              Cancel
            </button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setMode("replacing")} className={quietButtonClass}>
              Replace photo
            </button>
            <button
              type="button"
              onClick={() => setMode("confirming")}
              className={`${buttonClass} border border-red-700/30 text-red-800 hover:border-red-700/60`}
            >
              Remove photo
            </button>
          </span>
        )}
        {error && <p className="w-full text-sm text-red-800">{error}</p>}
      </figcaption>
    </figure>
  );
}

export default function RiderHeadshotCell({
  registrationId,
  kind,
  riderName,
  initial,
  onError,
  boxClassName = "h-10 w-10 rounded-full",
  large = false,
  onChange,
}: {
  /* The row's id: solo_registrations.id, or team_members.id for a team rider. */
  registrationId: string;
  kind: RiderKind;
  riderName: string;
  initial: RiderHeadshotState | undefined;
  /* Shown above the table: a 40px cell has no room for a message. */
  onError: (message: string | null) => void;
  /* Size and shape of the photo button. The lists use the 40px circle; the
     check-in desk passes its own, larger box. */
  boxClassName?: string;
  /* Bigger initials and "+" badge, for a large box. */
  large?: boolean;
  /* Told the photo now shown after an add, replace or remove, so a page that
     shows the same rider twice (the check-in card and its team grid) can
     keep both in step. */
  onChange?: (url: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initial?.url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [webcam, setWebcam] = useState(false);

  const setError = useCallback(
    (message: string | null) => {
      setErrorState(message);
      onError(message ? `Photo for ${riderName}: ${message}` : null);
    },
    [onError, riderName]
  );

  /* True once the photo is saved, so the add pop-up knows to close. */
  const upload = async (file: File): Promise<boolean> => {
    const problem = validateHeadshotSource(file);

    if (problem) {
      setError(problem);
      return false;
    }

    setError(null);
    setBusy(true);

    try {
      const prepared = await prepareHeadshot(file);

      if (!prepared) {
        setError("This browser couldn't read that photo. Try a JPG or PNG.");
        return false;
      }

      const body = new FormData();
      body.append("registrationId", registrationId);
      body.append("kind", kind);
      body.append("photo", prepared.blob, "headshot.jpg");

      // The same request adds a first photo or replaces the one shown.
      const response = await fetch("/api/admin/headshots", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "The photo couldn't be saved.");
        return false;
      }

      const nextUrl = result.url ?? URL.createObjectURL(prepared.blob);
      setUrl(nextUrl);
      onChange?.(nextUrl);
      return true;
    } catch {
      setError("The photo couldn't be saved. Check the connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      void upload(file);
    }
  };

  /* The add button is also a drop zone: a picture dragged from the desktop
     or another window and dropped on it goes through the same upload as one
     chosen from files. Only a drag that carries files lights it up. */
  const [dragOver, setDragOver] = useState(false);
  const dragHasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (busy || !dragHasFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragOver(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOver(false);

    if (busy) {
      return;
    }

    const picked = pickDroppedImage(event.dataTransfer.files);

    if ("error" in picked) {
      setError(picked.error);
      return;
    }

    void upload(picked.file);
  };

  const openAdd = () => {
    setError(null);
    setAdding(true);
  };

  const takePhoto = () => {
    if (isTouchDevice()) {
      cameraInputRef.current?.click();
    } else {
      setWebcam(true);
    }
  };

  /* After a removal, the cell changes only once the pop-up has faded out. */
  const afterRemove = useRef<{ url: string | null } | null>(null);
  const closeViewer = useCallback(() => {
    setViewing(false);

    if (afterRemove.current) {
      setUrl(afterRemove.current.url);
      onChange?.(afterRemove.current.url);
      afterRemove.current = null;
    }
  }, [onChange]);
  const closeWebcam = useCallback(() => setWebcam(false), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const replaceFrom = (source: "files" | "camera") => {
    if (source === "files") {
      fileInputRef.current?.click();
    } else {
      takePhoto();
    }
  };

  return (
    <div className="flex items-center">
      {url ? (
        <button
          type="button"
          onClick={() => setViewing(true)}
          disabled={busy}
          title={error ?? `View ${riderName}'s photo`}
          className={`relative block ${boxClassName} overflow-hidden border bg-parchment transition-transform ${large ? "hover:scale-[1.03] focus-visible:scale-[1.03]" : "hover:scale-110 focus-visible:scale-110"} disabled:cursor-not-allowed disabled:hover:scale-100 ${
            error ? "border-red-700" : "border-bronze/30"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket */}
          <img src={url} alt={`${riderName}'s photo`} className="h-full w-full object-cover" />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-cream/70">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-bronze/30 border-t-bronze" />
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          onDragEnter={handleDragOver}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={busy}
          aria-haspopup="dialog"
          aria-expanded={adding}
          aria-label={`Add a photo for ${riderName}`}
          title={error ?? "Add a photo, or drop one here"}
          data-drop-active={dragOver || undefined}
          className={`relative flex ${boxClassName} items-center justify-center border border-dashed font-semibold ${large ? "text-2xl" : "text-xs"} transition-[color,background-color,border-color,transform] ${
            dragOver
              ? `${large ? "scale-[1.03]" : "scale-110"} border-2 border-solid border-bronze bg-parchment text-bronze-dark ring-4 ring-bronze/25`
              : error
                ? "border-red-700 text-red-700"
                : "border-bronze/40 text-bronze-dark hover:border-bronze hover:bg-parchment"
          } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
        >
          {busy ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-bronze/30 border-t-bronze" />
          ) : (
            <>
              <span className="text-brown/60">{initialsOf(riderName)}</span>
              <span
                className={`absolute flex items-center justify-center rounded-full bg-bronze-deep leading-none text-cream ${
                  large ? "bottom-1.5 right-1.5 h-7 w-7 text-lg" : "-bottom-0.5 -right-0.5 h-4 w-4 text-[11px]"
                }`}
              >
                +
              </span>
            </>
          )}
        </button>
      )}

      {url && viewing && (
        <Overlay label={`${riderName}'s photo`} onClose={closeViewer}>
          {(close) => (
            <PhotoViewer
              url={url}
              riderName={riderName}
              registrationId={registrationId}
              kind={kind}
              onRemoved={(nextUrl) => {
                afterRemove.current = { url: nextUrl };
              }}
              onReplace={replaceFrom}
              close={close}
            />
          )}
        </Overlay>
      )}

      {adding && (
        <Overlay label={`Add a photo for ${riderName}`} onClose={closeAdd}>
          {(close) => (
            <AddPhotoPopup
              riderName={riderName}
              busy={busy}
              error={error}
              onFile={upload}
              onRejected={setError}
              onWebcam={() => setWebcam(true)}
              close={close}
            />
          )}
        </Overlay>
      )}

      {webcam && (
        <Overlay label={`Take a photo of ${riderName}`} onClose={closeWebcam}>
          {(close) => (
            <WebcamCapture
              riderName={riderName}
              onCapture={(file) => void upload(file)}
              onUnavailable={setError}
              close={close}
            />
          )}
        </Overlay>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={HEADSHOT_ACCEPT}
        onChange={handleInput}
        className="hidden"
      />
      {/* Opens the camera directly on a phone or tablet. "environment" is the
          back camera: the admin is photographing the rider, not themselves. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInput}
        className="hidden"
      />
    </div>
  );
}
