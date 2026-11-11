"use client";

/**
 * The review team's open request, answered from the status page (backend-plan.md, M1.3): the questions, the reply-by
 * date, the documents asked for (uploaded here and sent with the answer), and the answer itself.
 */
import { useState } from "react";
import type { MyApplication } from "@excursia/contracts/apply";
import { fmtStamp } from "@excursia/domain/time";
import { useRespond, useUploadDocument } from "@/features/apply/hooks/use-apply";
import { Card } from "./fields";

const TYPES = "application/pdf,image/png,image/jpeg,.docx,.xlsx,.pptx";

export function Answer({ slug, app, maxBytes, onSent }: { slug: string; app: MyApplication; maxBytes: number; onSent: () => void }) {
  const request = app.requests.find((r) => r.open);
  const upload = useUploadDocument(slug, app.id);
  const respond = useRespond(slug, app.id);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ kind: string; fileId: string; name: string }[]>([]);
  const [tooBig, setTooBig] = useState<string | null>(null);
  if (!request) return null;

  return (
    <Card title="The review team asked for more information">
      <p className="text-[14px] text-slate">Reply by {fmtStamp(request.due, false)}. Your application waits until you answer.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px]">
        {request.questions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>

      {request.docs.length > 0 && (
        <div className="mt-4 space-y-2">
          <span className="label">Documents asked for</span>
          {request.docs.map((kind) => {
            const sent = files.filter((f) => f.kind === kind);
            const busy = upload.isPending && upload.variables?.kind === kind;
            return (
              <div key={kind} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                <span className="min-w-0 text-[14px]">
                  <span className="font-medium">{kind}</span>
                  {sent.map((f) => (
                    <span key={f.fileId} className="block truncate text-[13px] text-slate">
                      📄 {f.name}
                    </span>
                  ))}
                </span>
                <label className={`btn-secondary btn-sm ${upload.isPending ? "pointer-events-none opacity-50" : "cursor-pointer"}`}>
                  {busy ? "Uploading…" : sent.length ? "Add another" : "Upload"}
                  <input
                    type="file"
                    className="sr-only"
                    accept={TYPES}
                    disabled={upload.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (file.size > maxBytes) return setTooBig(`${file.name} is over ${Math.round(maxBytes / 1_048_576)} MB.`);
                      setTooBig(null);
                      upload.mutate({ kind, file }, { onSuccess: (r) => setFiles((fs) => [...fs, { kind, fileId: r.fileId, name: r.name }]) });
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          respond.mutate({ text, fileIds: files.map((f) => f.fileId) }, { onSuccess: onSent });
        }}
      >
        <label className="block">
          <span className="label">Your answer</span>
          <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {(tooBig || upload.error || respond.error) && (
          <p role="alert" className="rounded-md bg-bad-50 px-3 py-2 text-[14px] text-bad">
            {tooBig ?? upload.error?.message ?? respond.error?.message}
          </p>
        )}
        <button className="btn btn-primary w-full sm:w-auto" disabled={!text.trim() || respond.isPending || upload.isPending}>
          {respond.isPending ? "Sending…" : "Send the answer"}
        </button>
      </form>
    </Card>
  );
}
