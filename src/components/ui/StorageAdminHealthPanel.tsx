'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck2,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type {
  StorageAdminStatus,
  StorageAdminOverallStatus,
} from '../../lib/storage-admin-status';

export interface StorageAdminHealthPanelProps {
  inspect: () => Promise<StorageAdminStatus>;
}

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; value: StorageAdminStatus }
  | { status: 'error' };

interface PendingInspection {
  current: Promise<StorageAdminStatus> | null;
}

const pendingByInspector = new WeakMap<
  StorageAdminHealthPanelProps['inspect'],
  PendingInspection
>();

function inspectShared(
  inspect: StorageAdminHealthPanelProps['inspect'],
): Promise<StorageAdminStatus> {
  let slot = pendingByInspector.get(inspect);
  if (!slot) {
    slot = { current: null };
    pendingByInspector.set(inspect, slot);
  }
  if (slot.current) return slot.current;
  const operation = Promise.resolve().then(inspect);
  slot.current = operation;
  const release = () => {
    if (slot?.current === operation) {
      slot.current = null;
    }
  };
  void operation.then(release, release);
  return operation;
}

const OVERALL_COPY: Readonly<Record<
  StorageAdminOverallStatus,
  { label: string; className: string; message: string }
>> = {
  healthy: {
    label: 'Saudável',
    className: 'border-gym-emerald/30 bg-gym-emerald/15 text-gym-emerald',
    message: 'A inspeção administrativa está estável e não encontrou bloqueios.',
  },
  attention: {
    label: 'Atenção',
    className: 'border-yellow-500/30 bg-yellow-500/15 text-yellow-300',
    message: 'Há condições que exigem atenção antes de qualquer operação administrativa futura.',
  },
  blocked: {
    label: 'Bloqueado',
    className: 'border-gym-rose/30 bg-gym-rose/15 text-gym-rose',
    message: 'A leitura encontrou um bloqueio. Os dados foram apenas observados e permanecem intactos.',
  },
  unavailable: {
    label: 'Indisponível',
    className: 'border-white/15 bg-white/5 text-gym-text-muted',
    message: 'O diagnóstico não pôde confirmar o estado do armazenamento neste momento.',
  },
};

const VALUE_COPY = {
  boot: {
    ready: 'Pronto',
    blocked: 'Bloqueado',
    unknown: 'Desconhecido',
  },
  receipts: {
    present: 'Presentes',
    absent: 'Ausentes',
    conflicted: 'Em conflito',
  },
  evidence: {
    verified: 'Verificada',
    unverified: 'Não verificada',
    unstable: 'Instável',
    conflicted: 'Em conflito',
  },
  retention: {
    ready: 'Pronta',
    blocked: 'Bloqueada',
  },
  ownerToken: {
    available: 'Disponível',
    busy: 'Ocupado',
    expired: 'Expirado',
    malformed: 'Malformado',
    unavailable: 'Indisponível',
  },
} as const;

function SummaryCard(props: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.035] p-4">
      <dt className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gym-text-muted">
        <Icon className="h-4 w-4 text-gym-accent" aria-hidden="true" />
        {props.label}
      </dt>
      <dd className="mt-2 text-sm font-extrabold text-white">{props.value}</dd>
    </div>
  );
}

