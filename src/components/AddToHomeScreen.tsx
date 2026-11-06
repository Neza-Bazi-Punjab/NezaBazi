"use client";

/* "Add to Home Screen" for iPhones and Android phones: a round bronze
   button floating at the bottom right of the home page, with an "Add the
   app" label beside it the whole time. It pops in just after the page loads
   (globals.css, .a2hs).

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
   iPad or Android tablet), and never inside the installed app (opened from
   the home-screen icon). It stays there the whole time, also after it is
   tapped; its × hides it until the browser is closed (sessionStorage), and
   it is back on the next visit.

   Already installed? Inside the app the page knows (display-mode:
   standalone). In the browser:
   - Android: Chrome can say so (getInstalledRelatedApps, with
     related_applications in the manifest); it also tells the page the
     moment it is installed (appinstalled); and the installed app shares
     the browser's storage, so opening it once marks the phone (INSTALLED_KEY).
     Any of these hides the button.
   - iPhone: Safari and the home-screen app are kept fully apart (separate
     storage), and Apple gives websites no way to tell, so Safari keeps
     showing it; only the × hides it, for that visit.

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
export const INSTALLED_KEY = "nbp-app-installed";

const isInstalledApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/* Chrome on Android: is this site installed as an app on the phone? Needs
   related_applications in the manifest. Not in TypeScript's DOM types yet. */
const chromeSaysInstalled = async () => {
  const nav = navigator as Navigator & {
    getInstalledRelatedApps?: () => Promise<unknown[]>;
  };

  try {
    return ((await nav.getInstalledRelatedApps?.()) ?? []).length > 0;
  } catch {
    return false;
  }
};

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

  if (isInstalledApp()) {
    return null;
  }

  try {
    if (
      window.sessionStorage.getItem(DISMISS_KEY) === "1" ||
      window.localStorage.getItem(INSTALLED_KEY) === "1"
    ) {
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

export default function AddToHomeScreen() {
  const [phone, setPhone] = useState<Phone | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Opened as the installed app: remember it. On Android the browser
    // shares this storage, so Chrome stops showing the button too.
    if (isInstalledApp()) {
      try {
        window.localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        // Not remembered; Chrome's own check below still works.
      }
    }

    // Read once, after the page has loaded: these checks need the browser.
    const found = detectPhone();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone(found);
    setShowButton(found !== null);
    setInstallPrompt(savedInstallPrompt);

    let active = true;
    if (found?.platform === "android") {
      void chromeSaysInstalled().then((installed) => {
        if (installed && active) {
          setShowButton(false);
        }
      });
    }

    const onInstalled = () => setShowButton(false);
    installPromptListeners.add(setInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      active = false;
      installPromptListeners.delete(setInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!phone) {
    return null;
  }

  /* The ×: hidden for the rest of this visit (until the browser is closed);
     back on the next one. */
  const hideForNow = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not remembered; it is still hidden until the page is reloaded.
    }

    setShowButton(false);
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
      // Older Safari shows Share in the bottom bar; Safari on iOS 26 keeps
      // it behind ⋯ (bottom right). The page-menu button by the address has
      // no Share, so the text points past it.
      icon: (
        <span className="flex items-center gap-1">
          <ShareIcon className="h-6 w-6" />
          <span className="text-[11px] font-semibold text-brown/70">or</span>
          <MoreVerticalIcon className="h-6 w-6 rotate-90" />
        </span>
      ),
      text: (
        <>
          Tap <strong>Share</strong> at the bottom of Safari (the square with an
          arrow pointing up). Don&apos;t see it? Tap <strong>⋯</strong> at the
          bottom right, then <strong>Share</strong>.
        </>
      ),
    },
    {
      key: "add",
      icon: <AddSquareIcon className="h-6 w-6" />,
      text: (
        <>
          Tap <strong>Add to Home Screen</strong>. Not in the list? Tap{" "}
          <strong>View More</strong> or scroll down to find it.
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
    <>
      {showButton && (
        <div className="a2hs fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40">
          {/* "Add the app" stays beside the round button the whole time; the
              label and the circle are one button. */}
          <button
            type="button"
            onClick={openSteps}
            aria-label="Add Neza Bazi to your Home Screen"
            className="flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze active:scale-95 transition-transform"
          >
            <span className="whitespace-nowrap rounded-full bg-cream/95 px-3.5 py-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-brown shadow-md ring-1 ring-bronze/15">
              Add the app
            </span>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-bronze text-cream shadow-lg shadow-bronze-deep/30">
              <AddSquareIcon className="h-6 w-6" />
            </span>
          </button>
          {/* The ×: a small badge on the round button's corner, with a larger
              invisible tap area around it. */}
          <button
            type="button"
            onClick={hideForNow}
            aria-label="Hide Add to Home Screen"
            className="absolute -top-2 right-10 flex h-6 w-6 items-center justify-center rounded-full bg-cream text-brown shadow ring-1 ring-brown/20 before:absolute before:-inset-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-bronze"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
    </>
  );
}
