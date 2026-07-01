const { withSettingsGradle } = require('@expo/config-plugins');

/**
 * Plugin que bloquea el repositorio de snapshots de Sonatype
 * que causa timeouts en la compilación de expo-camera (cameraview).
 */
module.exports = function withBlockSonatype(config) {
  return withSettingsGradle(config, (mod) => {
    const contents = mod.modResults.contents;
    
    // Si ya tiene la modificación, no la dupliquemos
    if (contents.includes('// Block Sonatype snapshots')) {
      return mod;
    }
    
    // Agregar al inicio del settings.gradle (antes del primer bloque)
    const patch = `
// Block Sonatype snapshots — evita timeouts en cameraview
gradle.beforeSettings { settings ->
  settings.pluginManagement {
    repositories {
      gradlePluginPortal()
      google()
      mavenCentral()
      mavenLocal()
    }
  }
}
`;
    mod.modResults.contents = patch + contents;
    return mod;
  });
};
