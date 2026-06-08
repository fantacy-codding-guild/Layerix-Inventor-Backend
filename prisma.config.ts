import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasource: {
    url: 'postgresql://postgres:1725@localhost:5432/layerix_inventory?schema=public',
  },
})