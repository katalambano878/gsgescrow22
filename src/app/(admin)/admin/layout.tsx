import { LogOut } from "lucide-react";
import { AppSidebar, AppMobileNav, type NavItem } from "@/components/app-shell/sidebar";
import { LogoutButton } from "@/components/auth/logout-button";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Edge middleware has already kicked anonymous users to /admin-login. Here
  // we gate by role so a seller who somehow reaches /admin gets bounced to
  // their hub instead of seeing the control room chrome at all.
  await requireRole(["admin", "superadmin", "approver"], "/admin-login");
  const items: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: "activity" },
    { href: "/admin/users", label: "Users", icon: "users" },
    { href: "/admin/transactions", label: "Transactions", icon: "receipt" },
    { href: "/admin/disputes", label: "Disputes", icon: "shieldAlert" },
    { href: "/admin/reviews", label: "Reviews", icon: "star" },
    { href: "/admin/payouts", label: "Payouts", icon: "wallet" },
    { href: "/admin/payouts/approvals", label: "Payout Approvals", icon: "checkCircle" },
    { href: "/admin/kyc", label: "KYC Verifications", icon: "badgeCheck" },
    { href: "/admin/listings", label: "Listings", icon: "store" },
    { href: "/admin/fraud", label: "Fraud", icon: "eye" },
    { href: "/admin/riders", label: "Riders", icon: "bike" },
    { href: "/admin/reports", label: "Reports", icon: "chart" },
    { href: "/admin/sms", label: "SMS log", icon: "send" },
    { href: "/admin/sms-credit", label: "Buy SMS", icon: "wallet" },
    { href: "/admin/activity", label: "Audit log", icon: "history" },
    { href: "/admin/runbook", label: "Runbook", icon: "book" },
    { href: "/admin/settings", label: "Platform Settings", icon: "settings" },
  ];
  const footer = (
    <LogoutButton>
      <span className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-2">
        <LogOut size={14} /> Sign out
      </span>
    </LogoutButton>
  );
  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <ImpersonationBanner />
      <AppMobileNav brandSubtitle="Control room" items={items} footer={footer} />
      <div className="flex flex-1 min-w-0">
        <AppSidebar brandSubtitle="Control room" items={items} footer={footer} />
        <div className="flex-1 min-w-0 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
