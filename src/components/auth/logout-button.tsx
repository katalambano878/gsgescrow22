"use client";

import { logoutAction } from "@/lib/actions/auth";

export function LogoutButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={async () => {
        try {
          await logoutAction();
        } finally {
          window.location.assign("/");
        }
      }}
    >
      {children}
    </button>
  );
}
