#!/usr/bin/env node
/**
 * GOAL-09 — Importador da biblioteca real de exercícios.
 *
 * Baixa o dataset público free-exercise-db (licença pública, ver repo) e as
 * imagens dos exercícios CURADOS abaixo para `public/assets/exercises/<appId>/N.jpg`.
 *
 * Uso:
 *   node scripts/import-exercises.mjs --check   # só valida a curadoria contra o dataset (não escreve nada)
 *   node scripts/import-exercises.mjs           # valida + baixa imagens que ainda não existem
 *
 * Reexecutável: imagens já baixadas são puladas. Se a rede falhar, o script
 * aborta com erro claro e NÃO corrompe arquivos existentes (downloads vão para
 * arquivo temporário e só são movidos após sucesso).
 *
 * A curadoria (SELECTION) mapeia o id usado no app -> id do dataset. Os textos
 * em PT-BR ficam em src/mock/exercises.ts (autorados manualmente, não traduzidos
 * automaticamente); este script cuida apenas de dataset + imagens.
 */

import { mkdir, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';

const DATASET_URLS = [
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json',
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises.json'
];
const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const OUT_DIR = path.join(process.cwd(), 'public', 'assets', 'exercises');
const MAX_IMAGES_PER_EXERCISE = 2;

// appId (usado no app) -> datasetId (free-exercise-db)
export const SELECTION = {
  // ===== PEITO =====
  chest_supino_reto: 'Barbell_Bench_Press_-_Medium_Grip',
  chest_supino_haltere: 'Dumbbell_Bench_Press',
  chest_supino_inclinado_haltere: 'Incline_Dumbbell_Press',
  chest_supino_inclinado_barra: 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  chest_crucifixo_polia: 'Flat_Bench_Cable_Flyes',
  chest_peck_deck: 'Butterfly',
  chest_paralelas: 'Dips_-_Chest_Version',
  chest_flexao_bracos: 'Pushups',
  chest_crucifixo_haltere: 'Dumbbell_Flyes',
  chest_crucifixo_inclinado_haltere: 'Incline_Dumbbell_Flyes',
  chest_crossover_polia: 'Cable_Crossover',
  chest_crossover_baixo: 'Low_Cable_Crossover',
  chest_supino_declinado_barra: 'Decline_Barbell_Bench_Press',
  chest_supino_maquina: 'Machine_Bench_Press',
  chest_pullover_haltere: 'Bent-Arm_Dumbbell_Pullover',

  // ===== COSTAS =====
  back_barra_fixa: 'Pullups',
  back_puxada_pulley: 'Wide-Grip_Lat_Pulldown',
  back_remada_curvada: 'Bent_Over_Barbell_Row',
  back_remada_baixa: 'Seated_Cable_Rows',
  back_serrote: 'One-Arm_Dumbbell_Row',
  back_remada_cavalinho: 'T-Bar_Row_with_Handle',
  back_puxada_triangulo: 'V-Bar_Pulldown',
  back_puxada_supinada: 'Underhand_Cable_Pulldowns',
  back_puxada_fechada: 'Close-Grip_Front_Lat_Pulldown',
  back_barra_fixa_supinada: 'Chin-Up',
  back_pulldown_braco_reto: 'Straight-Arm_Pulldown',
  back_remada_maquina: 'Leverage_Iso_Row',
  back_hiperextensao_lombar: 'Hyperextensions_Back_Extensions',
  back_remada_curvada_supinada: 'Reverse_Grip_Bent-Over_Rows',
  back_remada_invertida: 'Inverted_Row',
  back_encolhimento_halteres: 'Dumbbell_Shrug',
  back_encolhimento_barra: 'Barbell_Shrug',

  // ===== OMBROS =====
  shoulder_desenvolvimento_haltere: 'Dumbbell_Shoulder_Press',
  shoulder_elevecao_lateral: 'Side_Lateral_Raise',
  shoulder_elevecao_posterior: 'Seated_Bent-Over_Rear_Delt_Raise',
  shoulder_desenvolvimento_militar_barra: 'Standing_Military_Press',
  shoulder_desenvolvimento_barra_sentado: 'Seated_Barbell_Military_Press',
  shoulder_desenvolvimento_arnold: 'Arnold_Dumbbell_Press',
  shoulder_desenvolvimento_maquina: 'Machine_Shoulder_Military_Press',
  shoulder_elevacao_frontal_halteres: 'Front_Dumbbell_Raise',
  shoulder_elevacao_lateral_polia: 'Cable_Seated_Lateral_Raise',
  shoulder_face_pull: 'Face_Pull',
  shoulder_crucifixo_inverso_maquina: 'Reverse_Machine_Flyes',
  shoulder_remada_alta_barra: 'Upright_Barbell_Row',

  // ===== BÍCEPS =====
  biceps_rosca_direta: 'Barbell_Curl',
  biceps_rosca_martelo: 'Hammer_Curls',
  biceps_rosca_alternada: 'Dumbbell_Alternate_Bicep_Curl',
  biceps_rosca_scott: 'Preacher_Curl',
  biceps_rosca_scott_maquina: 'Machine_Preacher_Curls',
  biceps_rosca_concentrada: 'Concentration_Curls',
  biceps_rosca_polia: 'Standing_Biceps_Cable_Curl',
  biceps_rosca_martelo_cabo: 'Cable_Hammer_Curls_-_Rope_Attachment',
  biceps_rosca_inclinada: 'Incline_Dumbbell_Curl',
  biceps_rosca_w: 'EZ-Bar_Curl',
  biceps_rosca_inversa: 'Reverse_Barbell_Curl',

  // ===== TRÍCEPS =====
  triceps_polia_corda: 'Triceps_Pushdown_-_Rope_Attachment',
  triceps_testa: 'EZ-Bar_Skullcrusher',
  triceps_supino_fechado: 'Close-Grip_Barbell_Bench_Press',
  triceps_mergulho_banco: 'Bench_Dips',
  triceps_paralelas: 'Dips_-_Triceps_Version',
  triceps_frances_haltere: 'Seated_Triceps_Press',
  triceps_coice: 'Tricep_Dumbbell_Kickback',
  triceps_polia_barra: 'Triceps_Pushdown',
  triceps_polia_v: 'Triceps_Pushdown_-_V-Bar_Attachment',
  triceps_frances_corda_polia: 'Cable_Rope_Overhead_Triceps_Extension',

  // ===== PERNAS =====
  legs_agachamento_barra: 'Barbell_Squat',
  legs_leg_press: 'Leg_Press',
  legs_legpress_45: 'Narrow_Stance_Leg_Press',
  legs_cadeira_extensora: 'Leg_Extensions',
  legs_mesa_flexora: 'Lying_Leg_Curls',
  legs_stiff: 'Stiff-Legged_Barbell_Deadlift',
  legs_levantamento_terra: 'Barbell_Deadlift',
  legs_agachamento_frontal: 'Front_Barbell_Squat',
  legs_agachamento_goblet: 'Goblet_Squat',
  legs_agachamento_corporal: 'Bodyweight_Squat',
  legs_agachamento_hack: 'Hack_Squat',
  legs_agachamento_smith: 'Smith_Machine_Squat',
  legs_agachamento_sumo_halter: 'Plie_Dumbbell_Squat',
  legs_afundo_halteres: 'Dumbbell_Lunges',
  legs_passada_barra: 'Barbell_Walking_Lunge',
  legs_agachamento_bulgaro: 'Split_Squat_with_Dumbbells',
  legs_terra_romeno: 'Romanian_Deadlift',
  legs_terra_sumo: 'Sumo_Deadlift',
  legs_stiff_halteres: 'Stiff-Legged_Dumbbell_Deadlift',
  legs_cadeira_adutora: 'Thigh_Adductor',
  legs_cadeira_abdutora: 'Thigh_Abductor',
  legs_flexora_sentado: 'Seated_Leg_Curl',
  legs_subida_banco: 'Dumbbell_Step_Ups',

  // ===== GLÚTEOS =====
  glutes_elevacao_pelvica: 'Barbell_Hip_Thrust',
  glutes_gluteo_cabo: 'One-Legged_Cable_Kickback',
  glutes_coice_quatro_apoios: 'Glute_Kickback',
  glutes_ponte_solo: 'Butt_Lift_Bridge',
  glutes_ponte_unilateral: 'Single_Leg_Glute_Bridge',
  glutes_bom_dia_barra: 'Good_Morning',

  // ===== PANTURRILHA =====
  calves_panturrilha_em_pe: 'Standing_Calf_Raises',
  calves_panturrilha_sentado: 'Seated_Calf_Raise',
  calves_panturrilha_leg_press: 'Calf_Press_On_The_Leg_Press_Machine',
  calves_panturrilha_halter: 'Standing_Dumbbell_Calf_Raise',
  calves_panturrilha_burro: 'Donkey_Calf_Raises',

  // ===== ABDÔMEN =====
  abs_prancha_abdominal: 'Plank',
  abs_abdominal_supra: 'Crunches',
  abs_abdominal_declinado: 'Decline_Crunch',
  abs_abdominal_polia: 'Cable_Crunch',
  abs_abdominal_maquina: 'Ab_Crunch_Machine',
  abs_abdominal_infra: 'Flat_Bench_Lying_Leg_Raise',
  abs_elevacao_pernas_barra: 'Hanging_Leg_Raise',
  abs_prancha_lateral: 'Side_Bridge',
  abs_abdominal_obliquo: 'Oblique_Crunches',
  abs_russian_twist: 'Russian_Twist',

  // ===== CARDIO =====
  cardio_corrida_esteira: 'Running_Treadmill',
  cardio_caminhada_esteira: 'Walking_Treadmill',
  cardio_bicicleta: 'Bicycling_Stationary',
  cardio_eliptico: 'Elliptical_Trainer',
  cardio_pular_corda: 'Rope_Jumping',
  cardio_remo_ergometro: 'Rowing_Stationary',
  cardio_escada: 'Step_Mill',

  // ===== FUNCIONAL =====
  functional_kettlebell_swing: 'One-Arm_Kettlebell_Swings',
  functional_escalador: 'Mountain_Climbers',
  functional_farmer_walk: 'Farmers_Walk',
  functional_battle_rope: 'Battling_Ropes',

  // ===== MOBILIDADE =====
  mobility_alongamento_posterior: 'Hamstring_Stretch',
  mobility_alongamento_quadriceps: 'Quad_Stretch',
  mobility_gato_coluna: 'Cat_Stretch',
  mobility_alongamento_peitoral: 'Dynamic_Chest_Stretch',
  mobility_flexores_quadril: 'Kneeling_Hip_Flexor'
};

async function fetchDataset() {
  let lastError = null;
  for (const url of DATASET_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error(`Dataset vazio/inesperado em ${url}`);
      console.log(`Dataset carregado de ${url} (${data.length} exercícios).`);
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`Falha ao baixar ${url}: ${err.message}`);
    }
  }
  throw new Error(`Não foi possível baixar o dataset (rede?): ${lastError?.message}. Nenhum arquivo foi alterado.`);
}

