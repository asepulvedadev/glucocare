export type MeasurementPlan = {
  id: 'default';
  readingsPerDay: 1 | 2 | 3;
  times: string[];
  instructions?: string;
  updatedAt: string;
};

export type NewMeasurementPlan = Omit<MeasurementPlan, 'id' | 'updatedAt'>;
