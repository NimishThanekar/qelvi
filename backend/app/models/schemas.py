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


class MealLogResponse(BaseModel):
    id: str
    user_id: str
    date: str
    meal_type: str
    entries: List[MealEntry]
    total_calories: float
    notes: Optional[str] = None
    context: Optional[str] = None
    created_at: datetime


class DailySummary(BaseModel):
    date: str
    total_calories: float
    calorie_goal: Optional[int]
    meals: List[dict]
    meal_breakdown: dict


# Meal Templates
class MealTemplateCreate(BaseModel):
    name: str
    meal_type: str
    entries: List[MealEntry]


# Groups
class GroupCreate(BaseModel):
    name: str


class GroupMember(BaseModel):
    user_id: str
    name: str
    checked_in_today: bool
    is_me: bool


class GroupResponse(BaseModel):
    id: str
    name: str
    code: str
    members: List[GroupMember]
