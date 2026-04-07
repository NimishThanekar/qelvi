import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Zap, Crown } from "lucide-react";
import { subscriptionApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

type Plan = "monthly" | "annual";

const FEATURES: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: "Manual meal logging",        free: "Unlimited",    pro: "Unlimited" },
  { label: "Food database search",       free: "Full access",  pro: "Full access" },
  { label: "Daily calorie tracking",     free: true,           pro: true },
  { label: "7-day history",             free: true,           pro: true },
  { label: "AI meal logging",           free: "10 lifetime",  pro: "Unlimited" },
  { label: "\"What should I eat?\"",    free: false,          pro: true },
  { label: "Full context insights",     free: "Basic only",   pro: "Full + trends" },
  { label: "History beyond 7 days",     free: false,          pro: "Unlimited" },
  { label: "Food personality card",     free: false,          pro: true },
  { label: "Weekly calorie budget",     free: false,          pro: true },
  { label: "Buddy system",              free: "1 buddy",      pro: "Unlimited" },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function FeatureCell({ val }: { val: string | boolean }) {
  if (val === true)  return <Check size={15} style={{ color: "#a3e635" }} className="mx-auto" />;
  if (val === false) return <X    size={14} style={{ color: "#444" }}    className="mx-auto" />;
  return <span className="text-xs text-text-secondary">{val}</span>;
}

export default function Upgrade() {
  const { user, refreshUser } = useAuthStore();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>("annual");
  const [loading, setLoading] = useState(false);

  const isPro = user?.is_pro;
  const expiresAt = user?.pro_expires_at
    ? new Date(user.pro_expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Could not load payment gateway. Check your connection.");
        return;
      }

      const orderRes = await subscriptionApi.createOrder(plan);
      const { order_id, amount, currency, key_id } = orderRes.data;

      await new Promise<void>((resolve, reject) => {
        const options = {
          key: key_id || import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount,
          currency,
          order_id,
          name: "Qelvi",
          description: plan === "annual" ? "Pro Annual — ₹999/year" : "Pro Monthly — ₹149/month",
          image: "/icons/icon-192.png",
          prefill: { name: user?.name || "", email: user?.email || "" },
          theme: { color: "#a78bfa" },
          modal: { ondismiss: () => reject(new Error("dismissed")) },
          handler: async (response: any) => {
            try {
              await subscriptionApi.verify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan_type: plan,
              });
              await refreshUser();
              toast.success("Welcome to Pro! 🎉");
              navigate("/dashboard");
              resolve();
            } catch {
              toast.error("Payment received but activation failed. Contact support.");
              reject(new Error("verify failed"));
            }
          },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", () => {
          toast.error("Payment failed. Please try again.");
          reject(new Error("payment failed"));
        });
        rzp.open();
      });
    } catch (err: any) {
      if (err?.message !== "dismissed" && err?.message !== "payment failed" && err?.message !== "verify failed") {
        toast.error(err?.response?.data?.detail || "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-4"
          style={{ backgroundColor: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }}
        >
          <Zap size={12} />
          Qelvi Pro
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Track smarter, eat better
        </h1>
        <p className="text-sm text-text-muted max-w-sm mx-auto">
          Unlock AI logging, personalised meal suggestions, and deep insights into your eating patterns.
        </p>
      </div>

      {/* Already Pro banner */}
      {isPro && (
        <div
          className="card p-5 mb-6 flex items-center gap-4"
          style={{ borderColor: "rgba(167,139,250,0.3)", backgroundColor: "rgba(167,139,250,0.06)" }}
        >
          <Crown size={22} style={{ color: "#a78bfa", flexShrink: 0 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#a78bfa" }}>You're on Pro</p>
            <p className="text-xs text-text-muted mt-0.5">
              {user?.plan_type === "annual" ? "Annual plan" : "Monthly plan"}
              {expiresAt && ` · Renews ${expiresAt}`}
            </p>
          </div>
        </div>
      )}

      {/* Pricing toggle */}
      {!isPro && (
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setPlan("monthly")}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              plan === "monthly"
                ? "border-text-muted text-text-primary bg-bg-elevated"
                : "border-bg-border text-text-muted hover:text-text-secondary"
            }`}
          >
            Monthly<br />
            <span className="text-xs font-normal">₹149/mo</span>
          </button>
          <button
            onClick={() => setPlan("annual")}
            className="relative flex flex-col items-center"
          >
            <span
              className="absolute -top-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ backgroundColor: "#a3e635", color: "#000" }}
            >
              SAVE 44%
            </span>
            <span
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all border inline-block text-center ${
                plan === "annual"
                  ? "border-text-muted text-text-primary bg-bg-elevated"
                  : "border-bg-border text-text-muted hover:text-text-secondary"
              }`}
            >
              Annual<br />
              <span className="text-xs font-normal">₹999/yr</span>
            </span>
          </button>
        </div>
      )}

      {/* CTA */}
      {!isPro && (
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full py-3.5 rounded-xl text-sm font-semibold mb-6 transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: "#a78bfa", color: "#fff", opacity: loading ? 0.7 : 1 }}
        >
          <Zap size={15} />
          {loading ? "Loading…" : plan === "annual" ? "Subscribe · ₹999/year" : "Subscribe · ₹149/month"}
        </button>
      )}

      {/* Feature comparison */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px] text-xs font-medium text-text-muted px-4 py-3 border-b border-bg-elevated">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center" style={{ color: "#a78bfa" }}>Pro</span>
        </div>
        {FEATURES.map((f, i) => (
          <div
            key={f.label}
            className={`grid grid-cols-[1fr_80px_80px] items-center px-4 py-3 text-xs ${
              i % 2 === 0 ? "" : "bg-bg-elevated/40"
            }`}
          >
            <span className="text-text-secondary pr-2">{f.label}</span>
            <div className="text-center"><FeatureCell val={f.free} /></div>
            <div className="text-center"><FeatureCell val={f.pro} /></div>
          </div>
        ))}
      </div>

      {/* Fine print */}
      <p className="text-[11px] text-text-muted text-center mt-4">
        Payments processed securely by Razorpay · Cancel anytime
      </p>
    </div>
  );
}
