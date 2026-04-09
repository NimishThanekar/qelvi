export interface FoodItem {
  id: string;
  item: string;
  category: string;
  cuisine: string;
  kcal_per_100g: number;
  scoop_g?: number;
  bowl_g?: number;
  restaurant_g?: number;
  piece_g?: number;
  kcal_per_scoop?: number;
  kcal_per_bowl?: number;
  kcal_per_restaurant_serving?: number;
  kcal_per_piece?: number;
  meal_category?: string;
  meal_tags?: string[];
  food_image_url?: string;
  is_custom?: boolean;
  combo_items?: { food_id: string; food_name: string; calories: number; weight_g: number; quantity: number }[];
}

export interface MealEntry {
  food_id: string;
  food_name: string;
  category: string;
  cuisine: string;
  serving_type: 'scoop' | 'bowl' | 'restaurant' | 'piece' | 'custom';
  quantity: number;
  weight_g: number;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface MealLog {
  id: string;
  user_id: string;
  date: string;
  meal_type: string;
  entries: MealEntry[];
  total_calories: number;
  notes?: string;
  context?: string;
  source?: string;
  created_at: string;
}

export interface AIEstimateItem {
  name: string;
  quantity: number;
  unit: string;
  estimated_calories: number;
}

export interface AIEstimateResponse {
  items: AIEstimateItem[];
  total_calories: number;
  confidence: 'high' | 'medium' | 'low';
  cached: boolean;
}

export interface FrequentFood extends MealEntry {
  count: number;
}

export interface MealTemplate {
  id: string;
  user_id: string;
  name: string;
  meal_type: string;
  entries: MealEntry[];
  total_calories: number;
  created_at: string;
}

export type MoodKey = "easy" | "busy" | "travel" | "sick" | "craving" | "momentum";

export const MOODS: Record<MoodKey, { emoji: string; label: string; color: string }> = {
  easy:     { emoji: "☀️", label: "Easy day",      color: "#fbbf24" },
  busy:     { emoji: "⚡", label: "Busy",           color: "#fb923c" },
  travel:   { emoji: "✈️", label: "Travel",         color: "#38bdf8" },
  sick:     { emoji: "🤒", label: "Sick",           color: "#94a3b8" },
  craving:  { emoji: "🌊", label: "Craving-heavy", color: "#f87171" },
  momentum: { emoji: "🔥", label: "Good momentum", color: "#4ade80" },
};

export const MOOD_LIST = (Object.entries(MOODS) as [MoodKey, { emoji: string; label: string; color: string }][])
  .map(([key, v]) => ({ key, ...v }));

export interface Buddy {
  id: string;
  code: string;
  streak: number;
  buddy_name: string | null;
  buddy_checked_in_today: boolean;
  my_checked_in_today: boolean;
  created_at: string;
}

export interface DayStatus {
  date: string;
  recovery_day: boolean;
  yesterday_calories: number;
  surplus_pct: number;
  calorie_goal: number;
  yesterday_context?: string;
}

export interface ContextStat {
  context: string;
  avg_calories: number;
  count: number;
  over_goal_pct: number;
  days_with_context: number;
  vs_home_delta: number | null;
}

export interface ContextInsightFull extends ContextStat {
  top_foods: string[];
  day_of_week: Record<string, number>;       // "0"–"6" -> avg kcal
  day_of_week_count: Record<string, number>; // "0"–"6" -> number of logs
  peak_day: string | null;
  prev_avg_calories: number | null;
  trend_pct: number | null; // positive = calories went UP vs prior 30 days
}

export interface DailySummary {
  date: string;
  total_calories: number;
  calorie_goal?: number;
  meals: MealLog[];
  meal_breakdown: Record<string, number>;
  festival_adjustment?: FestivalAdjustment | null;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'adhoc';

export const MEAL_TYPES: { value: MealType; label: string; emoji: string; color: string }[] = [
  { value: 'breakfast', label: 'Breakfast', emoji: '🌅', color: '#fbbf24' },
  { value: 'lunch', label: 'Lunch', emoji: '☀️', color: '#fb923c' },
  { value: 'dinner', label: 'Dinner', emoji: '🌙', color: '#a78bfa' },
  { value: 'snack', label: 'Snack', emoji: '🍎', color: '#34d399' },
  { value: 'adhoc', label: 'Anytime', emoji: '⚡', color: '#38bdf8' },
];

export const MEAL_CONTEXTS = [
  { value: 'home', label: 'Home', emoji: '🏠' },
  { value: 'office', label: 'Office', emoji: '💼' },
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { value: 'street_food', label: 'Street', emoji: '🛺' },
  { value: 'travel', label: 'Travel', emoji: '✈️' },
  { value: 'party', label: 'Party', emoji: '🎉' },
  { value: 'late_night', label: 'Late Night', emoji: '🌙' },
];

export const CATEGORY_IMAGES: Record<string, string> = {
  // Existing categories (both slug formats for compatibility)
  'Veg bhaji/sabzi': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80',
  'Veg bhaji / sabzi': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80',
  'Dal/pulses/legumes': 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400&q=80',
  'Dal / pulses / legumes': 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400&q=80',
  'Staples/breakfast/rice': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80',
  'Staples / breakfast / rice': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80',
  'Rice/biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80',
  'Rice / biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80',
  'Chinese/Indo-Chinese': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
  'Chinese / Indo-Chinese': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
  'South Indian': 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&q=80',
  'Fish/seafood': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
  'Fish / seafood': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
  'Non-veg curry/dry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  'Non-veg curry / dry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  'Street food/fast food': 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=400&q=80',
  'Street food / fast food': 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=400&q=80',
  'Cafe/international': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'Cafe / international': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'Cafe / international fast food': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'Bakery/snacks/sweets': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',
  'Bakery / snacks / sweets': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',
  'Salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
  'Drink': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
  'Alcoholic drink': 'https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=400&q=80',
  // New categories
  'Bread/roti/flatbreads': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',
  'North Indian': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80',
  'Mughlai': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  'Gujarati': 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400&q=80',
  'Bengali': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
  'Rajasthani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80',
  'Egg dishes': 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&q=80',
  'Pizza': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80',
  'Burger/sandwich': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'Dessert/mithai': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
  'Dairy/milk products': 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400&q=80',
  'Soup': 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=80',
  'Noodles/pasta': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
  'Protein/fitness foods': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400&q=80',
  'Fruits': 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=80',
};

export const getCategoryImage = (category: string): string =>
  CATEGORY_IMAGES[category] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80';


export interface RecommendationItem {
  food_id: string;
  food_name: string;
  category: string;
  serving_type: string;
  serving_calories: number;
  times_logged: number;
}

export interface RecommendationsResponse {
  from_history: RecommendationItem[];
  suggestions: RecommendationItem[];
}

export interface FestivalAdjustment {
  festival_id: string;
  festival_name: string;
  original_goal: number;
  adjusted_goal: number;
  type: string;
  emoji: string;
  color_accent: string;
  ambient_effect: string;
  description: string;
  goal_multiplier: number;
  festival_mode: string;
  start_date: string;
  end_date: string;
}

export interface FestivalInfo {
  id: string;
  name: string;
  country: string;
  start_date: string;
  end_date: string;
  type: string;
  goal_multiplier: number;
  emoji: string;
  color_accent: string;
  ambient_effect: string;
  description: string;
  food_keywords: string[];
  recovery_days: number;
}

export interface FestivalRecovery {
  festival_name: string;
  festival_emoji: string;
  ended_date: string;
  recovery_days_total: number;
  recovery_day_current: number;
  excess_calories: number;
  suggested_daily_reduction: number;
  suggested_goal: number;
}

export interface ActiveFestivalsResponse {
  active: FestivalInfo[];
  upcoming: FestivalInfo | null;
  recovery: FestivalRecovery | null;
}

export interface FoodPersonalityStats {
  tracked_days: number;
  avg_daily_calories: number;
  top_food: string | null;
  top_context: string | null;
  consistency_pct: number;
  calorie_goal: number;
}

export interface FoodPersonality {
  personality_type: string;
  title: string;
  emoji: string;
  description: string;
  stats: FoodPersonalityStats;
}

export interface FestivalHistory {
  festival_id: string;
  festival_name: string;
  emoji: string;
  start_date: string;
  end_date: string;
  avg_during: number;
  avg_before: number | null;
  delta_pct: number | null;
  excess_calories: number | null;
  days_logged: number;
}

/** Alias kept for clarity in recovery-card code */
export type RecoveryInfo = FestivalRecovery;

export interface FestivalFoodItem {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  kcal_per_100g: number;
  serving_calories: number | null;
}

export interface ReferralStats {
  referral_code: string;
  referral_count: number;
  total_pro_days_earned: number;
  is_practitioner: boolean;
}

export interface PatientListItem {
  patient_id: string;
  name: string;
  email: string;
  last_active: string | null;
  days_since_last_log: number | null;
  is_active: boolean;
  avg_calories_30d: number | null;
  calorie_goal: number | null;
  adherence_rate: number;
  current_streak: number;
}

export interface PatientAlert {
  patient_id: string;
  name: string;
  adherence_rate: number;
  days_since_last_log: number | null;
}

export interface PractitionerOverview {
  total_patients: number;
  active_patients: number;
  inactive_patients: number;
  avg_adherence_rate: number;
  patients_needing_attention: PatientAlert[];
  top_performing_patients: PatientAlert[];
}

export interface PatientSummary {
  patient_id: string;
  name: string;
  email: string;
  calorie_goal: number | null;
  avg_calories_30d: number | null;
  avg_calories_7d: number | null;
  best_day_calories: number | null;
  worst_day_calories: number | null;
  days_logged_30d: number;
  adherence_rate: number;
  current_streak: number;
  meal_distribution: Record<string, number>;
  context_distribution: Record<string, number>;
  top_foods: { food_name: string; count: number }[];
  weekly_trend: { week_start: string; week_end: string; avg_calories: number; days_logged: number }[];
  food_variety_score: number;
}

export interface WeeklyWrapData {
  week_start: string;
  week_end: string;
  total_calories: number;
  avg_daily_calories: number;
  best_day: string | null;
  most_logged_food: string | null;
  most_common_meal_type: string | null;
  streak: number;
  context_breakdown: Record<string, number>;
  consistency_score: number;
  vs_previous_week: number | null;
  title: string;
  title_emoji: string;
  days_logged: number;
  total_meals: number;
  unique_foods: number;
  calorie_goal: number;
}
