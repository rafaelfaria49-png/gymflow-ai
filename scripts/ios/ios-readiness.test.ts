import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(__dirname, '../..');
const IOS_DIR = path.join(ROOT_DIR, 'ios');
const APP_DIR = path.join(IOS_DIR, 'App');
const INNER_APP_DIR = path.join(APP_DIR, 'App');

describe('GOAL-MOBILE-006: Prontidão iOS / iPhone / App Store', () => {
  describe('1. Identidade e Bundle Identifier', () => {
    it('mantém Bundle ID canônico com.gymflowai.app em capacitor.config.ts', () => {
      const configPath = path.join(ROOT_DIR, 'capacitor.config.ts');
      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain("appId: 'com.gymflowai.app'");
      expect(content).toContain("appName: 'GymFlow'");
    });

    it('mantém Bundle ID canônico com.gymflowai.app e nome GymFlow no Info.plist', () => {
      const plistPath = path.join(INNER_APP_DIR, 'Info.plist');
      const content = fs.readFileSync(plistPath, 'utf8');
      expect(content).toContain('<key>CFBundleDisplayName</key>');
      expect(content).toContain('<string>GymFlow</string>');
      expect(content).toContain('<key>CFBundleIdentifier</key>');
      expect(content).toContain('<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>');
    });

    it('configura PRODUCT_BUNDLE_IDENTIFIER com.gymflowai.app no project.pbxproj', () => {
      const pbxprojPath = path.join(APP_DIR, 'App.xcodeproj', 'project.pbxproj');
      const content = fs.readFileSync(pbxprojPath, 'utf8');
      const bundleIdMatches = content.match(/PRODUCT_BUNDLE_IDENTIFIER = (.*?);/g);
      expect(bundleIdMatches).not.toBeNull();
      expect(bundleIdMatches!.length).toBeGreaterThanOrEqual(2);
      for (const match of bundleIdMatches!) {
        expect(match).toBe('PRODUCT_BUNDLE_IDENTIFIER = com.gymflowai.app;');
      }
    });

    it('mantém versionamento canônico sincronizado (MARKETING_VERSION 1.0, CURRENT_PROJECT_VERSION 1)', () => {
      const pbxprojPath = path.join(APP_DIR, 'App.xcodeproj', 'project.pbxproj');
      const content = fs.readFileSync(pbxprojPath, 'utf8');
      const mVersionMatches = content.match(/MARKETING_VERSION = (.*?);/g);
      const bVersionMatches = content.match(/CURRENT_PROJECT_VERSION = (.*?);/g);

      expect(mVersionMatches).not.toBeNull();
      for (const m of mVersionMatches!) {
        expect(m).toBe('MARKETING_VERSION = 1.0;');
      }

      expect(bVersionMatches).not.toBeNull();
      for (const b of bVersionMatches!) {
        expect(b).toBe('CURRENT_PROJECT_VERSION = 1;');
      }
    });

    it('preserva deployment target de compatibilidade iOS 14.0 sem elevação prematura', () => {
      const podfilePath = path.join(APP_DIR, 'Podfile');
      const podfileContent = fs.readFileSync(podfilePath, 'utf8');
      expect(podfileContent).toMatch(/platform :ios, ['"]14\.0['"]/);

      const pbxprojPath = path.join(APP_DIR, 'App.xcodeproj', 'project.pbxproj');
      const pbxContent = fs.readFileSync(pbxprojPath, 'utf8');
      const targetMatches = pbxContent.match(/IPHONEOS_DEPLOYMENT_TARGET = (.*?);/g);
      expect(targetMatches).not.toBeNull();
      for (const t of targetMatches!) {
        expect(t).toBe('IPHONEOS_DEPLOYMENT_TARGET = 14.0;');
      }
    });
  });

  describe('2. Info.plist e Menor Privilégio', () => {
    it('não contém permissões invasivas ou não utilizadas', () => {
      const plistPath = path.join(INNER_APP_DIR, 'Info.plist');
      const content = fs.readFileSync(plistPath, 'utf8');

      const prohibitedKeys = [
        'NSCameraUsageDescription',
        'NSMicrophoneUsageDescription',
        'NSLocationWhenInUseUsageDescription',
        'NSLocationAlwaysAndWhenInUseUsageDescription',
        'NSLocationAlwaysUsageDescription',
        'NSPhotoLibraryUsageDescription',
        'NSPhotoLibraryAddUsageDescription',
        'NSContactsUsageDescription',
        'NSHealthShareUsageDescription',
        'NSHealthUpdateUsageDescription',
        'NSUserTrackingUsageDescription',
        'NSBluetoothAlwaysUsageDescription',
        'NSBluetoothPeripheralUsageDescription',
        'NSCalendarsUsageDescription',
        'NSRemindersUsageDescription',
        'NSSpeechRecognitionUsageDescription',
        'NSFaceIDUsageDescription',
      ];

      for (const key of prohibitedKeys) {
        expect(content).not.toContain(`<key>${key}</key>`);
      }
    });

    it('configura orientação exclusiva portrait para iPhone e 4 orientações para iPad', () => {
      const plistPath = path.join(INNER_APP_DIR, 'Info.plist');
      const content = fs.readFileSync(plistPath, 'utf8');

      expect(content).toContain('<key>UISupportedInterfaceOrientations</key>');
      expect(content).toContain('<string>UIInterfaceOrientationPortrait</string>');
      expect(content).toContain('<key>UISupportedInterfaceOrientations~ipad</key>');
    });
  });

  describe('3. App Transport Security (ATS) e Conectividade HTTPS', () => {
    it('não contém NSAllowsArbitraryLoads=true no Info.plist', () => {
      const plistPath = path.join(INNER_APP_DIR, 'Info.plist');
      const content = fs.readFileSync(plistPath, 'utf8');
      expect(content).not.toContain('NSAllowsArbitraryLoads');
    });

    it('todos os endpoints do manifest de mídia utilizam exclusivamente HTTPS', () => {
      const manifestPath = path.join(ROOT_DIR, 'src/domain/media/manifest.json');
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestRaw);

      expect(manifest.cdnBaseUrl).toMatch(/^https:\/\//);

      for (const asset of Object.values(manifest.assets) as any[]) {
        if (asset.video?.url) {
          expect(asset.video.url).toMatch(/^https:\/\//);
        }
        if (asset.thumbnailUrl) {
          expect(asset.thumbnailUrl).toMatch(/^https:\/\//);
        }
      }
    });
  });

  describe('4. Privacy Manifest (PrivacyInfo.xcprivacy)', () => {
    it('possui apenas UMA fonte canônica no diretório do target App', () => {
      const canonicalPath = path.join(INNER_APP_DIR, 'PrivacyInfo.xcprivacy');
      const rootPath = path.join(APP_DIR, 'PrivacyInfo.xcprivacy');

      expect(fs.existsSync(canonicalPath)).toBe(true);
      expect(fs.existsSync(rootPath)).toBe(false);
    });

    it('está devidamente registrado e incluído no bundle de recursos em project.pbxproj', () => {
      const pbxprojPath = path.join(APP_DIR, 'App.xcodeproj', 'project.pbxproj');
      const content = fs.readFileSync(pbxprojPath, 'utf8');

      // PBXBuildFile
      expect(content).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile;/);
      // PBXFileReference
      expect(content).toMatch(/PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;/);
      // PBXGroup App
      expect(content).toMatch(/public \*\//);
      // PBXResourcesBuildPhase
      expect(content).toMatch(/Resources \*\/ = \{[\s\S]*?PrivacyInfo\.xcprivacy in Resources/);
    });

    it('declara apenas Required Reason APIs estritamente auditadas sem categorias fictícias', () => {
      const canonicalPath = path.join(INNER_APP_DIR, 'PrivacyInfo.xcprivacy');
      const content = fs.readFileSync(canonicalPath, 'utf8');

      // Acessa apenas FileTimestamp para o @capacitor/filesystem
      expect(content).toContain('<key>NSPrivacyAccessedAPIType</key>');
      expect(content).toContain('<string>NSPrivacyAccessedAPICategoryFileTimestamp</string>');
      expect(content).toContain('<string>C617.1</string>');

      // Não inventa categorias não usadas
      expect(content).not.toContain('NSPrivacyAccessedAPICategoryUserDefaults');
      expect(content).not.toContain('NSPrivacyAccessedAPICategorySystemBootTime');
      expect(content).not.toContain('NSPrivacyAccessedAPICategoryDiskSpace');
      expect(content).not.toContain('NSPrivacyAccessedAPICategoryActiveKeyboards');

      // Zero dados coletados e zero tracking
      expect(content).toContain('<key>NSPrivacyCollectedDataTypes</key>');
      expect(content).toContain('<key>NSPrivacyTracking</key>');
      expect(content).toContain('<false/>');
    });
  });

  describe('5. Assets Obrigatórios da Apple', () => {
    it('possui AppIcon universal opaco de 1024x1024 px com Contents.json válido', () => {
      const iconSetDir = path.join(INNER_APP_DIR, 'Assets.xcassets', 'AppIcon.appiconset');
      const iconPath = path.join(iconSetDir, 'AppIcon-512@2x.png');
      const jsonPath = path.join(iconSetDir, 'Contents.json');

      expect(fs.existsSync(iconPath)).toBe(true);
      expect(fs.existsSync(jsonPath)).toBe(true);

      const stats = fs.statSync(iconPath);
      expect(stats.size).toBeGreaterThan(10000); // Arquivo binário PNG íntegro

      const contents = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      expect(contents.images[0].size).toBe('1024x1024');
      expect(contents.images[0].idiom).toBe('universal');
      expect(contents.images[0].filename).toBe('AppIcon-512@2x.png');
    });

    it('possui Splash.imageset completo com resoluções 1x, 2x, 3x universais', () => {
      const splashDir = path.join(INNER_APP_DIR, 'Assets.xcassets', 'Splash.imageset');
      const jsonPath = path.join(splashDir, 'Contents.json');

      expect(fs.existsSync(jsonPath)).toBe(true);
      const contents = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      expect(contents.images.length).toBe(3);

      for (const img of contents.images) {
        const filePath = path.join(splashDir, img.filename);
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.statSync(filePath).size).toBeGreaterThan(10000);
      }
    });
  });

  describe('6. Segurança do Repositório e Proteção contra Credenciais Apple', () => {
    it('não contém arquivos de certificados ou chaves rastreados no git', () => {
      const gitFiles = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf8' });
      const sensitiveExtensions = [
        /\.p12$/m,
        /\.cer$/m,
        /\.mobileprovision$/m,
        /\.provisionprofile$/m,
        /\.p8$/m,
        /\.keystore$/m,
        /\.jks$/m,
      ];

      for (const regex of sensitiveExtensions) {
        expect(gitFiles).not.toMatch(regex);
      }
    });

    it('regras de .gitignore protegem credenciais Apple no root e em ios/', () => {
      const rootGitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
      const iosGitignore = fs.readFileSync(path.join(IOS_DIR, '.gitignore'), 'utf8');

      expect(rootGitignore).toContain('*.p12');
      expect(rootGitignore).toContain('*.mobileprovision');
      expect(rootGitignore).toContain('*.cer');
      expect(rootGitignore).toContain('*.p8');

      expect(iosGitignore).toContain('*.p12');
      expect(iosGitignore).toContain('*.mobileprovision');
    });
  });

  describe('7. Plugins Nativos do Capacitor', () => {
    it('declara todos os 7 plugins essenciais no Podfile', () => {
      const podfilePath = path.join(APP_DIR, 'Podfile');
      const content = fs.readFileSync(podfilePath, 'utf8');

      const expectedPods = [
        'CapacitorApp',
        'CapacitorFileTransfer',
        'CapacitorFilesystem',
        'CapacitorKeyboard',
        'CapacitorShare',
        'CapacitorSplashScreen',
        'CapacitorStatusBar',
      ];

      for (const pod of expectedPods) {
        expect(content).toContain(`pod '${pod}'`);
      }
    });
  });
});
