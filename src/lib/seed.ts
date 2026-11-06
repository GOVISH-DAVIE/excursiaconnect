import type { AppState, Delegate, Order, Session, Shift, TeamMember } from "./types";
import { DEFAULT_GRANTS } from "./roles";
import { bouer, ca3, ca3Rooms, ca3Tiers, ca3Zones, seedDealRoom } from "./dealroom/seed";
import { DR_TIER, DR_ZONE } from "./dealroom/logic";

const team: TeamMember[] = [
  { id: "u_owner", organiserId: "org_epic", name: "Njeri Kamande", email: "njeri@epicpr.example", role: "Owner", eventIds: [], status: "Active", lastActive: "Today, 09:12" },
  { id: "u_staff1", organiserId: "org_epic", name: "Kevin Oduya", email: "kevin@epicpr.example", role: "Staff", eventIds: ["ev_nairobi_summit"], responsibility: "Delegates", status: "Active", lastActive: "Today, 08:40" },
  { id: "u_staff2", organiserId: "org_epic", name: "Faith Wanjala", email: "faith@epicpr.example", role: "Staff", eventIds: ["ev_nairobi_summit", "ev_fintech_forum"], responsibility: "Exhibition and sponsors", status: "Active", lastActive: "Yesterday" },
  { id: "u_staff3", organiserId: "org_epic", name: "Brian Kiptoo", email: "brian@epicpr.example", role: "Staff", eventIds: ["ev_nairobi_summit"], responsibility: "Programme and speakers", status: "Active", lastActive: "Today, 07:55" },
  { id: "u_fin", organiserId: "org_epic", name: "Dennis Mburu", email: "dennis@epicpr.example", role: "Finance", eventIds: [], responsibility: "Ledger and payouts", status: "Active", lastActive: "Mon 3 Nov" },
  { id: "u_desk1", organiserId: "org_epic", name: "Agnes Muthoni", email: "agnes@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Active", lastActive: "Today, 08:02" },
  { id: "u_desk2", organiserId: "org_epic", name: "Collins Were", email: "collins@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Active", lastActive: "Today, 08:05" },
  { id: "u_desk3", organiserId: "org_epic", name: "Mary Atieno", email: "mary@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Active", lastActive: "Today, 08:10" },
  { id: "u_desk4", organiserId: "org_epic", name: "Joseph Kariuki", email: "joseph@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Active", lastActive: "Today, 08:11" },
  { id: "u_desk5", organiserId: "org_epic", name: "Lucy Nekesa", email: "lucy@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Invited" },
  { id: "u_desk6", organiserId: "org_epic", name: "Patrick Omolo", email: "patrick@epicpr.example", role: "Accreditation", eventIds: ["ev_nairobi_summit"], status: "Invited" },
  { id: "u_spk", organiserId: "org_epic", name: "Esther Njeri", email: "esther.njeri@company.co.ke", role: "Speaker", eventIds: ["ev_nairobi_summit"], status: "Active", lastActive: "Today, 10:55" },
];

const shifts: Shift[] = [
  { id: "sh1", eventId: "ev_nairobi_summit", day: 1, slot: "Morning", post: "desk", memberId: "u_desk1" },
  { id: "sh2", eventId: "ev_nairobi_summit", day: 1, slot: "Afternoon", post: "desk", memberId: "u_desk2" },
  { id: "sh3", eventId: "ev_nairobi_summit", day: 1, slot: "Morning", post: "z_main:in", memberId: "u_desk3" },
  { id: "sh4", eventId: "ev_nairobi_summit", day: 1, slot: "Afternoon", post: "z_main:in", memberId: "u_desk3" },
  { id: "sh5", eventId: "ev_nairobi_summit", day: 1, slot: "Morning", post: "z_exhib:in", memberId: "u_desk4" },
  { id: "sh6", eventId: "ev_nairobi_summit", day: 1, slot: "Morning", post: "z_vip:in", memberId: "u_desk2" },
  { id: "sh7", eventId: "ev_nairobi_summit", day: 1, slot: "Afternoon", post: "z_breakout:in", memberId: "u_desk4" },
  { id: "sh8", eventId: "ev_nairobi_summit", day: 2, slot: "Morning", post: "desk", memberId: "u_desk1" },
  { id: "sh9", eventId: "ev_nairobi_summit", day: 2, slot: "Morning", post: "z_main:in", memberId: "u_desk3" },
];

