"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

async function fetchUnreadCount() {
    const { data } = await api.get("/admin/notifications/unread-count");
    return data as { count: number };
}

export function AdminBell() {
    const unread = useQuery({
        queryKey: ["admin-unread-count"],
        queryFn: fetchUnreadCount,
        refetchInterval: 10000,
    });

    const count = unread.data?.count ?? 0;

    return (
        <Link href="/admin/inbox">
            <Button variant="outline" className="relative">
                <Bell className="h-4 w-4" />
                {count > 0 ? (
                    <span className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white text-xs px-2 py-0.5">
                        {count}
                    </span>
                ) : null}
            </Button>
        </Link>
    );
}
