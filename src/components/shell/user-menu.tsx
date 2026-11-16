import { LogOut } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";
import { signOut } from "@/lib/actions/auth";
import { Avatar } from "./avatar";
import { t } from "@/i18n";

export async function SidebarUser() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-paper/5 p-2.5">
      <Link href="/ayarlar" className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={user.fullName ?? user.email} url={user.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-paper">{user.fullName ?? t.nav.settings}</span>
          <span className="block truncate text-xs text-paper/50">{user.email}</span>
        </span>
      </Link>
      <form action={signOut}>
        <button type="submit" className="grid size-9 place-items-center rounded-xl text-paper/60 hover:bg-paper/10 hover:text-paper"
          aria-label={t.nav.signOut} title={t.nav.signOut}>
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}

export async function MobileHeaderAvatar() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <Link href="/ayarlar" aria-label={t.nav.settings}>
      <Avatar name={user.fullName ?? user.email} url={user.avatarUrl} size="sm" />
    </Link>
  );
}
