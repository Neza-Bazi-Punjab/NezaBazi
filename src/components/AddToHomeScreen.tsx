"use client";

/* "Add to Home Screen" on the home page, iPhone only for now (Android comes
   in a later change, with a web app manifest and Chrome's own install popup).

   Apple gives websites no way to open the add-to-home-screen popup, so the
   button opens a short panel with the three taps it takes in Safari. The
   icon and the name under it ("Neza Bazi") come from src/app/apple-icon.png
   and `appleWebApp.title` in src/app/layout.tsx.

   Who sees it: only an iPhone with a touch screen, never a laptop or an
   iPad; never inside the installed app (opened from the home-screen icon);
   and never again on a phone where the × was pressed. Every check needs the
   browser, so nothing is drawn on the server or before the page has loaded:
   desktop visitors never see it flash. */
import { useEffect, useRef, useState } from "react";
import { AddSquareIcon, CloseIcon, ShareIcon } from "@/components/icons";

export const DISMISS_KEY = "nbp-add-to-home-screen-dismissed";

type Phone = { inAppBrowser: boolean };

/* Instagram, Facebook and similar apps open links in their own browser,
   which cannot add to the home screen; the panel then says to open the page
   in Safari first. */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp/i;

const detectIphone = (): Phone | null => {
  const { userAgent } = navigator;

  if (!/iPhone|iPod/.test(userAgent)) {
    return null;
  }

  if (!window.matchMedia("(pointer: coarse)").matches) {
    return null;
  }

  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (installed) {
    return null;
  }

  try {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") {
      return null;
    }
  } catch {
    // Storage blocked (private mode, settings): show the button anyway.
  }

  return { inAppBrowser: IN_APP_BROWSER.test(userAgent) };
};

export default function AddToHomeScreen({ className = "" }: { className?: string }) {
  const [phone, setPhone] = useState<Phone | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Read once, after the page has loaded: these checks need the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone(detectIphone());
  }, []);

  if (!phone) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not remembered on this phone; it is still hidden until the next visit.
    }

    dialogRef.current?.close();
    setPhone(null);
  };

  const steps = [
    ...(phone.inAppBrowser
      ? [
          {
            key: "safari",
            icon: null,
            text: (
              <>
                This app&apos;s browser can&apos;t do it. Tap <strong>⋯</strong> (top or
                bottom corner) and choose <strong>Open in Safari</strong> or{" "}
                <strong>Open in browser</strong>, then follow the steps below.
              </>
            ),
          },
        ]
      : []),
    {
      key: "share",
      icon: <ShareIcon className="h-6 w-6" />,
      text: (
        <>
          Tap <strong>Share</strong> at the bottom of Safari (the square with an
          arrow pointing up). On some iPhones it is behind the <strong>⋯</strong>{" "}
          button.
        </>
      ),
    },
    {
      key: "add",
      icon: <AddSquareIcon className="h-6 w-6" />,
      text: (
        <>
          Scroll down the list and tap <strong>Add to Home Screen</strong>.
        </>
      ),
    },
    {
      key: "confirm",
      icon: null,
      text: (
        <>
          Tap <strong>Add</strong> in the top corner. The Neza Bazi icon appears on
          your home screen.
        </>
      ),
    },
  ];

  return (
    <div className={className}>
      <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-brown/40 text-brown">
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex items-center gap-2.5 px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] transition-colors hover:text-bronze focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bronze"
        >
          <AddSquareIcon className="h-5 w-5" />
          Add to Home Screen
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide Add to Home Screen"
          className="border-l border-brown/25 px-3 text-brown/70 transition-colors hover:text-bronze focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bronze"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="add-to-home-screen-title"
        onClick={(event) => {
          // A tap on the dimmed area outside the panel closes it.
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-cream p-0 text-ink backdrop:bg-ink/50"
      >
        <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
          <div className="flex items-start justify-between gap-4">
            <h2
              id="add-to-home-screen-title"
              className="font-display text-lg font-bold uppercase tracking-[0.12em] text-brown"
            >
              Add to Home Screen
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="-mr-2 -mt-1 rounded-lg p-2 text-brown/70 hover:text-bronze focus-visible:outline-2 focus-visible:outline-bronze"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-1 text-sm leading-6 text-brown/85">
            Open the championship from an icon on your phone, like an app.
          </p>

          <ol className="mt-5 space-y-4">
            {steps.map((step, index) => (
              <li key={step.key} className="flex items-start gap-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bronze font-display text-sm font-bold text-cream">
                  {index + 1}
                </span>
                <p className="flex-1 pt-0.5 text-[15px] leading-6 text-ink">{step.text}</p>
                {step.icon && (
                  <span className="shrink-0 rounded-lg border border-bronze/25 bg-sand p-1.5 text-bronze-deep">
                    {step.icon}
                  </span>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-5 text-xs leading-5 text-brown/75">
            Best in Safari. On iOS 16.4 or later, Chrome and other browsers have
            Add to Home Screen in their Share menu too.
          </p>
        </div>
      </dialog>
    </div>
  );
}
