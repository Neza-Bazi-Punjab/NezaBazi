"use client";

/* "Add to Home Screen" on the home page, for iPhones and Android phones.

   iPhone: Apple gives websites no way to open the add-to-home-screen popup,
   so the button opens a short panel with the three taps it takes in Safari.

   Android: when Chrome decides the site can be installed (it needs the web
   app manifest, src/app/manifest.ts, and its icons), it hands the page a
   `beforeinstallprompt` event. The button keeps that event and, when tapped,
   shows Chrome's own "Install app" popup: one tap and it is done. If Chrome
   never offers it (another browser, or the popup was already used), the
   button opens a panel with the menu steps instead.

   The icon and the name under it ("Neza Bazi") come from the manifest and,
   on iPhone, src/app/apple-icon.png and `appleWebApp.title` in layout.tsx.

   Who sees it: only a phone with a touch screen (never a laptop, desktop,
   iPad or Android tablet); never inside the installed app (opened from the
   home-screen icon); and never again on a phone where the × was pressed.
   Every check needs the browser, so nothing is drawn on the server or before
   the page has loaded: desktop visitors never see it flash. */
import { useEffect, useRef, useState } from "react";
import {
  AddSquareIcon,
  CloseIcon,
  MoreVerticalIcon,
  ShareIcon,
} from "@/components/icons";

export const DISMISS_KEY = "nbp-add-to-home-screen-dismissed";

type Platform = "ios" | "android";
type Phone = { platform: Platform; inAppBrowser: boolean };

/* Chrome's install offer. Not in TypeScript's DOM types yet. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/* Instagram, Facebook and similar apps open links in their own browser,
   which cannot add to the home screen; the panel then says to open the page
   in Safari or Chrome first. `; wv)` marks any Android in-app web view. */
const IN_APP_BROWSER =
  /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|; wv\)/i;

const detectPhone = (): Phone | null => {
  const { userAgent } = navigator;
  const platform: Platform | null = /iPhone|iPod/.test(userAgent)
    ? "ios"
    : // Android phones say "Mobile"; Android tablets do not.
      /Android/.test(userAgent) && /Mobile/.test(userAgent)
      ? "android"
      : null;

  if (!platform) {
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

  return { platform, inAppBrowser: IN_APP_BROWSER.test(userAgent) };
};

/* Chrome can offer the install before React has finished loading the page,
   so the offer is caught as soon as this file loads and kept here. Chrome's
   own small "Add to Home screen" bar is held back (preventDefault) only on an
   Android phone that will show our button instead. */
let savedInstallPrompt: InstallPromptEvent | null = null;
const installPromptListeners = new Set<(event: InstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    if (detectPhone()?.platform !== "android") {
      return;
    }

    event.preventDefault();
    savedInstallPrompt = event as InstallPromptEvent;
    installPromptListeners.forEach((listener) => listener(savedInstallPrompt));
  });
}

export default function AddToHomeScreen({ className = "" }: { className?: string }) {
  const [phone, setPhone] = useState<Phone | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Read once, after the page has loaded: these checks need the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone(detectPhone());
    setInstallPrompt(savedInstallPrompt);

    const onInstalled = () => setPhone(null);
    installPromptListeners.add(setInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      installPromptListeners.delete(setInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
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

  const openSteps = async () => {
    // Android with Chrome's offer in hand: show Chrome's own popup. The offer
    // works once, so afterwards the button falls back to the steps panel.
    if (phone.platform === "android" && installPrompt) {
      const offer = installPrompt;
      savedInstallPrompt = null;
      setInstallPrompt(null);

      try {
        await offer.prompt();
        const { outcome } = await offer.userChoice;

        if (outcome === "accepted") {
          setPhone(null);
        }

        return;
      } catch {
        // Chrome refused the popup; show the steps instead.
      }
    }

    dialogRef.current?.showModal();
  };

  const openInBrowserStep = {
    key: "browser",
    icon: null,
    text:
      phone.platform === "ios" ? (
        <>
          This app&apos;s browser can&apos;t do it. Tap <strong>⋯</strong> (top or
          bottom corner) and choose <strong>Open in Safari</strong> or{" "}
          <strong>Open in browser</strong>, then follow the steps below.
        </>
      ) : (
        <>
          This app&apos;s browser can&apos;t do it. Tap <strong>⋮</strong> (top
          corner) and choose <strong>Open in Chrome</strong> or{" "}
          <strong>Open in browser</strong>, then follow the steps below.
        </>
      ),
  };

  const iosSteps = [
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

  const androidSteps = [
    {
      key: "menu",
      icon: <MoreVerticalIcon className="h-6 w-6" />,
      text: (
        <>
          Tap the <strong>⋮</strong> menu at the top right of Chrome.
        </>
      ),
    },
    {
      key: "add",
      icon: <AddSquareIcon className="h-6 w-6" />,
      text: (
        <>
          Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
        </>
      ),
    },
    {
      key: "confirm",
      icon: null,
      text: (
        <>
          Tap <strong>Install</strong> or <strong>Add</strong>. The Neza Bazi icon
          appears on your home screen.
        </>
      ),
    },
  ];

  const steps = [
    ...(phone.inAppBrowser ? [openInBrowserStep] : []),
    ...(phone.platform === "ios" ? iosSteps : androidSteps),
  ];

  return (
    <div className={className}>
      <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-brown/40 text-brown">
        <button
          type="button"
          onClick={openSteps}
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
            {phone.platform === "ios"
              ? "Best in Safari. On iOS 16.4 or later, Chrome and other browsers have Add to Home Screen in their Share menu too."
              : "Best in Chrome. In Samsung Internet, tap ≡ at the bottom, then Add page to → Home screen."}
          </p>
        </div>
      </dialog>
    </div>
  );
}
