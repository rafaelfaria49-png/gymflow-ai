// GOAL-115 — Gera o APK de release via wrapper do Gradle (cross-platform).
// Requer o projeto android/ sincronizado (npm run cap:sync:android) e JDK 17 +
// Android SDK instalados. Sem credenciais de signing, o Gradle gera um APK
// release UNSIGNED (modo resiliente de android/app/build.gradle); com as
// credenciais (release-signing.properties ou env GYMFLOW_RELEASE_*), gera um
// APK release ASSINADO. O APK sai em:
//   android/app/build/outputs/apk/release/app-release.apk
// Nunca confundir com o APK de debug (npm run android:build).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const androidDir = path.resolve("android");
if (!existsSync(androidDir)) {
  console.error(
    "[android:apk:release] Pasta android/ nao encontrada. Rode antes: npm run cap:sync:android"
  );
  process.exit(1);
}

const isWin = process.platform === "win32";
// Caminho ABSOLUTO para o wrapper do Gradle: com shell:true o cmd.exe do
// Windows nao resolve um `gradlew.bat` "solto" a partir do cwd, entao passamos
// o caminho completo.
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");

console.log("[android:apk:release] Gerando APK de release (assembleRelease)...");
const result = spawnSync(gradlew, ["assembleRelease"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error(`[android:apk:release] Falha no build Gradle (exit code: ${result.status})`);
  process.exit(result.status ?? 1);
}

const apkOutputDir = path.join(androidDir, "app", "build", "outputs", "apk", "release");
if (existsSync(apkOutputDir)) {
  const files = readdirSync(apkOutputDir).filter((f) => f.endsWith(".apk"));
  if (files.length > 0) {
    console.log("\n[android:apk:release] Sucesso! APK de release gerado:");
    for (const f of files) {
      const fullPath = path.join(apkOutputDir, f);
      const sizeBytes = statSync(fullPath).size;
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      console.log(`  -> ${fullPath} (${sizeMB} MB / ${sizeBytes} bytes)`);
    }
  } else {
    console.warn(`[android:apk:release] Nenhum arquivo .apk encontrado em ${apkOutputDir}`);
  }
} else {
  console.warn(`[android:apk:release] Diretorio de saida nao encontrado: ${apkOutputDir}`);
}

process.exit(0);
