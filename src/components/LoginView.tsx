/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useId, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { GoogleSignInButton } from "./GoogleSignInButton";
import {
  buildOpenInChromeUrl,
  detectInAppBrowser,
} from "../utils/inAppBrowser";

import { auth } from "../services/firebase";
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
} from "firebase/auth";
import { Customer } from "../types";
import { FirebaseCustomerAuth } from "../services/firebaseCustomerAuth";
import {
  GUEST_UPLOAD_TRANSFER_REQUIRED_MESSAGE,
  guestUploadedDesignOwnershipContinuity,
} from "../services/guestUploadedDesignOwnershipContinuity";
import { designStylePrecanonicalUploadCleanupCoordinator } from "../utils/designStylePrecanonicalUploadCleanup";

interface LoginViewProps {
  onLogin: (customer: Customer) => void;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  checkoutMode?: boolean;
  onCancel?: () => void;
}

export default function LoginView({
  onLogin,
  checkoutMode = false,
  onCancel,
}: LoginViewProps) {
  // Navigation active login/register mode: 'login' | 'register'
  const [activeMode, setActiveMode] = useState<"login" | "register">("login");
  const [pendingAction, setPendingAction] = useState<
    "pin-login" | "register" | "google" | null
  >(null);
  const isBusy = pendingAction !== null;

  // Sign In inputs
  const [loginIdentifier, setLoginIdentifier] = useState(""); // can be email or phone
  const [loginPasscode, setLoginPasscode] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [pendingAuthenticatedCustomer, setPendingAuthenticatedCustomer] =
    useState<Customer | null>(null);
  const [isTransferringGuestDesign, setIsTransferringGuestDesign] =
    useState(false);

  const prepareGuestUploadTransition = async (): Promise<boolean> => {
    const precanonicalPreparation =
      await designStylePrecanonicalUploadCleanupCoordinator.prepareForAuthTransition(
        () => auth.currentUser,
      );
    if (precanonicalPreparation.status === "blocked") {
      setError(GUEST_UPLOAD_TRANSFER_REQUIRED_MESSAGE);
      return false;
    }
    const preparation =
      await guestUploadedDesignOwnershipContinuity.prepare(auth.currentUser);
    if (preparation.status === "transfer_required") {
      setError(GUEST_UPLOAD_TRANSFER_REQUIRED_MESSAGE);
      return false;
    }
    return true;
  };

  const finishAuthenticatedLogin = async (
    customer: Customer,
  ): Promise<boolean> => {
    const identity = auth.currentUser;
    if (!identity || identity.isAnonymous) {
      setError("Secure account authentication could not be confirmed.");
      return false;
    }
    setIsTransferringGuestDesign(true);
    try {
      const continuity =
        await guestUploadedDesignOwnershipContinuity.ensure(identity);
      if (continuity.status === "transfer_required") {
        setPendingAuthenticatedCustomer(customer);
        setError(GUEST_UPLOAD_TRANSFER_REQUIRED_MESSAGE);
        return false;
      }
      setPendingAuthenticatedCustomer(null);
      onLogin(customer);
      return true;
    } finally {
      setIsTransferringGuestDesign(false);
    }
  };

  const handleRetryGuestDesignTransfer = async () => {
    if (!pendingAuthenticatedCustomer) return;
    setError("");
    const completed = await finishAuthenticatedLogin(
      pendingAuthenticatedCustomer,
    );
    if (completed) {
      setSuccessMsg(
        `Welcome back, ${pendingAuthenticatedCustomer.name}!`,
      );
    }
  };

  // Register inputs (Common / Email)
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPIN, setRegPIN] = useState("");

  // Handle Sign In submission
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginIdentifier.trim()) {
      setError("Please enter your registered email address or phone number.");
      return;
    }
    if (!/^(?:\d{4}|\d{6})$/.test(loginPasscode)) {
      setError("Please enter your 4-digit or 6-digit security PIN.");
      return;
    }

    if (isBusy) return;
    setPendingAction("pin-login");
    try {
      if (!(await prepareGuestUploadTransition())) return;
      const customer = await FirebaseCustomerAuth.signInWithPin(
        loginIdentifier.trim(),
        loginPasscode,
      );
      if (await finishAuthenticatedLogin(customer)) {
        setSuccessMsg(`Welcome back, ${customer.name}!`);
      }
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Secure login failed. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isBusy) return;
    setPendingAction("google");
    try {
      setError("");
      const provider = new GoogleAuthProvider();
      const existingIdentity = auth.currentUser;
      let result;
      if (existingIdentity?.isAnonymous) {
        try {
          result = await linkWithPopup(existingIdentity, provider);
        } catch (linkError) {
          const code =
            linkError && typeof linkError === "object" && "code" in linkError
              ? String((linkError as { code?: unknown }).code)
              : "";
          const credential = GoogleAuthProvider.credentialFromError(
            linkError as Parameters<
              typeof GoogleAuthProvider.credentialFromError
            >[0],
          );
          if (
            !credential ||
            (code !== "auth/credential-already-in-use" &&
              code !== "auth/email-already-in-use")
          ) {
            throw linkError;
          }
          if (!(await prepareGuestUploadTransition())) return;
          result = await signInWithCredential(auth, credential);
        }
      } else {
        if (!(await prepareGuestUploadTransition())) return;
        result = await signInWithPopup(auth, provider);
      }
      const customer = await FirebaseCustomerAuth.bootstrap(result.user);
      if (await finishAuthenticatedLogin(customer)) {
        setSuccessMsg(`Session activated: ${customer.name}`);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      let friendlyMessage = "Google login failed. Please try again or contact support.";
      if (err.code === "auth/unauthorized-domain") {
        friendlyMessage = "This website domain is not authorized for Google login yet. Add this exact domain in Firebase Authentication > Settings > Authorized domains.";
      } else if (err.code === "auth/operation-not-allowed") {
        friendlyMessage = "Google login is not enabled yet. Please contact support.";
      } else if (err.code === "auth/popup-blocked") {
        friendlyMessage = "Your browser blocked the Google login window. Please allow popups and try again.";
      } else if (err.code === "auth/popup-closed-by-user") {
        friendlyMessage = "Google login was cancelled. Please try again.";
      } else if (err.code === "auth/network-request-failed") {
        friendlyMessage = "Network issue. Please check your connection and try again.";
      } else if (err.code === "AUTH_SERVER_UNAVAILABLE") {
        friendlyMessage =
          typeof err.message === "string" && err.message.trim()
            ? err.message
            : "Authentication server is temporarily unavailable. Please try again.";
      }
      if (
        inAppBrowser &&
        (err.code === "auth/popup-blocked" ||
          err.code === "auth/operation-not-supported-in-this-environment" ||
          err.code === "auth/web-storage-unsupported")
      ) {
        friendlyMessage = `Google sign-in can't open inside the ${inAppBrowser.appName} browser. Open this page in your phone's browser, or use your email below.`;
      }
      setError(friendlyMessage);
    } finally {
      setPendingAction(null);
    }
  };

  
  // Register with Email
  const handleRegisterEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!regName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!regEmail.trim()) {
      setError("Please enter an email address.");
      return;
    }
    if (!regEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!/^\d{6}$/.test(regPIN)) {
      setError("Please set a 6-digit security PIN.");
      return;
    }

    if (isBusy) return;
    setPendingAction("register");
    try {
      if (!(await prepareGuestUploadTransition())) return;
      const customer = await FirebaseCustomerAuth.registerWithPin({
        name: regName.trim(),
        email: regEmail.trim(),
        pin: regPIN,
      });
      if (await finishAuthenticatedLogin(customer)) {
        setSuccessMsg("Account created successfully!");
      }
    } catch (registrationError) {
      setError(
        registrationError instanceof Error
          ? registrationError.message
          : "Secure account creation failed. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const fieldIds = useId();
  const ids = {
    loginTab: `${fieldIds}-tab-login`,
    registerTab: `${fieldIds}-tab-register`,
    loginPanel: `${fieldIds}-panel-login`,
    registerPanel: `${fieldIds}-panel-register`,
    loginEmail: `${fieldIds}-login-email`,
    loginPin: `${fieldIds}-login-pin`,
    loginPinHint: `${fieldIds}-login-pin-hint`,
    regName: `${fieldIds}-register-name`,
    regEmail: `${fieldIds}-register-email`,
    regPin: `${fieldIds}-register-pin`,
    regPinHint: `${fieldIds}-register-pin-hint`,
  };
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);

  const inAppBrowser = useMemo(
    () =>
      typeof navigator === "undefined"
        ? null
        : detectInAppBrowser(navigator.userAgent),
    [],
  );
  const [linkCopied, setLinkCopied] = useState(false);
  const pageUrl = typeof window === "undefined" ? "" : window.location.href;
  const openInChromeUrl =
    inAppBrowser?.isAndroid && pageUrl ? buildOpenInChromeUrl(pageUrl) : null;
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setLinkCopied(true);
    } catch {
      setLinkCopied(false);
    }
  };

  const switchMode = (mode: "login" | "register", moveFocus = false) => {
    setActiveMode(mode);
    setError("");
    if (moveFocus) {
      (mode === "login" ? loginTabRef : registerTabRef).current?.focus();
    }
  };
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowLeft" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? "login"
          : event.key === "End"
            ? "register"
            : activeMode === "login"
              ? "register"
              : "login";
      switchMode(next, true);
    }
  };

  const labelClass = "block text-sm font-medium text-heritage-ink/80";
  const inputClass =
    "block w-full pl-10 pr-4 py-3 bg-heritage-cream/40 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink disabled:opacity-60";
  const primaryButtonClass =
    "w-full mt-2 min-h-11 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 py-3 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
  const tabClass = (selected: boolean) =>
    `flex-1 min-h-11 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-heritage-gold ${
      selected
        ? "bg-white text-heritage-green border-b-2 border-heritage-gold"
        : "text-heritage-ink/70 hover:text-heritage-green hover:bg-white/50"
    }`;

  return (
    <div className="max-w-md mx-auto my-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-3xl border border-heritage-gold/20 bg-white overflow-hidden shadow-xl"
      >
        {/* Immersive Header Backdrop */}
        <div className="bg-heritage-green p-8 text-center border-b border-heritage-gold/20 relative overflow-hidden flex flex-col items-center justify-center">
          {/* Subtle decorative vector lines */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#C5A85C_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="relative mb-4">
            <img
              loading="lazy"
              src={odogwuLogo}
              alt="The Odogwu Heritage Logo"
              className="w-16 h-16 rounded-full border border-heritage-gold/35 object-cover shadow-lg bg-heritage-forest"
              referrerPolicy="no-referrer"
            />
          </div>

          <span className="relative inline-flex items-center gap-1.5 px-3 py-1 bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 rounded-full text-xs font-semibold mb-3">
            <ShieldCheck size={12} aria-hidden="true" /> Secure portal
          </span>
          <h2 className="relative text-2xl font-display font-bold text-white tracking-tight">
            Customer Login
          </h2>
          <p className="relative text-sm text-heritage-beige/90 mt-1.5 leading-relaxed max-w-xs mx-auto">
            {checkoutMode
              ? "Sign in or create an account to securely complete your order."
              : "Log in or create an account."}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div
              role="alert"
              className="mb-5 p-3 bg-red-50 text-red-800 text-sm rounded-xl border border-red-200 flex items-start gap-2"
            >
              <span className="mt-0.5" aria-hidden="true"><XCircle size={16} /></span>
              <div className="min-w-0 flex-1">
                <span className="block leading-snug">{error}</span>
                {pendingAuthenticatedCustomer && (
                  <button
                    type="button"
                    disabled={isTransferringGuestDesign}
                    onClick={() => void handleRetryGuestDesignTransfer()}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={14} aria-hidden="true" />
                    {isTransferringGuestDesign
                      ? "Securing Design..."
                      : "Retry Secure Design Transfer"}
                  </button>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div
              role="status"
              className="mb-5 p-3 bg-green-50 text-green-800 text-sm rounded-xl border border-green-200 flex items-start gap-2"
            >
              <span className="mt-0.5" aria-hidden="true"><CheckCircle2 size={16} /></span>
              <span className="flex-1 leading-snug">{successMsg}</span>
            </div>
          )}

          {inAppBrowser && (
            <div
              data-testid="in-app-browser-notice"
              className="mb-4 rounded-xl border border-heritage-gold/40 bg-heritage-cream/40 p-3 text-sm text-heritage-ink"
            >
              <p className="leading-snug">
                Google sign-in may not work inside the {inAppBrowser.appName}{" "}
                browser.{" "}
                {inAppBrowser.isIos
                  ? "Tap the menu (… or ⋯) and choose “Open in browser”, "
                  : "Open this page in your browser, "}
                or use your email below.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {openInChromeUrl && (
                  <a
                    href={openInChromeUrl}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-heritage-gold/50 bg-white px-3 text-sm font-semibold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Open in Chrome
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-heritage-gold/50 bg-white px-3 text-sm font-semibold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
                >
                  <Copy size={14} aria-hidden="true" />
                  {linkCopied ? "Link copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}

          <GoogleSignInButton
            onClick={() => void handleGoogleSignIn()}
            loading={pendingAction === "google"}
            disabled={isBusy}
          />

          <div className="relative flex items-center my-5">
            <div className="flex-grow border-t border-gray-200" />
            <span className="flex-shrink mx-3 text-sm text-heritage-ink/70">
              or use your email and PIN
            </span>
            <div className="flex-grow border-t border-gray-200" />
          </div>

          {/* Dual Mode Tab Selector */}
          <div
            role="tablist"
            aria-label="Log in or create an account"
            className="flex border-b border-gray-100 bg-heritage-cream/10 -mx-6 mb-5"
          >
            <button
              ref={loginTabRef}
              type="button"
              role="tab"
              id={ids.loginTab}
              aria-selected={activeMode === "login"}
              aria-controls={ids.loginPanel}
              tabIndex={activeMode === "login" ? 0 : -1}
              onClick={() => switchMode("login")}
              onKeyDown={handleTabKeyDown}
              className={tabClass(activeMode === "login")}
            >
              <Lock size={14} aria-hidden="true" /> Log in
            </button>
            <button
              ref={registerTabRef}
              type="button"
              role="tab"
              id={ids.registerTab}
              aria-selected={activeMode === "register"}
              aria-controls={ids.registerPanel}
              tabIndex={activeMode === "register" ? 0 : -1}
              onClick={() => switchMode("register")}
              onKeyDown={handleTabKeyDown}
              className={tabClass(activeMode === "register")}
            >
              <User size={14} aria-hidden="true" /> Create account
            </button>
          </div>

          {/* MODE 1: LOGIN */}
          {activeMode === "login" && (
            <form
              onSubmit={handleSignIn}
              className="space-y-4"
              role="tabpanel"
              id={ids.loginPanel}
              aria-labelledby={ids.loginTab}
              aria-busy={pendingAction === "pin-login" || undefined}
            >
              <div className="space-y-1.5">
                <label htmlFor={ids.loginEmail} className={labelClass}>
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/40">
                    <Mail size={16} aria-hidden="true" />
                  </div>
                  <input
                    id={ids.loginEmail}
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="johndoe@gmail.com"
                    disabled={isBusy}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor={ids.loginPin} className={labelClass}>
                    4- or 6-digit security PIN
                  </label>
                  <span className="text-xs text-heritage-gold hover:text-heritage-green cursor-pointer transition-colors">
                    Forgot PIN?
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/40">
                    <Lock size={16} aria-hidden="true" />
                  </div>
                  <input
                    id={ids.loginPin}
                    name="password"
                    type="password"
                    inputMode="numeric"
                    autoComplete="current-password"
                    maxLength={6}
                    aria-describedby={ids.loginPinHint}
                    value={loginPasscode}
                    onChange={(e) =>
                      setLoginPasscode(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="4 or 6 digits"
                    disabled={isBusy}
                    className={`${inputClass} font-mono tracking-widest`}
                  />
                </div>
                <p id={ids.loginPinHint} className="sr-only">
                  Numbers only, 4 or 6 digits.
                </p>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                aria-busy={pendingAction === "pin-login" || undefined}
                className={primaryButtonClass}
              >
                {pendingAction === "pin-login" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODE 2: CREATE ACCOUNT */}
          {activeMode === "register" && (
            <form
              onSubmit={handleRegisterEmail}
              className="space-y-4"
              role="tabpanel"
              id={ids.registerPanel}
              aria-labelledby={ids.registerTab}
              aria-busy={pendingAction === "register" || undefined}
            >
              <div className="space-y-1.5">
                <label htmlFor={ids.regName} className={labelClass}>
                  Full name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/40">
                    <User size={16} aria-hidden="true" />
                  </div>
                  <input
                    id={ids.regName}
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="John Doe"
                    disabled={isBusy}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={ids.regEmail} className={labelClass}>
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/40">
                    <Mail size={16} aria-hidden="true" />
                  </div>
                  <input
                    id={ids.regEmail}
                    name="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="johndoe@gmail.com"
                    disabled={isBusy}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={ids.regPin} className={labelClass}>
                  Choose a 6-digit security PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/40">
                    <Lock size={16} aria-hidden="true" />
                  </div>
                  <input
                    id={ids.regPin}
                    name="new-password"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    aria-describedby={ids.regPinHint}
                    value={regPIN}
                    onChange={(e) =>
                      setRegPIN(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Choose code (e.g. 123456)"
                    disabled={isBusy}
                    className={`${inputClass} font-mono tracking-widest`}
                  />
                </div>
                <p id={ids.regPinHint} className="sr-only">
                  Numbers only, exactly 6 digits.
                </p>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                aria-busy={pendingAction === "register" || undefined}
                className={primaryButtonClass}
              >
                {pendingAction === "register" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create my account <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          )}

          {checkoutMode && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full mt-4 min-h-11 py-2 text-sm font-semibold text-heritage-green hover:text-heritage-gold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold rounded-lg"
            >
              Back to Cart
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
