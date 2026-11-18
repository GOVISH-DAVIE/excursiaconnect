/** The desk's calls to the API (M2.2): the only file in the web app that knows these paths. */
import { BadgeList, DevicesView, DeviceView, ScannerHome, ScanResults, type ScanInput } from "@excursia/contracts/scan";
import { conditional, http } from "../http";

export const scanApi = {
  /* the workspace */
  devices: (eventId: string) => http.get(`/v1/scan/${eventId}/devices`, { schema: DevicesView }),
  enrol: (eventId: string, name: string) => http.post(`/v1/scan/${eventId}/devices`, { body: { name }, schema: DeviceView }),
  retire: (eventId: string, deviceId: string) => http.post(`/v1/scan/${eventId}/devices/${deviceId}/retire`),
  setPin: (pin: string) => http.put("/v1/scan/pin", { body: { pin } }),
  /* the scanner */
  home: () => http.get("/v1/scan/device", { schema: ScannerHome }),
  signIn: (staffId: string, pin: string) => http.post("/v1/scan/device/signin", { body: { staffId, pin }, schema: ScannerHome }),
  signOut: () => http.post("/v1/auth/signout"),
  badges: (eventId: string, etag: string | null) => conditional(`/v1/scan/${eventId}/badges`, etag, BadgeList),
  scan: (eventId: string, scans: ScanInput[]) => http.post(`/v1/scan/${eventId}/scans`, { body: { scans }, schema: ScanResults }),
};
