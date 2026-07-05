'use client';

import React, { useState } from 'react';
import { useGymFlow } from '../providers/GymFlowContext';
import { Mail, Lock, User, ArrowLeft, KeyRound, Sparkles, ChevronRight } from 'lucide-react';

export const LoginPage = () => {
  const { loginDemoUser, registerUser, setActiveView } = useGymFlow();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    // Entra direto simulando login
    registerUser({
      name: email.split('@')[0],
      email: email,
      level: 'intermediate',
      premiumStatus: 'free'
    });
  };

  return (
    <div className="min-h-screen bg-gym-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blurs */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-gym-accent/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gym-emerald/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/5 shadow-2xl relative">
        <button
          onClick={() => setActiveView('landing')}
          className="absolute top-6 left-6 text-gym-text-muted hover:text-white flex items-center gap-1 text-xs font-semibold bg-white/5 py-1.5 px-3 rounded-full transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>

        <div className="text-center mt-8 mb-8">
          <span className="text-2xl font-black bg-gradient-to-r from-gym-accent to-gym-emerald bg-clip-text text-transparent tracking-tighter pl-0.5">
            GYMFLOW<span className="text-white">AI</span>
          </span>
          <h2 className="text-xl font-bold text-white mt-4">Bem-vindo de volta</h2>
          <p className="text-xs text-gym-text-muted mt-1">Insira seus dados para acessar sua conta</p>
        </div>

        {error && (
          <div className="bg-gym-rose/10 border border-gym-rose/30 text-gym-rose text-xs rounded-xl p-3 mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-1.5 pl-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
              <input
                type="email"
                placeholder="nome@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 pl-1">
              <label className="text-xs font-bold uppercase tracking-wider text-gym-text-muted">Senha</label>
              <button
                type="button"
                onClick={() => setActiveView('recovery')}
                className="text-[10px] text-gym-accent hover:underline font-bold"
              >
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
              <input
                type="password"
                placeholder="Sua senha secreta"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-gym-accent to-gym-emerald hover:from-gym-accent-hover hover:to-gym-emerald text-gym-dark font-extrabold rounded-xl transition-all shadow-md shadow-gym-accent/15 cursor-pointer text-xs uppercase tracking-wider mt-2"
          >
            Entrar
          </button>
        </form>

        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-white/5 w-full"></div>
          <span className="bg-gym-dark px-3 text-[10px] text-gym-text-muted uppercase tracking-wider absolute">Ou</span>
        </div>

        <button
          type="button"
          onClick={loginDemoUser}
          className="w-full py-3.5 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
        >
          <Sparkles className="w-4 h-4 text-gym-accent" />
          Acessar como Usuário Demo
        </button>

        <p className="text-center text-xs text-gym-text-muted mt-8">
          Não tem uma conta?{' '}
          <button
            onClick={() => setActiveView('register')}
            className="text-gym-accent hover:underline font-semibold"
          >
            Cadastre-se grátis
          </button>
        </p>
      </div>
    </div>
  );
};

export const RegisterPage = () => {
  const { loginDemoUser, setActiveView } = useGymFlow();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    // Encaminha para o Onboarding para completar o cadastro inteligente!
    setActiveView('onboarding');
  };

  return (
    <div className="min-h-screen bg-gym-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blurs */}
      <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-gym-accent/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-gym-emerald/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/5 shadow-2xl relative">
        <button
          onClick={() => setActiveView('landing')}
          className="absolute top-6 left-6 text-gym-text-muted hover:text-white flex items-center gap-1 text-xs font-semibold bg-white/5 py-1.5 px-3 rounded-full transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>

        <div className="text-center mt-8 mb-6">
          <span className="text-2xl font-black bg-gradient-to-r from-gym-accent to-gym-emerald bg-clip-text text-transparent tracking-tighter pl-0.5">
            GYMFLOW<span className="text-white">AI</span>
          </span>
          <h2 className="text-xl font-bold text-white mt-4">Crie sua conta</h2>
          <p className="text-xs text-gym-text-muted mt-1">Defina suas credenciais para iniciar o onboarding</p>
        </div>

        {error && (
          <div className="bg-gym-rose/10 border border-gym-rose/30 text-gym-rose text-xs rounded-xl p-3 mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-1.5 pl-1">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
              <input
                type="text"
                placeholder="Seu nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-1.5 pl-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
              <input
                type="email"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-1.5 pl-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
              <input
                type="password"
                placeholder="Crie uma senha forte"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-gym-accent to-gym-emerald hover:from-gym-accent-hover hover:to-gym-emerald text-gym-dark font-extrabold rounded-xl transition-all shadow-md shadow-gym-accent/15 cursor-pointer text-xs uppercase tracking-wider mt-2 flex items-center justify-center gap-2"
          >
            Começar Onboarding Inteligente
            <ChevronRight className="w-4 h-4 text-gym-dark" />
          </button>
        </form>

        <div className="relative flex items-center justify-center my-5">
          <div className="border-t border-white/5 w-full"></div>
          <span className="bg-gym-dark px-3 text-[10px] text-gym-text-muted uppercase tracking-wider absolute">Ou</span>
        </div>

        <button
          type="button"
          onClick={loginDemoUser}
          className="w-full py-3.5 bg-gym-card hover:bg-white/5 border border-white/10 hover:border-white/20 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
        >
          <Sparkles className="w-4 h-4 text-gym-accent" />
          Entrar como Usuário Demo
        </button>

        <p className="text-center text-xs text-gym-text-muted mt-6">
          Já tem conta?{' '}
          <button
            onClick={() => setActiveView('login')}
            className="text-gym-accent hover:underline font-semibold"
          >
            Faça login
          </button>
        </p>
      </div>
    </div>
  );
};

export const RecoveryPage = () => {
  const { setActiveView } = useGymFlow();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gym-dark flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-gym-accent/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="glass w-full max-w-md p-8 rounded-3xl border border-white/5 shadow-2xl relative">
        <button
          onClick={() => setActiveView('login')}
          className="absolute top-6 left-6 text-gym-text-muted hover:text-white flex items-center gap-1 text-xs font-semibold bg-white/5 py-1.5 px-3 rounded-full transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao Login
        </button>

        <div className="text-center mt-8 mb-6">
          <div className="w-12 h-12 bg-gym-accent/15 border border-gym-accent/20 rounded-full flex items-center justify-center text-gym-accent mx-auto mb-4">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Recuperação de Senha</h2>
          <p className="text-xs text-gym-text-muted mt-1">Enviaremos um código para redefinir sua credencial</p>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="bg-gym-accent/15 border border-gym-accent/30 text-gym-accent text-xs rounded-xl p-4">
              Instruções de redefinição de senha foram enviadas para <span className="font-bold">{email}</span>. Verifique sua caixa de entrada e spam.
            </div>
            <button
              onClick={() => setActiveView('login')}
              className="w-full py-3 bg-gym-accent text-gym-dark font-bold rounded-xl text-xs uppercase"
            >
              Voltar ao Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gym-text-muted mb-1.5 pl-1">E-mail Cadastrado</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 w-4 h-4 text-gym-text-muted" />
                <input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-gym-accent focus:ring-1 focus:ring-gym-accent rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-gym-text-muted outline-none transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-gym-accent to-gym-emerald text-gym-dark font-extrabold rounded-xl transition-all shadow-md shadow-gym-accent/15 text-xs uppercase tracking-wider cursor-pointer"
            >
              Enviar E-mail de Recuperação
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
