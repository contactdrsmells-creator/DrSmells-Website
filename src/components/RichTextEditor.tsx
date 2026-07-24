"use client";

import { useRef, useEffect, useState } from "react";
import { Bold, Italic, List, Type, Heading1, Heading2, Paintbrush, Highlighter, Eraser } from "lucide-react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}

function ToolbarButton({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? "text-olive bg-gray-200" : "text-gray-500 hover:text-olive hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );
}

const PRESET_COLORS = [
  "#000000", "#2B3A1B", "#C5CBB0", "#FF0000", "#FF6600",
  "#FFD700", "#008000", "#0066CC", "#6633CC", "#CC0066",
  "#FFFFFF", "#666666", "#999999", "#CC3333", "#FF9933",
  "#FFEE55", "#33CC66", "#3399FF", "#9966FF", "#FF66AA",
];

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb.startsWith("#") ? rgb : "#000000";
  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function ColorPicker({
  label,
  onSelect,
  onClose,
  initialColor,
}: {
  label: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  initialColor?: string;
}) {
  const [custom, setCustom] = useState(initialColor || "#000000");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 w-[220px]">
      <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
      <div className="grid grid-cols-10 gap-1 mb-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(c);
            }}
            className="w-5 h-5 rounded border border-gray-200 hover:scale-125 transition-transform"
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-7 h-7 rounded cursor-pointer border-0 p-0"
        />
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded"
          placeholder="#000000"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(custom);
          }}
          className="text-xs px-2 py-1 bg-olive text-white rounded hover:bg-sage-dark"
        >
          OK
        </button>
      </div>
    </div>
  );
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [fontSizeInput, setFontSizeInput] = useState("16");
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const savedSelection = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalChange.current = false;
  }, [value]);

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelection.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const sel = window.getSelection();
    if (sel && savedSelection.current) {
      editorRef.current?.focus();
      sel.removeAllRanges();
      sel.addRange(savedSelection.current);
    }
  }

  function exec(command: string, val?: string) {
    restoreSelection();
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    handleInput();
  }

  function handleInput() {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }

  function applyFontSize(px: string) {
    const size = parseInt(px);
    if (isNaN(size) || size < 8 || size > 120) return;
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    document.execCommand("fontSize", false, "7");
    if (editorRef.current) {
      const fonts = editorRef.current.querySelectorAll('font[size="7"]');
      fonts.forEach((font) => {
        const span = document.createElement("span");
        span.style.fontSize = `${size}px`;
        span.innerHTML = font.innerHTML;
        font.parentNode?.replaceChild(span, font);
      });
    }
    handleInput();
  }

  // Strip ALL background colors from the entire content
  function clearAllBackgrounds() {
    if (!editorRef.current) return;
    // Remove background-color from all elements
    const allEls = editorRef.current.querySelectorAll("*");
    allEls.forEach((el) => {
      (el as HTMLElement).style.removeProperty("background-color");
      (el as HTMLElement).style.removeProperty("background");
      // Clean up padding/border-radius added by block background
      if ((el as HTMLElement).getAttribute("data-bg-wrapper") !== null) {
        // Unwrap the wrapper: move children out and remove wrapper
        const parent = el.parentNode;
        while (el.firstChild) {
          parent?.insertBefore(el.firstChild, el);
        }
        parent?.removeChild(el);
      }
    });
    // Also clean empty style attributes
    editorRef.current.querySelectorAll('[style=""]').forEach((el) => {
      el.removeAttribute("style");
    });
    handleInput();
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <ToolbarButton onClick={() => exec("bold")} title="Bold">
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} title="Italic">
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton onClick={() => exec("formatBlock", "h2")} title="Heading">
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "h3")} title="Subheading">
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "p")} title="Normal text">
          <Type className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <ToolbarButton onClick={() => exec("insertUnorderedList")} title="Bullet list">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Font Size */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Size:</span>
          <input
            type="number"
            min={8}
            max={120}
            value={fontSizeInput}
            onMouseDown={() => saveSelection()}
            onFocus={() => saveSelection()}
            onChange={(e) => setFontSizeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFontSize(fontSizeInput);
              }
            }}
            className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 bg-white text-center"
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              applyFontSize(fontSizeInput);
            }}
            className="text-[10px] px-1.5 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
          >
            px
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Text Color */}
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              saveSelection();
              setShowTextColor(!showTextColor);
              setShowHighlight(false);
            }}
            title="Text Color"
            active={showTextColor}
          >
            <Paintbrush className="w-4 h-4" />
          </ToolbarButton>
          {showTextColor && (
            <ColorPicker
              label="Text Color"
              initialColor={(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  const el = sel.anchorNode?.parentElement;
                  if (el) return rgbToHex(window.getComputedStyle(el).color);
                }
                return "#000000";
              })()}
              onSelect={(color) => {
                exec("foreColor", color);
                setShowTextColor(false);
              }}
              onClose={() => setShowTextColor(false)}
            />
          )}
        </div>

        {/* Text Highlight */}
        <div className="relative">
          <ToolbarButton
            onClick={() => {
              saveSelection();
              setShowHighlight(!showHighlight);
              setShowTextColor(false);
            }}
            title="Text Highlight"
            active={showHighlight}
          >
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>
          {showHighlight && (
            <ColorPicker
              label="Highlight Color"
              initialColor={(() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                  const el = sel.anchorNode?.parentElement;
                  if (el) {
                    const bg = window.getComputedStyle(el).backgroundColor;
                    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return rgbToHex(bg);
                  }
                }
                return "#FFEE55";
              })()}
              onSelect={(color) => {
                exec("hiliteColor", color);
                setShowHighlight(false);
              }}
              onClose={() => setShowHighlight(false)}
            />
          )}
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* Clear All Backgrounds */}
        <ToolbarButton onClick={clearAllBackgrounds} title="Clear All Background Colors">
          <Eraser className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onBlur={() => { saveSelection(); handleInput(); }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        data-placeholder={placeholder || "Type here..."}
        className="px-3 py-2 text-sm min-h-[150px] focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-400 prose prose-sm max-w-none"
        style={{ minHeight: `${rows * 24}px` }}
      />
    </div>
  );
}
