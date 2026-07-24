"use client";

import DOMPurify from "dompurify";

interface Props {
  html: string;
  className?: string;
}

export default function SafeHTML({ html, className }: Props) {
  if (!html) return null;

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "h1", "h2", "h3", "h4", "ul", "ol", "li", "span", "font", "div"],
    ALLOWED_ATTR: ["size", "style", "class", "color", "face", "data-bg-wrapper"],
  });

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
