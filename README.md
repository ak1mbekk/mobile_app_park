# mobileappmapmodule

## Мобильный показ «Домик у тропы» · ветка 2.0

[Запись прохождения на 32 секунды](docs/showcase/Animal-Park.mp4) · [Экраны игры и парка](docs/showcase/showcase.jpg) · [Техническое задание](specs/animal-park/TZ.md)

Для показа из корня репозитория запустите `python -m http.server 8138 --bind 0.0.0.0 --directory public/demo`. Готовая сборка включена в эту ветку. На компьютере откройте `http://127.0.0.1:8138/?view=3d`. На телефоне в той же Wi-Fi-сети замените `127.0.0.1` локальным адресом компьютера. Брандмауэр должен разрешать вход на этот порт в частной сети. При обычном открытии главной страницы 3D загружается по кнопке. Встреча использует WebGL 2, объём движка и сцены вместе около 80 МБ до сетевого сжатия.

1. Поднесите яблоко к лапам, дождитесь, пока Ричи его съест, и подтвердите имя. Через нижнюю вкладку можно уйти в парк и вернуться к анимации.
2. В домике нажмите на миску, купель, лежанку или сундук. Выигрыш даёт 5 листьев и 10 опыта. На 5 листьев можно купить плетёный мяч. Стадии взросления и тестовый купон привязаны к уровню.
3. Откройте **Парк → Я в парке → Кормления**. Выберите дату, найдите вольер № 36 или сохраните напоминание в календарь телефона. В каталоге хранится локальный снимок 116 видов с фотографиями. Официальная касса открывается отдельно. Демонстрационный купон действует только в тестовом расчёте.

Исходная редактируемая 3D-сцена находится в `Godot/Scenes/Levels/FirstMeeting.tscn`. В Godot 4.7.2 с экспортными шаблонами выполните из каталога Godot `godot --headless --import`, затем `godot --headless --export-release Web`. Остальные сцены демонстрационной игры и путеводитель находятся в `public/demo`. Профиль и покупки хранятся на устройстве в пределах адреса приложения.

Сборка оболочки выполняется командой `npm run build`. Маршрут `/` открывает игру, `/guide` — прежнюю главную модуля карт, `/calendar` — календарь с переходом в программу кормлений. Браузерный тест запускается командой `node scripts/check-demo.cjs http://127.0.0.1:8138/` с доступным для Node модулем Playwright и установленным Chromium. При использовании другого исполняемого файла Chromium укажите `BROWSER_EXE`.

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
