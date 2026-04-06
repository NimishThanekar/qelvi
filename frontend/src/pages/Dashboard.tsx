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
} from "lucide-react";
import { logsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import type { DailySummary, MealLog, FrequentFood, DayStatus, ContextStat } from "../types";
import { MEAL_TYPES, MEAL_CONTEXTS } from "../types";
import CalorieRing from "../components/CalorieRing";
import CaloriePace from "../components/CaloriePace";
import WeeklyWrap from "../components/WeeklyWrap";
import ContextInsightsCard from "../components/ContextInsightsCard";
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

  useEffect(() => {
    logsApi.frequent().then((r) => setFrequentFoods(r.data)).catch(() => {});
    logsApi.dayStatus().then((r) => setDayStatus(r.data)).catch(() => {});
    logsApi.contextStats().then((r) => setContextStats(r.data)).catch(() => {});
  }, []);

  const changeDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  };

  const isToday = date === new Date().toISOString().split("T")[0];

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
          {/* Ambient glow blob behind the ring */}
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl animate-ambient"
            style={{
              background:
                "radial-gradient(ellipse at 50% 44%, rgba(var(--accent-rgb) / 0.14) 0%, transparent 62%)",
            }}
          />
          <div className="relative z-10">
            <CalorieRing consumed={consumed} goal={goal} size={150} />
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

      {/* Calorie Pace — real-time projection for today */}
      {isToday && consumed > 0 && <CaloriePace consumed={consumed} goal={goal} />}

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

      {/* FAB for mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-accent-primary rounded-full flex items-center justify-center shadow-lg shadow-accent-primary/20 hover:bg-accent-soft transition-colors z-20"
      >
        <Plus size={22} className="text-btn-fg" />
      </button>

      {showModal && (
        <FoodSearchModal
          onClose={() => setShowModal(false)}
          onLogged={fetchSummary}
          defaultMealType={activeMealType}
          defaultDate={date}
        />
      )}

    </div>
  );
}
