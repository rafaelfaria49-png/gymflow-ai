/**
 * GymFlow AI — Módulo de Nutrição
 */

export * from './profile-gates';
export * from './engine-types';
export * from './engine-validation';
export * from './engine';
export * from './ledger-types';
export * from './ledger';
export * from './migration';
export * from './rollover';
export * from './profile-validation';
export * from './gate-snapshot';
export * from './admin-gate';
export * from './effective-timezone';
export * from './target-resolution';
export * from './provider-bridge';
export * from './lifecycle';
export * from './food-types';
export * from './food-database';
export * from './food-preferences';
export * from './suggestions';
export * from './trend';
export * from './ai-assistant-types';
export * from './ai-assistant';
// NUT-007: `ai-assistant-client` ('use client') é importado direto pelos
// componentes; `ai-assistant-provider` e `ai-assistant-gateway` são
// SERVER-ONLY (chave GYMFLOW_AI_API_KEY) — importados apenas pela Route
// Handler `src/app/api/nutrition/assistant/route.ts`. Nenhum dos três entra
// neste barrel.
