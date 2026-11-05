"use client";

import { useStore } from "@/lib/store";

export function ResetButton({ className = "" }: { className?: string }) {
  const { dispatch } = useStore();
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "reset" });
        try {
          localStorage.removeItem("excursiaconnect-proto-v1");
        } catch {}
      }}
      className={`underline underline-offset-4 hover:text-coral ${className}`}
    >
      Reset demo data
    </button>
  );
}
