"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
    LayoutDashboard,
    ShoppingBag,
    Boxes,
    Tags,
    LogOut,
    Wallet,
    Bell,
} from "lucide-react";
import { TicketPercent } from "lucide-react";

import { useQuery } from "@tanstack/react-query";

import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { authStore } from "@/lib/auth";
import { api } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Toaster } from "sonner";

function NavItem({
    href,
    label,
    icon: Icon,
    rightBadge,
}: {
    href: string;
    label: string;
    icon: React.ElementType;
    rightBadge?: React.ReactNode;
}) {
    const pathname = usePathname();
    const active =
        href === "/admin"
            ? pathname === "/admin"
            : pathname === href || pathname?.startsWith(href + "/");

    return (
        <Link
            href={href}
            className={cn(
                "group flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition",
                active ? "bg-black text-white shadow-sm" : "text-black/70 hover:bg-black/5 hover:text-black"
            )}
        >
            <div className="flex items-center gap-2 min-w-0">
                <Icon className={cn("h-4 w-4", active ? "text-white" : "text-black/50 group-hover:text-black")} />
                <span className="truncate">{label}</span>
            </div>

            {rightBadge ? <div className="shrink-0">{rightBadge}</div> : null}
        </Link>
    );
}

async function fetchUnreadCount() {
    const { data } = await api.get("/admin/notifications/unread-count");
    return data as { count: number };
}

    function UnreadBell({ count }: { count: number }) {

    return (
        <Link href="/admin/inbox" className="relative inline-flex">
            <Button variant="outline" size="icon" className="rounded-xl">
                <Bell className="h-4 w-4" />
            </Button>

            {count > 0 ? (
                <span className="absolute -top-2 -right-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5 leading-none">
                    {count}
                </span>
            ) : null}
        </Link>
    );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const me = authStore.getMe();

    async function logout() {
        try {
            await api.post(endpoints.auth.logout, {});
        } catch {
            // ignora
        } finally {
            authStore.clearAll();
            toast.message("Você saiu.");
            window.location.href = "/login";
        }
    }

    // pega contador pra usar também como badge no item do menu (opcional)
    const unread = useQuery({
        queryKey: ["admin-unread-count"],
        queryFn: fetchUnreadCount,
        refetchInterval: 10000,
    });
    const unreadCount = unread.data?.count ?? 0;

    const badge =
        unreadCount > 0 ? (
            <span className="rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5 leading-none">
                {unreadCount}
            </span>
        ) : null;

    return (
        <AuthGuard>
            <div className="min-h-screen bg-[#F7F8FA]">
                <div className="grid min-h-screen grid-cols-[280px_1fr]">
                    {/* Sidebar */}
                    <aside className="border-r bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-lg font-black leading-tight">KeyFi Admin</div>
                                <div className="text-xs text-black/60 truncate">{me?.email ?? "Painel"}</div>
                            </div>

                            {/* ✅ Sino com badge */}
                            <UnreadBell count={unreadCount} />
                        </div>

                        <Separator className="my-4" />

                        <nav className="grid gap-1">
                            <NavItem href="/admin" label="Dashboard" icon={LayoutDashboard} />
                            <NavItem href="/admin/orders" label="Pedidos" icon={ShoppingBag} />
                            <NavItem href="/admin/products" label="Produtos" icon={Boxes} />
                            <NavItem href="/admin/categories" label="Categorias" icon={Tags} />
                            <NavItem href="/admin/coupons" label="Cupons" icon={TicketPercent} />

                            {/* ✅ NOVO: Inbox */}
                            <NavItem href="/admin/inbox" label="Inbox" icon={Bell} rightBadge={badge} />

                            {/* ✅ já existia */}
                        </nav>

                        <div className="mt-6">
                            <Separator className="my-4" />
                            <Button variant="outline" className="w-full rounded-xl" onClick={logout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Sair
                            </Button>
                        </div>
                    </aside>

                    {/* Main */}
                    <main className="p-6">
                        <div className="mx-auto w-full max-w-6xl">{children}</div>
                    </main>
                </div>
            </div>
            <Toaster richColors />
        </AuthGuard>
    );
}
