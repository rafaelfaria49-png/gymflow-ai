import type { Exercise } from '../../types';
import type {
  EquipmentCategory,
  EquipmentId,
} from '../../types/training-taxonomy';
import { getCurrentCivilDate, isValidCivilDate } from '../../lib/training-profile';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_REGISTRY,
  getEquipmentDefinition,
} from '../../lib/equipment-registry';
import { resolveLegacyEquipment } from '../../lib/equipment-legacy-map';

export const GYM_PROFILE_SCHEMA_VERSION = 1 as const;

export type GymProfileKind = 'gym' | 'home' | 'travel';

export type GymEquipmentAvailabilityStatus = 'available' | 'unavailable' | 'crowded';

export interface GymProfileEquipment {
  equipmentId: EquipmentId;
  status: GymEquipmentAvailabilityStatus;
  /** Data civil em que uma indisponibilidade temporária deixa de valer. */
  unavailableUntil?: string;
}

export interface GymProfile {
  id: string;
  name: string;
  kind: GymProfileKind;
  isDefault: boolean;
  equipment: GymProfileEquipment[];
}

/** Coleção persistida; `null` significa que o usuário ainda não configurou um perfil. */
export interface GymProfileState {
  schemaVersion: typeof GYM_PROFILE_SCHEMA_VERSION;
  activeProfileId: string;
  profiles: GymProfile[];
}

export interface GymProfileAvailability {
  profileId: string;
  profileName: string;
  availableEquipment: EquipmentId[];
  unavailableEquipment: EquipmentId[];
  crowdedEquipment: EquipmentId[];
  statuses: Partial<Record<EquipmentId, GymEquipmentAvailabilityStatus>>;
}

export type GymProfileExerciseAvailabilityStatus =
  | GymEquipmentAvailabilityStatus
  | 'unverified';

export interface GymProfileExerciseAvailability {
  status: GymProfileExerciseAvailabilityStatus;
  equipmentIds: EquipmentId[];
}

export interface GymProfileValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface GymProfileValidationResult {
  valid: boolean;
  errors: readonly GymProfileValidationIssue[];
}

export const GYM_PROFILE_KIND_LABELS: Readonly<Record<GymProfileKind, string>> = Object.freeze({
  gym: 'Academia',
  home: 'Casa',
  travel: 'Viagem',
});

export const EQUIPMENT_CATEGORY_LABELS: Readonly<Record<EquipmentCategory, string>> = Object.freeze({
  bodyweight: 'Peso corporal',
  free_weight: 'Pesos livres',
  cable: 'Polias e cabos',
  selectorized_machine: 'Máquinas com pinos',
  plate_loaded_machine: 'Máquinas com anilhas',
  articulated_machine: 'Máquinas articuladas',
  cardio_machine: 'Cardio',
  support: 'Bancos e suportes',
  accessory: 'Acessórios',
  resistance_band: 'Faixas elásticas',
  suspension: 'Suspensão',
  floor: 'Solo',
  other: 'Outros',
});

export const GYM_PROFILE_CATEGORIES: readonly EquipmentCategory[] = Object.freeze([
  ...EQUIPMENT_CATEGORIES,
]);

/**
 * Seed do Founder: o catálogo canônico já carrega labels e aliases em PT-BR.
 * Um perfil novo começa com toda a lista ativa disponível; a pessoa só precisa
 * retirar o que não existe no local em vez de marcar dezenas de itens.
 */
export const FOUNDER_GYM_PROFILE_EQUIPMENT: readonly EquipmentId[] = Object.freeze(
  EQUIPMENT_REGISTRY
    .map((definition) => definition.id),
);

