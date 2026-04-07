from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime, date


# Auth
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    age: Optional[int] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    gender: Optional[str] = None  # male/female/other
    activity_level: Optional[str] = "moderate"  # sedentary/light/moderate/active/very_active
    dietary_preferences: Optional[List[str]] = []  # vegan, keto, vegetarian, etc.
    calorie_goal: Optional[int] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    dietary_preferences: Optional[List[str]] = None
    calorie_goal: Optional[int] = None


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    age: Optional[int] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    dietary_preferences: Optional[List[str]] = []
    calorie_goal: Optional[int] = None
    bmr: Optional[float] = None
    tdee: Optional[float] = None
    is_admin: Optional[bool] = False
    is_pro: bool = False
    ai_uses_remaining: int = 10
    pro_expires_at: Optional[str] = None
    plan_type: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# Food
class FoodItem(BaseModel):
    id: str
    item: str
    category: str
    cuisine: str
    kcal_per_100g: float
    scoop_g: Optional[float] = None
    bowl_g: Optional[float] = None
    restaurant_g: Optional[float] = None
    kcal_per_scoop: Optional[float] = None
    kcal_per_bowl: Optional[float] = None
    kcal_per_restaurant_serving: Optional[float] = None


# Meal Log
class MealEntry(BaseModel):
    food_id: str
    food_name: str
    category: str
    cuisine: str
    serving_type: str  # scoop / bowl / restaurant / custom
    quantity: float = 1.0
    weight_g: float
    calories: float
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class MealLog(BaseModel):
    meal_type: str  # breakfast / lunch / dinner / snack / adhoc
    entries: List[MealEntry]
    notes: Optional[str] = None


class MealLogCreate(BaseModel):
    date: str  # YYYY-MM-DD
    meal_type: str
    entries: List[MealEntry]
    notes: Optional[str] = None
    context: Optional[str] = None  # home/office/restaurant/street_food/travel/party/late_night
    source: Optional[str] = None  # "manual" | "ai"


class MealLogResponse(BaseModel):
    id: str
    user_id: str
    date: str
    meal_type: str
    entries: List[MealEntry]
    total_calories: float
    notes: Optional[str] = None
    context: Optional[str] = None
    source: Optional[str] = None
    created_at: datetime


# AI Meal Estimation
class AIEstimateRequest(BaseModel):
    text: str
    meal_type: str = "lunch"


class AIEstimateItem(BaseModel):
    name: str
    quantity: float
    unit: str = "serving"
    estimated_calories: int


class AIEstimateResponse(BaseModel):
    items: List[AIEstimateItem]
    total_calories: int
    confidence: str  # "high" | "medium" | "low"
    cached: bool = False


class RecommendationItem(BaseModel):
    food_id: str
    food_name: str
    category: str
    serving_type: str
    serving_calories: float
    times_logged: int = 0


class RecommendationsResponse(BaseModel):
    from_history: List[RecommendationItem]
    suggestions: List[RecommendationItem]


class DailySummary(BaseModel):
    date: str
    total_calories: float
    calorie_goal: Optional[int]
    meals: List[dict]
    meal_breakdown: dict


# Custom Foods (user-exclusive)
class CustomFoodCreate(BaseModel):
    name: str
    calories_per_serving: float
    serving_size_g: Optional[float] = 100.0
    combo_items: Optional[List[dict]] = None  # [{food_id, food_name, calories, weight_g, quantity}]


class CustomFoodResponse(BaseModel):
    id: str
    user_id: str
    name: str
    calories_per_serving: float
    serving_size_g: float
    combo_items: Optional[List[dict]] = None
    created_at: str


# Meal Templates
class MealTemplateCreate(BaseModel):
    name: str
    meal_type: str
    entries: List[MealEntry]


# Groups
class GroupCreate(BaseModel):
    name: str


class CheckinRequest(BaseModel):
    mood: Optional[str] = None  # easy | busy | travel | sick | craving | momentum


class GroupSettingsUpdate(BaseModel):
    reset_time: Optional[str] = None   # "HH:MM"
    reset_timezone: Optional[str] = None


class SetAnchorRequest(BaseModel):
    anchor_user_id: Optional[str] = None  # None to unset


class RegenerateCodeRequest(BaseModel):
    expires_in: Optional[str] = None  # "24h" | "7d" | None (never)


class GroupMember(BaseModel):
    user_id: str
    name: str
    checked_in_today: bool
    is_me: bool
    mood: Optional[str] = None
    missed_days: int = 0
    anchor_user_id: Optional[str] = None
    anchor_missing: bool = False


class GroupResponse(BaseModel):
    id: str
    name: str
    code: str
    members: List[GroupMember]
    reset_time: str = "23:00"
    reset_timezone: str = "Asia/Kolkata"
    code_expires_at: Optional[str] = None
    is_creator: bool = False
    anchor_pairs: dict = {}


class WeeklyRecapResponse(BaseModel):
    group_id: str
    group_name: str
    checkin_days: int
    total_possible: int
    best_streak: int
    vs_last_week: int
