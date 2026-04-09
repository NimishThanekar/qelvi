import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuthStore } from "../store/authStore";
import { Flame, Eye, EyeOff, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { register, googleLogin } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlRef = searchParams.get("ref")?.toUpperCase() || "";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [referralCode, setReferralCode] = useState(urlRef);
  const [referralOpen, setReferralOpen] = useState(!!urlRef);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) return;
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        ...(referralCode.trim() ? { referral_code: referralCode.trim().toUpperCase() } : {}),
      });
      toast.success("Account created! Welcome 🎉");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Registration failed");
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
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 bg-accent-primary rounded-xl flex items-center justify-center">
            <Flame size={18} className="text-btn-fg" />
          </div>
          <span className="text-xl font-semibold text-text-primary tracking-tight">Qelvi</span>
        </div>

        <div className="card p-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-text-primary">Create account</h2>
            <p className="text-xs text-text-muted mt-0.5">Your journey starts here</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className="input pr-10"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Min 8 characters"
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
            {/* Referral code — collapsible */}
            <div>
              {urlRef ? (
                /* Pre-filled from URL — always expanded */
                <div
                  className="rounded-xl p-3 border"
                  style={{ borderColor: "rgba(163,230,53,0.3)", backgroundColor: "rgba(163,230,53,0.06)" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={14} style={{ color: "#a3e635" }} />
                    <span className="text-xs font-medium" style={{ color: "#a3e635" }}>
                      You'll both get 30 days of Pro free!
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold tracking-widest text-text-primary text-center py-1">
                    {referralCode}
                  </div>
                </div>
              ) : (
                /* Collapsed trigger */
                <>
                  <button
                    type="button"
                    onClick={() => setReferralOpen((o) => !o)}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors w-full"
                  >
                    {referralOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Have a referral code?
                  </button>
                  {referralOpen && (
                    <div className="mt-2">
                      <input
                        className="input font-mono tracking-widest uppercase text-center"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder="XXXXXX"
                        maxLength={8}
                        autoComplete="off"
                      />
                      {referralCode.trim().length >= 6 && (
                        <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "#a3e635" }}>
                          <CheckCircle size={11} />
                          You'll both get 30 days of Pro free!
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !form.name || !form.email || !form.password}
              className="btn-primary w-full py-3"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-bg-elevated" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-bg-elevated" />
          </div>

          <div className="flex flex-col items-center gap-2">
            <GoogleLogin
              onSuccess={async (res) => {
                if (!res.credential) return;
                try {
                  await googleLogin(res.credential);
                  navigate("/dashboard");
                } catch (err: any) {
                  toast.error(err?.response?.data?.detail || "Google sign-in failed");
                }
              }}
              onError={() => toast.error("Google sign-in failed")}
              theme="filled_black"
              shape="rectangular"
              text="signup_with"
              size="large"
              width="320"
            />
            <p className="text-[10px] text-text-muted text-center">
              Creates a Qelvi account linked to your Google profile
            </p>
          </div>
        </div>

        <p className="text-xs text-text-muted text-center mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-accent-primary hover:text-accent-soft">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
