export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealEvent = {
  id: string;
  mealType: MealType;
  occurredAt: string;
  note?: string;
  createdAt: string;
  syncState: 'local' | 'pending' | 'synced' | 'failed';
};

export type NewMealEvent = Omit<MealEvent, 'id' | 'createdAt' | 'syncState'>;

export const mealTypeLabel: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Merienda',
};
