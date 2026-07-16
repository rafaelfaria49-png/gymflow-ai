'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { ArrowLeft, ArrowRight, BrainCircuit, ShieldAlert, Award, Play } from 'lucide-react';
import { TrainingProfileSelector } from '../components/TrainingProfileSelector';
import { TrainingProfileSummary } from '../components/TrainingProfileSummary';
import { validateTrainingProfile } from '../lib/training-profile';
import type { TrainingProfileFields } from '../types/training-profile';

export const OnboardingFlow = () => {
  const { registerUser } = useGymFlow();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Analisando seu perfil...');
  const [showResult, setShowResult] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [goal, setGoal] = useState<'hypertrophy' | 'slimming' | 'strength' | 'conditioning' | 'athlete'>('hypertrophy');
  const [trainingProfile, setTrainingProfile] = useState<TrainingProfileFields>({
    level: 'intermediate',
    trainingStatus: 'active',
  });
  const [gender, setGender] = useState<'male' | 'female' | 'neutral'>('neutral');
  const [age, setAge] = useState(25);
  const [weight, setWeight] = useState(75);
  const [height, setHeight] = useState(175);
  const [frequency, setFrequency] = useState(4);
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState<'gym' | 'home' | 'both'>('gym');
  const [equipments, setEquipments] = useState<string[]>(['Barra', 'Halteres', 'Polia']);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [muscleFocus, setMuscleFocus] = useState<string[]>(['Peito', 'Costas']);
  const [preference, setPreference] = useState('');
  const level = trainingProfile.level;
  const trainingProfileValid = validateTrainingProfile(trainingProfile).valid;

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => Math.max(1, s - 1));

  const toggleEquipment = (eq: string) => {
    setEquipments((prev) =>
      prev.includes(eq) ? prev.filter((item) => item !== eq) : [...prev, eq]
    );
  };

  const toggleMuscleFocus = (mf: string) => {
    setMuscleFocus((prev) =>
      prev.includes(mf) ? prev.filter((item) => item !== mf) : [...prev, mf]
    );
  };

  const toggleRestriction = (rest: string) => {
    setRestrictions((prev) =>
      prev.includes(rest) ? prev.filter((item) => item !== rest) : [...prev, rest]
    );
  };

  const generatePlan = () => {
    setLoading(true);
    const steps = [
      'Lendo seus objetivos...',
      'Analisando limitações físicas e articulares...',
      'Calculando volume semanal ideal (Fórmula GymFlow)...',
      'Cruzando com 42 exercícios biomecânicos...',
      'Otimizando cronograma de descanso...',
      'Gerando ficha inteligente via IA Coach...'
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setLoadingText(steps[currentStep]);
      } else {
        clearInterval(interval);
        setLoading(false);
        setShowResult(true);
      }
    }, 800);
  };

  const handleStart = () => {
    registerUser({
      name: name || 'Atleta GymFlow',
      email: email || 'user@gymflow.ai',
      level,
      goal,
      gender,
      age,
      weight,
      height,
      frequency,
      duration,
      location,
      equipments,
      restrictions,
      muscleFocus,
      preference,
      trainingStatus: trainingProfile.trainingStatus ?? 'active',
      returnToTraining: trainingProfile.returnToTraining,
      trainingExperienceYears: trainingProfile.trainingExperienceYears,
    });
  };

  // Renderizador de Passos
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-xl font-bold text-white mb-2">Para começar, qual seu nome e e-mail?</h2>
            <div>
              <label className="block text-xs font-bold uppercase text-gym-text-muted mb-1">Nome Completo</label>
              <input
                type="text"
                placeholder="Ex: Rafael Silveira"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-gym-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gym-text-muted mb-1">E-mail</label>
              <input
                type="email"
                placeholder="Ex: rafael@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white outline-none focus:border-gym-accent"
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Qual seu objetivo principal?</h2>
            <div className="grid grid-cols-1 gap-2.5">
              {([
                { id: 'hypertrophy', label: '💪 Hipertrofia (Ganhar massa magra)' },
                { id: 'slimming', label: '🏃 Emagrecimento & Definição' },
                { id: 'strength', label: '🏋️ Força Bruta (Aumentar cargas)' },
                { id: 'conditioning', label: '⚡ Condicionamento Físico & GPP' },
                { id: 'athlete', label: '🏆 Performance Atlética Olímpica' }
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setGoal(opt.id)}
                  className={`p-4 rounded-xl text-left border text-sm font-bold transition-all ${
                    goal === opt.id
                      ? 'border-gym-accent bg-gym-accent/10 text-gym-accent'
                      : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Experiência e momento atual</h2>
            <TrainingProfileSelector
              idPrefix="onboarding-training-profile"
              value={trainingProfile}
              onChange={setTrainingProfile}
            />
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Seu perfil e dados físicos</h2>

            {/* Perfil: masculino / feminino / neutro */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1.5">Perfil de Treino</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'male', label: '🚹 Masculino' },
                  { id: 'female', label: '🚺 Feminino' },
                  { id: 'neutral', label: '⚧ Neutro' }
                ] as const).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id)}
                    className={`py-2.5 rounded-xl border text-[11px] font-bold transition-all ${
                      gender === g.id
                        ? 'border-gym-accent bg-gym-accent/10 text-gym-accent'
                        : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gym-text-muted mt-1.5">
                Usado para ajustar referências de treino. O avatar Kai (masc.) está em produção.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Idade</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 text-center font-bold text-white outline-none focus:border-gym-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Peso (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 text-center font-bold text-white outline-none focus:border-gym-accent"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gym-text-muted mb-1 text-center">Altura (cm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 text-center font-bold text-white outline-none focus:border-gym-accent"
                />
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Disponibilidade e Frequência</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gym-text-muted mb-2">Quantos dias na semana quer treinar?</label>
                <div className="flex justify-between gap-1.5">
                  {[2, 3, 4, 5, 6].map((day) => (
                    <button
                      key={day}
                      onClick={() => setFrequency(day)}
                      className={`flex-1 py-3 font-bold rounded-xl border text-sm transition-all ${
                        frequency === day
                          ? 'border-gym-accent bg-gym-accent/15 text-gym-accent'
                          : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                      }`}
                    >
                      {day}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gym-text-muted mb-2">Tempo disponível por sessão?</label>
                <div className="flex justify-between gap-1.5">
                  {[30, 45, 60, 90, 120].map((dur) => (
                    <button
                      key={dur}
                      onClick={() => setDuration(dur)}
                      className={`flex-1 py-3 font-bold rounded-xl border text-xs transition-all ${
                        duration === dur
                          ? 'border-gym-accent bg-gym-accent/15 text-gym-accent'
                          : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                      }`}
                    >
                      {dur}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Onde treina e Equipamentos</h2>
            <div className="space-y-4">
              <div className="flex gap-2">
                {([
                  { id: 'gym', label: '🏢 Academia' },
                  { id: 'home', label: '🏠 Casa (Calistenia)' },
                  { id: 'both', label: '🔄 Ambos' }
                ] as const).map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => setLocation(loc.id)}
                    className={`flex-1 py-3 font-bold rounded-xl border text-xs transition-all ${
                      location === loc.id
                        ? 'border-gym-accent bg-gym-accent/15 text-gym-accent'
                        : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    {loc.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-gym-text-muted mb-2">Equipamentos Disponíveis</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Halteres', 'Barra e Anilhas', 'Polia/Cabos', 'Aparelhos Guiados', 'Faixas Elásticas', 'Kettlebell'].map((eq) => {
                    const isSelected = equipments.includes(eq);
                    return (
                      <button
                        key={eq}
                        onClick={() => toggleEquipment(eq)}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all ${
                          isSelected
                            ? 'border-gym-accent bg-gym-accent/10 text-gym-accent'
                            : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{eq}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      case 7:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Foco Muscular e Restrições</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gym-text-muted mb-2">Músculos que deseja dar maior foco?</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Pernas', 'Glúteos', 'Abdômen'].map((mf) => {
                    const isSelected = muscleFocus.includes(mf);
                    return (
                      <button
                        key={mf}
                        onClick={() => toggleMuscleFocus(mf)}
                        className={`p-2 rounded-xl border text-[11px] font-bold text-center transition-all ${
                          isSelected
                            ? 'border-gym-accent bg-gym-accent/10 text-gym-accent'
                            : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        {mf}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gym-text-muted mb-2">Restrições / Lesões / Dores articulares?</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Coluna/Lombar', 'Joelhos', 'Ombros', 'Punhos/Cotovelos'].map((rest) => {
                    const isSelected = restrictions.includes(rest);
                    return (
                      <button
                        key={rest}
                        onClick={() => toggleRestriction(rest)}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'border-gym-rose bg-gym-rose/10 text-gym-rose'
                            : 'border-white/5 bg-white/5 text-white hover:bg-white/10'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {rest}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      case 8:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white mb-2">Alguma preferência especial?</h2>
            <div>
              <label className="block text-xs font-bold text-gym-text-muted mb-1">Notas para a IA Coach (Opcional)</label>
              <textarea
                placeholder="Ex: Quero focar em bíceps, gosto de treinar com métodos de super-série e odeio cardio longo..."
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white outline-none focus:border-gym-accent h-32 resize-none"
              />
            </div>
            <p className="text-[10px] text-gym-text-muted italic">
              * Aviso de Responsabilidade: Respeite os limites do seu corpo. Em caso de restrições ou dores agudas severas, o GymFlow AI não substitui a orientação presencial de um médico ou profissional de Educação Física habilitado.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gym-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blurs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gym-accent/5 rounded-full blur-3xl pointer-events-none"></div>

      {loading ? (
        <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/5 shadow-2xl text-center space-y-6">
          <div className="w-20 h-20 bg-gym-accent/10 border-2 border-dashed border-gym-accent rounded-full flex items-center justify-center mx-auto animate-spin">
            <BrainCircuit className="w-8 h-8 text-gym-accent animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white">IA Coach Gerando Seu Treino</h2>
          <p className="text-sm font-semibold text-gym-accent animate-pulse">{loadingText}</p>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald animate-pulse-glow" style={{ width: '80%' }}></div>
          </div>
        </div>
      ) : showResult ? (
        <div className="glass w-full max-w-lg p-8 rounded-3xl border border-white/5 shadow-2xl text-center space-y-6 animate-scale-up">
          <div className="w-16 h-16 bg-gym-emerald/20 rounded-full flex items-center justify-center text-gym-emerald mx-auto border border-gym-emerald/30 shadow-lg shadow-gym-emerald/10">
            <Award className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">Seu Plano GymFlow AI Está Pronto!</h2>
            <p className="text-xs text-gym-text-muted mt-1">Desenvolvido com base no seu perfil de {level} no objetivo {goal}.</p>
          </div>

          <TrainingProfileSummary profile={{ ...trainingProfile, goal, frequency, duration }} />

          {/* Card Resumo do Plano */}
          <div className="bg-gym-card border border-white/10 rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gym-accent uppercase tracking-wider">Programa Sugerido:</span>
              <span className="bg-gym-accent/15 text-gym-accent text-[10px] font-black px-2 py-0.5 rounded-full uppercase">{level}</span>
            </div>
            <h3 className="text-base font-bold text-white">
              {goal === 'hypertrophy'
                ? 'GymFlow - Hipertrofia Acelerada e Volume Direcionado'
                : goal === 'slimming'
                ? 'GymFlow - Definição Máxima e Gasto Metabólico'
                : 'GymFlow - Força Central Base e Progressão Linear'}
            </h3>
            <p className="text-xs text-gym-text-muted leading-relaxed">
              Planilha personalizada de {frequency} dias na semana, {duration} minutos por treino, com foco primário em: <span className="text-white font-bold">{muscleFocus.join(', ')}</span>.
            </p>
            {restrictions.length > 0 && (
              <div className="flex items-center gap-1.5 bg-gym-rose/10 border border-gym-rose/25 text-gym-rose p-2.5 rounded-xl text-[10px] font-medium">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Restrições observadas: Adaptações de segurança inseridas para {restrictions.join(', ')}.</span>
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            className="w-full py-4 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl transition-all shadow-lg shadow-gym-accent/25 flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
          >
            Acessar Meu Painel Completo
            <Play className="w-4 h-4 fill-gym-dark" />
          </button>
        </div>
      ) : (
        <div className="glass w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl flex flex-col justify-between min-h-[480px]">
          {/* Top Progress bar */}
          <div>
            <div className="flex justify-between items-center text-xs text-gym-text-muted mb-4 font-bold">
              <span className="text-gym-accent uppercase tracking-widest">Passo {step} de 8</span>
              <span>{Math.round((step / 8) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gym-accent to-gym-emerald transition-all duration-300"
                style={{ width: `${(step / 8) * 100}%` }}
              ></div>
            </div>

            {/* Step Content */}
            <div className="py-2">{renderStepContent()}</div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center gap-4 mt-8 pt-4 border-t border-white/5">
            <button
              onClick={prevStep}
              disabled={step === 1}
              className={`py-3 px-5 font-bold rounded-xl text-xs flex items-center gap-1 transition-all ${
                step === 1
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-gym-text-muted hover:text-white bg-white/5 hover:bg-white/10'
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>

            {step < 8 ? (
              <button
                onClick={nextStep}
                disabled={(step === 1 && (!name || !email)) || (step === 3 && !trainingProfileValid)}
                className="py-3 px-6 bg-gym-accent hover:bg-gym-accent-hover text-gym-dark font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-gym-accent/15 cursor-pointer disabled:opacity-50"
              >
                Avançar <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={generatePlan}
                className="py-3 px-6 bg-gradient-to-r from-gym-accent to-gym-emerald hover:from-gym-accent-hover hover:to-gym-emerald text-gym-dark font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-gym-accent/25 cursor-pointer"
              >
                Gerar Plano de IA <BrainCircuit className="w-4 h-4 animate-bounce" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
