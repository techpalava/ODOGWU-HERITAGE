import React from "react";
import { auth } from "../services/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { ShieldCheck, Loader2, XCircle } from "lucide-react";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import { useAppStore } from "../store/useAppStore";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";
import { Customer } from "../types";

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
  const { currentUser, setCustomers, customers, setCurrentUser } =
    useAppStore();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleGoogleLogin = async () => {
    try {
      setError("");
      setLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      let existingAcc = customers.find(
        (acc) => acc.email.toLowerCase() === (user.email || "").toLowerCase(),
      );

      if (!existingAcc) {
        existingAcc = {
          name: user.displayName || "Admin User",
          email: user.email || "",
          phone: user.phoneNumber || "",
          passcode: "1960", // Legacy compat
          role: AuthorizationEngine.isAdminEmail(user.email) ? AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR : "Verified Google Client", // Default role
          orderStatus: "Fresh Passport Activation",
          method: "gmail",
        } as any;
        setCustomers([...customers, existingAcc]);
      } else if (AuthorizationEngine.isAdminEmail(user.email)) {
        // Ensure role is updated if they are an admin
        existingAcc.role = AuthorizationEngine.ROLES.SUPER_ADMINISTRATOR;
      }
      
      setCurrentUser(existingAcc!);
      setLoading(false);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.message || "Failed to authenticate with Google.");
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

  if (loading) {
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
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-sm cursor-pointer mb-4"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign In with Google
          </button>
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
