/** Matching's calls to the API (M3.1): the only file in the web app that knows these paths. */
import {
  Candidates, DecidedMatch, Directory, MatchingBoard, MatchView, MyIntroductions, MyProfile, SeekerProfile, SharedLink,
  type BriefInput, type DecideMatchInput, type IntroduceInput, type RespondIntroInput, type TeaserInput,
} from "@excursia/contracts/matching";
import { http } from "../http";

const team = (eventId: string) => `/v1/matching/${eventId}`;
const intro = (slug: string, matchId: string) => `/v1/introductions/${slug}/${matchId}`;

export const matchingApi = {
  /* the team's */
  board: (eventId: string) => http.get(team(eventId), { schema: MatchingBoard }),
  candidates: (eventId: string, appId: string) => http.get(`${team(eventId)}/candidates/${appId}`, { schema: Candidates }),
  decide: (eventId: string, input: DecideMatchInput) => http.post(`${team(eventId)}/decisions`, { body: input, schema: DecidedMatch }),
  match: (eventId: string, matchId: string) => http.get(`${team(eventId)}/matches/${matchId}`, { schema: MatchView }),
  brief: (eventId: string, matchId: string, input: BriefInput) => http.put(`${team(eventId)}/matches/${matchId}/brief`, { body: input, schema: MatchView }),
  introduce: (eventId: string, matchId: string, input: IntroduceInput) => http.post(`${team(eventId)}/matches/${matchId}/introduce`, { body: input, schema: MatchView }),

  /* the participant's */
  mine: (slug: string) => http.get(`/v1/introductions/${slug}`, { schema: MyIntroductions }),
  respond: (slug: string, matchId: string, input: RespondIntroInput) => http.post(`${intro(slug, matchId)}/respond`, { body: input, schema: MyIntroductions }),
  consent: (slug: string, matchId: string, docId: string, granted: boolean) => http.put(`${intro(slug, matchId)}/documents/${docId}/consent`, { body: { granted }, schema: MyIntroductions }),
  profile: (slug: string, matchId: string) => http.post(`${intro(slug, matchId)}/profile`, { schema: SeekerProfile }),
  open: (slug: string, matchId: string, docId: string, action: "view" | "download") => http.post(`${intro(slug, matchId)}/documents/${docId}/open`, { body: { action }, schema: SharedLink }),

  /* the business's teaser, and the directory for verified counterparties */
  myProfile: (slug: string) => http.get(`/v1/introductions/${slug}/teaser`, { schema: MyProfile }),
  saveTeaser: (slug: string, input: TeaserInput) => http.put(`/v1/introductions/${slug}/teaser`, { body: input, schema: MyProfile }),
  setDownload: (slug: string, docId: string, download: boolean) => http.put(`/v1/introductions/${slug}/teaser/documents/${docId}`, { body: { download }, schema: MyProfile }),
  directory: (slug: string) => http.get(`/v1/introductions/${slug}/directory`, { schema: Directory }),
  interest: (slug: string, seekerId: string) => http.post(`/v1/introductions/${slug}/directory/${seekerId}/interest`, { schema: Directory }),
};
