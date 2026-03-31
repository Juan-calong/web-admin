"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast, Toaster } from "sonner";
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  Tags,
  LogOut,
  Bell,
  Landmark,
  Images,
  ShieldCheck,
  Clapperboard,
  Layers3,
  HeartHandshake,
  MessageSquareText,
  Megaphone,
  Truck,
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
        active
          ? "bg-black text-white shadow-sm"
          : "text-black/70 hover:bg-black/5 hover:text-black"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Icon
          className={cn(
            "h-4 w-4",
            active ? "text-white" : "text-black/50 group-hover:text-black"
          )}
        />
        <span className="truncate">{label}</span>
      </div>

      {rightBadge ? <div className="shrink-0">{rightBadge}</div> : null}
    </Link>
  );
}

async function fetchInboxUnreadCount() {
  const { data } = await api.get(endpoints.adminInbox.unreadCount);
  return data as { count: number };
}

async function fetchCommentUnreadCount() {
  const { data } = await api.get(endpoints.adminCommentNotifications.unreadCount);
  return data as { count: number };
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] leading-none text-white">
      {count}
    </span>
  );
}

function UnreadBell({ count }: { count: number }) {
  return (
    <Link href="/admin/inbox" className="relative inline-flex">
      <Button variant="outline" size="icon" className="rounded-xl">
        <Bell className="h-4 w-4" />
      </Button>

      {count > 0 ? (
        <span className="absolute -top-2 -right-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] leading-none text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = authStore.getMe();

  const hideSidebar =
    !!pathname &&
    pathname.startsWith("/admin/products/") &&
    pathname !== "/admin/products";

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

  const inboxUnread = useQuery({
    queryKey: ["admin-unread-count"],
    queryFn: fetchInboxUnreadCount,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const commentUnread = useQuery({
    queryKey: ["admin-comment-unread-count"],
    queryFn: fetchCommentUnreadCount,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const inboxUnreadCount = inboxUnread.data?.count ?? 0;
  const commentUnreadCount = commentUnread.data?.count ?? 0;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[#F7F8FA]">
        {hideSidebar ? (
          <main className="min-h-screen">{children}</main>
        ) : (
          <div className="grid min-h-screen grid-cols-[280px_1fr]">
            <aside className="border-r bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-black leading-tight">KeyFi Admin</div>
                  <div className="truncate text-xs text-black/60">
                    {me?.email ?? "Painel"}
                  </div>
                </div>

                <UnreadBell count={inboxUnreadCount} />
              </div>

              <Separator className="my-4" />

              <nav className="grid gap-1">
                <NavItem href="/admin" label="Dashboard" icon={LayoutDashboard} />
                <NavItem href="/admin/orders" label="Pedidos" icon={ShoppingBag} />
                <NavItem href="/admin/products" label="Produtos" icon={Boxes} />
                <NavItem href="/admin/categories" label="Categorias" icon={Tags} />
                <NavItem href="/admin/coupons" label="Cupons" icon={TicketPercent} />
                <NavItem
                  href="/admin/inbox"
                  label="Inbox"
                  icon={Bell}
                  rightBadge={<CountBadge count={inboxUnreadCount} />}
                />
                <NavItem href="/admin/bb-funds" label="Saldo BB" icon={Landmark} />
                <NavItem href="/admin/home-banners" label="Banners Home" icon={Images} />
                <NavItem href="/admin/security" label="Segurança" icon={ShieldCheck} />
                <NavItem href="/admin/training-videos" label="Vídeos" icon={Clapperboard} />
                <NavItem href="/admin/broadcasts" label="Broadcasts" icon={Megaphone} />
                <NavItem
                  href="/admin/quantity-discounts"
                  label="Promoções por quantidade"
                  icon={Layers3}
                />
                <NavItem
                  href="/admin/beneficiaries"
                  label="Beneficiários"
                  icon={HeartHandshake}
                />
                <NavItem
                  href="/admin/product-comments"
                  label="Comentários"
                  icon={MessageSquareText}
                  rightBadge={<CountBadge count={commentUnreadCount} />}
                />
              </nav>
              <NavItem href="/admin/shipping" label="Entrega e frete" icon={Truck} />

              <div className="mt-6">
                <Separator className="my-4" />
                <Button variant="outline" className="w-full rounded-xl" onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
              </div>
            </aside>

            <main className="p-6">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          </div>
        )}
      </div>

      <Toaster richColors />
    </AuthGuard>
  );
}