# Standard Prompt — E0.5 (briefing idêntico para TODAS as ferramentas)

> **Regra:** toda ferramenta recebe **exatamente** este alvo. Só muda a *forma de entrada* (texto vs. imagem vs. selfie), nunca o alvo. Isso torna a comparação justa.

---

## A. ALVO CANÔNICO (idêntico para todos)

### Avatar Masculino — "GymFlow Male V1"
- Homem, **28–35 anos**, **atleta natural**, **~12–15% de gordura**.
- Aparência **saudável**, **extremamente realista**.
- **Rosto neutro**, simpático, simétrico, **sem uncanny valley**.
- **Mãos detalhadas** (dedos corretos, sem colapso).
- **Pele realista** (poros, SSS, não plástica).
- **Corpo proporcional** (mesomorfo atlético — **NÃO bodybuilder**).
- **Roupa fitness premium** (paleta escura + acento cyber-lime `#a3e635`), **tênis moderno**.
- Ambiente: **academia premium**, **iluminação cinematográfica**.
- ❌ **Proibido:** videogame, cartoon, anime, bodybuilder exagerado, low-poly.

### Avatar Feminino — "GymFlow Female V1"
- Mesmo conceito, **~18–22% de gordura**, **corpo fitness natural**, **elegante**, **saudável**, **premium**.
- Cabelo **preso para treino** (evita clipping na animação).
- Mesmas regras de rosto/mãos/pele/roupa/ambiente/proibições.

> Referência completa: `docs/GYMFLOW_ART_BIBLE_V1.md` §3 (M) e §4 (F).

---

## B. PROMPT DE TEXTO (para text-to-3D: Meshy, Tripo, Hunyuan, Rodin)

Colar **exatamente** isto (PT→EN abaixo, pois a maioria dos motores responde melhor em inglês):

**EN (usar este):**
```
Hyper-realistic full-body 3D model of a natural athletic man, 28-35 years old,
~12-15% body fat, healthy fit physique (NOT a bodybuilder), neutral friendly face,
symmetrical, highly detailed realistic hands, realistic skin with pores and subsurface,
proportional anatomy, wearing premium dark fitness apparel with subtle lime-green
(#a3e635) accents and modern training sneakers, standing in a relaxed neutral A-pose,
cinematic studio lighting on a dark premium background, photorealistic, PBR materials.
NOT cartoon, NOT anime, NOT videogame, NOT low-poly, NOT exaggerated muscles.
```
(Versão feminina: trocar para *"natural athletic woman, ~18-22% body fat, healthy fit feminine physique, hair tied back for training"*, mantendo o resto.)

---

## C. ENTRADA POR IMAGEM (para image-to-3D / avatar-from-photo: CC5 Headshot 3, MetaPerson, Avaturn)

Essas ferramentas partem de **uma imagem**. Para manter o briefing idêntico:
1. Gerar **1 retrato + 1 corpo inteiro** de referência com um gerador de imagem (mesmo alvo da seção A) — frontal, A-pose, luz neutra, fundo limpo.
2. Usar **a MESMA imagem** de referência como entrada em todas as ferramentas image-driven.
3. Guardar a imagem de referência em `results/_reference/` (M e F).

> Assim, "mesmo briefing" vale também para as ferramentas que não aceitam texto.

---

## D. SAÍDA EXIGIDA (para todas, quando possível)
- Export **GLB** (e FBX se disponível).
- Captura de tela do **preview** (frente + 3/4 + close do rosto + close das mãos).
- Salvar tudo em `results/<ferramenta>/` + preencher o Test Card (`../experiments/TEST_CARD_TEMPLATE.md`).