export function StorageAdminHealthPanel({
  inspect,
}: StorageAdminHealthPanelProps) {
  const [view, setView] = useState<ViewState>({ status: 'loading' });
  const mountedRef = useRef(false);
  const requestRef = useRef(0);

  const refresh = useCallback(() => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setView({ status: 'loading' });
    void inspectShared(inspect).then(
      (value) => {
        if (mountedRef.current && requestRef.current === request) {
          setView({ status: 'ready', value });
        }
      },
      () => {
        if (mountedRef.current && requestRef.current === request) {
          setView({ status: 'error' });
        }
      },
    );
  }, [inspect]);

  useEffect(() => {
    mountedRef.current = true;
    const request = requestRef.current + 1;
    requestRef.current = request;
    void inspectShared(inspect).then(
      (value) => {
        if (mountedRef.current && requestRef.current === request) {
          setView({ status: 'ready', value });
        }
      },
      () => {
        if (mountedRef.current && requestRef.current === request) {
          setView({ status: 'error' });
        }
      },
    );
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, [inspect]);

  const value = view.status === 'ready' ? view.value : null;
  const overall = value ? OVERALL_COPY[value.overall] : null;

  return (
    <section
      aria-labelledby="storage-admin-health-title"
      className="glass rounded-3xl border border-white/5 p-4 sm:p-5 lg:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gym-accent/20 bg-gym-accent/10 text-gym-accent">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="storage-admin-health-title"
                className="text-lg font-black tracking-tight text-white sm:text-xl"
              >
                Saúde administrativa do armazenamento
              </h2>
              {overall && (
                <span
                  aria-label={`Estado geral: ${overall.label}`}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${overall.className}`}
                >
                  {overall.label}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gym-text-muted">
              Visão local, agregada e somente leitura do boot, da evidência física e da retenção.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={view.status === 'loading'}
          aria-label="Atualizar diagnóstico somente leitura"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-xs font-extrabold text-white transition-colors enabled:hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${view.status === 'loading' ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Atualizar diagnóstico
        </button>
      </div>

      {view.status === 'loading' && (
        <div
          role="status"
          aria-live="polite"
          className="mt-5 rounded-2xl border border-white/5 bg-white/[0.025] p-5 text-sm text-gym-text-muted"
        >
          Lendo o estado administrativo sem alterar dados…
        </div>
      )}

      {view.status === 'error' && (
        <div
          role="alert"
          className="mt-5 flex gap-3 rounded-2xl border border-gym-rose/25 bg-gym-rose/10 p-4 text-sm text-gym-rose"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>
            O diagnóstico está indisponível. Nenhum dado foi alterado; tente atualizar novamente.
          </p>
        </div>
      )}

      {value && overall && (
        <>
          <div
            role={value.overall === 'healthy' ? 'status' : 'alert'}
            className={`mt-5 flex gap-3 rounded-2xl border p-4 text-sm ${
              value.overall === 'healthy'
                ? 'border-gym-emerald/20 bg-gym-emerald/10 text-gym-emerald'
                : value.overall === 'attention'
                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200'
                  : 'border-gym-rose/20 bg-gym-rose/10 text-gym-rose'
            }`}
          >
            {value.overall === 'healthy'
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
            <p>{overall.message}</p>
          </div>

          <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Boot" value={VALUE_COPY.boot[value.boot]} icon={Activity} />
            <SummaryCard
              label="Receipts"
              value={VALUE_COPY.receipts[value.receipts]}
              icon={FileCheck2}
            />
            <SummaryCard
              label="Evidência"
              value={VALUE_COPY.evidence[value.evidence]}
              icon={Database}
            />
            <SummaryCard
              label="Retenção"
              value={VALUE_COPY.retention[value.retention.status]}
              icon={ShieldCheck}
            />
            <SummaryCard
              label="Owner-token"
              value={VALUE_COPY.ownerToken[value.ownerToken]}
              icon={KeyRound}
            />
          </dl>

          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Contagens agregadas
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  ['Observadas', value.storage.observed],
                  ['Avaliadas', value.storage.evaluated],
                  ['Ativas', value.storage.active],
                  ['Migração', value.storage.migration],
                  ['Históricas', value.storage.historical],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-xl bg-white/[0.035] p-3">
                    <dt className="text-[9px] font-bold uppercase text-gym-text-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-black text-white">{count}</dd>
                  </div>
                ))}
              </dl>
              {value.storage.evaluated === 0 && (
                <p className="mt-3 text-xs text-gym-text-muted">
                  Nenhuma geração pôde ser avaliada nesta inspeção.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-white">
                Classificação de retenção
              </h3>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                {[
                  ['Manter', value.retention.keep],
                  ['Protegidas', value.retention.protected],
                  ['Candidatas futuras', value.retention.futureDeleteCandidate],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-xl bg-white/[0.035] p-3">
                    <dt className="text-[9px] font-bold uppercase text-gym-text-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-black text-white">{count}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-extrabold">
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-gym-text-muted">
                  Execução autorizada: não
                </span>
                <span className="rounded-full bg-white/5 px-2.5 py-1 text-gym-text-muted">
                  Exclusão autorizada: não
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-gym-accent/15 bg-gym-accent/[0.06] p-4 text-xs leading-relaxed text-gym-text-muted">
            <p>
              Nenhuma limpeza automática é executada por esta tela. Candidatas futuras são apenas
              uma classificação e não autorizam exclusão.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
