/** Organisers', events' and Algotech's calls to the API: the only file in the web app that knows these paths. */
import { UploadTarget } from "@excursia/contracts/apply";
import {
  AdminQueue,
  DealRoomSettings,
  EventView,
  OrganiserView,
  type DealRoomSettingsInput,
  type DealRoomStaffInput,
  type EventDecisionInput,
  type EventInput,
  type KycDecision,
  type KycInput,
  type OrganiserSignup,
} from "@excursia/contracts/onboarding";
import { SignInNext } from "@excursia/contracts/auth";
import { DocumentLink } from "@excursia/contracts/review";
import { http } from "../http";

const org = (id: string) => `/v1/organisers/${id}`;

export const onboardingApi = {
  signupCode: (email: string) => http.post<void>("/v1/organisers/signup/code", { body: { email } }),
  signUp: (input: OrganiserSignup) => http.post("/v1/organisers/signup", { body: input, schema: SignInNext }),

  mine: () => http.get("/v1/organisers/mine", { schema: OrganiserView.array() }),
  organiser: (id: string) => http.get(org(id), { schema: OrganiserView }),
  saveKyc: (id: string, input: KycInput) => http.patch(`${org(id)}/kyc`, { body: input, schema: OrganiserView }),
  signDpa: (id: string, by: string) => http.post(`${org(id)}/kyc/dpa`, { body: { by }, schema: OrganiserView }),
  submitKyc: (id: string) => http.post(`${org(id)}/kyc/submit`, { schema: OrganiserView }),
  removeKycDoc: (id: string, fileId: string) => http.del(`${org(id)}/kyc/documents/${fileId}`, { schema: OrganiserView }),
  kycDocLink: (id: string, fileId: string) => http.get(`${org(id)}/kyc/documents/${fileId}`, { schema: DocumentLink }),
  /** Where to put it, the bytes, then "it's there", which attaches it to KYC. */
  async uploadKycDoc(id: string, kind: string, file: File) {
    const target = await http.post(`${org(id)}/kyc/documents`, { body: { kind, name: file.name, contentType: file.type, size: file.size }, schema: UploadTarget });
    await http.upload(target.url, target.headers, file);
    return http.post(`${org(id)}/kyc/documents/${target.fileId}/complete`, { schema: OrganiserView });
  },

  createEvent: (organiserId: string, input: EventInput) => http.post(`${org(organiserId)}/events`, { body: input, schema: EventView }),
  event: (id: string) => http.get(`/v1/events/${id}`, { schema: EventView }),
  saveEvent: (id: string, input: EventInput) => http.put(`/v1/events/${id}`, { body: input, schema: EventView }),
  submitEvent: (id: string) => http.post(`/v1/events/${id}/submit`, { schema: EventView }),
  publishEvent: (id: string) => http.post(`/v1/events/${id}/publish`, { schema: EventView }),

  queue: () => http.get("/v1/admin/queue", { schema: AdminQueue }),
  decideKyc: (organiserId: string, input: KycDecision) => http.post(`/v1/admin/organisers/${organiserId}/kyc`, { body: input, schema: OrganiserView }),
  decideEvent: (id: string, input: EventDecisionInput) => http.post(`/v1/admin/events/${id}/decision`, { body: input, schema: EventView }),
  addStaff: (id: string, input: DealRoomStaffInput) => http.post(`/v1/admin/events/${id}/dealroom/staff`, { body: input, schema: EventView }),

  settings: (eventId: string) => http.get(`/v1/dealroom/${eventId}/settings`, { schema: DealRoomSettings }),
  saveSettings: (eventId: string, input: DealRoomSettingsInput) => http.put(`/v1/dealroom/${eventId}/settings`, { body: input, schema: DealRoomSettings }),
};
