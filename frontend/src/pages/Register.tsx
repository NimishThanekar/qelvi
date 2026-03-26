import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Flame, ChevronRight, ChevronLeft, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

const DIETARY_PREFS = [
  "Vegetarian",
  "Vegan",
  "Keto",
  "Paleo",
  "Gluten-free",
  "Dairy-free",
  "Low-carb",
  "High-protein",
];
const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary", desc: "Little or no exercise" },
  { value: "light", label: "Light", desc: "1-3 days/week" },
  { value: "moderate", label: "Moderate", desc: "3-5 days/week" },
  { value: "active", label: "Active", desc: "6-7 days/week" },
  { value: "very_active", label: "Very Active", desc: "Intense training" },
];

export default function Register() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    age: "",
    weight_kg: "",
    height_cm: "",
    gender: "male",
    activity_level: "moderate",
    dietary_preferences: [] as string[],
    calorie_goal: "",
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const togglePref = (p: string) => {
    set(
      "dietary_preferences",
      form.dietary_preferences.includes(p)
        ? form.dietary_preferences.filter((x: string) => x !== p)
        : [...form.dietary_preferences, p]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        password: form.password,
        age: form.age ? parseInt(form.age) : undefined,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : undefined,
        height_cm: form.height_cm ? parseFloat(form.height_cm) : undefined,
        gender: form.gender,
        activity_level: form.activity_level,
        dietary_preferences: form.dietary_preferences,
        calorie_goal: form.calorie_goal
          ? parseInt(form.calorie_goal)
          : undefined,
      });
      toast.success("Account created! Welcome 🎉");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { label: "Account", num: 1 },
    { label: "Body", num: 2 },
    { label: "Goals", num: 3 },
  ];

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
            <Flame size={18} className="text-black" />
          </div>
          <span className="text-xl font-semibold text-text-primary tracking-tight">
            Qelvi
          </span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 ${
                  step === s.num
                    ? "text-accent-primary"
                    : step > s.num
                    ? "text-text-secondary"
                    : "text-text-muted"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s.num
                      ? "bg-accent-primary text-black"
                      : step > s.num
                      ? "bg-bg-border text-text-secondary"
                      : "bg-bg-elevated text-text-muted"
                  }`}
                >
                  {s.num}
                </div>
                <span className="text-xs hidden sm:inline">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-8 h-px ${
                    step > s.num ? "bg-text-muted" : "bg-bg-elevated"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="card p-7">
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Create account
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Your journey starts here
                </p>
              </div>
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Your name"
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
                onClick={() => setStep(2)}
                disabled={!form.name || !form.email || !form.password}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                Continue <ChevronRight size={15} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Your body
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  We'll calculate your BMR & TDEE
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Gender</label>
                  <select
                    className="input"
                    value={form.gender}
                    onChange={(e) => set("gender", e.target.value)}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Age</label>
                  <input
                    type="number"
                    className="input"
                    value={form.age}
                    onChange={(e) => set("age", e.target.value)}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="label">Weight (kg)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.weight_kg}
                    onChange={(e) => set("weight_kg", e.target.value)}
                    placeholder="70"
                  />
                </div>
                <div>
                  <label className="label">Height (cm)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.height_cm}
                    onChange={(e) => set("height_cm", e.target.value)}
                    placeholder="175"
                  />
                </div>
              </div>
              <div>
                <label className="label">Activity level</label>
                <div className="space-y-1.5">
                  {ACTIVITY_LEVELS.map((al) => (
                    <button
                      key={al.value}
                      onClick={() => set("activity_level", al.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                        form.activity_level === al.value
                          ? "bg-accent-primary/10 border border-accent-primary/20 text-accent-soft"
                          : "bg-bg-elevated border border-transparent text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      <span className="font-medium">{al.label}</span>
                      <span className="text-text-muted">{al.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep(1)}
                  className="btn-ghost flex items-center gap-1"
                >
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Your goals
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Customize your experience
                </p>
              </div>
              <div>
                <label className="label">Daily calorie goal (optional)</label>
                <input
                  type="number"
                  className="input"
                  value={form.calorie_goal}
                  onChange={(e) => set("calorie_goal", e.target.value)}
                  placeholder="Auto-calculated from TDEE"
                />
              </div>
              <div>
                <label className="label">Dietary preferences</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DIETARY_PREFS.map((pref) => (
                    <button
                      key={pref}
                      onClick={() => togglePref(pref)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        form.dietary_preferences.includes(pref)
                          ? "bg-accent-primary/15 border-accent-primary/30 text-accent-soft"
                          : "bg-transparent border-bg-border text-text-muted hover:border-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {form.dietary_preferences.includes(pref) && "✓ "}
                      {pref}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep(2)}
                  className="btn-ghost flex items-center gap-1"
                >
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="btn-primary flex-1"
                >
                  {loading ? "Creating..." : "Create account 🎉"}
                </button>
              </div>
            </div>
          )}
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