const GYM_PROFILE_KINDS = new Set<GymProfileKind>(['gym', 'home', 'travel']);
const AVAILABILITY_STATUSES = new Set<GymEquipmentAvailabilityStatus>([
  'available',
  'unavailable',
  'crowded',
]);
const EQUIPMENT_IDS = new Set<EquipmentId>(EQUIPMENT_REGISTRY.map((definition) => definition.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGymProfileKind(value: unknown): value is GymProfileKind {
  return typeof value === 'string' && GYM_PROFILE_KINDS.has(value as GymProfileKind);
}

function isGymEquipmentAvailabilityStatus(value: unknown): value is GymEquipmentAvailabilityStatus {
  return typeof value === 'string' && AVAILABILITY_STATUSES.has(value as GymEquipmentAvailabilityStatus);
}

function isEquipmentId(value: unknown): value is EquipmentId {
  return typeof value === 'string' && EQUIPMENT_IDS.has(value as EquipmentId);
}

function cleanProfileId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id.length > 0 ? id : null;
}

function cleanProfileName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length > 0 ? name.slice(0, 80) : null;
}

function cloneEquipment(item: GymProfileEquipment): GymProfileEquipment {
  return item.unavailableUntil
    ? { ...item, unavailableUntil: item.unavailableUntil }
    : { equipmentId: item.equipmentId, status: item.status };
}

function cloneProfile(profile: GymProfile): GymProfile {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    isDefault: profile.isDefault,
    equipment: profile.equipment.map(cloneEquipment),
  };
}

function profileEquipmentMap(profile: GymProfile): Map<EquipmentId, GymProfileEquipment> {
  return new Map(profile.equipment.map((item) => [item.equipmentId, item]));
}

export function getTodayCivilDate(now: Date | string = new Date()): string {
  return typeof now === 'string' ? now : getCurrentCivilDate(now);
}

/**
 * A data de expiração é inclusiva: quando o calendário chega nela, o equipamento
 * volta a ser considerado disponível. Isso evita manter um item bloqueado além do
 * dia que o usuário informou.
 */
export function isTemporaryUnavailabilityExpired(
  unavailableUntil: string | undefined,
  todayCivilDate = getTodayCivilDate(),
): boolean {
  return Boolean(
    unavailableUntil
    && isValidCivilDate(unavailableUntil)
    && isValidCivilDate(todayCivilDate)
    && unavailableUntil <= todayCivilDate,
  );
}

export function getGymProfileEquipmentStatus(
  profile: GymProfile,
  equipmentId: EquipmentId,
  todayCivilDate = getTodayCivilDate(),
): GymEquipmentAvailabilityStatus {
  const item = profileEquipmentMap(profile).get(equipmentId);
  if (!item) return 'available';
  if (item.status === 'unavailable' && isTemporaryUnavailabilityExpired(item.unavailableUntil, todayCivilDate)) {
    return 'available';
  }
  return item.status;
}

export function getDefaultGymProfile(state: GymProfileState | null | undefined): GymProfile | null {
  if (!state?.profiles.length) return null;
  return state.profiles.find((profile) => profile.isDefault) ?? state.profiles[0] ?? null;
}

export function getActiveGymProfile(state: GymProfileState | null | undefined): GymProfile | null {
  if (!state?.profiles.length) return null;
  return state.profiles.find((profile) => profile.id === state.activeProfileId)
    ?? getDefaultGymProfile(state);
}

export function getGymProfileAvailability(
  profile: GymProfile | null | undefined,
  now: Date | string = new Date(),
): GymProfileAvailability | null {
  if (!profile) return null;
  const today = getTodayCivilDate(now);
  const statuses: Partial<Record<EquipmentId, GymEquipmentAvailabilityStatus>> = {};
  const availableEquipment: EquipmentId[] = [];
  const unavailableEquipment: EquipmentId[] = [];
  const crowdedEquipment: EquipmentId[] = [];

  for (const definition of EQUIPMENT_REGISTRY) {
    const status = getGymProfileEquipmentStatus(profile, definition.id, today);
    statuses[definition.id] = status;
    if (status === 'available') availableEquipment.push(definition.id);
    else if (status === 'unavailable') unavailableEquipment.push(definition.id);
    else crowdedEquipment.push(definition.id);
  }

  return {
    profileId: profile.id,
    profileName: profile.name,
    availableEquipment,
    unavailableEquipment,
    crowdedEquipment,
    statuses,
  };
}

export function getActiveGymProfileAvailability(
  state: GymProfileState | null | undefined,
  now: Date | string = new Date(),
): GymProfileAvailability | null {
  return getGymProfileAvailability(getActiveGymProfile(state), now);
}

