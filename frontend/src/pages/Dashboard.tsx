import { useState, useEffect, useCallback, useRef } from "react";
import { format, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Flame,
  Target,
  TrendingUp,
  Coffee,
  RotateCcw,
  X,
  Sparkles,
} from "lucide-react";
import { logsApi, foodApi, festivalsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { DailySummary, MealLog, FrequentFood, DayStatus, ContextStat, RecommendationItem, FoodPersonality, ActiveFestivalsResponse, FestivalFoodItem } from "../types";
import { MEAL_TYPES, MEAL_CONTEXTS } from "../types";
import CalorieRing from "../components/CalorieRing";
import CaloriePace from "../components/CaloriePace";
import WeeklyWrap from "../components/WeeklyWrap";
import ContextInsightsCard from "../components/ContextInsightsCard";
import FoodPersonalityCard from "../components/FoodPersonalityCard";
import FoodSearchModal from "../components/FoodSearchModal";
import toast from "react-hot-toast";

function CountUp({ to, duration = 650 }: { to: number; duration?: number }) {
  const [display, setDisplay] = useState(to);
  const currentRef = useRef(to);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = currentRef.current;
    if (from === to) return;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(from + (to - from) * eased);
      currentRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, duration]);

  return <>{display}</>;
}

const ACCENT = "#3B7BFF";

