"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copiar",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" className="btn btn-secondary text-sm" onClick={copy}>
      {copied ? "Copiado!" : label}
    </button>
  );
}