const EV = "ev_nairobi_summit";
const EV2 = "ev_coastal_pr";
const EV3 = "ev_fintech_forum";

const firstNames = ["Amina", "Brian", "Cynthia", "David", "Esther", "Felix", "Grace", "Hassan", "Irene", "James", "Kevin", "Lydia", "Mercy", "Nelson", "Olive", "Peter", "Ruth", "Samuel", "Terry", "Wanjiru", "Yvonne", "Zablon", "Achieng", "Baraka", "Chebet", "Dennis", "Edith", "Faith", "George", "Halima"];
const lastNames = ["Mwangi", "Odhiambo", "Kamau", "Njoroge", "Otieno", "Wafula", "Kiprop", "Mutua", "Achieng", "Omondi", "Ndungu", "Karanja", "Maina", "Wambui", "Kimani", "Ochieng", "Barasa", "Cheruiyot", "Njeri", "Abdalla"];
const orgs = ["Safaricom", "KCB Group", "Equity Bank", "Nation Media", "UNDP Kenya", "Twiga Foods", "M-KOPA", "Kenya Airways", "Britam", "Jubilee Insurance", "iHub", "Strathmore University", "Ministry of ICT", "Absa Kenya", "Davis & Shirtliff", "Gearbox", "Kenya Red Cross", "NCBA", "Sanlam", "Bidco Africa"];
const titles = ["Marketing Manager", "Head of Communications", "CEO", "Product Lead", "Brand Manager", "Programme Officer", "Founder", "Operations Director", "Events Coordinator", "PR Executive", "Country Director", "Analyst"];

