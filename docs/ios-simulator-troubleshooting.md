# Запуск на iOS Simulator — обход ошибки «Request was denied by service delegate»

Ошибки `FBSOpenApplicationServiceErrorDomain Code: 1`, `RequestDenied`, «Could not attach to App» (LLDB), **«Launchd job spawn failed»** с **NSPOSIXErrorDomain Code: 35 (Resource temporarily unavailable)** при запуске в симуляторе обычно связаны с лимитом процессов или состоянием симулятора. Система не может создать процесс для приложения — то же «ресурс временно недоступен», что и при `fork failed` в терминале.

## Что сделать по шагам

### 0. Снизить нагрузку на систему (если есть Code 35 / spawn failed)

Перед повторным запуском в Xcode:

- Закройте лишние приложения и вкладки (браузеры, Cursor/VS Code, другие симуляторы).
- По возможности перезапустите Xcode или откройте новый терминал и снова откройте проект.

Затем переходите к шагам ниже.

---

В проекте добавлена общая схема **App** с запуском без отладчика (LLDB). Закройте Xcode, снова откройте: `npx cap open ios`, выберите схему **App** и нажмите Run — ошибка «Could not attach to App» должна пропасть. Если нет — см. пункты ниже.

### 1. Выбрать другой симулятор

В Xcode вверху слева выберите **Destination** (рядом со схемой **App**):

- Нажмите на текущее устройство (например, iPhone 17).
- Выберите **другой симулятор** — например **iPhone 15** или **iPhone 15 Pro** с **iOS 18.x**, если есть.
- **iOS 26 / iPhone 17** на симуляторе часто дают именно «Request was denied» и «Launchd job spawn failed (Code 35)» — по возможности используйте симулятор с iOS 18.

Затем снова **Product → Run** (⌘R).

### 2. Очистить сборку и перезапустить

1. **Product → Clean Build Folder** (⇧⌘K).
2. Закройте Xcode.
3. Откройте **Simulator** (Spotlight: `Simulator`).
4. В меню симулятора: **Device → Erase All Content and Settings**.
5. Закройте Simulator.
6. Снова откройте проект в Xcode: `npx cap open ios` из папки проекта.
7. Выберите нужный симулятор и нажмите **Run**.

### 3. Запуск без отладчика

Иногда запуск без подсоединения отладчика помогает:

1. **Product → Scheme → Edit Scheme…** (⌘<).
2. Слева выберите **Run**.
3. Вкладка **Info** → снимите галочку **Debug executable**.
4. **Close** и снова **Run**.

(Потом можно вернуть **Debug executable** для отладки.)

### 4. Перезагрузка Mac

Если ошибка не исчезает, перезагрузите Mac — так сбрасываются лимиты процессов и состояние **launchd** и симулятора. Особенно помогает при постоянном **Code 35** (Resource temporarily unavailable).

### 5. Запуск на реальном устройстве

Подключите iPhone по USB:

1. В Xcode выберите ваш iPhone в **Destination**.
2. При первом запуске: **Signing & Capabilities** → укажите **Team** (Apple ID).
3. На iPhone: **Настройки → Основные → VPN и управление устройством** — доверьте разработчику.
4. Запустите приложение из Xcode (**Run**).

---

## Ошибка «unable to spawn process clang-stat-cache (Resource temporarily unavailable)»

В проекте уже отключён кэш компиляции Clang (`CLANG_ENABLE_COMPILE_CACHE = NO` в `ios/debug.xcconfig` и в настройках проекта для Debug/Release). Это убирает вызов `clang-stat-cache` и обычно устраняет ошибку.

Если она всё ещё появляется:

1. **Product → Clean Build Folder** (⇧⌘K), затем снова **Run**.
2. Закройте Xcode и удалите кэш сборки:
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```
   Затем снова откройте проект и соберите.
3. Перезагрузите Mac — иногда сбрасываются лимиты процессов.

---

## Сбой «Приложение WidgetRenderer_Default неожиданно завершило работу»

Это **системный сбой процесса WebKit**, который рендерит содержимое приложения (WKWebView). Не путать с виджетами iOS (WidgetKit): в проекте виджетов нет, «WidgetRenderer_Default» — внутреннее имя процесса рендеринга WebKit. ErrorBoundary и try/catch в JS этот сбой не перехватывают.

### Что можно сделать

1. **Другой симулятор**  
   В Xcode смените Destination на другой iPhone (например, iPhone 15 / iOS 18). На симуляторах с новыми бета-версиями iOS такие сбои встречаются чаще.

2. **Запуск на реальном устройстве**  
   Подключите iPhone по USB и запустите приложение с Xcode на устройстве. Часто на устройстве WebView ведёт себя стабильнее, чем в симуляторе.

3. **Чистая пересборка**  
   - **Product → Clean Build Folder** (⇧⌘K).  
   - Закройте Xcode, удалите DerivedData:
     ```bash
     rm -rf ~/Library/Developer/Xcode/DerivedData
     ```
   - Снова откройте проект и соберите.

4. **Обновить зависимости**  
   Обновите Capacitor и iOS-проект:
   ```bash
   npm update @capacitor/core @capacitor/ios
   npx cap update ios
   npx cap sync ios
   ```
   Затем снова откройте Xcode и запустите приложение.

5. **Перезагрузка симулятора / Mac**  
   В симуляторе: **Device → Erase All Content and Settings**. Если сбои повторяются — перезагрузите Mac.

Если после этих шагов сбой повторяется, сохраните отчёт (в диалоге нажмите «Подробнее») и при необходимости отправьте его в Apple или приложите к обращению в поддержку Capacitor/Ionic — это типичная проблема WebKit на симуляторе.

---

После изменений в веб-части не забывайте синхронизировать проект:

```bash
npm run build && npx cap sync ios
```

Затем снова откройте Xcode и запускайте приложение.
