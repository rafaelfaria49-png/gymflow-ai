# `drop/` — caixa de entrada dos GLBs reais

Coloque aqui os arquivos **`.glb`** que você gerar/baixar de cada ferramenta. O analisador (`../tools/analyze-glb.mjs`) lê esta pasta por padrão.

## Convenção de nomes
`gymflow_<sexo>_<ferramenta>[_vN].glb`

Exemplos:
- `gymflow_male_meshy.glb`
- `gymflow_female_tripo.glb`
- `gymflow_male_cc5_v2.glb`

## Sidecar obrigatório-quando-possível: `<nome>.meta.json`
Ao lado de cada `.glb`, crie um `.meta.json` com o **mesmo nome base**. Ele carrega o que os bytes não contam (ferramenta, plano, **licença**, custo, tempo de geração) e — **depois** de você olhar o modelo — as **notas visuais** (rosto/mãos/pele) e, quando medirmos, o **FPS**.

> Sem o sidecar, o analisador ainda roda, mas deixa **visual** e **comercial** como *pendentes* (não inventa nota).

Copie `_TEMPLATE.meta.json`, renomeie para `<nome>.meta.json` e preencha.

## Isolamento
Tudo aqui é **teste**. Nenhum arquivo desta pasta vai para `public/assets/` nem para o GymFlow AI. A migração de um asset para o produto só acontece após decisão formal (portões da Bíblia/E0).

## Importante sobre licença
GLB de **free tier** costuma vir com licença restritiva (ex.: Meshy free = CC BY 4.0 **público**; Tripo free = **sem uso comercial**). Isso é ótimo para **teste**, mas **não serve** como asset final de marca. Registre a licença real no `.meta.json` — o eixo **comercial** depende disso e um portão pode reprovar.
