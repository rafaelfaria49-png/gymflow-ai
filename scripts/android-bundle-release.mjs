// GOAL-MOBILE-005 — Gera o Android App Bundle (AAB) de release via wrapper do Gradle.
// Requer que o projeto android/ já exista (npm run cap:sync) e um JDK 17 + o
// Android SDK instalados. O AAB sai em:
//   android/app/build/outputs/bundle/release/app-release.aab
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const androidDir = path.resolve("android");
if (!existsSync(androidDir)) {
  console.error(
    "[android:bundle:release] Pasta android/ nao encontrada. Rode antes: npm run cap:sync:android"
  );
  process.exit(1);
}

const isWin = process.platform === "win32";
// Caminho ABSOLUTO para o wrapper do Gradle: com shell:true o cmd.exe do
// Windows nao resolve um `gradlew.bat` "solto" a partir do cwd, entao passamos
// o caminho completo.
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");

console.log("[android:bundle:release] Iniciando geracao do Android App Bundle (AAB)...");
const result = spawnSync(gradlew, ["bundleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error(`[android:bundle:release] Falha no build Gradle (exit code: ${result.status})`);
  process.exit(result.status ?? 1);
}

const bundleOutputDir = path.join(androidDir, "app", "build", "outputs", "bundle", "release");
if (existsSync(bundleOutputDir)) {
  const files = readdirSync(bundleOutputDir).filter((f) => f.endsWith(".aab"));
  if (files.length > 0) {
    console.log("\n[android:bundle:release] Sucesso! Android App Bundle gerado:");
    for (const f of files) {
      const fullPath = path.join(bundleOutputDir, f);
      const sizeBytes = statSync(fullPath).size;
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      console.log(`  -> ${fullPath} (${sizeMB} MB / ${sizeBytes} bytes)`);
    }
  } else {
    console.warn(`[android:bundle:release] Nenhum arquivo .aab encontrado em ${bundleOutputDir}`);
  }
} else {
  console.warn(`[android:bundle:release] Diretorio de saida nao encontrado: ${bundleOutputDir}`);
}

process.exit(0);
