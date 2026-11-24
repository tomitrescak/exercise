"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dumbbell, History, House, Images, ListChecks, LogOut, MessageSquare, UserRound } from "lucide-react";
import { api } from "@/lib/client/api";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/", label: "Home", icon: House },
  { href: "/routines", label: "Routines", icon: ListChecks },
  { href: "/coach", label: "Coach", icon: MessageSquare },
  { href: "/history", label: "History", icon: History },
  { href: "/photos", label: "Photos", icon: Images },
  { href: "/profile", label: "Profile", icon: UserRound },
];

const hidden = (pathname: string) => pathname === "/login" || pathname.startsWith("/workout/");
const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  if (hidden(pathname)) return null;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
        <Link href="/" className="mr-3 flex items-center gap-2 font-semibold">
          <Dumbbell className="size-5 text-accent" /> Coach
        </Link>
        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm whitespace-nowrap",
                isActive(pathname, l.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <button onClick={logout} className="ml-auto rounded-md p-2 text-muted hover:text-foreground" title="Log out" aria-label="Log out">
          <LogOut className="size-4" />
        </button>
      </nav>
    </header>
  );
}

/** Bottom tab bar for phones; the spacer keeps page content clear of it. */
export function MobileTabs() {
  const pathname = usePathname();
  if (hidden(pathname)) return null;
  return (
    <>
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", active ? "font-medium text-accent" : "text-muted")}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
