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

    let playing = false;
    let giveUpTimer: ReturnType<typeof setTimeout> | undefined;

    const tryPlay = () => {
      if (playing) return;
      // Set muted through the property as well as the attribute: some browsers
      // consult the property when deciding whether autoplay is permitted, and
      // refuse a video they consider unmuted.
      el.muted = true;
      el.play().then(
        () => {
          playing = true;
          setNeedsTap(false);
          clearTimeout(giveUpTimer);
        },
        () => {},
      );
    };

    const gestures: (keyof DocumentEventMap)[] = ["touchstart", "click", "scroll"];
    const onGesture = () => tryPlay();
    gestures.forEach((type) =>
      document.addEventListener(type, onGesture, { passive: true }),
    );

    const media: (keyof HTMLMediaElementEventMap)[] = ["loadeddata", "canplay", "canplaythrough"];
    media.forEach((type) => el.addEventListener(type, tryPlay));

    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          // Worth the bandwidth now that it is actually being looked at.
          if (el.preload !== "auto") el.preload = "auto";
          tryPlay();
          // Only offer a play button once it has had its chance on screen.
          clearTimeout(giveUpTimer);
          giveUpTimer = setTimeout(() => {
            if (!playing) setNeedsTap(true);
          }, 2500);
        }),
      { threshold: 0.25 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimeout(giveUpTimer);
      gestures.forEach((type) => document.removeEventListener(type, onGesture));
      media.forEach((type) => el.removeEventListener(type, tryPlay));
    };
  }, [src]);

  // "#t=0.001" asks for the frame at that timestamp, which iOS then paints as
  // a still. Without it the element stays blank until playback begins.
  const withFirstFrame = poster || src.includes("#") ? src : `${src}#t=0.001`;

  return (
    <video
      ref={ref}
      src={withFirstFrame}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      controls={needsTap}
      className={className}
      onClick={() => ref.current?.play().catch(() => {})}
    />
  );
}
