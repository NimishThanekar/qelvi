import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Flame } from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      toast.success("OTP sent! Check your inbox.");
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
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
          <h1 className="text-xl font-semibold text-text-primary mb-1">Forgot password?</h1>
          <p className="text-xs text-text-muted mb-6">
            Enter your email and we'll send a 6-digit reset code.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <button
              type="submit"
              disabled={loading || !email}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? "Sending code..." : "Send reset code"}
            </button>
          </form>

          <p className="text-xs text-text-muted text-center mt-5">
            Remembered it?{" "}
            <Link to="/login" className="text-accent-primary hover:text-accent-soft transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
