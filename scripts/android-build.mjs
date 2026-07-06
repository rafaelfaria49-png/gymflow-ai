// GOAL-12 — Gera o APK de debug via wrapper do Gradle (cross-platform).
// Requer que o projeto android/ já exista (npm run cap:sync) e um JDK 17 + o
// Android SDK instalados (ANDROID_HOME). O APK sai em:
//   android/app/build/outputs/apk/debug/app-debug.apk
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const androidDir = path.resolve("android");
if (!existsSync(androidDir)) {
  console.error(
    "[android:build] Pasta android/ nao encontrada. Rode antes: npm run cap:sync"
  );
  process.exit(1);
}

const isWin = process.platform === "win32";
// Caminho ABSOLUTO para o wrapper do Gradle: com shell:true o cmd.exe do
// Windows nao resolve um `gradlew.bat` "solto" a partir do cwd, entao passamos
// o caminho completo (o diretorio do projeto nao tem espacos).
const gradlew = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");

const result = spawnSync(gradlew, ["assembleDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
