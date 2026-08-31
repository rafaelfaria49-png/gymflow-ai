'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  addGymProfile,
  createDefaultGymProfileState,
  createGymProfile,
  EQUIPMENT_CATEGORY_LABELS,
  getActiveGymProfile,
  getGymProfileEquipmentStatus,
  getTodayCivilDate,
  GYM_PROFILE_CATEGORIES,
  GYM_PROFILE_KIND_LABELS,
  isTemporaryUnavailabilityExpired,
  removeGymProfile,
  setActiveGymProfile,
  setAllGymProfileEquipmentStatus,
  setDefaultGymProfile,
  updateGymProfile,
  updateGymProfileEquipment,
  updateGymProfileInState,
  type GymEquipmentAvailabilityStatus,
  type GymProfile,
  type GymProfileKind,
  type GymProfileState,
} from './model';
import { EQUIPMENT_REGISTRY, searchEquipment } from '../../lib/equipment-registry';

interface GymProfileSettingsProps {
  value: GymProfileState | null;
  onChange: (value: GymProfileState | null) => void;
}

const STATUS_LABELS: Readonly<Record<GymEquipmentAvailabilityStatus, string>> = Object.freeze({
  available: 'Disponível',
  unavailable: 'Indisponível',
  crowded: 'Lotado agora',
});

const STATUS_HELP: Readonly<Record<GymEquipmentAvailabilityStatus, string>> = Object.freeze({
  available: 'Entra normalmente nas sugestões.',
  unavailable: 'Fica fora das sugestões enquanto durar o bloqueio.',
  crowded: 'Continua elegível, mas perde prioridade nas sugestões.',
});

