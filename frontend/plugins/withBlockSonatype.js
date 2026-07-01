const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Bloquea com.google.android:cameraview agregando un sustituto local
 * en el build.gradle de la app, evitando que Gradle consulte Sonatype.
 */
module.exports = function withBlockSonatype(config) {
  return withAppBuildGradle(config, (mod) => {
    const contents = mod.modResults.contents;

    if (contents.includes('// Fix cameraview sonatype')) {
      return mod;
    }

    // Agregar resolutionStrategy al final del bloque android {}
    const patch = `

// Fix cameraview sonatype — forzar versión disponible en mavenCentral
configurations.all {
    resolutionStrategy {
        force 'androidx.camera:camera-core:1.3.4'
    }
    exclude group: 'com.google.android', module: 'cameraview'
}
`;
    // Insertar antes del último cierre del archivo
    mod.modResults.contents = contents.trimEnd() + patch;
    return mod;
  });
};
