"use client";

/* "Export to Excel" under Solo Riders and under Teams: every rider in that
   list as an .xlsx file (GET /api/admin/registrations/export).

   Only an OK response with a spreadsheet in it becomes a download; any error
   (the server's JSON { error }, a lost connection, a sign-in page) is shown
   beside the button and never saved as a file. While a file is being
   prepared the button is disabled, and a second click does nothing. */
import { useEffect, useRef, useState } from "react";
import {
  RIDER_EXPORT_API,
  RIDER_EXPORT_CONTENT_TYPE,
  filenameFromContentDisposition,
  riderExportFilename,
  todayInIndia,
} from "@/lib/admin/rider-export";

const NETWORK_ERROR = "Could not reach the server. Check the connection and retry.";

/* Long enough for every browser to have started saving the file. */
const REVOKE_AFTER_MS = 10_000;

export default function ExportRidersButton({
  list,
  className,
}: {
  list: "solo" | "teams";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<Array<{ timer: ReturnType<typeof setTimeout>; url: string }>>([]);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;

    return () => {
      mountedRef.current = false;

      for (const { timer, url } of timers.splice(0)) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  const exportList = async () => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`${RIDER_EXPORT_API}?list=${list}`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof body?.error === "string" && body.error.trim() !== ""
            ? body.error
            : `The export failed (error ${response.status}). Try again.`;

        if (mountedRef.current) {
          setError(message);
        }

        return;
      }

      const type = response.headers.get("Content-Type") ?? "";

      if (!type.toLowerCase().startsWith(RIDER_EXPORT_CONTENT_TYPE)) {
        if (mountedRef.current) {
          setError("The export did not come back as an Excel file. Sign in again and retry.");
        }

        return;
      }

      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get("Content-Disposition"),
        riderExportFilename(list, todayInIndia())
      );
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.rel = "noopener";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        const entry = {
          url,
          timer: setTimeout(() => {
            URL.revokeObjectURL(url);
            timersRef.current = timersRef.current.filter((item) => item !== entry);
          }, REVOKE_AFTER_MS),
        };
        timersRef.current.push(entry);
      }
    } catch {
      if (mountedRef.current) {
        setError(NETWORK_ERROR);
      }
    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <div className={`flex flex-col items-start gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => void exportList()}
        disabled={busy}
        aria-busy={busy}
        className="whitespace-nowrap rounded-lg bg-bronze-deep px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Export to Excel"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-sm leading-5 text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
