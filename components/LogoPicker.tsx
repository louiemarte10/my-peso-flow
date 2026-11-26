"use client";

import { useRef, useState } from "react";

/** Logos are stored inline, so they are shrunk to this square before upload. */
const MAX_PX = 128;

/**
 * Pick a real logo (the GCash mark, a bank's) for a wallet.
 *
 * The file never leaves the browser as-is: it is drawn onto a 128px canvas and
 * re-encoded as PNG, so a 2MB photo becomes a few KB and the stored value is a
 * predictable square whatever was chosen. SVGs are kept as-is — they are
 * already tiny and scale better than any raster we could produce.
 */
export default function LogoPicker({
  value,
  onChange,
  fallbackEmoji,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  fallbackEmoji?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    // Generous: the shrink below is what actually controls the stored size.
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is over 5MB. Try a smaller one.");
      return;
    }

    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);

      if (file.type === "image/svg+xml") {
        onChange(dataUrl);
        return;
      }

      onChange(await shrinkToSquare(dataUrl));
    } catch {
      setError("That image could not be read. Try a PNG or JPG.");
    } finally {
      setBusy(false);
      // Let the same file be picked again after a removal.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-ice text-xl"
        aria-hidden="true"
      >
        {value ? (
          // A data URL; next/image would only add indirection.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-contain" />
        ) : (
          (fallbackEmoji ?? "👛")
        )}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand-dark disabled:opacity-50"
        >
          {busy ? "Reading…" : value ? "Change logo" : "Upload logo"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setError("");
            }}
            className="rounded-lg px-2 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Remove
          </button>
        )}
      </div>

      <p className="w-full text-xs text-slate-400">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : (
          <>
            PNG, JPG, WEBP or SVG. Shrunk to {MAX_PX}px square automatically, so
            a logo saved from the web is fine. Without one, the emoji below is
            used.
          </>
        )}
      </p>
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Draw the image centred on a transparent MAX_PX square and re-encode as PNG. */
function shrinkToSquare(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(MAX_PX / img.width, MAX_PX / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = MAX_PX;
      canvas.height = MAX_PX;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));

      // Centre it, so a wide logo is not stretched into a square.
      ctx.drawImage(img, (MAX_PX - w) / 2, (MAX_PX - h) / 2, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("decode failed"));
    img.src = dataUrl;
  });
}
