"use client";

import DOMPurify from "dompurify";

interface Props {
  html: string;
  className?: string;
}

export default function SafeHTML({ html, className }: Props) {
  if (!html) return null;

  // `class` is deliberately not allowed. Text pasted from WhatsApp Web brings
  // that app's own markup with it — `selectable-text`, `copyable-text` and a
  // dozen obfuscated names like `x10wlt62` — which name stylesheets that do not
  // exist here. The warning emoji in the Emmeley description arrived inside one
  // of those spans and rendered clipped because of it. Nothing in the shop's
  // own content uses a class for anything, so dropping them loses nothing and
  // makes a paste from anywhere come out as plain text in the site's own type.
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "h1", "h2", "h3", "h4", "ul", "ol", "li", "span", "font", "div"],
    ALLOWED_ATTR: ["size", "style", "color", "face", "data-bg-wrapper"],
  });

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
