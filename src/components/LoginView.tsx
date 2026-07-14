/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
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
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { Customer } from "../types";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";

interface LoginViewProps {
  onLogin: (email: string, name: string, phone?: string) => void;
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
}

export default function LoginView({
  onLogin,
  customers,
  setCustomers,
}: LoginViewProps) {
  // Navigation active login/register mode: 'login' | 'register'
  const [activeMode, setActiveMode] = useState<"login" | "register">("login");

  // Registration sub-methods: 'email' | 'gmail' | 'phone'
  const [regMethod, setRegMethod] = useState<"email" | "phone">(
    "email",
  );

  // Synchronized state with parent customers database
  const accounts = customers;
  const setAccounts = (
    updated: Customer[] | ((prev: Customer[]) => Customer[]),
  ) => {
    if (typeof updated === "function") {
      setCustomers(updated);
    } else {
      setCustomers(updated);
    }
  };

  // Sign In inputs
  const [loginIdentifier, setLoginIdentifier] = useState(""); // can be email or phone
  const [loginPasscode, setLoginPasscode] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Register inputs (Common / Email)
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPIN, setRegPIN] = useState("");

  // Register inputs (Phone)
  const [regPhone, setRegPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+234"); // default Nigeria/Lagos
  const [phoneOtp, setPhoneOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(60);
  const [otpVerified, setOtpVerified] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // OTP Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpSent && otpTimer > 0 && !otpVerified) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpSent, otpTimer, otpVerified]);

  // Handle Sign In submission
  const handleSignIn = (e: React.FormEvent) => {
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

    const cleanId = loginIdentifier.trim().toLowerCase();

    // Search in accounts database
    const match = accounts.find((acc) => {
      const emailMatch = acc.email.toLowerCase() === cleanId;
      const phoneMatch =
        acc.phone &&
        acc.phone.replace(/[\s-()]/g, "") === cleanId.replace(/[\s-()]/g, "");
      return (emailMatch || phoneMatch) && acc.passcode === loginPasscode;
    });

    if (match) {
      setSuccessMsg(`Welcome back, ${match.name}!`);
      setTimeout(() => {
        onLogin(match.email, match.name, match.phone);
      }, 800);
    } else {
      setError(
        "Incorrect identifier or security PIN. Please try again or create a new account.",
      );
    }
  };

  // Quick Login trigger
  const handleGoogleSignIn = async () => {
    try {
      setError("");
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      let existingAcc = accounts.find(
        (acc) => (acc.email || "").trim().toLowerCase() === (user.email || "").trim().toLowerCase(),
      );

      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Google User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960",
          role: AuthorizationEngine.resolveRole({ email: user.email } as any),
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        const updated = [...accounts, existingAcc];
        setAccounts(updated);
      } else {
        existingAcc.role = AuthorizationEngine.resolveRole(existingAcc);
      }

      setSuccessMsg(`Session activated: ${existingAcc.name}`);
      setTimeout(() => {
        onLogin(existingAcc!.email, existingAcc!.name, existingAcc!.phone);
      }, 600);
    } catch (err: any) {
      console.error("Login failed:", err);
      let friendlyMessage = "Google login failed. Please try again or contact support.";
      if (err.code === "auth/unauthorized-domain") {
        friendlyMessage = "Google login is not authorized for this website domain yet. Please contact support.";
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
  const handleRegisterEmail = (e: React.FormEvent) => {
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

    // Check if account already exists
    const exists = accounts.some(
      (acc) => acc.email.toLowerCase() === regEmail.trim().toLowerCase(),
    );
    if (exists) {
      setError(
        "An account with this email address already exists. Please log in.",
      );
      return;
    }

    const newAcc: Customer = {
      name: regName.trim(),
      email: regEmail.trim(),
      phone: "",
      passcode: regPIN,
      role: AuthorizationEngine.resolveRole({ email: regEmail.trim() } as any),
      orderStatus: "Fresh Passport Activation",
      method: "email",
    };

    const updated = [...accounts, newAcc];
    setAccounts(updated);
    

    setSuccessMsg("Account created successfully!");
    setTimeout(() => {
      onLogin(newAcc.email, newAcc.name);
    }, 1000);
  };

  // Register with Phone
  const handleRegisterPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!regName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!regPhone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (regPIN.length < 4) {
      setError("Please set a 4-digit security PIN.");
      return;
    }
    if (!otpVerified) {
      setError(
        "Please verify your phone number using the SMS verification OTP code.",
      );
      return;
    }

    const fullPhone = `${countryCode} ${regPhone.trim()}`;

    // Check if account already exists by phone
    const exists = accounts.some(
      (acc) =>
        acc.phone &&
        acc.phone.replace(/[\s-()]/g, "") === fullPhone.replace(/[\s-()]/g, ""),
    );
    if (exists) {
      setError(
        "An account with this phone number already exists. Please log in.",
      );
      return;
    }

    // Generate simulated login email
    const cleanName = regName.trim().toLowerCase().replace(/\s+/g, ".");
    const simEmail = `${cleanName}@phone-member.nl`;

    const newAcc: Customer = {
      name: regName.trim(),
      email: simEmail,
      phone: fullPhone,
      passcode: regPIN,
      role: AuthorizationEngine.resolveRole({ email: simEmail } as any),
      orderStatus: "Fresh Passport Activation",
      method: "phone",
    };

    const updated = [...accounts, newAcc];
    setAccounts(updated);
    

    setSuccessMsg("Mobile account activated!");
    setTimeout(() => {
      onLogin(simEmail, newAcc.name, fullPhone);
    }, 1000);
  };

  // Trigger Phone Verification OTP Simulation
  const triggerSendOtp = () => {
    if (!regPhone.trim() || regPhone.length < 6) {
      setError("Please enter a valid phone number before requesting OTP.");
      return;
    }
    setError("");
    setOtpSent(true);
    setOtpTimer(60);
    setPhoneOtp("");
    // Notice toast
    setSuccessMsg("Simulated SMS Sent! Check Code in panel.");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // Verify phone OTP
  const handleVerifyOtp = () => {
    setIsVerifyingOtp(true);
    setTimeout(() => {
      setIsVerifyingOtp(false);
      if (phoneOtp === "1960") {
        setOtpVerified(true);
        setSuccessMsg("Phone number successfully verified!");
        setError("");
      } else {
        setError(
          'Incorrect OTP code. Enter "1960" for simulation authorization.',
        );
      }
    }, 800);
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
            Log in or create a custom tailoring profile with full cloud
            specifications.
          </p>
        </div>

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
              <span className="flex-1 leading-snug">{error}</span>
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
              {/* Two Sub-Methods Tab Heads */}
              <div className="grid grid-cols-2 gap-2 bg-heritage-cream/30 p-1.5 rounded-xl border border-heritage-gold/10">
                <button
                  type="button"
                  onClick={() => {
                    setRegMethod("email");
                    setError("");
                  }}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    regMethod === "email"
                      ? "bg-white text-heritage-green shadow-sm border border-heritage-gold/25"
                      : "text-heritage-ink/65 hover:text-heritage-ink"
                  }`}
                >
                  <Mail size={12} /> Email
                </button>

          
                <button
                  type="button"
                  onClick={() => {
                    setRegMethod("phone");
                    setError("");
                  }}
                  className={`py-2 text-[10px] uppercase font-bold tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    regMethod === "phone"
                      ? "bg-white text-heritage-green shadow-sm border border-heritage-gold/25"
                      : "text-heritage-ink/65 hover:text-heritage-ink"
                  }`}
                >
                  <Smartphone size={12} /> Phone
                </button>
              </div>

              {/* SUBMODE A: CUSTOM EMAIL SIGN UP */}
              {regMethod === "email" && (
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
              )}

              

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
                              placeholder="Enter Code (Simulation PIN: 1960)"
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
                            * For simulation testing, enter standard code{" "}
                            <strong className="text-heritage-gold">1960</strong>{" "}
                            to authorize phone.
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

          {/* Quick-Access Member Cards */}
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
        </div>
      </motion.div>

      
    </div>
  );
}
