"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { normalizeGhPhone } from "@/lib/utils";
import { Mail, KeyRound, Phone, Lock, User } from "lucide-react";
import { postLoginRedirect } from "@/lib/actions/post-login";
import { claimPendingSellerOrders } from "@/lib/actions/claim-orders";
import {
  requestPhoneOtp,
  verifyPhoneOtp,
  requestEmailOtp,
  verifyEmailOtp,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/actions/auth";

type Mode = "phone" | "password" | "email";

/**
 * Unified login / signup form.
 *
 *   - `mode="login"` (default): phone OTP, email+password sign-in, email OTP fallback.
 *   - `mode="signup"`: phone OTP (creates user), email+password sign-up, email OTP.
 */
export function LoginForm({
  next,
  authLive,
  intent = "login",
  claimToken = null,
}: {
  next?: string;
  authLive: boolean;
  intent?: "login" | "signup";
  claimToken?: string | null;
}) {
  const [tab, setTab] = useState<Mode>("phone");
  const [step, setStep] = useState<"enter" | "code">("enter");

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [normalisedPhone, setNormalisedPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = intent === "signup";

  function resetCode() {
    setStep("enter");
    setCode("");
  }

  async function finishAndRedirect() {
    if (claimToken) {
      try {
        const res = await claimPendingSellerOrders({ token: claimToken });
        if (res.ok && res.claimed > 0) {
          toast.success(
            res.claimed === 1
              ? "Order claimed and added to your Hub"
              : `${res.claimed} orders added to your Hub`,
          );
        }
      } catch {
        // Best-effort
      }
    }
    if (claimToken) {
      try {
        const payload = JSON.parse(
          atob(claimToken.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/") + "=="),
        ) as { ref?: string };
        if (payload.ref) {
          window.location.assign(`/hub/transactions/${payload.ref}`);
          return;
        }
      } catch {
        // fall through
      }
    }
    window.location.assign(await postLoginRedirect(next));
  }

  function requireAuth() {
    if (!authLive) {
      toast.error("Auth is not configured — set AUTH_SECRET (32+ chars) in the environment");
      return false;
    }
    return true;
  }

  async function handlePhoneStart() {
    if (!requireAuth()) return;
    const norm = normalizeGhPhone(phone);
    if (!norm) {
      toast.error("Enter a valid Ghana phone (024xxxxxxx or +233…)");
      return;
    }
    setBusy(true);
    try {
      const res = await requestPhoneOtp({
        phone: norm,
        displayName: displayName || undefined,
        intent,
      });
      if (!res.ok) throw new Error(res.error);
      setNormalisedPhone(norm);
      toast.success("Code sent — check your SMS");
      setStep("code");
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoneVerify() {
    if (!requireAuth()) return;
    if (code.length < 6) {
      toast.error("Enter the 6-digit code from your SMS");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyPhoneOtp({
        phone: normalisedPhone,
        code,
        displayName: displayName || undefined,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(isSignup ? "Welcome to SBBS" : "Signed in");
      await finishAndRedirect();
    } catch (err) {
      toast.error((err as Error).message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailStart() {
    if (!requireAuth()) return;
    if (!email) {
      toast.error("Enter your email");
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmailOtp({
        email,
        displayName: displayName || undefined,
        intent,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Check your email for a 6-digit code");
      setStep("code");
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailVerify() {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const res = await verifyEmailOtp({
        email,
        code,
        displayName: displayName || undefined,
      });
      if (!res.ok) throw new Error(res.error);
      toast.success(isSignup ? "Welcome to SBBS" : "Signed in");
      await finishAndRedirect();
    } catch (err) {
      toast.error((err as Error).message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordSubmit() {
    if (!requireAuth()) return;
    if (!email || !password) {
      toast.error("Enter email and password");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      const res = isSignup
        ? await signUpWithPassword({
            email,
            password,
            displayName: displayName || undefined,
          })
        : await signInWithPassword({ email, password });
      if (!res.ok) throw new Error(res.error);
      toast.success(isSignup ? "Account created" : "Signed in");
      await finishAndRedirect();
    } catch (err) {
      toast.error((err as Error).message ?? "Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  function onPrimaryClick() {
    if (step === "code") {
      if (tab === "phone") handlePhoneVerify();
      else handleEmailVerify();
      return;
    }
    if (tab === "phone") handlePhoneStart();
    else if (tab === "email") handleEmailStart();
    else handlePasswordSubmit();
  }

  const primaryCta = (() => {
    if (step === "code") return "Verify and continue";
    if (tab === "phone") return "Send SMS code";
    if (tab === "email") return "Send email code";
    return isSignup ? "Create account" : "Sign in";
  })();

  return (
    <div className="space-y-4">
      {step === "enter" && (
        <div className="flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-muted)]/60 p-1 text-xs font-semibold">
          <TabButton active={tab === "phone"} onClick={() => setTab("phone")}>
            <Phone size={12} /> Phone
          </TabButton>
          <TabButton active={tab === "password"} onClick={() => setTab("password")}>
            <Lock size={12} /> Password
          </TabButton>
          <TabButton active={tab === "email"} onClick={() => setTab("email")}>
            <Mail size={12} /> Email code
          </TabButton>
        </div>
      )}

      {step === "enter" && isSignup && (
        <div>
          <Label htmlFor="displayName">Name (optional)</Label>
          <Input
            id="displayName"
            type="text"
            placeholder="Ama Asare"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            leading={<User size={14} />}
          />
          <p className="text-[11px] text-[var(--muted)] mt-1">
            Shown to buyers on your public profile. You can change it anytime.
          </p>
        </div>
      )}

      {step === "enter" && tab === "phone" && (
        <div>
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            placeholder="024xxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            leading={<Phone size={14} />}
          />
        </div>
      )}

      {step === "enter" && (tab === "password" || tab === "email") && (
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leading={<Mail size={14} />}
          />
        </div>
      )}

      {step === "enter" && tab === "password" && (
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leading={<Lock size={14} />}
          />
        </div>
      )}

      {step === "code" && (
        <div>
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            leading={<KeyRound size={14} />}
          />
          <button
            type="button"
            className="mt-2 text-xs text-[var(--muted)] underline"
            onClick={resetCode}
          >
            Use a different {tab === "phone" ? "number" : "email"}
          </button>
        </div>
      )}

      <Button type="button" className="w-full" disabled={busy} onClick={onPrimaryClick}>
        {busy ? "Please wait…" : primaryCta}
      </Button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 transition",
        active
          ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--ink)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
