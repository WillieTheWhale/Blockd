import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Blockd Interviewee',
    executableName: 'blockd-interviewee',
    icon: './resources/icon',
    asar: true,
    appBundleId: 'com.blockd.interviewee',
    appCategoryType: 'public.app-category.productivity',
    // Copy icon.png to resources for runtime access
    extraResource: ['./resources/icon.png'],
    protocols: [
      {
        name: 'Blockd Protocol',
        schemes: ['blockd'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'blockd_interviewee',
      setupIcon: './resources/icon.ico',
    }),
    new MakerZIP({}, ['darwin', 'linux']),
    new MakerDMG({
      icon: './resources/icon.icns',
      format: 'ULFO',
    }),
    new MakerRpm({
      options: {
        icon: './resources/icon.png',
      },
    }),
    new MakerDeb({
      options: {
        icon: './resources/icon.png',
        maintainer: 'Blockd Team',
        homepage: 'https://blockd.io',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
