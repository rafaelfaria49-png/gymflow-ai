'use client';

import React from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Dumbbell, Shield, Zap, Target, Star, ChevronRight, Sparkles, TrendingUp, Heart } from 'lucide-react';

export const LandingPage = () => {
  const { loginDemoUser, setActiveView } = useGymFlow();

  const benefits = [
    {
      icon: Target,
      title: 'Hipertrofia Inteligente',
      desc: 'Nossa IA analisa seu volume de treino ideal por agrupamento muscular e sugere cargas semana após semana.'
    },
    {
      icon: Zap,
      title: 'Economia de Tempo',
      desc: 'Adaptação instantânea de treinos: avise o app se tiver apenas 30 minutos e veja o plano se transformar.'
    },
    {
      icon: Shield,
      title: 'Segurança Postural',
      desc: 'Mais de 15 videoaulas dedicadas de fisioterapeutas esportivos corrigindo postura e biomecânica.'
    },
    {
      icon: TrendingUp,
      title: 'Gamificação Ativa',
      desc: 'Suba de nível, complete conquistas exclusivas e dispute posições no ranking de consistência semanal.'
    }
  ];

  const testimonials = [
    {
      name: 'Dr. Lucas Ribeiro',
      role: 'Médico Esportivo',
      text: 'O GymFlow AI unificou o acompanhamento de carga, nutrição e técnica num app só. Recomendo muito aos meus pacientes.',
      avatar: '👨‍⚕️'
    },
    {
      name: 'Mariana Guedes',
      role: 'Atleta de Crossfit',
      text: 'Bati meu recorde de levantamento terra na segunda semana usando as planilhas avançadas da IA Coach! Incrível.',
      avatar: '👩‍🎤'
    },
    {
      name: 'César Augusto',
      role: 'Empresário',
      text: 'Fazer agachamento correto e sem dor na lombar sempre foi meu sonho. A técnica explicada nos vídeos é impecável.',
      avatar: '👨‍💼'
    }
  ];

  return (
    <div className="min-h-screen bg-gym-dark text-white relative overflow-hidden flex flex-col">
      {/* Decorative gradient blur rings */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gym-accent/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-gym-emerald/10 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Header bar */}
      <header className="sticky top-0 z-40 w-full glass border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between">
        <span className="text-2xl font-black bg-gradient-to-r from-gym-accent to-gym-emerald bg-clip-text text-transparent tracking-tighter pl-0.5">
          GYMFLOW<span className="text-white">AI</span>
        </span>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveView('login')}
            className="text-sm font-semibold text-gym-text-muted hover:text-white transition-all cursor-pointer"
          >
            Entrar
          </button>
          <button
            onClick={() => setActiveView('register')}
            className="text-xs md:text-sm font-bold bg-gym-accent hover:bg-gym-accent-hover text-gym-dark px-4 py-2 rounded-full transition-all cursor-pointer shadow-md shadow-gym-accent/20"
          >
            Começar Agora
          </button>
        </div>
      </header>

      {/* Main hero section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-24 md:pt-24 flex flex-col items-center text-center">
        {/* IA Sparkle Badge */}
        <div className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full py-1.5 px-4 mb-6 hover:bg-white/10 transition-all cursor-pointer animate-pulse-glow">
          <Sparkles className="w-3.5 h-3.5 text-gym-accent" />
          <span className="text-xs font-bold tracking-wide uppercase text-gym-accent">Treinador Inteligente 2.0</span>
        </div>

        <h1 className="text-4xl md:text-7xl font-black tracking-tight leading-none max-w-4xl text-white">
          A evolução do seu corpo,<br />
          <span className="bg-gradient-to-r from-gym-accent to-gym-emerald bg-clip-text text-transparent drop-shadow-sm">
            guiada por Inteligência Artificial.
          </span>
        </h1>

        <p className="text-md md:text-xl text-gym-text-muted max-w-2xl mt-6 leading-relaxed">
          Crie treinos personalizados instantâneos, registre suas cargas com precisão de atleta, corrija sua postura com aulas de biomecânica e gerencie sua assinatura num visual premium impecável.
        </p>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-10 w-full sm:w-auto">
          <button
            onClick={() => setActiveView('onboarding')}
            className="px-8 py-4 bg-gradient-to-r from-gym-accent to-gym-emerald hover:from-gym-accent-hover hover:to-gym-emerald text-gym-dark font-extrabold rounded-2xl transition-all shadow-xl shadow-gym-accent/15 flex items-center justify-center gap-2 cursor-pointer text-base"
          >
            Criar Meu Plano Grátis
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={loginDemoUser}
            className="px-8 py-4 bg-gym-card/60 hover:bg-gym-card border border-white/10 hover:border-white/20 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer text-base"
          >
            Entrar como Usuário Demo
          </button>
        </div>

        {/* Features badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 w-full max-w-4xl text-center border-t border-white/5 pt-10">
          <div>
            <span className="text-3xl font-extrabold text-white">100%</span>
            <p className="text-xs text-gym-text-muted mt-1">Dados Mockados Offline</p>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-gym-accent">40+</span>
            <p className="text-xs text-gym-text-muted mt-1">Exercícios com Guia</p>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-gym-emerald">LVL 1-50</span>
            <p className="text-xs text-gym-text-muted mt-1">Gamificação Integrada</p>
          </div>
          <div>
            <span className="text-3xl font-extrabold text-white">0%</span>
            <p className="text-xs text-gym-text-muted mt-1">Custos Reais</p>
          </div>
        </div>

        {/* Benefits section */}
        <section className="mt-32 w-full">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">Por que escolher o GymFlow AI?</h2>
          <p className="text-sm md:text-base text-gym-text-muted max-w-xl mx-auto mb-16">
            Combinamos inteligência artificial, biomecânica e usabilidade premium para entregar um app de academia superior.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {benefits.map((b, idx) => {
              const Icon = b.icon;
              return (
                <div key={idx} className="glass p-6 rounded-3xl border border-white/5 hover:border-gym-accent/20 transition-all group">
                  <div className="bg-gym-accent/10 w-12 h-12 rounded-2xl flex items-center justify-center text-gym-accent mb-4 group-hover:scale-110 transition-all">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{b.title}</h3>
                  <p className="text-xs text-gym-text-muted leading-relaxed">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Plan Pricing Section */}
        <section className="mt-32 w-full max-w-5xl">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-4">Assinaturas Transparentes</h2>
          <p className="text-sm md:text-base text-gym-text-muted mb-16 max-w-xl mx-auto">
            Escolha o plano ideal para suas metas. Cancele quando quiser, sem taxas reais.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            {/* Free */}
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-sm font-bold text-gym-text-muted uppercase tracking-wider">GymFlow Free</span>
                <div className="text-3xl font-extrabold text-white mt-2">R$ 0<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
                <p className="text-xs text-gym-text-muted mt-2">Para quem está iniciando a jornada de treinos e quer monitoramento essencial.</p>
                <ul className="text-xs text-white/80 space-y-3 mt-6">
                  <li className="flex items-center gap-2">✓ Treinos limitados (3 por semana)</li>
                  <li className="flex items-center gap-2">✓ Biblioteca básica de exercícios</li>
                  <li className="flex items-center gap-2">✓ Histórico de cargas limitado</li>
                </ul>
              </div>
              <button onClick={() => setActiveView('register')} className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl mt-8 text-xs transition-all">
                Começar Grátis
              </button>
            </div>

            {/* Pro - Destaque */}
            <div className="glass bg-gradient-to-b from-gym-accent/5 to-transparent p-8 rounded-3xl border-2 border-gym-accent relative flex flex-col justify-between">
              <span className="absolute top-4 right-4 bg-gym-accent text-gym-dark text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Recomendado</span>
              <div>
                <span className="text-sm font-bold text-gym-accent uppercase tracking-wider">GymFlow Pro</span>
                <div className="text-3xl font-extrabold text-white mt-2">R$ 19,90<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
                <p className="text-xs text-gym-text-muted mt-2">Para entusiastas da musculação que buscam suporte de IA e progresso de força.</p>
                <ul className="text-xs text-white/80 space-y-3 mt-6">
                  <li className="flex items-center gap-2">✓ IA Coach Chat Ilimitado</li>
                  <li className="flex items-center gap-2">✓ Planos completos para todos os níveis</li>
                  <li className="flex items-center gap-2">✓ Acesso integral às videoaulas premium</li>
                  <li className="flex items-center gap-2">✓ Gráficos e estatísticas avançadas</li>
                </ul>
              </div>
              <button onClick={() => { loginDemoUser(); }} className="w-full py-3 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl mt-8 text-xs transition-all shadow-md shadow-gym-accent/25">
                Escolher Plano Pro
              </button>
            </div>

            {/* Elite */}
            <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-sm font-bold text-gym-emerald uppercase tracking-wider">GymFlow Elite</span>
                <div className="text-3xl font-extrabold text-white mt-2">R$ 39,90<span className="text-sm font-medium text-gym-text-muted">/mês</span></div>
                <p className="text-xs text-gym-text-muted mt-2">Para fisiculturistas e atletas de alto rendimento com relatórios mensais profundos.</p>
                <ul className="text-xs text-white/80 space-y-3 mt-6">
                  <li className="flex items-center gap-2">✓ Tudo do plano Pro</li>
                  <li className="flex items-center gap-2">✓ Acompanhamento Elite de Cargas</li>
                  <li className="flex items-center gap-2">✓ Comunidade e Canais Exclusivos</li>
                  <li className="flex items-center gap-2">✓ Relatórios avançados de fadiga</li>
                </ul>
              </div>
              <button onClick={() => { loginDemoUser(); }} className="w-full py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl mt-8 text-xs transition-all">
                Escolher Plano Elite
              </button>
            </div>
          </div>
        </section>

        {/* Testimonials section */}
        <section className="mt-32 w-full">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white mb-16">O que dizem os membros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {testimonials.map((t, idx) => (
              <div key={idx} className="glass p-6 rounded-3xl border border-white/5 flex flex-col justify-between">
                <p className="text-xs md:text-sm text-gym-text-muted italic">"{t.text}"</p>
                <div className="flex items-center gap-3 mt-6">
                  <div className="text-3xl">{t.avatar}</div>
                  <div>
                    <h4 className="text-xs font-bold text-white">{t.name}</h4>
                    <p className="text-[10px] text-gym-text-muted">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer bar */}
      <footer className="w-full border-t border-white/5 py-8 text-center text-xs text-gym-text-muted mt-auto bg-black/40">
        <p>© 2026 GymFlow AI Corporation. Todos os direitos reservados de demonstração.</p>
        <p className="mt-1 text-[10px]">Aviso: Este aplicativo é um teste técnico com dados 100% mockados e seguros.</p>
      </footer>
    </div>
  );
};