function resolveExerciseEquipmentIds(exercise: Pick<Exercise, 'equipmentIds' | 'equipment'>): {
  ids: EquipmentId[];
  confident: boolean;
} {
  const canonical = Array.isArray(exercise.equipmentIds)
    ? exercise.equipmentIds.filter(isEquipmentId)
    : [];
  if (canonical.length > 0) return { ids: [...new Set(canonical)], confident: true };

  const legacy = resolveLegacyEquipment(exercise.equipment ?? '');
  return {
    ids: [...new Set(legacy.equipmentIds)],
    // O mapa explícito não-genérico já é uma resolução determinística do
    // catálogo; entradas `generic` continuam sem confiança para não inventar
    // qual alternativa o exercício realmente usa.
    confident: legacy.resolution === 'exact'
      || legacy.resolution === 'alias'
      || legacy.resolution === 'legacy-map',
  };
}

export function getGymProfileExerciseAvailability(
  exercise: Pick<Exercise, 'equipmentIds' | 'equipment'>,
  availability: GymProfileAvailability | null | undefined,
): GymProfileExerciseAvailability {
  const resolved = resolveExerciseEquipmentIds(exercise);
  if (!availability || resolved.ids.length === 0) {
    return { status: 'unverified', equipmentIds: resolved.ids };
  }

  const statuses = resolved.ids.map((id) => availability.statuses[id]).filter(Boolean);
  if (statuses.length !== resolved.ids.length || !resolved.confident) {
    return { status: 'unverified', equipmentIds: resolved.ids };
  }
  if (statuses.includes('unavailable')) return { status: 'unavailable', equipmentIds: resolved.ids };
  if (statuses.includes('crowded')) return { status: 'crowded', equipmentIds: resolved.ids };
  return { status: 'available', equipmentIds: resolved.ids };
}

export interface CreateGymProfileOptions {
  id: string;
  name: string;
  kind?: GymProfileKind;
  isDefault?: boolean;
  equipment?: readonly GymProfileEquipment[];
}

export function createGymProfile(options: CreateGymProfileOptions): GymProfile {
  const equipmentById = new Map<EquipmentId, GymProfileEquipment>();
  for (const item of options.equipment ?? []) {
    if (!isEquipmentId(item.equipmentId) || !isGymEquipmentAvailabilityStatus(item.status)) continue;
    equipmentById.set(item.equipmentId, cloneEquipment(item));
  }
  for (const equipmentId of FOUNDER_GYM_PROFILE_EQUIPMENT) {
    if (!equipmentById.has(equipmentId)) equipmentById.set(equipmentId, { equipmentId, status: 'available' });
  }

  return {
    id: options.id.trim(),
    name: cleanProfileName(options.name) ?? 'Perfil de equipamentos',
    kind: options.kind ?? 'gym',
    isDefault: options.isDefault ?? false,
    equipment: EQUIPMENT_REGISTRY
      .map((definition) => equipmentById.get(definition.id))
      .filter((item): item is GymProfileEquipment => Boolean(item)),
  };
}

export function createDefaultGymProfile(
  id = 'gym_profile_main',
  name = 'Academia principal',
): GymProfile {
  return createGymProfile({ id, name, kind: 'gym', isDefault: true });
}

export function createDefaultGymProfileState(): GymProfileState {
  const profile = createDefaultGymProfile();
  return {
    schemaVersion: GYM_PROFILE_SCHEMA_VERSION,
    activeProfileId: profile.id,
    profiles: [profile],
  };
}

export function updateGymProfileEquipment(
  profile: GymProfile,
  equipmentId: EquipmentId,
  status: GymEquipmentAvailabilityStatus,
  unavailableUntil?: string,
): GymProfile {
  const current = profile.equipment.find((item) => item.equipmentId === equipmentId);
  const nextEquipment = profile.equipment.filter((item) => item.equipmentId !== equipmentId);
  const nextItem: GymProfileEquipment = {
    equipmentId,
    status,
    ...(status === 'unavailable' && unavailableUntil && isValidCivilDate(unavailableUntil)
      ? { unavailableUntil }
      : {}),
  };
  if (!current && !getEquipmentDefinition(equipmentId)) return cloneProfile(profile);
  nextEquipment.push(nextItem);
  nextEquipment.sort((left, right) => (
    (getEquipmentDefinition(left.equipmentId)?.id ?? left.equipmentId)
      .localeCompare(getEquipmentDefinition(right.equipmentId)?.id ?? right.equipmentId)
  ));
  return { ...cloneProfile(profile), equipment: nextEquipment };
}

