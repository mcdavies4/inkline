"use client";

import { useEffect, useState } from "react";

/**
 * Makes the signing page usable inside Telegram's in-app browser.
 *
 * The problem: Telegram's webview treats a downward swipe as "dismiss", so
 * drawing a signature fights the close gesture and strokes get dropped.
 *
 * What this does:
 *  1. Loads Telegram's WebApp SDK if we're inside Telegram.
 *  2. Calls expand() so the view is full height, and disableVerticalSwipes()
 *     (Bot API 7.7+) which stops the swipe-to-dismiss gesture entirely.
 *  3. Locks overscroll/pull-to-refresh at the document level.
 *  4. If the SDK is too old to disable swipes, shows an "Open in browser"
 *     bar so the signer isn't left struggling.
 *
 * Drop <TelegramSignFix /> once near the top of the signing page.
 */
export default function TelegramSignFix() {
  const [needsBrowser, setNeedsBrowser] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.href);

    const ua = navigator.userAgent || "";
    const inTelegram =
      /Telegram/i.test(ua) ||
      typeof (window as unknown as { Telegram?: unknown }).Telegram !== "undefined";

    // Always harden scrolling — helps in every mobile browser, not just Telegram.
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    if (!inTelegram) {
      return () => {
        document.body.style.overscrollBehavior = prevOverscroll;
      };
    }

    const setup = () => {
      const wa = (window as unknown as {
        Telegram?: {
          WebApp?: {
            expand?: () => void;
            disableVerticalSwipes?: () => void;
            enableClosingConfirmation?: () => void;
            ready?: () => void;
          };
        };
      }).Telegram?.WebApp;

      if (!wa) {
        setNeedsBrowser(true);
        return;
      }
      try {
        wa.ready?.();
        wa.expand?.();
        if (typeof wa.disableVerticalSwipes === "function") {
          wa.disableVerticalSwipes();
          // Swipe-to-dismiss is off — signing will work in place.
        } else {
          // Older Telegram client: we can't stop the gesture, so offer the escape hatch.
          wa.enableClosingConfirmation?.();
          setNeedsBrowser(true);
        }
      } catch {
        setNeedsBrowser(true);
      }
    };

    if ((window as unknown as { Telegram?: unknown }).Telegram) {
      setup();
    } else {
      const s = document.createElement("script");
      s.src = "https://telegram.org/js/telegram-web-app.js";
      s.async = true;
      s.onload = setup;
      s.onerror = () => setNeedsBrowser(true);
      document.head.appendChild(s);
    }

    return () => {
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  if (!needsBrowser) return null;

  return (
    <div className="tgfix">
      <style>{CSS}</style>
      <span>Signing feels stuck? Open this page in your browser.</span>
      <a href={url} target="_blank" rel="noopener noreferrer">Open ↗</a>
    </div>
  );
}

const CSS = `
.tgfix{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;
  gap:12px;background:#0A1A14;color:#F6FFFA;padding:11px 14px;border-radius:12px;margin:0 0 14px;
  font-size:13.5px;font-weight:500;line-height:1.35;}
.tgfix a{background:#12E27A;color:#0A1A14;text-decoration:none;font-weight:800;font-size:13px;
  padding:7px 14px;border-radius:100px;white-space:nowrap;}
`;
