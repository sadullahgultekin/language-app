export type Grade = 1 | 2 | 3 | 4; // 1=Again 2=Hard 3=Good 4=Easy

export interface SM2State {
  easiness: number;
  interval_days: number;
  repetitions: number;
  learning_step: number;
  lapses: number;
}

export interface ScheduleInput extends SM2State {
  grade: Grade;
  was_due: boolean;
}

export interface ScheduleOutput extends SM2State {
  next_due_minutes: number;
}

// Learning steps in minutes: position 1 = 1 min, position 2 = 10 min
const LEARNING_STEPS = [1, 10];
const MIN_EASINESS = 1.3;

export function schedule(input: ScheduleInput): ScheduleOutput {
  const { grade, was_due } = input;
  let { easiness, interval_days, repetitions, learning_step, lapses } = input;

  // Early-review guard: if not due and grade is not Again, don't advance schedule
  if (!was_due && grade !== 1) {
    return {
      easiness,
      interval_days,
      repetitions,
      learning_step,
      lapses,
      next_due_minutes: interval_days * 24 * 60,
    };
  }

  // --- Learning phase ---
  if (learning_step > 0) {
    if (grade === 1) {
      // Again: restart learning
      learning_step = 1;
      return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: LEARNING_STEPS[0] };
    }
    if (grade === 4) {
      // Easy: graduate immediately
      learning_step = 0;
      repetitions = 1;
      interval_days = 1;
      easiness = Math.min(easiness + 0.15, 5);
      return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: interval_days * 24 * 60 };
    }
    // Hard or Good: advance step
    const nextStep = learning_step + 1;
    if (nextStep > LEARNING_STEPS.length) {
      // Graduate
      learning_step = 0;
      repetitions = 1;
      interval_days = 1;
      return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: interval_days * 24 * 60 };
    }
    learning_step = nextStep;
    return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: LEARNING_STEPS[nextStep - 1] };
  }

  // --- Review phase ---
  if (grade === 1) {
    // Lapse
    easiness = Math.max(MIN_EASINESS, easiness - 0.2);
    lapses += 1;
    repetitions = 0;
    learning_step = 1;
    return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: LEARNING_STEPS[0] };
  }

  repetitions += 1;

  if (grade === 2) {
    // Hard
    easiness = Math.max(MIN_EASINESS, easiness - 0.15);
    interval_days = Math.max(1, interval_days * 1.2);
  } else if (grade === 3) {
    // Good — standard SM-2
    if (repetitions === 1) {
      interval_days = 1;
    } else if (repetitions === 2) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * easiness);
    }
  } else {
    // Easy
    easiness = Math.min(easiness + 0.15, 5);
    if (repetitions === 1) {
      interval_days = 1;
    } else if (repetitions === 2) {
      interval_days = 6;
    } else {
      interval_days = Math.round(interval_days * easiness * 1.3);
    }
  }

  return { easiness, interval_days, repetitions, learning_step, lapses, next_due_minutes: interval_days * 24 * 60 };
}
