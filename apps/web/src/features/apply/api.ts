/** Applying's calls to the API: the only file in the web app that knows these paths. */
import { ApplyForm, KYC_DOC, MyApplication, MyApplications, UploadTarget, type ApplyMode, type DraftChanges, type KycItem } from "@excursia/contracts/apply";
import { http } from "../http";

const base = (slug: string) => `/v1/apply/${slug}`;

export const applyApi = {
  form: (slug: string) => http.get(`${base(slug)}/form`, { schema: ApplyForm }),
  mine: (slug: string) => http.get(`${base(slug)}/mine`, { schema: MyApplications }),
  get: (slug: string, id: string) => http.get(`${base(slug)}/mine/${id}`, { schema: MyApplication }),
  start: (slug: string, input: { mode: ApplyMode; invite?: string }) => http.post(`${base(slug)}/mine`, { body: input, schema: MyApplication }),
  save: (slug: string, id: string, changes: DraftChanges) => http.patch(`${base(slug)}/mine/${id}`, { body: { changes }, schema: MyApplication }),
  submit: (slug: string, id: string, changes?: DraftChanges) => http.post(`${base(slug)}/mine/${id}/submit`, { body: { changes }, schema: MyApplication }),
  respond: (slug: string, id: string, input: { text: string; fileIds: string[] }) => http.post(`${base(slug)}/mine/${id}/respond`, { body: input, schema: MyApplication }),
  /**
   * Three steps: where to put it, the bytes themselves, then "it's there". Before submitting that attaches it; for an
   * open request it waits, and goes with the answer (respond, with its fileId).
   */
  async upload(slug: string, id: string, kind: string, file: File) {
    const target = await http.post(`${base(slug)}/mine/${id}/documents`, {
      body: { kind, name: file.name, contentType: file.type, size: file.size },
      schema: UploadTarget,
    });
    await http.upload(target.url, target.headers, file);
    const app = await http.post(`${base(slug)}/mine/${id}/documents/${target.fileId}/complete`, { schema: MyApplication });
    return { fileId: target.fileId, name: file.name, app };
  },
  /** A provider's KYC document (M1.6): uploaded the same way, then attached as that item. */
  async uploadKyc(slug: string, id: string, item: KycItem, file: File) {
    const target = await http.post(`${base(slug)}/mine/${id}/documents`, {
      body: { kind: KYC_DOC[item], name: file.name, contentType: file.type, size: file.size },
      schema: UploadTarget,
    });
    await http.upload(target.url, target.headers, file);
    return http.post(`${base(slug)}/mine/${id}/kyc`, { body: { item, fileId: target.fileId }, schema: MyApplication });
  },
  signNda: (slug: string, id: string, input: { name: string; title: string }) =>
    http.post(`${base(slug)}/mine/${id}/nda`, { body: { ...input, accept: true }, schema: MyApplication }),
};
