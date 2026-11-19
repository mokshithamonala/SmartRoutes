"use client";
import { useAuthActions, useConvexAuth } from "./lib/convexAdapter";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <button
      type="button"
      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
      onClick={() => void signOut()}
    >
      Sign out
    </button>
  );
}
