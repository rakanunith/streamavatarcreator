import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/streamavatarcreator/',   // ⬅️ IMPORTANT: replace with your repo, e.g. /unith-avatar-app/
  plugins: [react()],
  server: { port: 5175 },
})
