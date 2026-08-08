'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rebootDevice } from '@/lib/api-client';
import type { Device, DeviceListResponse } from '@/lib/types';

// Small cushion past the server-reported reboot duration, so this check
// lands after the device has actually flipped back rather than right on
// the edge of it.
const REBOOT_FOLLOWUP_BUFFER_MS = 500;

export function useRebootDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => rebootDevice(id),

    onMutate: async (id: string) => {
      // Unlike the alert feed, nothing here polls on an interval - but the
      // detail query or list could still have a fetch in flight (e.g. from
      // a recent refocus), so cancel before writing the optimistic value.
      await queryClient.cancelQueries({ queryKey: ['devices'] });

      const previousDetail = queryClient.getQueryData<Device>(['devices', 'detail', id]);
      const previousLists = queryClient.getQueriesData<DeviceListResponse>({ queryKey: ['devices', 'list'] });

      queryClient.setQueryData<Device>(['devices', 'detail', id], (old) =>
        old ? { ...old, status: 'rebooting' } : old,
      );

      // The same device can be sitting in several cached list pages at
      // once (different filter/sort/page combos the user visited earlier).
      // setQueriesData patches all of them in one call rather than picking
      // one "current" list to update - contrast this with the acknowledge
      // mutation, which only ever has one alerts cache entry to touch.
      queryClient.setQueriesData<DeviceListResponse>({ queryKey: ['devices', 'list'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          devices: old.devices.map((device) => (device.id === id ? { ...device, status: 'rebooting' } : device)),
        };
      });

      return { previousDetail, previousLists };
    },

    onError: (_err, id, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(['devices', 'detail', id], context.previousDetail);
      }
      context?.previousLists?.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },

    onSuccess: (result) => {
      // The server will genuinely flip this device back to 'online' after
      // rebootDurationMs, but that happens lazily on the next read - nothing
      // pushes it to us, and the device list doesn't poll like the alert
      // feed does. Check back once, timed to exactly when the server said
      // it would be done, instead of leaving the UI stuck on "rebooting."
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['devices'] });
      }, result.rebootDurationMs + REBOOT_FOLLOWUP_BUFFER_MS);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
  });
}
