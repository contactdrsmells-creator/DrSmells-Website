"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A background video that survives an in-app browser.
 *
 * Instagram and Facebook open links in their own browser, which refuses
 * autoplay far more readily than Safari or Chrome, and preloads nothing on a
 * metered connection — so a plain <video autoPlay muted playsInline> arrives
 * as an empty gap in the page, on the very screen an ad is paying to reach.
 *
 * Rather than give up after one refusal, this asks repeatedly at each moment a
 * browser is most likely to say yes:
 *
 *   - on mount, for the browsers that would have allowed it anyway
 *   - when the video scrolls into view, since an off-screen video is reason
 *     enough on its own to be refused
 *   - once enough data has arrived to actually start
 *   - on the viewer's first touch or scroll anywhere on the page, which counts
 *     as the user gesture that unlocks playback
 *
 * That last one is what usually wins: reaching a mid-page video means
 * scrolling to it, so the gesture has already happened by the time it matters.
 *
 * Controls appear only after it has been visible and still not started, so a
 * video that takes a moment to begin does not flash a play button first.
 */
export default function AutoVideo({
  src,
  className,
  poster,
}: {
  src: string;
  className?: string;
  poster?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let inView = false;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Asks the element whether it is playing rather than remembering that it
     * once did.
     *
     * A remembered flag was the bug: after the first successful play nothing
     * tried again, so anything that paused the video afterwards — scrolling it
     * off screen on iOS, another tab taking over, Low Power Mode engaging
     * mid-visit — stopped it for the rest of the session.
     */
    /**
     * One attempt at a time.
     *
     * el.paused stays true for as long as play() is still deciding, so the
     * guard below let every caller through while the first attempt was in
     * flight — and "scroll" is one of the callers. A phone fires that dozens
     * of times a second, so scrolling towards the video threw a fresh play()
     * at it on each frame, and a play() arriving while another is pending
     * aborts the one already working. The video spent the scroll being asked
     * to start over instead of starting.
     */
    let starting = false;

    const tryPlay = () => {
      if (starting || !el.paused) return;
      // Set muted through the property as well as the attribute: some browsers
      // consult the property when deciding whether autoplay is permitted, and
      // refuse a video they consider unmuted.
      el.muted = true;
      starting = true;
      el.play().then(
        () => {
          starting = false;
          setNeedsTap(false);
          clearTimeout(giveUpTimer);
        },
        () => {
          starting = false;
        },
      );
    };

    const gestures: (keyof DocumentEventMap)[] = ["touchstart", "click", "scroll"];
    const onGesture = () => tryPlay();
    gestures.forEach((type) =>
      document.addEventListener(type, onGesture, { passive: true }),
    );

    // "pause" covers the browser stopping it of its own accord; "ended" covers
    // a loop that did not come round, which some in-app browsers manage.
    const media: (keyof HTMLMediaElementEventMap)[] = [
      "loadeddata", "canplay", "canplaythrough", "pause", "ended", "stalled", "suspend",
    ];
    media.forEach((type) => el.addEventListener(type, tryPlay));

    // Coming back to the tab is the most common way a video is found stopped.
    const onVisible = () => { if (document.visibilityState === "visible") tryPlay(); };
    document.addEventListener("visibilitychange", onVisible);

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          inView = entry.isIntersecting;
          if (!inView) return;
          // Worth the bandwidth now that it is actually being looked at.
          if (el.preload !== "auto") el.preload = "auto";
          tryPlay();
          // Only offer a play button once it has had its chance on screen.
          clearTimeout(giveUpTimer);
          giveUpTimer = setTimeout(() => {
            if (el.paused) setNeedsTap(true);
          }, 2500);
        }),
      /**
       * Start it as it arrives, not a quarter of the way in.
       *
       * A quarter of a tall video is most of a phone screen, so playback was
       * asked for well after the video was being looked at — the first frame
       * sat there as a still while the viewer waited. The margin starts it
       * just before the top edge appears, so by the time it is on screen it
       * is already running.
       */
      { threshold: 0, rootMargin: "200px 0px" },
    );
    observer.observe(el);

    // The catch-all. Events cover the causes we know of; a video can still be
    // stopped by something we do not hear about, and while it is on screen it
    // should be playing. Cheap: a paused check, twice a second is not needed.
    const keepPlaying = setInterval(() => {
      if (inView && document.visibilityState === "visible") tryPlay();
    }, 1500);

    return () => {
      observer.disconnect();
      clearInterval(keepPlaying);
      clearTimeout(giveUpTimer);
      gestures.forEach((type) => document.removeEventListener(type, onGesture));
      media.forEach((type) => el.removeEventListener(type, tryPlay));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [src]);

  /**
   * A still to paint while the video itself is still arriving.
   *
   * Without one the element knows its size as soon as the metadata lands but
   * has no pixels to show, so the section held a correctly-shaped blank space
   * for several seconds — which is what a reader notices, far more than a
   * video that starts a moment late.
   *
   * Every video under public/ has a .jpg of its first frame beside it, made
   * at build time from the video itself, so the name is enough to find it.
   * They are 12–40KB and paint immediately. A video uploaded later through
   * the admin has no such file; the request simply 404s, the poster is
   * ignored, and the "#t" fragment below covers that case as before.
   */
  const stillFrame =
    poster ||
    (src.startsWith("/") && /\.(mp4|webm|mov|m4v)$/i.test(src)
      ? src.replace(/\.(mp4|webm|mov|m4v)$/i, ".jpg")
      : undefined);

  // "#t=0.001" asks for the frame at that timestamp, which iOS then paints as
  // a still. Without it the element stays blank until playback begins.
  const withFirstFrame = stillFrame || src.includes("#") ? src : `${src}#t=0.001`;

  return (
    <video
      ref={ref}
      src={withFirstFrame}
      poster={stillFrame}
      autoPlay
      muted
      loop
      playsInline
      /**
       * Fetch it with the page, not when the reader reaches it.
       *
       * "metadata" bought nothing worth having: the product-page videos are
       * 166KB to 680KB, smaller than a photograph already on the same page
       * (244KB), and holding them back only meant the download started once
       * the reader was already looking at the empty space. They are also
       * cached for a year now, so a returning visitor fetches nothing at all.
       */
      preload="auto"
      controls={needsTap}
      className={className}
      onClick={() => ref.current?.play().catch(() => {})}
    />
  );
}
