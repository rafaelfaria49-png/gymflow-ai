const EXERCISE_TO_VIDEO_ID: Record<string, string> = {
  chest_supino_reto: 'vid_supino_1',
  legs_agachamento_barra: 'vid_agachamento_1',
  back_remada_curvada: 'vid_remada_1',
  legs_levantamento_terra: 'vid_terra_1',
  glutes_elevacao_pelvica: 'extra_vid_technique_2',
  legs_legpress_45: 'extra_vid_machines_1',
  legs_stiff: 'vid_terra_2'
};

const VIDEO_TO_EXERCISE_ID: Record<string, string> = {
  vid_supino_1: 'chest_supino_reto',
  vid_supino_2: 'chest_supino_reto',
  vid_supino_3: 'chest_supino_reto',
  vid_agachamento_1: 'legs_agachamento_barra',
  vid_agachamento_2: 'legs_agachamento_barra',
  vid_agachamento_3: 'legs_agachamento_barra',
  vid_remada_1: 'back_remada_curvada',
  vid_remada_2: 'back_remada_curvada',
  vid_terra_1: 'legs_levantamento_terra',
  vid_terra_2: 'legs_stiff',
  extra_vid_technique_2: 'glutes_elevacao_pelvica',
  extra_vid_technique_6: 'glutes_elevacao_pelvica',
  extra_vid_machines_1: 'legs_legpress_45',
  extra_vid_machines_5: 'legs_legpress_45'
};

export function getTechniqueVideoIdForExerciseId(exerciseId: string) {
  return EXERCISE_TO_VIDEO_ID[exerciseId] ?? 'vid_supino_1';
}

export function getExerciseIdForTechniqueVideoId(videoId: string) {
  return VIDEO_TO_EXERCISE_ID[videoId] ?? null;
}
