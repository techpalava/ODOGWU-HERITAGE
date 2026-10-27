import React from "react";
import { auth } from "../services/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { ShieldCheck, Loader2, XCircle } from "lucide-react";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import { useAppStore } from "../store/useAppStore";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { Customer } from "../types";
import { FirebaseCustomerAuth } from "../services/firebaseCustomerAuth";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface AdminAuthGuardProps {
  children: React.ReactNode;
  onNavigateHome: () => void;
  requiredPermission?: (user: Customer | null) => boolean;
}

export function AdminAuthGuard({
  children,
  onNavigateHome,
  requiredPermission,
}: AdminAuthGuardProps) {
  const { currentUser, setCurrentUser, customerAuthReady } = useAppStore();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleGoogleLogin = async () => {
    try {
      setError("");
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const customer = await FirebaseCustomerAuth.bootstrap(result.user);
      setCurrentUser(customer);
      setLoading(false);
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
      setError(friendlyMessage);
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  if (loading || !customerAuthReady) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-heritage-gold h-12 w-12" />
      </div>
    );
  }

  // Authorize based on requiredPermission. Default to View Staff Dashboard.
  const checkPermission =
    requiredPermission || ((user) => AuthorizationEngine.canViewStaffDashboard(user));
  const isAuthorized = checkPermission(currentUser);

  if (!isAuthorized) {
    const isLoggedInGoogle = currentUser?.method === "gmail" || currentUser?.email;
    
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl shadow-xl border border-gray-100 text-center font-sans">
        <div className="bg-heritage-green p-8 text-center border-b border-heritage-gold/20 relative overflow-hidden flex flex-col items-center justify-center rounded-t-3xl -mt-8 -mx-8 mb-8">
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
            {isLoggedInGoogle ? <XCircle size={12} className="text-red-400" /> : <ShieldCheck size={12} />} 
            {isLoggedInGoogle ? "Access Denied" : "Access Restricted"}
          </span>
          <h2 className="relative text-2xl font-display font-bold text-white tracking-tight">
            Staff Portal
          </h2>
          <p className="relative text-xs text-heritage-beige/80 mt-1.5 leading-relaxed max-w-xs mx-auto">
            {isLoggedInGoogle 
              ? `The account (${currentUser.email}) is not authorized to access the admin portal.`
              : "Access to this section requires staff authorization. Please sign in with an authorized Google Workspace account."}
          </p>
        </div>
        
        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {!isLoggedInGoogle ? (
          <GoogleSignInButton
            onClick={() => void handleGoogleLogin()}
            label="Sign in with Google"
            loading={loading}
            className="mb-4"
          />
        ) : (
          <button
            onClick={handleSignOut}
            className="w-full bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm cursor-pointer mb-4"
          >
            Sign Out & Try Another Account
          </button>
        )}

        <button
          onClick={onNavigateHome}
          className="text-xs text-gray-500 hover:text-heritage-green font-medium underline cursor-pointer"
        >
          Return to Public Website
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
