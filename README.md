# ROVIA — Find your way.

Road trip planlama, GPS yolculuk kaydı, keşif ve dijital seyahatname platformu.

- **Mimari ve analiz:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Kurulum:** [docs/SETUP.md](docs/SETUP.md)
- **Faz raporları:** [docs/PHASE-1-REPORT.md](docs/PHASE-1-REPORT.md)

```bash
npm install && cp .env.example .env.local && npm run dev
npm run check      # typecheck + lint + DB/RLS testleri
npm run db:types   # migration'lardan Supabase tiplerini üret
```

Yığın: Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres + PostGIS + RLS, Auth, Storage) ·
MapLibre GL JS · OpenFreeMap · Valhalla · OpenStreetMap

Harita verisi © [OpenStreetMap katkıda bulunanlar](https://www.openstreetmap.org/copyright) (ODbL).