export default function Dashboard() {
  const { user } = useAuthStore();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [_loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeMealType, setActiveMealType] = useState<any>("lunch");
  const [frequentFoods, setFrequentFoods] = useState<FrequentFood[]>([]);
  const [dayStatus, setDayStatus] = useState<DayStatus | null>(null);
  const [contextStats, setContextStats] = useState<ContextStat[]>([]);
  const [dismissedMetricsBanner, setDismissedMetricsBanner] = useState(
    () => localStorage.getItem("metrics-banner-dismissed") === "1"
  );
  const [recommendations, setRecommendations] = useState<{ from_history: RecommendationItem[]; suggestions: RecommendationItem[] } | null>(null);
  const [recPaywalled, setRecPaywalled] = useState(false);
  const [modalPrefillQuery, setModalPrefillQuery] = useState("");
  const [personality, setPersonality] = useState<FoodPersonality | null>(null);
  const [showPersonalityCard, setShowPersonalityCard] = useState(false);

  // Festival state
  const [festivalData, setFestivalData] = useState<ActiveFestivalsResponse | null>(null);
  const [festivalFoods, setFestivalFoods] = useState<FestivalFoodItem[]>([]);
  const [teaserDismissedIds, setTeaserDismissedIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("dismissed-festival-teasers") || "[]"); }
    catch { return []; }
  });

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await logsApi.summary(date);
      setSummary(res.data);
    } catch {
      setSummary({
        date,
        total_calories: 0,
        calorie_goal: user?.calorie_goal,
        meals: [],
        meal_breakdown: {},
      });
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const isToday = date === new Date().toISOString().split("T")[0];

  useEffect(() => {
    logsApi.frequent().then((r) => setFrequentFoods(r.data)).catch(() => {});
    logsApi.dayStatus().then((r) => setDayStatus(r.data)).catch(() => {});
    logsApi.contextStats().then((r) => setContextStats(r.data)).catch(() => {});
    logsApi.getFoodPersonality().then((r) => setPersonality(r.data)).catch(() => {});
    // Festival data — skip entirely if user opted out
    const festMode = user?.festival_mode || "awareness";
    if (festMode !== "off") {
      festivalsApi.active(user?.country).then((r) => {
        setFestivalData(r.data);
        if (r.data.active.length > 0) {
          festivalsApi.foods(r.data.active[0].id)
            .then((fr) => setFestivalFoods(fr.data))
            .catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isToday) return;
    const goal_ = summary?.calorie_goal || user?.calorie_goal || 2000;
    const consumed_ = summary?.total_calories || 0;
    const remaining_ = Math.max(0, goal_ - consumed_);
    const h = new Date().getHours();
    const inMealWindow = h >= 6 && h < 23;
    if (remaining_ <= 200 || !inMealWindow) {
      setRecommendations(null);
      setRecPaywalled(false);
      return;
    }
    const mt = getCurrentMealType();
    // Cap to a meal-appropriate calorie target — remaining may be the full day budget
    // but we want serving-sized suggestions, not foods that would fill 2000+ kcal.
    const mealTargets: Record<string, number> = {
      breakfast: 500,
      lunch: 700,
      dinner: 700,
      snack: 300,
      adhoc: 400,
    };
    const target = Math.min(remaining_, mealTargets[mt] ?? 500);
    foodApi.getRecommendations(Math.round(target), mt)
      .then((r) => { setRecommendations(r.data); setRecPaywalled(false); })
      .catch((err) => {
        if (err?.response?.status === 403) setRecPaywalled(true);
      });
  }, [summary, isToday]);

  const changeDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  };

  const handleDelete = async (logId: string) => {
    try {
      await logsApi.delete(logId);
      toast.success("Entry removed");
      fetchSummary();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleLogAgain = async (entry: import("../types").MealEntry, mealType: string) => {
    try {
      await logsApi.create({
        date,
        meal_type: mealType,
        entries: [{
          food_id: entry.food_id,
          food_name: entry.food_name,
          category: entry.category,
          cuisine: entry.cuisine,
          serving_type: entry.serving_type,
          quantity: entry.quantity,
          weight_g: entry.weight_g,
          calories: entry.calories,
        }],
      });
      toast.success(`Logged ${entry.food_name} — ${Math.round(entry.calories)} kcal`);
      fetchSummary();
    } catch {
      toast.error("Failed to log");
    }
  };

  const getCurrentMealType = () => {
    const h = new Date().getHours();
    if (h >= 6 && h < 11) return "breakfast";
    if (h >= 11 && h < 15) return "lunch";
    if (h >= 15 && h < 19) return "snack";
    if (h >= 19 && h < 23) return "dinner";
    return "adhoc";
  };

  const quickLog = async (food: FrequentFood) => {
    try {
      await logsApi.create({
        date,
        meal_type: getCurrentMealType(),
        entries: [{
          food_id: food.food_id,
          food_name: food.food_name,
          category: food.category,
          cuisine: food.cuisine,
          serving_type: food.serving_type,
          quantity: food.quantity,
          weight_g: food.weight_g,
          calories: food.calories,
        }],
      });
      toast.success(`Logged ${food.food_name} — ${Math.round(food.calories)} kcal`);
      fetchSummary();
    } catch {
      toast.error("Failed to log");
    }
  };

  const handleRepeatLast = async () => {
    const mealType = getCurrentMealType();
    try {
      const res = await logsApi.repeatLast(mealType);
      const last = res.data;
      await logsApi.create({
        date,
        meal_type: last.meal_type,
        entries: last.entries,
      });
      toast.success(`Repeated last ${last.meal_type}`);
      fetchSummary();
    } catch {
      toast.error("No previous meal to repeat");
    }
  };

  const goal = summary?.calorie_goal || user?.calorie_goal || 2000;
  const consumed = summary?.total_calories || 0;
  const remaining = Math.max(0, goal - consumed);
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0;

  const festMode = user?.festival_mode || "awareness";
  const activeFestival = festivalData?.active[0] ?? null;
  const upcomingFestival = festivalData?.upcoming ?? null;
  const recovery = festivalData?.recovery ?? null;

  const upcomingDaysUntil = upcomingFestival
    ? Math.ceil((new Date(upcomingFestival.start_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
    : null;
  const teaserVisible =
    upcomingFestival &&
    upcomingDaysUntil !== null &&
    upcomingDaysUntil >= 0 &&
    upcomingDaysUntil <= 7 &&
    !teaserDismissedIds.includes(upcomingFestival.id);

  const dismissTeaser = (id: string) => {
    const next = [...teaserDismissedIds, id];
    localStorage.setItem("dismissed-festival-teasers", JSON.stringify(next));
    setTeaserDismissedIds(next);
  };

  // Festival-adjusted calorie ring color
  const ringAccentColor = activeFestival ? activeFestival.color_accent : undefined;

  // Log a festival food directly (one-tap from banner chips)
  const logFestivalFood = async (food: FestivalFoodItem) => {
    const cal = food.serving_calories ?? Math.round(food.kcal_per_100g);
    try {
      await logsApi.create({
        date,
        meal_type: getCurrentMealType(),
        entries: [{
          food_id: food.id,
          food_name: food.name,
          category: food.category,
          cuisine: food.cuisine,
          serving_type: "bowl",
          quantity: 1,
          weight_g: 100,
          calories: cal,
        }],
      });
      toast.success(`Logged ${food.name} — ${Math.round(cal)} kcal`);
      fetchSummary();
    } catch {
      toast.error("Failed to log");
    }
  };

  const dateLabel = isToday
    ? "Today"
    : date === new Date(Date.now() - 86400000).toISOString().split("T")[0]
    ? "Yesterday"
    : format(parseISO(date), "EEE, MMM d");

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Date navigator */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{dateLabel}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {format(parseISO(date), "MMMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeDate(-1)}
            className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          {!isToday && (
            <button
              onClick={() => setDate(new Date().toISOString().split("T")[0])}
              className="text-xs text-accent-primary hover:text-accent-soft px-2 transition-colors"
            >
              Today
            </button>
          )}
          <button
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Pre-festival teaser card — upcoming within 7 days */}
      {teaserVisible && upcomingFestival && upcomingDaysUntil !== null && (
        <div
          className="mb-4 card p-4 flex items-start gap-3"
          style={{ borderLeftColor: upcomingFestival.color_accent, borderLeftWidth: "4px" }}
        >
          <span className="text-2xl flex-shrink-0">{upcomingFestival.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {upcomingFestival.name} is in {upcomingDaysUntil === 0 ? "less than a day" : `${upcomingDaysUntil} day${upcomingDaysUntil !== 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-text-muted mt-0.5">{upcomingFestival.description}</p>
            {festMode === "full" && (
              <p className="text-xs mt-1" style={{ color: upcomingFestival.color_accent }}>
                Your goal will adjust to {Math.round((user?.calorie_goal || 2000) * upcomingFestival.goal_multiplier)} kcal.
              </p>
            )}
            <a href="/profile" className="text-xs text-text-muted hover:text-text-secondary mt-1 inline-block">
              Festival settings →
            </a>
          </div>
          <button
            onClick={() => dismissTeaser(upcomingFestival.id)}
            className="flex-shrink-0 p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Metrics banner — shown when no body metrics set */}
      {!dismissedMetricsBanner && !user?.weight_kg && (
        <div className="mb-4 card p-3 flex items-center gap-3" style={{ borderColor: "rgba(59,123,255,0.2)", backgroundColor: "rgba(59,123,255,0.06)" }}>
          <span className="text-base flex-shrink-0">📏</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-primary">Add your body metrics</p>
            <p className="text-xs text-text-muted mt-0.5">
              Get a personalized calorie goal based on your BMR &amp; TDEE →{" "}
              <a href="/profile" className="text-accent-primary hover:text-accent-soft">Profile</a>
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.setItem("metrics-banner-dismissed", "1");
              setDismissedMetricsBanner(true);
            }}
            className="flex-shrink-0 p-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Weekly Wrap — shows previous week's summary */}
      <WeeklyWrap />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Calorie ring card — with ambient glow */}
        <div className="card p-5 flex flex-col items-center col-span-1 relative">
          {/* Ambient glow blob behind the ring — uses festival color when active */}
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl animate-ambient"
            style={{
              background: ringAccentColor
                ? `radial-gradient(ellipse at 50% 44%, ${ringAccentColor}24 0%, transparent 62%)`
                : "radial-gradient(ellipse at 50% 44%, rgba(var(--accent-rgb) / 0.14) 0%, transparent 62%)",
            }}
          />
          <div className="relative z-10">
            <CalorieRing consumed={consumed} goal={goal} size={150} accentColor={ringAccentColor} />
          </div>
          <div className="mt-4 w-full grid grid-cols-2 gap-2 relative z-10">
            <div className="bg-bg-elevated rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted mb-1">Remaining</p>
              <p
                className="text-lg font-bold"
                style={{ color: remaining === 0 ? "#f87171" : ACCENT }}
              >
                <CountUp to={Math.round(remaining)} />
              </p>
              <p className="text-xs text-text-muted">kcal</p>
            </div>
            <div className="bg-bg-elevated rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted mb-1">Goal</p>
              <p className="text-lg font-bold text-text-secondary">{goal}</p>
              <p className="text-xs text-text-muted">kcal</p>
            </div>
          </div>
        </div>

        {/* Stats cards — spring stagger entrance, count-up numbers */}
        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-3 stagger-pop">
          {[
            { label: "Consumed", num: Math.round(consumed), suffix: "",  unit: "kcal",      icon: Flame,      color: "#fb923c" },
            { label: "Progress", num: Math.round(pct),      suffix: "%", unit: "of goal",   icon: Target,     color: ACCENT },
            { label: "Meals",    num: summary?.meals.length || 0, suffix: "", unit: "entries", icon: Coffee,  color: "#38bdf8" },
            { label: "BMR",      num: user?.bmr ? Math.round(user.bmr) : null, suffix: "", unit: "base rate", icon: TrendingUp, color: "#a78bfa" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card p-4 transition-all duration-300 hover:-translate-y-0.5"
              style={{ willChange: "transform" }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-text-muted">{stat.label}</p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-200 hover:scale-110"
                  style={{ backgroundColor: stat.color + "22" }}
                >
                  <stat.icon size={13} style={{ color: stat.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-text-primary">
                {stat.num !== null
                  ? <><CountUp to={stat.num} />{stat.suffix}</>
                  : "—"}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{stat.unit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Festival banner — active festival (not shown in recovery mode) */}
      {activeFestival && !recovery && (
        <div
          className="mb-4 rounded-2xl p-4 border border-bg-border overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${activeFestival.color_accent}14 0%, ${activeFestival.color_accent}08 100%)`,
          }}
        >
          <div className="flex items-start gap-2 mb-1">
            <span className="text-2xl">{activeFestival.emoji}</span>
            <div>
              <p className="text-base font-bold text-text-primary">{activeFestival.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{activeFestival.description}</p>
            </div>
          </div>

          {festMode === "full" && user?.festival_adjustment ? (
            <p className="text-xs mt-2" style={{ color: activeFestival.color_accent }}>
              Adjusted goal: <strong>{user.festival_adjustment.adjusted_goal} kcal</strong>{" "}
              <span className="text-text-muted">(normal: {user.festival_adjustment.original_goal})</span>
            </p>
          ) : festMode === "awareness" ? (
            <p className="text-xs mt-2 text-text-muted">
              Your goal stays at {goal} kcal — enjoy the festivities! 🎉
            </p>
          ) : null}

          {/* Festival food chips */}
          {festivalFoods.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: activeFestival.color_accent }}>
                Festival foods
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {festivalFoods.slice(0, 8).map((food) => (
                  <div
                    key={food.id}
                    className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
                    style={{ borderColor: `${activeFestival.color_accent}40`, backgroundColor: `${activeFestival.color_accent}08` }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary whitespace-nowrap">{food.name}</p>
                      {food.serving_calories && (
                        <p className="text-text-muted">{food.serving_calories} kcal</p>
                      )}
                    </div>
                    <button
                      onClick={() => logFestivalFood(food)}
                      className="flex-shrink-0 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap"
                      style={{ backgroundColor: `${activeFestival.color_accent}20`, color: activeFestival.color_accent }}
                    >
                      Log
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recovery card — replaces festival banner after festival ends (full mode only) */}
      {recovery && festMode === "full" && (() => {
        const rec = recovery;
        const segments = rec.recovery_days_total;
        const filled = rec.recovery_day_current;
        return (
          <div className="mb-4 card p-4" style={{ borderColor: "#94a3b820", backgroundColor: "#94a3b808" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🌱</span>
              <div>
                <p className="text-sm font-semibold text-text-primary">{rec.festival_name} Recovery</p>
                <p className="text-xs text-text-muted">
                  Day {rec.recovery_day_current} of {rec.recovery_days_total} of gentle recovery
                </p>
              </div>
            </div>
            <p className="text-xs text-text-muted mb-3">
              {rec.festival_name} added ~{rec.excess_calories} extra kcal over {rec.recovery_days_total} days.{" "}
              You're bouncing back 🌿
            </p>
            <div className="flex gap-1 mb-3">
              {Array.from({ length: segments }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full"
                  style={{ backgroundColor: i < filled ? "#64748b" : "#1e293b" }}
                />
              ))}
            </div>
            <p className="text-xs text-text-muted">
              Today's suggested goal:{" "}
              <span className="text-text-secondary font-medium">{rec.suggested_goal} kcal</span>
            </p>
          </div>
        );
      })()}

      {/* Calorie Pace — real-time projection for today */}
      {isToday && consumed > 0 && <CaloriePace consumed={consumed} goal={goal} />}

      {/* What Should I Eat — Pro recommendation card */}
      {isToday && (recommendations || recPaywalled) && (() => {
        const chips = recommendations
          ? [...recommendations.from_history, ...recommendations.suggestions].slice(0, 4)
          : [];
        const mt = getCurrentMealType();
        const mtInfo = MEAL_TYPES.find((m) => m.value === mt);
        return (
          <div className="mb-4 card p-4 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">{mtInfo?.emoji || "🍽️"}</span>
              <div>
                <p className="text-sm font-semibold text-text-primary">What should I eat?</p>
                <p className="text-xs text-text-muted">~{Math.round(remaining)} kcal left · {mtInfo?.label || "Meal"} ideas</p>
              </div>
            </div>

            {recPaywalled ? (
              /* Locked state for free users */
              <div className="relative">
                <div className="flex flex-col gap-2 blur-sm pointer-events-none select-none" aria-hidden="true">
                  {["Dal Makhani", "Grilled Chicken", "Paneer Tikka", "Brown Rice Bowl"].map((name) => (
                    <div key={name} className="flex items-center justify-between px-3 py-2.5 bg-bg-elevated rounded-xl border border-bg-border">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{name}</p>
                        <p className="text-xs text-text-muted">bowl · ~350 kcal</p>
                      </div>
                      <button className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(59,123,255,0.15)", color: "#3B7BFF" }}>
                        Log This
                      </button>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(10,10,10,0.92) 35%)" }}>
                  <p className="text-2xl mb-2">🔒</p>
                  <p className="text-sm font-semibold text-text-primary mb-1">Pro feature</p>
                  <p className="text-xs text-text-muted mb-3 text-center max-w-[200px]">
                    Personalised meal suggestions based on your calorie budget
                  </p>
                  <a
                    href="/upgrade"
                    className="px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ backgroundColor: "#a78bfa", color: "#fff" }}
                  >
                    Upgrade to Pro
                  </a>
                </div>
              </div>
            ) : chips.length === 0 ? null : (
              <div className="flex flex-col gap-2">
                {chips.map((item) => (
                  <div
                    key={item.food_id}
                    className="flex items-center justify-between px-3 py-2.5 bg-bg-elevated rounded-xl border border-bg-border"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-sm font-medium text-text-primary truncate">{item.food_name}</p>
                      <p className="text-xs text-text-muted">
                        {item.serving_type} · {Math.round(item.serving_calories)} kcal
                        {item.times_logged > 0 && (
                          <span className="ml-1.5 text-accent-primary">· logged {item.times_logged}×</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveMealType(mt as any);
                        setModalPrefillQuery(item.food_name);
                        setShowModal(true);
                      }}
                      className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: "rgba(59,123,255,0.15)", color: "#3B7BFF" }}
                    >
                      Log This
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Recovery Mode Banner — context-aware */}
      {dayStatus?.recovery_day && (() => {
        const ctxInfo = dayStatus.yesterday_context
          ? MEAL_CONTEXTS.find(c => c.value === dayStatus.yesterday_context)
          : null;
        const ctxPhrase = ctxInfo
          ? ` — mostly from ${ctxInfo.emoji} ${ctxInfo.label.toLowerCase()} eating`
          : "";
        const suggestion = ctxInfo && ctxInfo.value !== "home"
          ? "A quiet home-cooked meal today rebalances it."
          : "Lighter portions today will rebalance it.";
        return (
          <div className="mb-4 card p-3 flex items-center gap-3" style={{ borderColor: "#fb923c30", backgroundColor: "#fb923c08" }}>
            <span className="text-xl animate-float" style={{ display: "inline-block" }}>🌱</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "#fb923c" }}>Recovery Day</p>
              <p className="text-xs text-text-muted">
                You ate {dayStatus.yesterday_calories} kcal yesterday (+{dayStatus.surplus_pct}%){ctxPhrase}. {suggestion}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Quick Add */}
      {(frequentFoods.length > 0 || true) && (
        <div className="mb-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Quick Add</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {frequentFoods.map((food) => (
              <button
                key={food.food_id}
                onClick={() => quickLog(food)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-bg-elevated hover:bg-bg-border rounded-xl text-xs transition-all border border-bg-border"
              >
                <span className="text-text-primary font-medium max-w-[90px] truncate">{food.food_name}</span>
                <span className="text-text-muted">·</span>
                <span className="text-accent-primary whitespace-nowrap">{Math.round(food.calories)} kcal</span>
              </button>
            ))}
            <button
              onClick={handleRepeatLast}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-bg-elevated hover:bg-bg-border rounded-xl text-xs transition-all border border-bg-border text-text-secondary hover:text-text-primary"
            >
              <RotateCcw size={12} />
              <span>Repeat last</span>
            </button>
          </div>
        </div>
      )}

      <ContextInsightsCard stats={contextStats} />

      {/* Meal sections — stagger entrance */}
      <div className="space-y-3 mb-20 md:mb-0 stagger">
        {MEAL_TYPES.map((mt) => {
          const logs =
            summary?.meals.filter((m) => m.meal_type === mt.value) || [];
          const mealCals = summary?.meal_breakdown[mt.value] || 0;

          return (
            <div key={mt.value} className="card">
              {/* Meal header */}
              <div className="flex items-center justify-between p-4 border-b border-bg-elevated">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">{mt.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {mt.label}
                    </p>
                    {mealCals > 0 && (
                      <p className="text-xs" style={{ color: mt.color }}>
                        {Math.round(mealCals)} kcal
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveMealType(mt.value);
                    setShowModal(true);
                  }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
                  style={{ backgroundColor: mt.color + "15", color: mt.color }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = mt.color;
                    (e.currentTarget as HTMLElement).style.color = "var(--btn-fg)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = mt.color + "15";
                    (e.currentTarget as HTMLElement).style.color = mt.color;
                  }}
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>

              {/* Entries */}
              {logs.length > 0 ? (
                <div className="divide-y divide-bg-elevated">
                  {logs.map((log: MealLog) =>
                    log.entries.map((entry, ei) => (
                      <div
                        key={`${log.id}-${ei}`}
                        className="flex items-center gap-3 px-4 py-3 group"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: mt.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {entry.food_name}
                          </p>
                          <p className="text-xs text-text-muted">
                            {entry.serving_type} · {Math.round(entry.weight_g)}g
                          </p>
                        </div>
                        <span className="text-sm font-medium text-text-secondary">
                          {Math.round(entry.calories)} kcal
                        </span>
                        <button
                          onClick={() => handleLogAgain(entry, mt.value)}
                          title="Log again"
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-all"
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-400/10 text-text-muted hover:text-red-400 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="px-4 py-3 text-xs text-text-muted italic">
                  Nothing logged yet
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Food Personality share button */}
      {personality && (
        <div className="card p-4 flex items-center justify-between gap-4 mt-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{personality.emoji}</span>
            <div>
              <p className="text-xs text-text-muted">Your food personality</p>
              <p className="text-sm font-semibold text-text-primary">{personality.title}</p>
            </div>
          </div>
          <button
            onClick={() => setShowPersonalityCard(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-shrink-0"
            style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}
          >
            <Sparkles size={13} />
            Share
          </button>
        </div>
      )}

      {/* FAB for mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-accent-primary rounded-full flex items-center justify-center shadow-lg shadow-accent-primary/20 hover:bg-accent-soft transition-colors z-20"
      >
        <Plus size={22} className="text-btn-fg" />
      </button>

      {showModal && (
        <FoodSearchModal
          onClose={() => { setShowModal(false); setModalPrefillQuery(""); }}
          onLogged={fetchSummary}
          defaultMealType={activeMealType}
          defaultDate={date}
          defaultQuery={modalPrefillQuery}
          activeFestival={activeFestival}
          festivalMode={festMode}
        />
      )}

      {showPersonalityCard && personality && (
        <FoodPersonalityCard
          data={personality}
          onClose={() => setShowPersonalityCard(false)}
        />
      )}

    </div>
  );
}