export function setAllGymProfileEquipmentStatus(
  profile: GymProfile,
  status: GymEquipmentAvailabilityStatus,
): GymProfile {
  return {
    ...cloneProfile(profile),
    equipment: FOUNDER_GYM_PROFILE_EQUIPMENT.map((equipmentId) => ({ equipmentId, status })),
  };
}

export function updateGymProfile(
  state: GymProfileState,
  profileId: string,
  patch: Partial<Pick<GymProfile, 'name' | 'kind'>>,
): GymProfileState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => profile.id === profileId
      ? {
          ...cloneProfile(profile),
          ...(patch.name !== undefined ? { name: cleanProfileName(patch.name) ?? profile.name } : {}),
          ...(patch.kind !== undefined && isGymProfileKind(patch.kind) ? { kind: patch.kind } : {}),
        }
      : profile),
  };
}

export function updateGymProfileInState(
  state: GymProfileState,
  profileId: string,
  updater: (profile: GymProfile) => GymProfile,
): GymProfileState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => profile.id === profileId ? updater(profile) : profile),
  };
}

export function setActiveGymProfile(state: GymProfileState, profileId: string): GymProfileState {
  if (!state.profiles.some((profile) => profile.id === profileId)) return state;
  return { ...state, activeProfileId: profileId };
}

export function setDefaultGymProfile(state: GymProfileState, profileId: string): GymProfileState {
  if (!state.profiles.some((profile) => profile.id === profileId)) return state;
  return {
    ...state,
    activeProfileId: profileId,
    profiles: state.profiles.map((profile) => ({ ...profile, isDefault: profile.id === profileId })),
  };
}

export function addGymProfile(state: GymProfileState, profile: GymProfile): GymProfileState {
  if (state.profiles.some((item) => item.id === profile.id)) return state;
  return {
    ...state,
    activeProfileId: profile.id,
    profiles: [...state.profiles, cloneProfile(profile)],
  };
}

export function removeGymProfile(state: GymProfileState, profileId: string): GymProfileState | null {
  const remaining = state.profiles.filter((profile) => profile.id !== profileId);
  if (remaining.length === state.profiles.length) return state;
  if (remaining.length === 0) return null;
  const removedDefault = state.profiles.find((profile) => profile.id === profileId)?.isDefault;
  const profiles = removedDefault
    ? remaining.map((profile, index) => ({ ...profile, isDefault: index === 0 }))
    : remaining;
  const nextActive = state.activeProfileId === profileId
    ? (profiles.find((profile) => profile.isDefault)?.id ?? profiles[0].id)
    : state.activeProfileId;
  return { ...state, activeProfileId: nextActive, profiles };
}

