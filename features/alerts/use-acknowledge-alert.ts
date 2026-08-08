'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acknowledgeAlert } from '@/lib/api-client';
import type { AlertListResponse } from '@/lib/types';

interface AcknowledgeVars {
  id: string;
  fail: boolean;
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fail }: AcknowledgeVars) => acknowledgeAlert(id, fail),
    // Mutations don't retry by default, and that default is correct here,
    // not just left alone: this endpoint toggles rather than sets. A blind
    // retry after a response that actually succeeded but was lost in
    // transit would toggle the flag right back to where it started.
    retry: false,

    onMutate: async ({ id }: AcknowledgeVars) => {
      // Without this, a poll already in flight when you click can resolve
      // after the optimistic write below and clobber it with pre-
      // acknowledge data - the collision this hook was built to expose.
      await queryClient.cancelQueries({ queryKey: ['alerts'] });

      const previous = queryClient.getQueryData<AlertListResponse>(['alerts']);

      queryClient.setQueryData<AlertListResponse>(['alerts'], (old) => {
        if (!old) return old;
        return {
          alerts: old.alerts.map((alert) =>
            alert.id === id ? { ...alert, acknowledged: !alert.acknowledged } : alert,
          ),
        };
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['alerts'], context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
