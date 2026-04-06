import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import FoodSearchModal from '../components/FoodSearchModal';
import type { MealType } from '../types';
import { MEAL_TYPES } from '../types';

const VALID_MEAL_TYPES = MEAL_TYPES.map((m) => m.value);

export default function LogMeal() {
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [mealType, setMealType] = useState<MealType>('lunch');

  useEffect(() => {
    const param = searchParams.get('meal');
    if (param && (VALID_MEAL_TYPES as string[]).includes(param)) {
      setMealType(param as MealType);
      setShowModal(true);
    }
  }, [searchParams]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-1">Log a Meal</h1>
      <p className="text-xs text-text-muted mb-8">Choose a meal type and search for food items</p>

      <div className="grid grid-cols-1 gap-3 mb-8">
        {MEAL_TYPES.map(mt => (
          <button
            key={mt.value}
            onClick={() => { setMealType(mt.value); setShowModal(true); }}
            className="card flex items-center gap-4 p-4 text-left hover:border-bg-border transition-all group"
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ backgroundColor: mt.color + '18' }}
            >
              {mt.emoji}
            </div>
            <div className="flex-1">
              <p className="font-medium text-text-primary">{mt.label}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {mt.value === 'breakfast' && 'Start your day right'}
                {mt.value === 'lunch' && 'Midday fuel'}
                {mt.value === 'dinner' && 'Evening meal'}
                {mt.value === 'snack' && 'Between meals'}
                {mt.value === 'adhoc' && 'Any time of day'}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: mt.color + '20' }}
            >
              <Plus size={16} style={{ color: mt.color }} />
            </div>
          </button>
        ))}
      </div>

      {showModal && (
        <FoodSearchModal
          onClose={() => setShowModal(false)}
          onLogged={() => {}}
          defaultMealType={mealType}
        />
      )}
    </div>
  );
}
