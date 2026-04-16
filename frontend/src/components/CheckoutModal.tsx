import { useState } from "react";
import { X, Crown, Check, Tag, Zap, TrendingUp, CalendarDays, Lightbulb } from "lucide-react";
import { subscriptionApi } from "../lib/api";
import type { User } from "../store/authStore";

type Plan = "monthly" | "annual";

interface CouponData {
  discount_pct: number;
  discount_amount: number;
  original_amount: number;
  final_amount: number;
  message: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialPlan: Plan;
  lockedPlan?: boolean;
  user: User | null;
  loading: boolean;
  onConfirm: (plan: Plan, couponCode?: string) => void;
}

const PLAN_PRICES: Record<Plan, number> = { monthly: 149, annual: 999 };

const BENEFITS = [
  { icon: Zap,          text: "Unlimited AI meal logging" },
  { icon: TrendingUp,   text: "Full context insights & trends" },
  { icon: CalendarDays, text: "Unlimited history & charts" },
  { icon: Lightbulb,   text: '"What should I eat?" suggestions' },
];

function getSegment(user: User | null): { headline: string; subtext: string } {
  if (!user) return { headline: "Unlock everything in Qelvi", subtext: "AI logging, full insights, and more" };
  if ((user.ai_uses_remaining ?? 10) === 0)
    return { headline: "You've hit your AI limit", subtext: "Upgrade for unlimited AI meal logging" };
  if (!user.is_pro && user.pro_expires_at)
    return { headline: "Welcome back to Pro", subtext: "Pick up where you left off" };
  if (user.plan_type === "monthly")
    return { headline: "Switch to Annual, save 44%", subtext: "₹999/year instead of ₹1,788" };
  return { headline: "Unlock everything in Qelvi", subtext: "AI logging, full insights, and more" };
}

