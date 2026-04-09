import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Flame, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../lib/api";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(email, otp, newPassword);
      toast.success("Password updated! Please sign in.");
      navigate("/login");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    try {
      await authApi.forgotPassword(email);
      toast.success("New code sent!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not resend code");
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent-soft/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm animate-slide-up">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <div className="w-9 h-9 bg-accent-primary rounded-xl flex items-center justify-center">
            <Flame size={18} className="text-btn-fg" />
          </div>
          <span className="text-xl font-semibold text-text-primary tracking-tight">Qelvi</span>
        </div>

        <div className="card p-7">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Enter reset code</h1>
          <p className="text-xs text-text-muted mb-6">
            We sent a 6-digit code to{" "}
            <span className="text-text-secondary font-medium">{email || "your email"}</span>.
            It expires in 15 minutes.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!prefillEmail && (
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            )}

            <div>
              <label className="label">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="input font-mono tracking-[0.4em] text-center text-lg"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
                autoComplete="one-time-code"
              />
            </div>

            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className="input pr-10"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6 || !newPassword}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? "Updating..." : "Reset password"}
            </button>
          </form>

          <p className="text-xs text-text-muted text-center mt-5">
            Didn't receive a code?{" "}
            <button
              type="button"
              onClick={handleResend}
              className="text-accent-primary hover:text-accent-soft transition-colors"
            >
              Resend
            </button>
            {" · "}
            <Link to="/login" className="text-accent-primary hover:text-accent-soft transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
