# Prompts finais por ferramenta

O **alvo é idêntico** para todas (ver `STANDARD_PROMPT.md`). Aqui ficam só os **ajustes de entrada** por ferramenta — porque cada motor responde a um formato. Cole o prompt EN do `STANDARD_PROMPT.md` e siga o ajuste abaixo.

> Lembrete: gerar **M e F**. Para a versão F, trocar o trecho para *"natural athletic woman, ~18-22% body fat, healthy fit feminine physique, hair tied back for training"* mantendo o resto.

---

## Meshy 6 — text-to-3D (começar por aqui)
- Modo: **Text to 3D**.
- Colar o prompt EN inteiro.
- Settings: qualidade **alta**, **PBR on**, topologia **quad** se oferecido, **rig/animation** on se disponível.
- Gerar 2–4 variações → escolher a melhor.
- Exportar **GLB**. Licença free = CC BY 4.0 público (só teste).

## Tripo — text-to-3D
- Modo: **Text to Model**.
- Mesmo prompt EN.
- Ativar **PBR** e, se houver, **rigging** (Tripo tem auto-rig em alguns planos).
- Exportar **GLB**. Free = **sem uso comercial** (só teste).

## Rodin / Hyper3D — text/image-to-3D
- Modo texto (ou imagem, se usar a referência).
- Mesmo prompt EN; Rodin tende a caprichar em **superfície/face**.
- Pedir **A/T-pose**. Exportar **GLB**.

## Hunyuan 3D 2.5 — image-to-3D
- Precisa de **1 imagem** (frontal, A-pose, fundo limpo) em `results/_reference/`.
- Forte em **geometria**; normalmente **sem rig** → exportar GLB e avaliar como base (re-rig depois).

## ChatAvatar (Deemos) — face/cabeça
- Texto ou imagem; foco em **rosto hiper-real** (benchmark de face).
- Exportar o que a ferramenta permitir; tratar como **referência de teto facial**, não corpo inteiro.

## MetaPerson / Avatar SDK — photo→avatar (GLB nativo)
- Entrada: **foto frontal** (a mesma referência M/F).
- Exporta **GLB/GLTF nativo** com rig → ótimo para testar carga R3F rápido.
- Estilo tende a "avatar" (não herói) — registrar no visual.

## Avaturn — photo→avatar
- Entrada: **selfie/foto frontal**.
- GLB rigado; estilizado. Bom para velocidade/fallback.

## 3D AI Studio — prompt/foto → rigado → GLB (tudo-em-um)
- Mesmo prompt EN (ou foto).
- Vantagem: pipeline curto (rig + GLB num lugar). Avaliar se a qualidade basta.

## Character Creator 5 + Headshot 3 + AccuRig — desktop (provável base oficial)
- **Headshot 3** aceita **foto OU texto** → personagem rigado com topologia limpa.
- Roupa/material no CC5; **AccuRig** se precisar (re)rig.
- **Não exporta glTF** → **FBX → Blender (cc_blender_tools) → glTF-transform → GLB**.
- Licença royalty-free (confirmar embed web — `BENCHMARK_LICENSES.md`).

## MetaHuman 2.0 — benchmark de realismo
- Criar no MetaHuman Creator → UE5 → export → Blender → GLB.
- Tratar como **teto de realismo** (peso/atrito alto p/ runtime web full-body), não como entrega.

---

## Depois de exportar
1. `gymflow_<sexo>_<ferramenta>.glb` → `../drop/` + `.meta.json` (de `../drop/_TEMPLATE.meta.json`).
2. Capturas (frente/3-4/rosto/mãos) → `../results/<ferramenta>/`.
3. `cd ../tools && node analyze-glb.mjs`.
4. Seguir `../checklists/EVALUATION_CHECKLIST.md`.