function profileIdForNewProfile(existing: readonly GymProfile[]): string {
  const base = `gym_profile_${Date.now().toString(36)}`;
  if (!existing.some((profile) => profile.id === base)) return base;
  let suffix = 2;
  while (existing.some((profile) => profile.id === `${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function nextProfileKind(profiles: readonly GymProfile[]): GymProfileKind {
  if (!profiles.some((profile) => profile.kind === 'home')) return 'home';
  if (!profiles.some((profile) => profile.kind === 'travel')) return 'travel';
  return 'gym';
}

function equipmentStatusLabel(status: GymEquipmentAvailabilityStatus): string {
  return STATUS_LABELS[status];
}

export const GymProfileSettings = ({ value, onChange }: GymProfileSettingsProps) => {
  const [search, setSearch] = useState('');
  const [profilePendingRemoval, setProfilePendingRemoval] = useState<string | null>(null);
  const todayCivilDate = getTodayCivilDate();
  const activeProfile = getActiveGymProfile(value);

  const visibleEquipment = useMemo(() => {
    const query = search.trim();
    return query ? searchEquipment(query) : [...EQUIPMENT_REGISTRY];
  }, [search]);

  const visibleByCategory = useMemo(
    () => GYM_PROFILE_CATEGORIES
      .map((category) => ({
        category,
        items: visibleEquipment.filter((definition) => definition.category === category),
      }))
      .filter(({ items }) => items.length > 0),
    [visibleEquipment],
  );

  const updateActiveProfile = (updater: (profile: GymProfile) => GymProfile) => {
    if (!value || !activeProfile) return;
    onChange(updateGymProfileInState(value, activeProfile.id, updater));
  };

  const updateEquipment = (
    equipmentId: GymProfile['equipment'][number]['equipmentId'],
    status: GymEquipmentAvailabilityStatus,
    unavailableUntil?: string,
  ) => {
    updateActiveProfile((profile) => updateGymProfileEquipment(
      profile,
      equipmentId,
      status,
      unavailableUntil,
    ));
  };

  const handleCreateFirstProfile = () => onChange(createDefaultGymProfileState());

  const handleAddProfile = () => {
    if (!value) return handleCreateFirstProfile();
    const kind = nextProfileKind(value.profiles);
    const label = GYM_PROFILE_KIND_LABELS[kind];
    const profile = createGymProfile({
      id: profileIdForNewProfile(value.profiles),
      name: label,
      kind,
      isDefault: false,
    });
    onChange(addGymProfile(value, profile));
    setProfilePendingRemoval(null);
  };

  const handleRemoveProfile = (profileId: string) => {
    if (!value) return;
    if (profilePendingRemoval !== profileId) {
      setProfilePendingRemoval(profileId);
      return;
    }
    onChange(removeGymProfile(value, profileId));
    setProfilePendingRemoval(null);
  };

  if (!value || !activeProfile) {
    return (
      <section className="border-t border-white/5 pt-6 space-y-4" aria-labelledby="gym-profile-heading">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-gym-accent/10 p-2 text-gym-accent">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 id="gym-profile-heading" className="text-sm font-black text-white">Equipamentos e disponibilidade</h4>
            <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-gym-text-muted">
              Crie um perfil para o GymFlow considerar o local real no Construtor. O checklist começa com tudo disponível;
              você só precisa retirar o que não existe ou marcar o que está lotado hoje.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateFirstProfile}
          className="min-h-[44px] w-full rounded-xl border border-gym-accent/30 bg-gym-accent/15 px-4 text-xs font-black text-gym-accent transition-colors hover:bg-gym-accent/25 sm:w-auto"
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden="true" />
          Configurar meu primeiro local
        </button>
      </section>
    );
  }

  const statusCounts = EQUIPMENT_REGISTRY.reduce(
    (counts, definition) => {
      const status = getGymProfileEquipmentStatus(activeProfile, definition.id, todayCivilDate);
      counts[status] += 1;
      return counts;
    },
    { available: 0, unavailable: 0, crowded: 0 } as Record<GymEquipmentAvailabilityStatus, number>,
  );

  return (
    <section className="border-t border-white/5 pt-6 space-y-5" aria-labelledby="gym-profile-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 rounded-xl bg-gym-accent/10 p-2 text-gym-accent">
            <MapPin className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 id="gym-profile-heading" className="text-sm font-black text-white">Equipamentos e disponibilidade</h4>
            <p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-gym-text-muted">
              O perfil ativo alimenta as sugestões e sinaliza exercícios que dependem de algo indisponível.
              Alterações são salvas neste aparelho.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddProfile}
          className="min-h-[44px] flex-shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black text-white transition-colors hover:bg-white/10"
        >
          <Plus className="mr-1.5 inline h-3.5 w-3.5 text-gym-accent" aria-hidden="true" />
          Adicionar local
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Perfis de equipamentos">
        {value.profiles.map((profile) => {
          const selected = profile.id === activeProfile.id;
          return (
            <button
              key={profile.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                onChange(setActiveGymProfile(value, profile.id));
                setProfilePendingRemoval(null);
              }}
              className={`min-h-[44px] min-w-[132px] flex-shrink-0 rounded-xl border px-3 text-left transition-colors ${
                selected
                  ? 'border-gym-accent bg-gym-accent/15 text-gym-accent'
                  : 'border-white/10 bg-white/5 text-gym-text-muted hover:text-white'
              }`}
            >
              <span className="block truncate text-[11px] font-black">{profile.name}</span>
              <span className="mt-0.5 block text-[9px] font-medium">{GYM_PROFILE_KIND_LABELS[profile.kind]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <label className="block text-[10px] font-bold uppercase tracking-wide text-gym-text-muted">
            Nome do local
            <input
              value={activeProfile.name}
              maxLength={80}
              onChange={(event) => onChange(updateGymProfile(value, activeProfile.id, { name: event.target.value }))}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/10 bg-gym-dark px-3 text-sm font-medium normal-case tracking-normal text-white outline-none focus:border-gym-accent"
              aria-label="Nome do perfil de equipamentos"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-gym-text-muted">
            Tipo de local
            <select
              value={activeProfile.kind}
              onChange={(event) => onChange(updateGymProfile(value, activeProfile.id, { kind: event.target.value as GymProfileKind }))}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/10 bg-gym-dark px-3 text-xs font-medium normal-case tracking-normal text-white outline-none focus:border-gym-accent"
              aria-label="Tipo do perfil de equipamentos"
            >
              {(Object.keys(GYM_PROFILE_KIND_LABELS) as GymProfileKind[]).map((kind) => (
                <option key={kind} value={kind}>{GYM_PROFILE_KIND_LABELS[kind]}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange(setDefaultGymProfile(value, activeProfile.id))}
            aria-pressed={activeProfile.isDefault}
            className={`min-h-[44px] rounded-xl border px-3 text-[10px] font-black transition-colors ${
              activeProfile.isDefault
                ? 'border-gym-accent/30 bg-gym-accent/15 text-gym-accent'
                : 'border-white/10 bg-white/5 text-gym-text-muted hover:text-white'
            }`}
          >
            <Star className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
            {activeProfile.isDefault ? 'Local padrão' : 'Tornar padrão'}
          </button>
          {value.profiles.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveProfile(activeProfile.id)}
              className={`min-h-[44px] rounded-xl border px-3 text-[10px] font-black transition-colors ${
                profilePendingRemoval === activeProfile.id
                  ? 'border-gym-rose/40 bg-gym-rose/15 text-rose-300'
                  : 'border-white/10 bg-white/5 text-gym-text-muted hover:text-rose-300'
              }`}
            >
              {profilePendingRemoval === activeProfile.id ? (
                <><Check className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" /> Confirmar remoção</>
              ) : (
                <><Trash2 className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" /> Remover</>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gym-accent/15 bg-gym-accent/5 p-3">
        <span className="text-[10px] font-black uppercase tracking-wide text-white">Resumo</span>
        <span className="text-[10px] text-gym-accent">{statusCounts.available} disponíveis</span>
        <span className="text-[10px] text-amber-300">{statusCounts.crowded} lotados</span>
        <span className="text-[10px] text-rose-300">{statusCounts.unavailable} indisponíveis</span>
        <button
          type="button"
          onClick={() => updateActiveProfile((profile) => setAllGymProfileEquipmentStatus(profile, 'available'))}
          className="ml-auto min-h-[36px] rounded-lg border border-gym-accent/25 bg-gym-accent/10 px-3 text-[10px] font-black text-gym-accent hover:bg-gym-accent/20"
        >
          Tudo disponível
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gym-text-muted" aria-hidden="true" />
        <label htmlFor="gym-profile-equipment-search" className="sr-only">Buscar equipamentos</label>
        <input
          id="gym-profile-equipment-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar equipamento, aparelho ou apelido..."
          className="min-h-[44px] w-full rounded-xl border border-white/10 bg-gym-dark py-2.5 pl-10 pr-10 text-xs text-white outline-none placeholder:text-gym-text-muted focus:border-gym-accent"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Limpar busca de equipamentos"
            className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-gym-text-muted hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-gym-text-muted" aria-label="Legenda de disponibilidade">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gym-accent" />Disponível</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />Lotado: perde prioridade</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-300" />Indisponível: sai da sugestão</span>
      </div>

      <div className="space-y-2">
        {visibleByCategory.map(({ category, items }) => (
          <details key={category} open={Boolean(search) || category === 'free_weight' || category === 'selectorized_machine'} className="group rounded-2xl border border-white/5 bg-white/[0.02]">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-3 text-[10px] font-black uppercase tracking-wider text-white [&::-webkit-details-marker]:hidden">
              <span>{EQUIPMENT_CATEGORY_LABELS[category]} <span className="text-gym-text-muted">({items.length})</span></span>
              <ChevronDown className="h-4 w-4 text-gym-text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid grid-cols-1 gap-2 border-t border-white/5 p-2 sm:grid-cols-2">
              {items.map((definition) => {
                const storedEntry = activeProfile.equipment.find((item) => item.equipmentId === definition.id);
                const status = getGymProfileEquipmentStatus(activeProfile, definition.id, todayCivilDate);
                const expired = storedEntry?.status === 'unavailable'
                  && isTemporaryUnavailabilityExpired(storedEntry.unavailableUntil, todayCivilDate);
                return (
                  <div key={definition.id} className="min-w-0 rounded-xl border border-white/5 bg-gym-dark/60 p-2.5">
                    <div className="flex items-start gap-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={status !== 'unavailable'}
                          onChange={(event) => updateEquipment(
                            definition.id,
                            event.target.checked ? 'available' : 'unavailable',
                          )}
                          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-gym-accent"
                          aria-label={`${definition.label}: ${equipmentStatusLabel(status)}`}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-bold text-white">{definition.label}</span>
                          <span className="mt-0.5 block text-[9px] leading-snug text-gym-text-muted">{STATUS_HELP[status]}</span>
                        </span>
                      </label>
                      <span className={`mt-0.5 flex-shrink-0 rounded-md px-1.5 py-1 text-[8px] font-black uppercase ${
                        status === 'available'
                          ? 'bg-gym-accent/10 text-gym-accent'
                          : status === 'crowded'
                            ? 'bg-amber-300/10 text-amber-300'
                            : 'bg-gym-rose/10 text-rose-300'
                      }`}>
                        {equipmentStatusLabel(status)}
                      </span>
                    </div>
                    <select
                      value={status}
                      onChange={(event) => updateEquipment(definition.id, event.target.value as GymEquipmentAvailabilityStatus)}
                      aria-label={`Status de ${definition.label}`}
                      className="mt-2 min-h-[36px] w-full rounded-lg border border-white/10 bg-gym-dark px-2 text-[10px] text-white outline-none focus:border-gym-accent"
                    >
                      {(Object.keys(STATUS_LABELS) as GymEquipmentAvailabilityStatus[]).map((option) => (
                        <option key={option} value={option}>{STATUS_LABELS[option]}</option>
                      ))}
                    </select>
                    {status === 'unavailable' && (
                      <label className="mt-2 block text-[9px] font-bold text-gym-text-muted">
                        Disponível a partir de (opcional)
                        <input
                          type="date"
                          min={todayCivilDate}
                          value={storedEntry?.unavailableUntil ?? ''}
                          onChange={(event) => updateEquipment(definition.id, 'unavailable', event.target.value || undefined)}
                          className="mt-1 min-h-[36px] w-full rounded-lg border border-white/10 bg-gym-dark px-2 text-[10px] text-white outline-none focus:border-gym-accent"
                          aria-label={`Data de retorno de ${definition.label}`}
                        />
                      </label>
                    )}
                    {expired && (
                      <p className="mt-1 flex items-start gap-1 text-[9px] leading-snug text-gym-accent">
                        <Check className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        Indisponibilidade expirada hoje; voltou a entrar nas sugestões.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        ))}
        {visibleByCategory.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-gym-text-muted" aria-hidden="true" />
            <p className="mt-2 text-xs text-gym-text-muted">Nenhum equipamento encontrado.</p>
          </div>
        )}
      </div>
    </section>
  );
};
