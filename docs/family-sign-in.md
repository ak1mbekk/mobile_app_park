# Семейный вход через Google и Apple

Профиль сохраняет гостевую игру на устройстве. При первом подтверждённом входе через Google или Apple создаётся семейный аккаунт. Чтобы добавить способ входа к существующей семье, сначала войдите в неё, затем нажмите «Подключить Google» или «Подключить Apple». В одной семье можно подключить по одной учётной записи каждого провайдера. Перенос енота выполняется кнопками сохранения и восстановления.

## Локальная проверка

Установите зависимости командой `npm ci`. Для проверки без внешних учётных записей и секретов запустите `node scripts/check-family-oidc.cjs`. Скрипт поднимает свой имитатор провайдера, использует временную SQLite и проверяет оба формата callback, связывание аккаунтов и чтение копии из второй сессии. Существующий браузерный сценарий запускается командой `node scripts/check-family.cjs`.

Google можно проверить на `http://localhost:8168` с тестовым OAuth-клиентом типа Web application. Зарегистрируйте точный callback `http://localhost:8168/api/family/oauth/google/callback`, установите `ANIMAL_PARK_FAMILY_ORIGIN=http://localhost:8168` и откройте демо по этому адресу. Данные браузера привязаны к адресу, поэтому сохранения с `127.0.0.1` относятся к другому origin. [Документация Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

Apple требует зарегистрированный домен с HTTPS. `localhost` и IP-адрес нельзя использовать как return URL Apple. [Документация Apple по возврату после авторизации](https://developer.apple.com/documentation/signinwithapplerestapi/request-an-authorization-to-the-sign-in-with-apple-server)

## Настройка HTTPS-стенда

Зафиксируйте HTTPS-адрес приложения без завершающего слеша в переменной `ANIMAL_PARK_FAMILY_ORIGIN`. Зарегистрируйте у провайдеров callback на этом же адресе. Страница и семейный API должны обслуживаться с одного origin.

| Провайдер | Путь callback | Серверные переменные |
| --- | --- | --- |
| Google | `/api/family/oauth/google/callback` | `ANIMAL_PARK_GOOGLE_CLIENT_ID`, `ANIMAL_PARK_GOOGLE_CLIENT_SECRET` |
| Apple | `/api/family/oauth/apple/callback` | `ANIMAL_PARK_APPLE_CLIENT_ID`, `ANIMAL_PARK_APPLE_CLIENT_SECRET` |

Для Google используйте Web application OAuth-клиент. Для Apple создайте Services ID, свяжите его с основным App ID и зарегистрируйте домен и полный return URL. В переменную `ANIMAL_PARK_APPLE_CLIENT_SECRET` передайте подписанный серверный JWT с ограниченным сроком действия и заменяйте его до истечения. Ключ подписи и значения переменных храните в серверном хранилище секретов. [Настройка Sign in with Apple](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple) · [Создание client secret для Apple](https://developer.apple.com/documentation/signinwithapplerestapi/creating-a-client-secret)

Если TLS завершает обратный прокси на той же машине, включите `ANIMAL_PARK_FAMILY_TRUST_PROXY=1`. Прокси должен быть единственным входом к внутреннему процессу, передавать точный публичный `Host` и выставлять `X-Forwarded-Proto: https` самостоятельно. Для Vite задайте разрешённый hostname явно. SQLite хранится в закрытом каталоге `ANIMAL_PARK_FAMILY_DIR`, отдельно от публикуемых файлов.

Без настроенного провайдера его кнопка недоступна. Перед открытием внешнего доступа проверьте реальные callback на зарегистрированных тестовых аккаунтах, хранение и восстановление SQLite и соответствие экранов действующим правилам Google и Apple. Статическая копия сайта без семейного API обслуживает гостевую игру.
