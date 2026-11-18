/** The workspace's scanner devices and the signed-in person's PIN (M2.2). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scanApi } from "../api";

const key = (eventId: string) => ["scan", eventId, "devices"] as const;

export const useDevices = (eventId: string) => useQuery({ queryKey: key(eventId), queryFn: () => scanApi.devices(eventId), enabled: !!eventId });

export function useDeviceActions(eventId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(eventId) });
  return {
    enrol: useMutation({ mutationFn: (name: string) => scanApi.enrol(eventId, name), onSuccess: refresh }),
    retire: useMutation({ mutationFn: (deviceId: string) => scanApi.retire(eventId, deviceId), onSuccess: refresh }),
    setPin: useMutation({ mutationFn: (pin: string) => scanApi.setPin(pin), onSuccess: refresh }),
  };
}
