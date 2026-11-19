import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const iosAppDir = path.join(root, 'ios', 'App', 'App');
const infoPlistPath = path.join(iosAppDir, 'Info.plist');
const pbxprojPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const appIconSetDir = path.join(
  iosAppDir,
  'Assets.xcassets',
  'AppIcon.appiconset'
);
const sourceIconPath = path.join(root, 'resources', 'AppIcon-512@2x.png');

if (!fs.existsSync(infoPlistPath)) {
  throw new Error(`Info.plist not found at ${infoPlistPath}. Run "npx cap add ios" first.`);
}

function setPlistValue(key, type, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, infoPlistPath], {
      stdio: 'ignore',
    });
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, infoPlistPath], {
      stdio: 'inherit',
    });
  }
}

// 1. Display Name & Export Compliance (avoids manual TestFlight prompt on every build)
setPlistValue('CFBundleDisplayName', 'string', 'TranoGasy');
setPlistValue('ITSAppUsesNonExemptEncryption', 'bool', 'false');

// 2. iOS Privacy Usage Descriptions (French)
setPlistValue(
  'NSLocationWhenInUseUsageDescription',
  'string',
  '"TranoGasy utilise votre position pour afficher les logements à proximité et localiser vos annonces."'
);
setPlistValue(
  'NSPhotoLibraryUsageDescription',
  'string',
  '"TranoGasy accède à votre photothèque pour ajouter des photos à vos annonces et à votre profil."'
);
setPlistValue(
  'NSPhotoLibraryAddUsageDescription',
  'string',
  '"TranoGasy enregistre des photos dans votre photothèque lorsque vous le demandez."'
);
setPlistValue(
  'NSCameraUsageDescription',
  'string',
  '"TranoGasy utilise l’appareil photo pour photographier vos biens immobiliers ou votre photo de profil."'
);

// 3. Install 1024x1024 opaque App Store icon
if (fs.existsSync(sourceIconPath) && fs.existsSync(appIconSetDir)) {
  const destIconPath = path.join(appIconSetDir, 'AppIcon-512@2x.png');
  fs.copyFileSync(sourceIconPath, destIconPath);

  const contentsJson = {
    images: [
      {
        filename: 'AppIcon-512@2x.png',
        idiom: 'universal',
        platform: 'ios',
        size: '1024x1024',
      },
    ],
    info: {
      author: 'xcode',
      version: 1,
    },
  };
  fs.writeFileSync(
    path.join(appIconSetDir, 'Contents.json'),
    JSON.stringify(contentsJson, null, 2) + '\n',
    'utf8'
  );
  console.log('✓ Installed 1024x1024 opaque AppIcon');
} else {
  console.warn('! Skipped AppIcon installation (missing source icon or AppIcon.appiconset)');
}

// 4. Configure manual App Store signing ONLY on the main App target (not CocoaPods frameworks)
const teamId = process.env.TEAM_ID?.trim();
const profileName = process.env.PROFILE_NAME?.trim();
const marketingVersion = process.env.MARKETING_VERSION?.trim() || '1.0.0';
const buildNumber = process.env.BUILD_NUMBER?.trim() || '1';

if (fs.existsSync(pbxprojPath) && teamId && profileName) {
  let pbx = fs.readFileSync(pbxprojPath, 'utf8');

  // Switch target provisioning style to Manual
  pbx = pbx.replace(/ProvisioningStyle = Automatic;/g, 'ProvisioningStyle = Manual;');
  pbx = pbx.replace(/CODE_SIGN_STYLE = Automatic;/g, 'CODE_SIGN_STYLE = Manual;');

  // Update version & build numbers
  pbx = pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketingVersion};`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);

  // Inject manual signing fields into each buildSettings block containing PRODUCT_BUNDLE_IDENTIFIER
  pbx = pbx.replace(
    /(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g,
    `$1\n\t\t\t\tCODE_SIGN_STYLE = Manual;\n\t\t\t\tDEVELOPMENT_TEAM = ${teamId};\n\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profileName}";`
  );

  fs.writeFileSync(pbxprojPath, pbx, 'utf8');
  console.log(`✓ Configured App target signing (Team=${teamId}, Profile="${profileName}", v${marketingVersion} build ${buildNumber})`);
}

console.log('✓ Configured iOS Info.plist, assets, and project settings');
