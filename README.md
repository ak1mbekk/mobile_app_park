# mobileappmapmodule

Модуль карт для ООО «Парк Животных». Стек: Vite, React, TypeScript, Capacitor (мобильные), Electron (десктоп), Leaflet.

## Стек

- **Vite 7** — сборка
- **React 18** + **TypeScript**
- **Tailwind CSS**
- **Leaflet** + **react-leaflet** — карты
- **Capacitor 8** — Android и iOS
- **Electron 37** — Windows, macOS, Linux

## Запуск

### Веб / Dev

```bash
npm install
npm run dev
```

### Electron (десктоп)

```bash
npm run electron:dev
```

Сначала должен быть запущен Vite (`npm run dev`). Либо `electron:dev` сам поднимет Vite.

### Capacitor (мобильные)

```bash
# Добавить платформы (один раз)
npm run cap:add:android
npm run cap:add:ios   # только на macOS

# Сборка и синхронизация
npm run cap:sync

# Открыть в Android Studio / Xcode
npm run cap:open:android
npm run cap:open:ios
```

## Сборка

```bash
npm run build           # веб
npm run electron:build  # Electron
npm run build:win       # Windows
npm run build:mac       # macOS
npm run build:linux     # Linux
```

## Структура

```
├── electron/          # Electron main и preload
├── public/            # Статика
├── src/
│   ├── pages/         # Страницы (MapPage и др.)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── capacitor.config.ts
├── vite.config.js
└── package.json
```
