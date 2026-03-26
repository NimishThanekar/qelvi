import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { logsApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useAccentColor } from "../store/themeStore";
import type { DailySummary, MealLog } from "../types";
import { MEAL_TYPES } from "../types";
import CalorieRing from "../components/CalorieRing";
import FoodSearchModal from "../components/FoodSearchModal";
import toast from "react-hot-toast";

export default function Dashboard() {
  const { user } = useAuthStore();
  const accentColor = useAccentColor();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [_loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeMealType, setActiveMealType] = useState<any>("lunch");

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Calorie ring card */}
        <div className="card p-5 flex flex-col items-center col-span-1">
          <CalorieRing consumed={consumed} goal={goal} size={150} />
          <div className="mt-4 w-full grid grid-cols-2 gap-2">
            <div className="bg-bg-elevated rounded-xl p-3 text-center">
              <p className="text-xs text-text-muted mb-1">Remaining</p>
              <p
                className="text-lg font-bold"
                style={{ color: remaining === 0 ? "#f87171" : accentColor }}
              >
                {Math.round(remaining)}
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

        {/* Stats cards */}
        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-3">
          {[
            {
              label: "Consumed",
              value: Math.round(consumed),
              unit: "kcal",
              icon: Flame,
              color: "#fb923c",
            },
            {
              label: "Progress",
              value: `${Math.round(pct)}%`,
              unit: "of goal",
              icon: Target,
              color: accentColor,
            },
            {
              label: "Meals logged",
              value: summary?.meals.length || 0,
              unit: "entries",
              icon: Coffee,
              color: "#38bdf8",
            },
            {
              label: "BMR",
              value: user?.bmr ? Math.round(user.bmr) : "—",
              unit: "base rate",
              icon: TrendingUp,
              color: "#a78bfa",
            },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-text-muted">{stat.label}</p>
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: stat.color + "20" }}
                >
                  <stat.icon size={13} style={{ color: stat.color }} />
                </div>
              </div>
              <p className="text-2xl font-bold text-text-primary">{stat.value}</p>
              <p className="text-xs text-text-muted mt-0.5">{stat.unit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Meal sections */}
      <div className="space-y-3 mb-20 md:mb-0">
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
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all hover:text-black"
                  style={{ backgroundColor: mt.color + "15", color: mt.color }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = mt.color;
                    (e.currentTarget as HTMLElement).style.color = "#000";
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
        <Plus size={22} className="text-black" />
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
