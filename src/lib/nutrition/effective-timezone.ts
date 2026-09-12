/**
 * GymFlow AI — Timezone efetivo do bridge nutricional (NUT-004B)
 *
 * - Com perfil: usa profile.timezone validado.
 * - Sem perfil: usa o timezone IANA efetivo do runtime via Intl.
 * - Nunca hardcodar America/Sao_Paulo ou UTC como fallback.
 * - Se nenhum timezone válido puder ser resolvido, falha apenas o bridge
 *   nutricional de forma explícita (sem corromper o ledger nem bloquear o app).
 */

import { isValidIanaTimezone } from './profile-validation';

export type EffectiveTimezoneResult =
  | { ok: true; timezone: string; source: 'profile' | 'runtime' }
  | { ok: false; error: string };

function readRuntimeTimezone(): string | null {
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof resolved === 'string' && resolved.trim().length > 0) return resolved;
    return null;
  } catch {
    return null;
  }
}

export function resolveEffectiveTimezone(
  profileTimezone?: string | null,
): EffectiveTimezoneResult {
  if (typeof profileTimezone === 'string' && profileTimezone.trim().length > 0) {
    if (isValidIanaTimezone(profileTimezone)) {
      return { ok: true, timezone: profileTimezone, source: 'profile' };
    }
    return {
      ok: false,
      error: `Timezone do perfil inválido: ${profileTimezone} (sem fallback hardcodado).`,
    };
  }
  const runtime = readRuntimeTimezone();
  if (runtime && isValidIanaTimezone(runtime)) {
    return { ok: true, timezone: runtime, source: 'runtime' };
  }
  return {
    ok: false,
    error: 'Nenhum timezone IANA válido pôde ser resolvido (sem fallback para UTC ou America/Sao_Paulo).',
  };
}
