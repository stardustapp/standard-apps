import vue from 'rollup-plugin-vue';
import css from 'rollup-plugin-css-only';
import { terser } from 'rollup-plugin-terser';

export default [
  {
    input: 'src/app.js',
    external: [
      'vue',
      '@dustjs/client',
      '@dustjs/client-vue',
    ],
    output: {
      name: 'Editor',
      file: 'dist/editor.umd.js',
      format: 'umd',
      sourcemap: true,
      globals: {
        vue: 'Vue',
        '@dustjs/client': 'DustClient',
        '@dustjs/client-vue': 'DustClientVue',
      //   'ws': 'WebSocket',
      //   'node-fetch': 'fetch',
      },
    },
    plugins: [
      vue({ css: false }),
      css({ output: 'dist/editor.css' }),
      terser(),
    ],
  },
];
