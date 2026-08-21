"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A background video that survives an in-app browser.
 *
 * Instagram and Facebook open links in their own browser, and it does not
 * behave like Safari or Chrome. Three things go wrong there, and a plain
 * <video autoPlay muted playsInline> hits all of them:
 *
 *   - Autoplay is often refused even when muted, so nothing ever starts.
 *   - preload defaults to none on a metered connection, so not even the first
 *     frame is fetched and the element paints empty.
 *   - With no controls, a refused autoplay leaves the viewer no way to start
 *     it — the video is simply a blank gap in the page, which is what an ad
 *     click currently lands on.
 *
 * So: preload the metadata, ask for the first frame explicitly, retry once the
 * video actually scrolls into view, and if the browser still refuses, show
 * controls so it can be tapped rather than leaving a hole.
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

    const tryPlay = () => {
      el.play().then(
        () => setNeedsTap(false),
        () => setNeedsTap(true),
      );
    };

    tryPlay();

    // A mid-page video is off-screen on load, which is reason enough for a
    // browser to refuse it. Ask again when it is actually being looked at.
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && tryPlay()),
      { threshold: 0.25 },
    );
    observer.observe(el);

    return () => observer.disconnect();
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
    />
  );
}