export function validateGymProfileState(value: unknown): GymProfileValidationResult {
  const errors: GymProfileValidationIssue[] = [];
  if (!isRecord(value)) return { valid: false, errors: [{ code: 'invalid-state', message: 'Perfil de equipamentos inválido.' }] };
  if (value.schemaVersion !== GYM_PROFILE_SCHEMA_VERSION) {
    errors.push({ code: 'invalid-schema-version', message: 'Versão do perfil de equipamentos desconhecida.', path: 'schemaVersion' });
  }
  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    errors.push({ code: 'profiles-required', message: 'O perfil precisa conter ao menos uma localização.', path: 'profiles' });
  }
  if (typeof value.activeProfileId !== 'string' || value.activeProfileId.trim().length === 0) {
    errors.push({ code: 'active-profile-required', message: 'O perfil ativo não foi informado.', path: 'activeProfileId' });
  }

  const ids = new Set<string>();
  let defaults = 0;
  if (Array.isArray(value.profiles)) {
    value.profiles.forEach((rawProfile, profileIndex) => {
      const path = `profiles[${profileIndex}]`;
      if (!isRecord(rawProfile)) {
        errors.push({ code: 'invalid-profile', message: 'Local de treino inválido.', path });
        return;
      }
      const profileId = cleanProfileId(rawProfile.id);
      if (!profileId) errors.push({ code: 'profile-id-required', message: 'ID do local ausente.', path: `${path}.id` });
      else if (ids.has(profileId)) errors.push({ code: 'duplicate-profile-id', message: 'ID de local duplicado.', path: `${path}.id` });
      else ids.add(profileId);
      if (!cleanProfileName(rawProfile.name)) errors.push({ code: 'profile-name-required', message: 'Nome do local ausente.', path: `${path}.name` });
      if (!isGymProfileKind(rawProfile.kind)) errors.push({ code: 'invalid-profile-kind', message: 'Tipo de local desconhecido.', path: `${path}.kind` });
      if (rawProfile.isDefault === true) defaults += 1;
      if (!Array.isArray(rawProfile.equipment)) {
        errors.push({ code: 'equipment-required', message: 'Checklist de equipamentos inválido.', path: `${path}.equipment` });
        return;
      }
      const equipmentIds = new Set<EquipmentId>();
      rawProfile.equipment.forEach((rawEquipment, equipmentIndex) => {
        const equipmentPath = `${path}.equipment[${equipmentIndex}]`;
        if (!isRecord(rawEquipment) || !isEquipmentId(rawEquipment.equipmentId)) {
          errors.push({ code: 'invalid-equipment', message: 'Equipamento desconhecido no perfil.', path: equipmentPath });
          return;
        }
        if (equipmentIds.has(rawEquipment.equipmentId)) {
          errors.push({ code: 'duplicate-equipment', message: 'Equipamento duplicado no perfil.', path: equipmentPath });
        }
        equipmentIds.add(rawEquipment.equipmentId);
        if (!isGymEquipmentAvailabilityStatus(rawEquipment.status)) {
          errors.push({ code: 'invalid-equipment-status', message: 'Disponibilidade desconhecida.', path: `${equipmentPath}.status` });
        }
        if ('unavailableUntil' in rawEquipment && rawEquipment.unavailableUntil !== undefined
          && (typeof rawEquipment.unavailableUntil !== 'string' || !isValidCivilDate(rawEquipment.unavailableUntil))) {
          errors.push({ code: 'invalid-unavailable-until', message: 'Use uma data válida no formato AAAA-MM-DD.', path: `${equipmentPath}.unavailableUntil` });
        }
      });
    });
  }
  if (defaults > 1) errors.push({ code: 'multiple-defaults', message: 'Há mais de um local padrão.', path: 'profiles' });
  if (ids.size > 0 && typeof value.activeProfileId === 'string' && !ids.has(value.activeProfileId)) {
    errors.push({ code: 'active-profile-not-found', message: 'O local ativo não existe.', path: 'activeProfileId' });
  }
  return { valid: errors.length === 0, errors };
}

export function isGymProfileState(value: unknown): value is GymProfileState {
  return validateGymProfileState(value).valid;
}

/**
 * Normaliza apenas estruturas válidas e mantém o payload imutável. Dados ausentes
 * continuam sendo `null`; o chamador não deve criar um perfil silenciosamente.
 */
export function normalizeGymProfileState(value: unknown): GymProfileState | null {
  if (value === null || value === undefined) return null;
  if (!isGymProfileState(value)) return null;
  const profiles = value.profiles.map((profile) => createGymProfile({
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    isDefault: profile.isDefault,
    equipment: profile.equipment,
  }));
  const defaultId = profiles.find((profile) => profile.isDefault)?.id ?? profiles[0].id;
  const activeProfileId = profiles.some((profile) => profile.id === value.activeProfileId)
    ? value.activeProfileId
    : defaultId;
  return {
    schemaVersion: GYM_PROFILE_SCHEMA_VERSION,
    activeProfileId,
    profiles: profiles.map((profile) => ({ ...profile, isDefault: profile.id === defaultId })),
  };
}
