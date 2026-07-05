import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/components/index.ts'),
      name: 'Servicefy',
      formats: ['es'],
      fileName: 'servicefy',
    },
    outDir: 'dist-lib',
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react-dom', 'lucide-react', /^react\//, /^react-dom\//],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'lucide-react': 'LucideReact',
        },
      },
    },
  },
})
