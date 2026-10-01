export default function MaintenanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-[100dvh] bg-[#0F0A1A]">{children}</div>;
}
