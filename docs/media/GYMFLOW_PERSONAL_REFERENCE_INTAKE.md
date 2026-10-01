# GymFlow — Contrato da referência visual oficial do personal

PERSONAL_REFERENCE_STATUS=MISSING_OFFICIAL_VISUAL_REFERENCE

READY_FOR_PERSONAL_REFERENCE_INTAKE=YES

READY_FOR_MEDIA_GENERATION_GOAL=NO

O usuário fornecerá depois a imagem oficial do personal. O GOAL-124 não recebeu essa imagem, não gerou um personal e não inferiu aparência a partir de texto.

## Contrato de recebimento

1. Receber a referência visual original fornecida pelo usuário e sua confirmação explícita de que ela representa o personal oficial. O arquivo deve permitir identificar rosto, aparência corporal e roupa oficial; se um desses elementos estiver indefinido, registrá-lo como pendente antes de gerar qualquer mídia.
2. Preservar o arquivo original, sem recortar, retocar ou sobrescrever. Registrar path, formato, dimensões e hash SHA-256 do original, a origem informada e a referência real à confirmação do usuário. Qualquer derivado futuro deve ter arquivo próprio e vínculo com o original.
3. Fixar a mesma identidade em toda geração e em todos os exercícios: aparência facial e corporal consistente, incluindo proporções e características visíveis. A referência visual prevalece sobre descrições textuais.
4. Fixar a roupa oficial a partir da referência confirmada. Se a roupa oficial não estiver visível ou confirmada, manter a pendência explícita; não escolher uma roupa inventada.
5. É proibido substituir o personal por pessoa genérica, outro atleta de catálogo ou identidade reconstruída de textos. Ausência, ambiguidade ou indisponibilidade da referência bloqueia a geração.
6. Registrar somente fatos fornecidos ou observáveis. Não inventar autoria, licença, direitos, timestamp de aprovação, modelo utilizado ou evidência de aprovação.

PERSONAL_REFERENCE_STATUS poderá passar a READY em GOAL futuro somente após o original estar preservado e acessível, a identidade e a roupa oficial estarem confirmadas pelo usuário e as pendências acima estarem resolvidas. Receber a referência não aprova imagens de exercício nem autoriza upload ou mudança de CDN.

## Uso futuro

Vincular cada geração ao hash e ao path do original e usar sempre o mesmo personal, corpo e roupa oficial. Antes de ligar qualquer resultado ao runtime, exigir revisão humana de identidade, equipamento, movimento, anatomia, enquadramento e sequência. As 125 candidatas atuais de capa continuam sem aprovação visual nova.

Consultar [GYMFLOW_MEDIA_GENERATION_PIPELINE.md](./GYMFLOW_MEDIA_GENERATION_PIPELINE.md) para os quatro gates obrigatórios. O estado atual permite receber a referência; a geração permanece bloqueada.
