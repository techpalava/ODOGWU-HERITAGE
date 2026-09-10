/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { motion } from "motion/react";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import {
  ShieldCheck,
  Mail,
  Lock,
  User,
  ArrowRight,
  Smartphone,
  Check,
  CheckCircle2,
  XCircle,
  RefreshCw,
  } from "lucide-react";

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
  const [regMethod] = useState<"email" | "phone">("email");

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
  const [regPhone, setRegPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+234");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [otpSent] = useState(false);
  const [otpTimer] = useState(0);
  const [otpVerified] = useState(false);
  const [isVerifyingOtp] = useState(false);

  // Handle Sign In submission
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginIdentifier.trim()) {
      setError("Please enter your registered email address or phone number.");
      return;
    }
    if (!loginPasscode) {
      setError("Please enter your 4-digit security PIN.");
      return;
    }

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
    }
  };

  const handleGoogleSignIn = async () => {
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
      }
      setError(friendlyMessage);
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
    if (regPIN.length < 4) {
      setError("Please set a 4-digit security PIN.");
      return;
    }

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
    }
  };

  const handleRegisterPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setError(
      "Phone registration is unavailable until Firebase SMS authentication is enabled. Please use Google or email registration.",
    );
  };

  const triggerSendOtp = () => {
    setError(
      "Phone registration is unavailable until Firebase SMS authentication is enabled.",
    );
  };

  const handleVerifyOtp = () => {
    setError(
      "Phone registration is unavailable until Firebase SMS authentication is enabled.",
    );
  };

  ;

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

          <span className="relative inline-flex items-center gap-1.5 px-3 py-1 bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 rounded-full text-[10px] font-bold uppercase tracking-widest mb-3">
            <ShieldCheck size={12} /> Secure Portal
          </span>
          <h2 className="relative text-2xl font-display font-bold text-white tracking-tight">
            Customer Login
          </h2>
          <p className="relative text-xs text-heritage-beige/80 mt-1.5 leading-relaxed max-w-xs mx-auto">
            {checkoutMode
              ? "Sign in or create an account to securely complete your order."
              : "Log in or create an account."}
          </p>
        </div>

        {checkoutMode && (
          <div className="p-6 pb-2 bg-white">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-3.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
            <div className="relative flex items-center mt-5">
              <div className="flex-grow border-t border-gray-150" />
              <span className="flex-shrink mx-3 text-[9px] text-heritage-ink/40 font-bold uppercase tracking-wider">
                Or use email and PIN
              </span>
              <div className="flex-grow border-t border-gray-150" />
            </div>
          </div>
        )}

        {/* Dual Mode Tab Selector */}
        <div className="flex border-b border-gray-100 bg-heritage-cream/10">
          <button
            type="button"
            onClick={() => {
              setActiveMode("login");
              setError("");
            }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${
              activeMode === "login"
                ? "bg-white text-heritage-green border-b-2 border-heritage-gold"
                : "text-heritage-ink/50 hover:text-heritage-green hover:bg-white/50"
            }`}
          >
            <Lock size={14} /> Log In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("register");
              setError("");
            }}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${
              activeMode === "register"
                ? "bg-white text-heritage-green border-b-2 border-heritage-gold"
                : "text-heritage-ink/50 hover:text-heritage-green hover:bg-white/50"
            }`}
          >
            <User size={14} /> Create Account
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-3 bg-red-50 text-red-700 text-[10px] uppercase font-bold tracking-wider rounded-xl border border-red-200 flex items-start gap-2">
              <span className="mt-0.5"><XCircle size={14} /></span>
              <div className="min-w-0 flex-1">
                <span className="block leading-snug">{error}</span>
                {pendingAuthenticatedCustomer && (
                  <button
                    type="button"
                    disabled={isTransferringGuestDesign}
                    onClick={() => void handleRetryGuestDesignTransfer()}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    {isTransferringGuestDesign
                      ? "Securing Design..."
                      : "Retry Secure Design Transfer"}
                  </button>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-3 bg-green-50 text-green-700 text-[10px] uppercase font-bold tracking-wider rounded-xl border border-green-200 flex items-start gap-2">
              <span className="mt-0.5"><CheckCircle2 size={14} /></span>
              <span className="flex-1 leading-snug">{successMsg}</span>
            </div>
          )}

          {/* MODE 1: LOGIN */}
          {activeMode === "login" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                    <Mail size={14} />
                  </div>
                  <input
                    type="email"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="johndoe@gmail.com"
                    className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                    Security PIN
                  </label>
                  <span className="text-[9px] text-heritage-gold hover:text-heritage-green cursor-pointer transition-colors">
                    Forgot PIN?
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                    <Lock size={14} />
                  </div>
                  <input
                    type="password"
                    maxLength={4}
                    value={loginPasscode}
                    onChange={(e) =>
                      setLoginPasscode(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="••••"
                    className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-mono tracking-widest font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                Sign In <ArrowRight size={12} />
              </button>
            </form>
          )}

          {/* MODE 2: CREATE ACCOUNT */}
          {activeMode === "register" && (
            <div className="space-y-5">
              <form onSubmit={handleRegisterEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                        <User size={14} />
                      </div>
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="John Doe"
                        className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                        <Mail size={14} />
                      </div>
                      <input
                        type="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="johndoe@gmail.com"
                        className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Choose 4-Digit Security PIN
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                        <Lock size={14} />
                      </div>
                      <input
                        type="password"
                        maxLength={4}
                        value={regPIN}
                        onChange={(e) =>
                          setRegPIN(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="Choose code (e.g. 1234)"
                        className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-mono tracking-widest font-bold"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    Create My Account <ArrowRight size={12} />
                  </button>
              </form>

              

              {/* SUBMODE C: PHONE NUMBER SIGN UP WITH OTP */}
              {regMethod === "phone" && (
                <form onSubmit={handleRegisterPhone} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                        <User size={14} />
                      </div>
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="Mary Alabi"
                        className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Mobile Phone Number
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="px-2 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs font-bold text-heritage-green focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      >
                        <option value="+234">🇳🇬 +234</option>
                        <option value="+31">🇳🇱 +31</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                      </select>
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-heritage-ink/30">
                          <Smartphone size={14} />
                        </div>
                        <input
                          type="tel"
                          value={regPhone}
                          onChange={(e) =>
                            setRegPhone(e.target.value.replace(/\D/g, ""))
                          }
                          placeholder="8012345678"
                          className="block w-full pl-9 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                      Choose 4-Digit Security PIN
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-heritage-ink/30">
                        <Lock size={14} />
                      </div>
                      <input
                        type="password"
                        maxLength={4}
                        value={regPIN}
                        onChange={(e) =>
                          setRegPIN(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="Choose PIN code"
                        className="block w-full pl-10 pr-4 py-2.5 bg-heritage-cream/40 border border-gray-250 rounded-xl text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink font-mono tracking-widest font-bold"
                      />
                    </div>
                  </div>

                  {/* Simulated OTP Section */}
                  <div className="p-3.5 rounded-xl border border-heritage-gold/10 bg-heritage-cream/15 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] uppercase font-bold text-heritage-ink/60 tracking-wider flex items-center gap-1">
                        <ShieldCheck size={12} className="text-heritage-gold" />{" "}
                        Mobile Verification OTP
                      </span>
                      {otpSent && !otpVerified && (
                        <span className="text-[9px] font-mono font-bold text-heritage-gold">
                          Expires in {otpTimer}s
                        </span>
                      )}
                    </div>

                    {!otpSent ? (
                      <button
                        type="button"
                        onClick={triggerSendOtp}
                        className="w-full bg-heritage-cream border border-heritage-gold/30 text-heritage-green hover:bg-white transition-all py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Request Mobile OTP Verification
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {otpVerified ? (
                          <div className="flex items-center gap-2 text-green-700 text-[10px] font-bold">
                            <Check
                              size={14}
                              className="p-0.5 bg-green-100 rounded-full"
                            />
                            <span>
                              Phone Verified successfully via secure gateway.
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              maxLength={4}
                              value={phoneOtp}
                              onChange={(e) =>
                                setPhoneOtp(e.target.value.replace(/\D/g, ""))
                              }
                              placeholder="Enter SMS verification code"
                              className="flex-1 px-3 py-1.5 bg-white border rounded-lg text-xs font-mono font-bold text-center tracking-widest focus:outline-none focus:border-heritage-gold"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyOtp}
                              disabled={isVerifyingOtp}
                              className="px-4 bg-heritage-green text-white rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-heritage-gold hover:text-heritage-forest transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              {isVerifyingOtp ? (
                                <RefreshCw size={10} className="animate-spin" />
                              ) : (
                                "Verify"
                              )}
                            </button>
                          </div>
                        )}
                        {!otpVerified && (
                          <p className="text-[8px] text-heritage-ink/50 leading-tight">
                            Phone registration requires verified Firebase SMS
                            authentication.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!otpVerified}
                    className="w-full mt-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest disabled:opacity-50 disabled:pointer-events-none transition duration-300 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    Create My Account <ArrowRight size={12} />
                  </button>
                </form>
              )}
            </div>
          )}

          {!checkoutMode && (
          <div className="space-y-3 pt-2">
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-gray-150"></div>
              <span className="flex-shrink mx-3 text-[9px] text-heritage-ink/40 font-bold uppercase tracking-wider">
                Or continue with
              </span>
              <div className="flex-grow border-t border-gray-150"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm cursor-pointer mt-2"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>
          </div>
          )}

          {checkoutMode && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full mt-4 py-2 text-[10px] font-bold uppercase tracking-wider text-heritage-green hover:text-heritage-gold cursor-pointer"
            >
              Back to Cart
            </button>
          )}
        </div>
      </motion.div>

      
    </div>
  );
}
