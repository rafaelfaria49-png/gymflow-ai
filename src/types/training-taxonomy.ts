export type MuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'cardio'
  | 'mobility'
  | 'full_body'
  | 'functional'
  | 'legs_general'
  | 'adductors'
  | 'abductors'
  | 'lower_back'
  | 'forearms'
  | 'traps';

export type MuscleGroupCategory =
  | 'upper_body'
  | 'lower_body'
  | 'trunk'
  | 'whole_body'
  | 'conditioning'
  | 'mobility';

export interface MuscleGroupDefinition {
  id: MuscleGroupId;
  label: string;
  aliases: readonly string[];
  order: number;
  category: MuscleGroupCategory;
  description?: string;
}

export type MovementPatternId =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hip_hinge'
  | 'knee_extension'
  | 'knee_flexion'
  | 'hip_extension'
  | 'hip_abduction'
  | 'hip_adduction'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'shoulder_abduction'
  | 'shoulder_flexion'
  | 'shoulder_extension'
  | 'calf_raise'
  | 'trunk_flexion'
  | 'trunk_extension'
  | 'trunk_rotation'
  | 'anti_extension'
  | 'anti_rotation'
  | 'locomotion'
  | 'mobility'
  | 'full_body_conditioning';

export type MovementPatternCategory =
  | 'upper_body'
  | 'lower_body'
  | 'trunk'
  | 'whole_body'
  | 'conditioning'
  | 'mobility';

export interface MovementPatternDefinition {
  id: MovementPatternId;
  label: string;
  description: string;
  category: MovementPatternCategory;
  aliases: readonly string[];
  technicalNote?: string;
}

export type ExerciseMechanics =
  | 'compound'
  | 'isolation'
  | 'cardio'
  | 'mobility'
  | 'functional';

export type ExerciseLaterality =
  | 'bilateral'
  | 'unilateral'
  | 'alternating'
  | 'not_applicable';

export type ExerciseBodyPosition =
  | 'standing'
  | 'seated'
  | 'lying'
  | 'prone'
  | 'kneeling'
  | 'supported'
  | 'hanging'
  | 'dynamic';

// Bancos, racks, barras, halteres e kettlebells são equipamentos específicos.
// As categorias descrevem famílias operacionais e evitam misturar nível e instância.
export type EquipmentCategory =
  | 'bodyweight'
  | 'free_weight'
  | 'cable'
  | 'selectorized_machine'
  | 'plate_loaded_machine'
  | 'articulated_machine'
  | 'cardio_machine'
  | 'support'
  | 'accessory'
  | 'resistance_band'
  | 'suspension'
  | 'floor'
  | 'other';

export type EquipmentStatus = 'active' | 'legacy' | 'planned';

export type EquipmentLoadType =
  | 'bodyweight'
  | 'fixed'
  | 'selectorized'
  | 'plate_loaded'
  | 'free_weight'
  | 'resistance'
  | 'not_applicable';

export type EquipmentId =
  | 'bodyweight'
  | 'exercise_mat'
  | 'weight_plates'
  | 'ankle_weights'
  | 'step_platform'
  | 'plyo_box'
  | 'resistance_band'
  | 'suspension_trainer'
  | 'jump_rope'
  | 'battle_rope'
  | 'barbell'
  | 'ez_bar'
  | 't_bar'
  | 'pull_up_bar'
  | 'parallel_bars'
  | 'smith_machine'
  | 'power_rack'
  | 'bench_press_rack'
  | 'weight_bench'
  | 'flat_bench'
  | 'incline_bench'
  | 'decline_bench'
  | 'upright_bench'
  | 'scott_bench'
  | 'roman_chair'
  | 'dumbbells'
  | 'kettlebells'
  | 'cable_crossover'
  | 'high_cable_station'
  | 'low_cable_station'
  | 'straight_bar_attachment'
  | 'v_bar_attachment'
  | 'rope_attachment'
  | 'triangle_handle'
  | 'leg_press_machine'
  | 'leg_press_45'
  | 'leg_press_90'
  | 'squat_machine'
  | 'hack_squat_machine'
  | 'seated_hack_squat_machine'
  | 'pendulum_squat_machine'
  | 'front_squat_machine'
  | 'leg_extension_machine'
  | 'seated_leg_curl_machine'
  | 'lying_leg_curl_machine'
  | 'articulated_leg_curl_machine'
  | 'standing_leg_curl_machine'
  | 'sumo_squat_machine'
  | 'glute_kickback_machine'
  | 'hip_thrust_setup'
  | 'hip_thrust_machine'
  | 'hip_abductor_machine'
  | 'hip_adductor_machine'
  | 'calf_raise_machine'
  | 'standing_calf_raise_machine'
  | 'seated_calf_raise_machine'
  | 'donkey_calf_machine'
  | 'abdominal_machine'
  | 'chest_press_machine'
  | 'articulated_chest_press_machine'
  | 'vertical_chest_press_machine'
  | 'incline_chest_press_machine'
  | 'flat_chest_press_machine'
  | 'decline_chest_press_machine'
  | 'incline_fly_machine'
  | 'pec_deck_machine'
  | 'reverse_pec_deck_machine'
  | 'pullover_machine'
  | 'seated_row_machine'
  | 'articulated_row_machine'
  | 'inverted_row_machine'
  | 'articulated_lat_pulldown_machine'
  | 'reverse_grip_pulldown_machine'
  | 'scott_curl_machine'
  | 'triceps_extension_machine'
  | 'shoulder_press_machine'
  | 'articulated_shoulder_press_machine'
  | 'stationary_bike'
  | 'elliptical'
  | 'treadmill'
  | 'rowing_ergometer'
  | 'stair_climber';

export interface EquipmentDefinition {
  id: EquipmentId;
  label: string;
  category: EquipmentCategory;
  aliases: readonly string[];
  searchTerms: readonly string[];
  status: EquipmentStatus;
  loadType: EquipmentLoadType;
  description?: string;
  unilateralSupported?: boolean;
  plateCalculatorCompatible?: boolean;
  typicalIncrementKg?: number;
}

export type EquipmentResolutionKind =
  | 'exact'
  | 'alias'
  | 'legacy-map'
  | 'generic'
  | 'unresolved';

export interface EquipmentResolution {
  raw: string;
  normalized: string;
  equipmentIds: readonly EquipmentId[];
  resolution: EquipmentResolutionKind;
  warnings?: readonly string[];
}

export interface TaxonomyValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface TaxonomyValidationReport {
  valid: boolean;
  errors: readonly TaxonomyValidationIssue[];
  warnings: readonly TaxonomyValidationIssue[];
  collisions: readonly string[];
}