export default function CheckoutModal({ isOpen, onClose, initialPlan, lockedPlan, user, loading, onConfirm }: Props) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [couponInput, setCouponInput] = useState("");
  const [couponStatus, setCouponStatus] = useState<"idle" | "loading" | "valid" | "invalid">("idle");
  const [couponError, setCouponError] = useState("");
  const [couponData, setCouponData] = useState<CouponData | null>(null);

  const { headline, subtext } = getSegment(user);

  const basePrice = PLAN_PRICES[plan];
  const finalPrice = couponData ? couponData.final_amount : basePrice;

  const handlePlanChange = (p: Plan) => {
    setPlan(p);
    // reset coupon when plan changes since validity may differ
    setCouponInput("");
    setCouponStatus("idle");
    setCouponData(null);
    setCouponError("");
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponStatus("loading");
    setCouponError("");
    try {
      const res = await subscriptionApi.validateCoupon(code, plan);
      setCouponData(res.data);
      setCouponStatus("valid");
    } catch (err: any) {
      setCouponStatus("invalid");
      setCouponError(err?.response?.data?.detail || "Invalid coupon code");
      setCouponData(null);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponInput("");
    setCouponStatus("idle");
    setCouponData(null);
    setCouponError("");
  };

  const handleConfirm = () => {
    onConfirm(plan, couponData ? couponInput.trim().toUpperCase() : undefined);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden animate-scale-in"
        style={{
          backgroundColor: "#111111",
          border: "1px solid rgba(167,139,250,0.25)",
          boxShadow: "0 0 0 1px rgba(167,139,250,0.08), 0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-6 pb-5"
          style={{
            background: "linear-gradient(135deg, rgba(167,139,250,0.1) 0%, rgba(167,139,250,0.03) 100%)",
            borderBottom: "1px solid rgba(167,139,250,0.12)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "rgba(167,139,250,0.15)" }}
              >
                <Crown size={17} style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary leading-tight">{headline}</p>
                <p className="text-xs text-text-muted mt-0.5">{subtext}</p>
              </div>
            </div>
            {!loading && (
              <button onClick={onClose} className="text-text-muted hover:text-text-secondary transition-colors mt-0.5">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Plan toggle */}
          {!lockedPlan && (
            <div>
              <p className="label mb-2">Plan</p>
              <div className="grid grid-cols-2 gap-2">
                {(["monthly", "annual"] as Plan[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePlanChange(p)}
                    className="relative rounded-xl p-3 text-left transition-all"
                    style={{
                      backgroundColor: plan === p ? "rgba(167,139,250,0.12)" : "#181818",
                      border: plan === p ? "1px solid rgba(167,139,250,0.35)" : "1px solid #242424",
                    }}
                  >
                    {p === "annual" && (
                      <span
                        className="absolute -top-2 left-3 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                        style={{ backgroundColor: "#a3e635", color: "#000" }}
                      >
                        SAVE 44%
                      </span>
                    )}
                    <p className="text-xs font-medium text-text-secondary capitalize">{p}</p>
                    <p className="text-base font-bold text-text-primary mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      ₹{PLAN_PRICES[p]}
                      <span className="text-xs font-normal text-text-muted ml-1">{p === "monthly" ? "/mo" : "/yr"}</span>
                    </p>
                    {p === "annual" && (
                      <p className="text-[10px] text-text-muted mt-0.5">Already saving ₹789 vs monthly</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Benefits */}
          <div>
            <p className="label mb-2">What you unlock</p>
            <div className="space-y-2">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "rgba(163,230,53,0.15)" }}
                  >
                    <Icon size={10} style={{ color: "#a3e635" }} />
                  </div>
                  <span className="text-xs text-text-secondary">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Coupon */}
          <div>
            <p className="label mb-2">Have a coupon?</p>
            {couponStatus === "valid" && couponData ? (
              <div
                className="flex items-center justify-between rounded-xl px-4 py-3 animate-fade-in"
                style={{ backgroundColor: "rgba(163,230,53,0.08)", border: "1px solid rgba(163,230,53,0.25)" }}
              >
                <div className="flex items-center gap-2">
                  <Check size={14} style={{ color: "#a3e635" }} />
                  <span className="text-xs font-semibold" style={{ color: "#a3e635" }}>
                    {couponInput.toUpperCase()}
                  </span>
                  <span className="text-xs text-text-muted">— saving ₹{couponData.discount_amount}</span>
                </div>
                <button
                  onClick={handleRemoveCoupon}
                  className="text-text-muted hover:text-text-secondary transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      if (couponStatus === "invalid") { setCouponStatus("idle"); setCouponError(""); }
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleApplyCoupon(); }}
                    placeholder="ENTER CODE"
                    className="input w-full pl-9 text-xs font-mono uppercase tracking-widest"
                    style={{ letterSpacing: "0.12em" }}
                  />
                </div>
                <button
                  onClick={handleApplyCoupon}
                  disabled={!couponInput.trim() || couponStatus === "loading"}
                  className="px-4 rounded-xl text-xs font-semibold transition-all flex-shrink-0"
                  style={{
                    backgroundColor: couponInput.trim() ? "rgba(167,139,250,0.15)" : "#181818",
                    border: "1px solid rgba(167,139,250,0.25)",
                    color: couponInput.trim() ? "#a78bfa" : "#555",
                  }}
                >
                  {couponStatus === "loading" ? "…" : "Apply"}
                </button>
              </div>
            )}
            {couponStatus === "invalid" && (
              <p className="text-xs mt-1.5 animate-fade-in" style={{ color: "#f87171" }}>{couponError}</p>
            )}
          </div>

          {/* Order summary */}
          <div
            className="rounded-xl px-4 py-3 space-y-1.5"
            style={{ backgroundColor: "#181818", border: "1px solid #242424" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted capitalize">{plan} plan</span>
              <span
                className="text-xs text-text-secondary"
                style={couponData ? { textDecoration: "line-through", opacity: 0.5 } : {}}
              >
                ₹{basePrice}
              </span>
            </div>
            {couponData && (
              <div className="flex items-center justify-between animate-fade-in">
                <span className="text-xs" style={{ color: "#a3e635" }}>
                  Coupon ({couponData.discount_pct}% off)
                </span>
                <span className="text-xs font-semibold" style={{ color: "#a3e635" }}>
                  −₹{couponData.discount_amount}
                </span>
              </div>
            )}
            <div
              className="flex items-center justify-between pt-1.5"
              style={{ borderTop: "1px solid #242424" }}
            >
              <span className="text-xs font-semibold text-text-primary">Total</span>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: couponData ? "#a3e635" : "var(--text-primary)" }}
              >
                ₹{finalPrice}
              </span>
            </div>
            {plan === "annual" && !couponData && (
              <p className="text-[10px] text-text-muted">Already saving ₹789 vs monthly billing</p>
            )}
            {plan === "annual" && couponData && (
              <p className="text-[10px]" style={{ color: "#a3e635" }}>
                Saving ₹{789 + couponData.discount_amount} total vs monthly billing
              </p>
            )}
          </div>

          {/* CTA */}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              backgroundColor: loading ? "#2a2a2a" : "#a3e635",
              color: loading ? "#555" : "#000",
            }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Opening payment…
              </>
            ) : (
              <>
                Pay ₹{finalPrice} securely
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          <p className="text-[10px] text-text-muted text-center -mt-2">
            Processed securely by Razorpay
            {plan === "annual" ? " · Cancel anytime for a pro-rated refund" : " · Non-refundable, no auto-renewal"}
          </p>
        </div>
      </div>
    </div>
  );
}
