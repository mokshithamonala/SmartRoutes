"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthActions, useAuthSession, useConvexAuth } from "./lib/convexAdapter";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { isGuest } = useAuthSession();
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success(isGuest ? "Exited Guest session." : "Signed out.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <button
      type="button"
      disabled={signingOut}
      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
      onClick={() => void handleSignOut()}
    >
      {signingOut ? "Signing out..." : isGuest ? "Sign in / Exit Guest" : "Sign out"}
    </button>
  );
}
