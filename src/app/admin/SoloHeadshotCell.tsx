"use client";

/* The Photo column on the admin Solo riders list.

   A rider with a photo shows a small round thumbnail; clicking it opens the
   photo in a pop-up over the page. A rider without one shows an add button
   with two choices: choose a file, or take a photo. On a phone or tablet
   "Take photo" opens the device camera directly; on a computer it opens the
   webcam in a pop-up. Either way the photo is rotated, downscaled and
   re-encoded in the browser exactly as a rider's own upload is, then stored as
   that rider's headshot — on their account, or on the registration for a
   rider who has no account (see /api/admin/headshots). */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  HEADSHOT_ACCEPT,
  prepareHeadshot,
  validateHeadshotSource,
} from "@/lib/headshots";

export type SoloHeadshotState = { url: string | null };

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

/* The pop-up for a rider's photo: the photo, their name, and Delete photo
   (asks once more before removing it, so a stray tap can't). */
function PhotoViewer({
  url,
  riderName,
  registrationId,
  onDeleted,
  close,
}: {
  url: string;
  riderName: string;
  registrationId: string;
  /* The photo to show next: usually none. */
  onDeleted: (nextUrl: string | null) => void;
  close: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/headshots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "The photo couldn't be deleted.");
        return;
      }

      onDeleted(result.url ?? null);
      close();
    } catch {
      setError("The photo couldn't be deleted. Check the connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  const buttonClass =
    "rounded-lg px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-60";

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
        {confirming ? (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-sm text-brown">Delete this photo?</span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className={`${buttonClass} border border-bronze/20 text-bronze-dark hover:border-bronze/40`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className={`${buttonClass} bg-red-800 text-cream hover:bg-red-700`}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${buttonClass} border border-red-700/30 text-red-800 hover:border-red-700/60`}
          >
            Delete photo
          </button>
        )}
        {error && <p className="w-full text-sm text-red-800">{error}</p>}
      </figcaption>
    </figure>
  );
}

export default function SoloHeadshotCell({
  registrationId,
  riderName,
  initial,
  onError,
}: {
  registrationId: string;
  riderName: string;
  initial: SoloHeadshotState | undefined;
  /* Shown above the table: a 40px cell has no room for a message. */
  onError: (message: string | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(initial?.url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [viewing, setViewing] = useState(false);
  const [webcam, setWebcam] = useState(false);

  const setError = useCallback(
    (message: string | null) => {
      setErrorState(message);
      onError(message ? `Photo for ${riderName}: ${message}` : null);
    },
    [onError, riderName]
  );

  /* The menu is fixed to the window, so it closes when anything else is
     clicked, the page scrolls, or Esc is pressed. */
  useEffect(() => {
    if (!menu) {
      return;
    }

    const dismiss = () => setMenu(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;

      if (!buttonRef.current?.contains(target) && !(target as Element).closest?.("[data-photo-menu]")) {
        dismiss();
      }
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && dismiss();

    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const upload = async (file: File) => {
    const problem = validateHeadshotSource(file);

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const prepared = await prepareHeadshot(file);

      if (!prepared) {
        setError("This browser couldn't read that photo. Try a JPG or PNG.");
        return;
      }

      const body = new FormData();
      body.append("registrationId", registrationId);
      body.append("photo", prepared.blob, "headshot.jpg");

      const response = await fetch("/api/admin/headshots", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "The photo couldn't be added.");
        return;
      }

      setUrl(result.url ?? URL.createObjectURL(prepared.blob));
    } catch {
      setError("The photo couldn't be added. Check the connection and try again.");
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

  const openMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }

    const box = buttonRef.current?.getBoundingClientRect();

    if (box) {
      setMenu({ left: box.left, top: box.bottom + 6 });
    }
  };

  const takePhoto = () => {
    setMenu(null);

    if (isTouchDevice()) {
      cameraInputRef.current?.click();
    } else {
      setWebcam(true);
    }
  };

  /* After a delete, the cell changes only once the pop-up has faded out. */
  const afterDelete = useRef<{ url: string | null } | null>(null);
  const closeViewer = useCallback(() => {
    setViewing(false);

    if (afterDelete.current) {
      setUrl(afterDelete.current.url);
      afterDelete.current = null;
    }
  }, []);
  const closeWebcam = useCallback(() => setWebcam(false), []);

  if (url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setViewing(true)}
          title={`View ${riderName}'s photo`}
          className="block h-10 w-10 overflow-hidden rounded-full border border-bronze/30 bg-parchment transition-transform hover:scale-110 focus-visible:scale-110"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from a private bucket */}
          <img src={url} alt={`${riderName}'s photo`} className="h-full w-full object-cover" />
        </button>
        {viewing && (
          <Overlay label={`${riderName}'s photo`} onClose={closeViewer}>
            {(close) => (
              <PhotoViewer
                url={url}
                riderName={riderName}
                registrationId={registrationId}
                onDeleted={(nextUrl) => {
                  afterDelete.current = { url: nextUrl };
                }}
                close={close}
              />
            )}
          </Overlay>
        )}
      </>
    );
  }

  const menuItemClass =
    "block w-full whitespace-nowrap px-4 py-2 text-left text-sm text-brown transition-colors hover:bg-parchment";

  return (
    <div className="flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={openMenu}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        aria-label={`Add a photo for ${riderName}`}
        title={error ?? "Add a photo"}
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-xs font-semibold transition-colors ${
          error
            ? "border-red-700 text-red-700"
            : "border-bronze/40 text-bronze-dark hover:border-bronze hover:bg-parchment"
        } disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-bronze/30 border-t-bronze" />
        ) : (
          <>
            <span className="text-brown/60">{initialsOf(riderName)}</span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-bronze-deep text-[11px] leading-none text-cream">
              +
            </span>
          </>
        )}
      </button>

      {menu &&
        createPortal(
          <div
            data-photo-menu
            role="menu"
            style={{ left: menu.left, top: menu.top }}
            className="fixed z-50 overflow-hidden rounded-lg border border-bronze/20 bg-cream py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => {
                setMenu(null);
                fileInputRef.current?.click();
              }}
            >
              Choose from files
            </button>
            <button type="button" role="menuitem" className={menuItemClass} onClick={takePhoto}>
              Take photo
            </button>
          </div>,
          document.body
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
