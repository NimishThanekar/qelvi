import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { User, Target, Activity, Utensils, Scale, Save } from "lucide-react";
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
  {
    value: "very_active",
    label: "Very Active",
    desc: "Intense daily training",
  },
];

export default function Profile() {
  const { user, updateUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || "",
    age: user?.age?.toString() || "",
    weight_kg: user?.weight_kg?.toString() || "",
    height_cm: user?.height_cm?.toString() || "",
    gender: user?.gender || "male",
    activity_level: user?.activity_level || "moderate",
    dietary_preferences: user?.dietary_preferences || [],
    calorie_goal: user?.calorie_goal?.toString() || "",
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const togglePref = (pref: string) => {
    set(
      "dietary_preferences",
      form.dietary_preferences.includes(pref)
        ? form.dietary_preferences.filter((p: string) => p !== pref)
        : [...form.dietary_preferences, pref]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateUser({
        name: form.name,
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
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const bmi =
    form.weight_kg && form.height_cm
      ? (
          parseFloat(form.weight_kg) /
          Math.pow(parseFloat(form.height_cm) / 100, 2)
        ).toFixed(1)
      : null;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-1">Profile</h1>
      <p className="text-xs text-text-muted mb-6">
        Personalize your nutrition tracking
      </p>

      {/* Avatar row */}
      <div className="card p-5 mb-4 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-primary/20 to-accent-soft/20 border border-accent-primary/20 flex items-center justify-center text-2xl font-bold text-accent-primary">
          {user?.name?.[0]?.toUpperCase() || "U"}
        </div>
        <div>
          <p className="font-semibold text-text-primary">{user?.name}</p>
          <p className="text-xs text-text-muted">{user?.email}</p>
          {user?.tdee && (
            <p className="text-xs text-accent-primary mt-1">
              TDEE: {Math.round(user.tdee)} kcal/day
            </p>
          )}
        </div>
        {bmi && (
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold text-text-primary">{bmi}</p>
            <p className="text-xs text-text-muted">BMI</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Basic info */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">Basic info</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
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
              <label className="label">Age (years)</label>
              <input
                type="number"
                className="input"
                value={form.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
        </div>

        {/* Body metrics */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">Body metrics</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          {user?.bmr && (
            <div className="mt-3 flex gap-3">
              <div className="flex-1 bg-bg-elevated rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">BMR</p>
                <p className="text-lg font-bold text-text-secondary">
                  {Math.round(user.bmr)}
                </p>
                <p className="text-xs text-text-muted">kcal/day</p>
              </div>
              <div className="flex-1 bg-bg-elevated rounded-xl p-3 text-center">
                <p className="text-xs text-text-muted">TDEE</p>
                <p className="text-lg font-bold text-accent-primary">
                  {user.tdee ? Math.round(user.tdee) : "—"}
                </p>
                <p className="text-xs text-text-muted">kcal/day</p>
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Activity level
            </h3>
          </div>
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map((al) => (
              <button
                key={al.value}
                onClick={() => set("activity_level", al.value)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${
                  form.activity_level === al.value
                    ? "bg-accent-primary/10 border border-accent-primary/20 text-accent-soft"
                    : "bg-bg-elevated border border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <span className="font-medium">{al.label}</span>
                <span className="text-xs text-text-muted">{al.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Calorie goal */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Daily calorie goal
            </h3>
          </div>
          <input
            type="number"
            className="input"
            value={form.calorie_goal}
            onChange={(e) => set("calorie_goal", e.target.value)}
            placeholder={
              user?.tdee ? `Suggested: ${Math.round(user.tdee)}` : "2000"
            }
          />
          {user?.tdee && (
            <p className="text-xs text-text-muted mt-2">
              Your TDEE is ~{Math.round(user.tdee)} kcal. Leave blank to use
              this automatically.
            </p>
          )}
        </div>

        {/* Dietary preferences */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Utensils size={15} className="text-text-muted" />
            <h3 className="text-sm font-medium text-text-secondary">
              Dietary preferences
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFS.map((pref) => {
              const active = form.dietary_preferences.includes(pref);
              return (
                <button
                  key={pref}
                  onClick={() => togglePref(pref)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? "bg-accent-primary/15 border-accent-primary/30 text-accent-soft"
                      : "bg-transparent border-bg-border text-text-muted hover:border-text-muted hover:text-text-secondary"
                  }`}
                >
                  {active && "✓ "}
                  {pref}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          <Save size={15} />
          {saving ? "Saving..." : "Save profile"}
        </button>
      </div>
    </div>
  );
}
