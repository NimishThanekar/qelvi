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
  created_at: string;
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

export interface GroupMember {
  user_id: string;
  name: string;
  checked_in_today: boolean;
  is_me: boolean;
  mood?: MoodKey | null;
  missed_days: number;
  anchor_user_id?: string | null;
  anchor_missing?: boolean;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  members: GroupMember[];
  reset_time: string;
  reset_timezone: string;
  code_expires_at?: string | null;
  is_creator: boolean;
  anchor_pairs: Record<string, string>;
}

export interface WeeklyRecap {
  group_id: string;
  group_name: string;
  checkin_days: number;
  total_possible: number;
  best_streak: number;
  vs_last_week: number;
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

export interface DailySummary {
  date: string;
  total_calories: number;
  calorie_goal?: number;
  meals: MealLog[];
  meal_breakdown: Record<string, number>;
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
  'Veg bhaji / sabzi': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&q=80',
  'Dal / pulses / legumes': 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400&q=80',
  'Staples / breakfast / rice': 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&q=80',
  'Rice / biryani': 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80',
  'Chinese / Indo-Chinese': 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
  'South Indian': 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400&q=80',
  'Fish / seafood': 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
  'Non-veg curry / dry': 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&q=80',
  'Street food / fast food': 'https://images.unsplash.com/photo-1555126634-323283e090fa?w=400&q=80',
  'Cafe / international fast food': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80',
  'Bakery / snacks / sweets': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80',
  'Salad': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
  'Drink': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&q=80',
  'Alcoholic drink': 'https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=400&q=80',
};

export const getCategoryImage = (category: string): string =>
  CATEGORY_IMAGES[category] || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80';