async function fileExists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function downloadImage(remoteRelPath, destPath) {
  const url = IMAGE_BASE + remoteRelPath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`Imagem suspeita (${buf.length} bytes) em ${url}`);
  const tmp = destPath + '.tmp';
  await writeFile(tmp, buf);
  await rename(tmp, destPath); // atômico: nunca deixa arquivo corrompido no destino
  return buf.length;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const dataset = await fetchDataset();
  const byId = new Map(dataset.map((e) => [e.id, e]));

  const missing = [];
  const noImages = [];
  for (const [appId, datasetId] of Object.entries(SELECTION)) {
    const entry = byId.get(datasetId);
    if (!entry) missing.push(`${appId} -> ${datasetId}`);
    else if (!Array.isArray(entry.images) || entry.images.length === 0) noImages.push(`${appId} -> ${datasetId}`);
  }
  if (missing.length > 0 || noImages.length > 0) {
    if (missing.length) console.error('IDs INEXISTENTES no dataset:\n  ' + missing.join('\n  '));
    if (noImages.length) console.error('SEM IMAGENS no dataset:\n  ' + noImages.join('\n  '));
    process.exit(1);
  }
  console.log(`Curadoria validada: ${Object.keys(SELECTION).length} exercícios, todos existem no dataset com imagens.`);
  if (checkOnly) return;

  let downloaded = 0;
  let skipped = 0;
  for (const [appId, datasetId] of Object.entries(SELECTION)) {
    const entry = byId.get(datasetId);
    const dir = path.join(OUT_DIR, appId);
    await mkdir(dir, { recursive: true });
    const images = entry.images.slice(0, MAX_IMAGES_PER_EXERCISE);
    for (let i = 0; i < images.length; i++) {
      const dest = path.join(dir, `${i}.jpg`);
      if (await fileExists(dest)) { skipped++; continue; }
      await downloadImage(images[i], dest);
      downloaded++;
    }
  }
  console.log(`Imagens: ${downloaded} baixadas, ${skipped} já existiam.`);
}

main().catch((err) => {
  console.error(`ERRO: ${err.message}`);
  process.exit(1);
});
