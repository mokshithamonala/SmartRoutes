"use client";
import { useAuthActions } from "./lib/convexAdapter";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function SignInForm() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [submitting, setSubmitting] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      toast.success(
        flow === "signIn"
          ? "Signed in to SmartRoutes."
          : "Driver account created and signed in.",
      );
      navigate("/planner", { replace: true });
    } catch (error: any) {
      const msg =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : flow === "signIn"
            ? "Could not sign in. Check your email and password."
            : "Could not create account. Please try again.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuestSignIn = async () => {
    setErrorMessage(null);
    setGuestSubmitting(true);
    try {
      await signIn("anonymous");
      toast.success("Entered SmartRoutes in Guest mode.");
      navigate("/planner", { replace: true });
    } catch (error: any) {
      const msg =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Could not start guest session. Please try again.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setGuestSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <form className="flex flex-col gap-3" onSubmit={(e) => void handleSubmit(e)}>
        <input
          className="auth-input-field"
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          className="auth-input-field"
          type="password"
          name="password"
          placeholder={flow === "signUp" ? "Password (min 8 characters)" : "Password"}
          autoComplete={flow === "signUp" ? "new-password" : "current-password"}
          minLength={flow === "signUp" ? 8 : 1}
          required
        />
        {errorMessage && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2"
          >
            {errorMessage}
          </p>
        )}
        <button
          className="auth-button"
          type="submit"
          disabled={submitting || guestSubmitting}
        >
          {submitting
            ? flow === "signIn"
              ? "Signing in..."
              : "Creating account..."
            : flow === "signIn"
              ? "Sign in"
              : "Sign up"}
        </button>
        <div className="text-center text-xs text-slate-600 dark:text-slate-400">
          <span>
            {flow === "signIn"
              ? "Don't have an account? "
              : "Already have an account? "}
          </span>
          <button
            type="button"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium cursor-pointer"
            onClick={() => {
              setErrorMessage(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn" ? "Sign up instead" : "Sign in instead"}
          </button>
        </div>
      </form>
      <div className="flex items-center justify-center my-4">
        <hr className="grow border-slate-200 dark:border-slate-800" />
        <span className="mx-3 text-xs text-slate-500 dark:text-slate-400">or</span>
        <hr className="grow border-slate-200 dark:border-slate-800" />
      </div>
      <button
        type="button"
        disabled={submitting || guestSubmitting}
        className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-900 dark:text-slate-100 text-sm font-medium transition-colors"
        onClick={() => void handleGuestSignIn()}
      >
        {guestSubmitting ? "Starting Guest session..." : "Continue as Guest"}
      </button>
    </div>
  );
}
