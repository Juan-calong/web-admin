"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";

async function fetchUnreadCount() {
  const { data } = await api.get(endpoints.adminInbox.unreadCount);
  return data as { count: number };
}

export function useAdminUnreadCount() {
  return useQuery({
    queryKey: ["admin-unread-count"],
    queryFn: fetchUnreadCount,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}