function pseudo(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const rand = pseudo(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const tiers = [
  { id: "t_full", eventId: EV, name: "Full conference", price: 12000, currency: "KES" as const, cap: 350, sold: 0, visibility: "public" as const, approval: "auto" as const, entitlements: ["all-days", "z_main", "z_exhib", "z_dining", "z_breakout", "breakouts"], description: "All three days, plenaries, breakouts, exhibition and lunches." },
  { id: "t_day1", eventId: EV, name: "Day 1 only", price: 5000, currency: "KES" as const, cap: 100, sold: 0, visibility: "public" as const, approval: "auto" as const, entitlements: ["day-1", "z_main", "z_exhib", "z_dining"], description: "Opening day plenaries and exhibition." },
  { id: "t_vip", eventId: EV, name: "VIP", price: 25000, currency: "KES" as const, cap: 40, sold: 0, visibility: "public" as const, approval: "auto" as const, entitlements: ["all-days", "z_main", "z_exhib", "z_dining", "z_vip", "z_breakout", "breakouts", "dinner"], description: "Everything in Full conference plus VIP lounge and the gala dinner." },
  { id: "t_virtual", eventId: EV, name: "Virtual", price: 50, currency: "USD" as const, cap: 500, sold: 0, visibility: "public" as const, approval: "auto" as const, entitlements: ["stream"], description: "Live stream of plenaries and selected breakouts." },
  { id: "t_sponsor", eventId: EV, name: "Sponsor pass", price: 0, currency: "KES" as const, cap: 60, sold: 0, visibility: "invite" as const, approval: "organiser" as const, entitlements: ["all-days", "z_main", "z_exhib", "z_dining", "z_vip", "dinner"], description: "Complimentary pass for sponsor and exhibitor staff; organiser approval required." },
];

const zones = [
  { id: "z_main", eventId: EV, name: "Main hall", capacity: 600, occupancy: 0 },
  { id: "z_exhib", eventId: EV, name: "Exhibition", capacity: 400, occupancy: 0 },
  { id: "z_dining", eventId: EV, name: "Dining", capacity: 250, occupancy: 0, window: "12:30–14:00" },
  { id: "z_vip", eventId: EV, name: "VIP lounge", capacity: 40, occupancy: 0 },
  { id: "z_breakout", eventId: EV, name: "Breakout wing", capacity: 200, occupancy: 0 },
];

const rooms = [
  { id: "r_a", zoneId: "z_breakout", name: "Room A (Kilimanjaro)", capacity: 60 },
  { id: "r_b", zoneId: "z_breakout", name: "Room B (Kenya)", capacity: 50 },
  { id: "r_c", zoneId: "z_breakout", name: "Room C (Elgon)", capacity: 40 },
];

const sessions: Session[] = [
  { id: "s1", eventId: "ev_nairobi_summit", day: 1, start: "08:00", end: "09:00", title: "Accreditation and coffee", kind: "break", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s2", eventId: "ev_nairobi_summit", day: 1, start: "09:00", end: "10:30", title: "Opening plenary: The state of African brands", kind: "plenary", speakers: ["Wanjiru Kamau", "Hassan Abdalla"], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s3", eventId: "ev_nairobi_summit", day: 1, start: "11:00", end: "12:30", title: "Crisis communications in real time", track: "PR", roomId: "r_a", kind: "breakout", speakers: ["Esther Njeri"], capacity: 60, enrolled: 41, attended: 31, rating: 4.6, status: "ended", walkIns: false, comments: ["Clear, practical, wanted more time for questions.", "Best session of the day."] },
  { id: "s4", eventId: "ev_nairobi_summit", day: 1, start: "11:00", end: "12:30", title: "Measuring earned media", track: "Analytics", roomId: "r_b", kind: "breakout", speakers: ["Brian Otieno"], capacity: 50, enrolled: 50, attended: 39, rating: 4.2, status: "ended", walkIns: false, comments: ["Clear, practical, wanted more time for questions.", "Best session of the day."] },
  { id: "s5", eventId: "ev_nairobi_summit", day: 1, start: "11:00", end: "12:30", title: "Influencer contracts that hold up", track: "Legal", roomId: "r_c", kind: "breakout", speakers: ["Lydia Wambui"], capacity: 40, enrolled: 22, attended: 0, status: "scheduled", walkIns: false },
  { id: "s6", eventId: "ev_nairobi_summit", day: 1, start: "12:30", end: "14:00", title: "Lunch", kind: "break", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s7", eventId: "ev_nairobi_summit", day: 1, start: "14:00", end: "15:30", title: "Panel: Corporate events after the pandemic", kind: "plenary", speakers: ["Felix Mutua", "Grace Ndungu", "Peter Barasa"], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s8", eventId: "ev_nairobi_summit", day: 1, start: "19:00", end: "22:00", title: "Gala dinner (VIP and sponsors)", kind: "social", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s9", eventId: "ev_nairobi_summit", day: 2, start: "09:00", end: "10:30", title: "Keynote: Storytelling for East African audiences", kind: "plenary", speakers: ["Achieng Omondi"], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s10", eventId: "ev_nairobi_summit", day: 2, start: "11:00", end: "12:30", title: "Workshop: Building a media list", track: "PR", roomId: "r_a", kind: "breakout", speakers: ["Nelson Karanja"], capacity: 60, enrolled: 33, attended: 0, status: "scheduled", walkIns: false },
  { id: "s11", eventId: "ev_nairobi_summit", day: 2, start: "11:00", end: "12:30", title: "Sponsorship ROI, by the numbers", track: "Analytics", roomId: "r_b", kind: "breakout", speakers: ["Mercy Cheruiyot"], capacity: 50, enrolled: 29, attended: 0, status: "scheduled", walkIns: false },
  { id: "s12", eventId: "ev_nairobi_summit", day: 2, start: "12:30", end: "14:00", title: "Lunch", kind: "break", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s13", eventId: "ev_nairobi_summit", day: 2, start: "14:00", end: "15:30", title: "Agency showcase and exhibition hour", kind: "social", speakers: [], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s14", eventId: "ev_nairobi_summit", day: 3, start: "09:00", end: "10:30", title: "Closing plenary and awards", kind: "plenary", speakers: ["Wanjiru Kamau"], enrolled: 0, attended: 0, status: "scheduled", walkIns: true },
  { id: "s15", eventId: "ev_nairobi_summit", day: 3, start: "11:00", end: "12:30", title: "Roundtable: Working with government", track: "Policy", roomId: "r_c", kind: "breakout", speakers: ["Samuel Kiprop"], capacity: 40, enrolled: 18, attended: 0, status: "scheduled", walkIns: false },
];

const delegates: Delegate[] = [];
const orders: Order[] = [];
const countries = ["Kenya", "Kenya", "Kenya", "Kenya", "Uganda", "Tanzania", "Rwanda", "Nigeria", "United Kingdom"];
const cats: Delegate["category"][] = ["General Delegate", "General Delegate", "General Delegate", "General Delegate", "General Delegate", "Speaker", "Sponsor", "Exhibitor", "VIP", "Panelist"];
const statuses: Delegate["status"][] = ["Confirmed", "Confirmed", "Confirmed", "Confirmed", "Confirmed", "Confirmed", "Checked in", "Checked in", "Awaiting payment", "Pending", "Cancelled"];

const seatsTaken: Record<string, number> = {};
for (let i = 0; i < 212; i++) {
  const first = pick(firstNames);
  const last = pick(lastNames);
  const cat = pick(cats);
  const tier = cat === "VIP" ? tiers[2] : cat === "Sponsor" || cat === "Exhibitor" ? tiers[4] : rand() < 0.15 ? tiers[1] : rand() < 0.08 ? tiers[3] : tiers[0];
  const status = pick(statuses);
  const id = `d_${(1000 + i).toString(36)}`;
  const day1 = status === "Checked in";
  // breakouts at random, never two in the same slot, never past the room's seats
  const enrolled = tier.entitlements.includes("breakouts")
    ? sessions
        .filter((s) => s.kind === "breakout" && rand() < 0.35 && (seatsTaken[s.id] ?? 0) < (s.capacity ?? 0))
        .reduce<Session[]>((acc, s) => (acc.some((o) => o.day === s.day && o.start < s.end && s.start < o.end) ? acc : [...acc, s]), [])
        .slice(0, 3)
        .map((s) => { seatsTaken[s.id] = (seatsTaken[s.id] ?? 0) + 1; return s.id; })
    : [];
  delegates.push({
    id,
    eventId: EV,
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@${pick(["gmail.com", "outlook.com", "company.co.ke", "org.ke"])}`,
    phone: `+2547${Math.floor(10000000 + rand() * 89999999)}`,
    organisation: pick(orgs),
    jobTitle: pick(titles),
    country: pick(countries),
    category: cat,
    tierId: tier.id,
    status,
    accredited: day1,
    checkIns: day1 ? [{ day: 1, at: `08:${(10 + Math.floor(rand() * 49)).toString().padStart(2, "0")}` }] : [],
    zoneLog: [],
    sessions: enrolled.slice(0, 3),
    bookable: rand() < 0.3,
    slots: rand() < 0.3 ? [{ day: 1, time: "15:45", location: "Networking lounge" }, { day: 2, time: "10:30", location: "Networking lounge" }] : undefined,
    badgeCode: `EXC-${id.toUpperCase().replace("D_", "")}-${Math.floor(1000 + rand() * 8999)}`,
  });
  tier.sold += status === "Confirmed" || status === "Checked in" ? 1 : 0;
  if ((status === "Confirmed" || status === "Checked in") && tier.price > 0) {
    const gross = tier.price;
    const method = tier.currency === "USD" ? "card" : rand() < 0.75 ? "mpesa" : rand() < 0.6 ? "card" : "bank";
    const commission = Math.round(gross * 0.05);
    const gatewayFee = method === "bank" ? 0 : Math.round(gross * 0.015);
    orders.push({
      id: `o_${i}`,
      eventId: EV,
      delegateId: id,
      tierId: tier.id,
      gross,
      discount: 0,
      gatewayFee,
      commission,
      net: gross - commission,
      method,
      reference: method === "mpesa" ? `R${Math.floor(10000000 + rand() * 89999999).toString(36).toUpperCase()}` : method === "card" ? `PSK_${Math.floor(rand() * 1e8).toString(16)}` : `INV-${1000 + i}`,
      status: "paid",
      at: `2026-${(9 + Math.floor(rand() * 2)).toString().padStart(2, "0")}-${(1 + Math.floor(rand() * 28)).toString().padStart(2, "0")}`,
    });
  }
}

// a couple of named delegates we use in the demo
delegates[0] = { ...delegates[0], id: "d_demo", name: "Amina Mwangi", email: "amina.mwangi@nation.co.ke", phone: "+254711223344", organisation: "Nation Media", jobTitle: "Head of Communications", category: "General Delegate", tierId: "t_full", status: "Confirmed", accredited: false, checkIns: [], sessions: ["s3", "s10"], bookable: true, slots: [{ day: 1, time: "15:45", location: "Networking lounge" }, { day: 2, time: "10:30", location: "Networking lounge" }], badgeCode: "EXC-DEMO-4821" };
delegates[1] = { ...delegates[1], id: "d_vip", name: "Hassan Abdalla", email: "hassan.abdalla@safaricom.co.ke", phone: "+254722000111", organisation: "Safaricom", jobTitle: "Chief Brand Officer", category: "VIP", tierId: "t_vip", status: "Checked in", accredited: true, checkIns: [{ day: 1, at: "08:12" }], badgeCode: "EXC-VIP-1001", bookable: true, slots: [{ day: 1, time: "16:00", location: "VIP lounge" }] };
orders.push(
  { id: "o_demo", eventId: EV, delegateId: "d_demo", tierId: "t_full", gross: 12000, discount: 0, gatewayFee: 180, commission: 600, net: 11400, method: "mpesa", reference: "RKJ3M8Q2TX", status: "paid", at: "2026-10-02" },
  { id: "o_vip", eventId: EV, delegateId: "d_vip", tierId: "t_vip", gross: 25000, discount: 0, gatewayFee: 375, commission: 1250, net: 23750, method: "card", reference: "PSK_7f21c0ab", status: "paid", at: "2026-09-28" },
);
// a session's counter is the roster: the number of delegates who hold a seat. An ended session's attendance
// is its room-door scans, so the seed writes those on the first `attended` people of the roster.
for (const s of sessions) {
  if (s.kind !== "breakout") continue;
  const roster = delegates.filter((d) => d.sessions.includes(s.id));
  s.enrolled = roster.length;
  s.attended = Math.min(s.attended, s.enrolled);
  if (s.status === "ended" && s.roomId) {
    const [h, m] = s.start.split(":").map(Number);
    roster.slice(0, s.attended).forEach((d, i) => {
      const t = new Date(2026, 0, 1, h, m - 8 + Math.floor((i * 17) % 22));
      d.roomLog = [...(d.roomLog ?? []), { roomId: s.roomId!, sessionId: s.id, day: s.day, at: `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`, verdict: "allow" }];
    });
  }
}
delegates[2] = { ...delegates[2], id: "d_cancel", name: "Terry Maina", email: "terry.maina@mkopa.com", status: "Cancelled", badgeCode: "EXC-CANC-0007", cancelled: true };

let inside = 0;
for (const d of delegates) {
  if (d.checkIns.length === 0) continue;
  const at = d.checkIns[0].at;
  const hallIn = `${at.slice(0, 3)}${((Number(at.slice(3)) + 7) % 60).toString().padStart(2, "0")}`;
  d.zoneLog = [{ zoneId: "z_main", direction: "in", at: hallIn, verdict: "allow" }];
  inside++;
  if (d.category === "General Delegate" && rand() < 0.12) d.zoneLog.unshift({ zoneId: "z_vip", direction: "in", at: "10:1" + Math.floor(rand() * 9), verdict: "deny", reason: "Not entitled: VIP lounge" });
  if (rand() < 0.08) d.zoneLog.unshift({ zoneId: "z_main", direction: "in", at: "10:2" + Math.floor(rand() * 9), verdict: "deny", reason: "Anti-passback: already inside" });
}
zones[0].occupancy = inside;

for (const sess of sessions) {
  if (sess.kind !== "breakout") continue;
  const roster = delegates.filter((d) => d.sessions.includes(sess.id) && d.status !== "Cancelled" && d.status !== "Refunded");
  sess.enrolled = Math.min(sess.capacity ?? roster.length, roster.length);
  if (sess.status === "ended") sess.attended = Math.round(sess.enrolled * 0.78);
}

// the Deal Room's event: Bouer's Connected Africa 3.0, its participants badged on approval or verification
const deal = seedDealRoom();
const ca3TierRows = ca3Tiers.map((t) => (t.id === DR_TIER ? { ...t, sold: deal.delegates.length } : t));
const ca3ZoneRows = ca3Zones.map((z) => (z.id === DR_ZONE ? { ...z, occupancy: deal.drZoneInside } : z));

const liveIds = new Set(delegates.map((d) => d.id));
const cleanOrders = orders.filter((o) => liveIds.has(o.delegateId));

export const seed: AppState = {
  formFields: [
    { id: "f_bio", eventId: "ev_nairobi_summit", label: "Short bio", type: "textarea", required: true, showTo: ["Speaker", "Panelist"], help: "Shown in the programme, 60 words at most" },
    { id: "f_headshot", eventId: "ev_nairobi_summit", label: "Headshot (up to 5 MB)", type: "file", required: false, showTo: ["Speaker"] },
    { id: "f_dietary", eventId: "ev_nairobi_summit", label: "Dietary or accessibility needs", type: "text", required: false, showTo: "Everyone" },
    { id: "f_stand", eventId: "ev_nairobi_summit", label: "Stand number", type: "text", required: false, showTo: ["Exhibitor", "Sponsor"] },
  ],
  exceptions: [
    { ref: "RKJ7Q2M1", issue: "M-Pesa callback received with no matching order, KES 12,000", raised: "2026-11-05 03:10" },
    { ref: "PSK_8a1f30c2", issue: "Paystack settled KES 11,820 against a ledger line of 12,000. Fee variance.", raised: "2026-11-04 03:05" },
  ],
  campaigns: [{ id: "c1", eventId: "ev_nairobi_summit", at: "2026-11-03 09:00", segment: "Confirmed, all tiers", channel: "Email and SMS", subject: "Your badge and the day 1 programme", recipients: 160 }],
  payoutsPaid: [],
  banners: {},
  floorPlans: {},
  galleries: {},
  speakerProfiles: [
    { eventId: "ev_nairobi_summit", name: "Hassan Abdalla", organisation: "Safaricom", jobTitle: "Chief Brand Officer" },
    { eventId: "ev_nairobi_summit", name: "Esther Njeri", organisation: "Nation Media", jobTitle: "Head of Communications" },
  ],
  sponsors: [
    { id: "sp1", eventId: "ev_nairobi_summit", name: "KCB Group", tier: "Headline" },
    { id: "sp2", eventId: "ev_nairobi_summit", name: "Nation Media", tier: "Gold" },
    { id: "sp3", eventId: "ev_nairobi_summit", name: "Britam", tier: "Gold" },
    { id: "sp4", eventId: "ev_nairobi_summit", name: "iHub", tier: "Silver" },
    { id: "sp5", eventId: "ev_nairobi_summit", name: "Strathmore University", tier: "Partner" },
  ],
  team,
  shifts,
  grants: DEFAULT_GRANTS,
  organisers: [
    { id: "org_epic", name: "Epic PR & Events Ltd", kycStatus: "Verified", kraPin: "P051234567X", registrationNo: "PVT-2019-44821", payoutAccount: "KCB ****4471", licenceFee: 85000, commissionPct: 5 },
    { id: "org_coast", name: "Coastal Communications", kycStatus: "Pending", kraPin: "P059876543Y", registrationNo: "PVT-2022-11930", payoutAccount: "M-Pesa till 5522118", licenceFee: 60000, commissionPct: 6 },
    bouer, // after Epic: several screens take organisers[0] as the signed-in organiser
  ],
  events: [
    { id: EV, slug: "nairobi-brand-summit-2026", organiserId: "org_epic", name: "Nairobi Brand & PR Summit 2026", tagline: "Three days on the future of brands, media and events in East Africa.", venue: "Sarit Expo Centre", city: "Nairobi", startDate: "2026-11-25", endDate: "2026-11-27", days: 3, state: "Live", commissionPct: 5, oneOffFee: 0, licenceFee: 85000, gatewayFeesBorneBy: "Algotech", staffCount: 4, stations: 3, expectedAttendance: 500, brand: { primary: "#0F4C81", logoText: "EPIC" }, registrationsByDay: [4, 9, 14, 11, 22, 31, 28, 19, 26, 34, 14, 8] },
    { id: EV2, slug: "coastal-tourism-media-week", organiserId: "org_coast", name: "Coastal Tourism Media Week", tagline: "Mombasa's annual meeting of tourism brands and the press.", venue: "Sarova Whitesands", city: "Mombasa", startDate: "2027-02-10", endDate: "2027-02-11", days: 2, state: "Submitted", commissionPct: 6, oneOffFee: 0, licenceFee: 60000, gatewayFeesBorneBy: "Algotech", staffCount: 2, stations: 2, expectedAttendance: 300, brand: { primary: "#0A7E8C", logoText: "CTMW" }, registrationsByDay: [] },
    { id: EV3, slug: "east-africa-fintech-forum", organiserId: "org_epic", name: "East Africa Fintech Forum", tagline: "Payments, lending and the next 100 million customers.", venue: "Radisson Blu Upper Hill", city: "Nairobi", startDate: "2027-03-18", endDate: "2027-03-18", days: 1, state: "Draft", commissionPct: 5, oneOffFee: 0, licenceFee: 85000, gatewayFeesBorneBy: "Algotech", staffCount: 0, stations: 0, expectedAttendance: 400, brand: { primary: "#5B2A86", logoText: "EAFF" }, registrationsByDay: [] },
    ca3,
  ],
  tiers: [...tiers, ...ca3TierRows],
  zones: [...zones, ...ca3ZoneRows],
  rooms: [...rooms, ...ca3Rooms],
  sessions,
  delegates: [...delegates, ...deal.delegates],
  orders: cleanOrders,
  messages: [
    { id: "m1", from: "d_vip", to: "d_demo", body: "Hi Amina, enjoyed your question in the opening plenary. Free for 10 minutes at 16:00?", at: "10:42" },
    { id: "m2", from: "d_demo", to: "d_vip", body: "Yes, VIP lounge works. See you then.", at: "10:51" },
  ],
  currentDelegateId: "d_demo",
  dealRoom: deal.dr,
};
