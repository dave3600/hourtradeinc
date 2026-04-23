import { CrossDeviceSync } from "@/components/CrossDeviceSync";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CrossDeviceSync />
      {children}
    </>
  );
}
