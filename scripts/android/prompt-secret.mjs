// GOAL-117 — Leitura interativa de senha SEM eco no terminal.
// Exige TTY: senha nunca vem de pipe/arquivo neste fluxo. Nada é impresso
// além do rótulo da pergunta.

export function promptSecret(question) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(
      new Error("Entrada interativa indisponível (stdin não é um terminal). Rode o comando num terminal.")
    );
  }
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    let inEscape = false;
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        // Sequências de escape (setas etc.): descarta até o terminador.
        if (inEscape) {
          if (/[A-Za-z~]/.test(ch)) inEscape = false;
          continue;
        }
        if (ch === "\u001b") {
          inEscape = true;
          continue;
        }
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003" || ch === "\u0004") return finish(new Error("Cancelado pelo usuário."));
        if (ch === "\u007f" || ch === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
