# Auth система — Ръководство

BEG Estates / EstateFlow използва класическа email + password автентикация
с двуфакторна (TOTP) защита, задължителна за служителите.

---

## За клиенти

### Първи логин

1. Получавате имейл от админа с **временна парола**.
2. Влизате на: https://estate-flow-9.preview.emergentagent.com/login/client
3. Системата ще поиска веднага да зададете нова, лична парола (минимум 8 символа, поне 1 буква и 1 цифра).
4. Готово — оттук нататък използвате вашата лична парола.

### Забравена парола

1. На страницата за вход натиснете „**Забравена парола?**".
2. Въведете вашия имейл — системата ще приеме заявката.
3. **Свържете се с нашия екип** (телефон / WhatsApp / Viber) — операторът ще ви изпрати личен линк за смяна.
4. Отваряте линка → задавате нова парола.
5. Готово.

> Линкът е **валиден 1 час** и **еднократен**. Ако не го използвате навреме, поискайте нова заявка.

### Промяна на парола (доброволна)

В клиентския портал → меню **„Смяна на парола"**.

### Какво НЕ можете да правите от портала

Клиентският портал е **read-only**:

- Преглед на собствените резервации, плащания и документи — ✅
- Кореспонденция с екипа — ✅
- Самостоятелно създаване / редакция на резервации — ❌ (свържете се с нас)
- Редакция на чужди данни — ❌

---

## За служители (admin / sales / project manager / accounting / broker)

### Първи логин (нов служител)

1. Получавате имейл и временна парола от super admin.
2. Влизате на: https://estate-flow-9.preview.emergentagent.com/login/staff
3. **Стъпка 1**: имейл + парола → продължете.
4. **Стъпка 2**: системата ще покаже **QR код** — сканирайте го с **Google Authenticator** или **Authy**.
5. Запазете тайния резервен ключ на сигурно място (напр. на хартия в сейф).
6. Въведете 6-цифрения код, който приложението показва.
7. Готово!

> 2FA е **задължително** за всички служители и **не може да се изключи**. Това е политика на сигурност.

### Всеки следващ логин

1. Имейл + парола.
2. 6-цифров TOTP код от authenticator-а.
3. Готово.

### Загубен телефон / authenticator?

Свържете се със **super admin**. Той ще нулира вашия TOTP setup и ще можете
отново да го настроите при следващ вход.

### Забравена парола

1. На страницата за staff вход → „Забравена парола?".
2. Въвеждате служебния имейл.
3. Друг администратор трябва да копира reset линка от админ панела
   (**Админ → Пароли → Активни заявки**) и да ви го предаде.
4. Отваряте линка → задавате нова парола.

---

## За admin / super admin — ръчно управление на пароли

### Активни заявки за смяна на парола

Меню: **Админ → Пароли**

- Виждате всички pending заявки (клиенти + служители).
- Бутон „Копирай" → линкът се добавя в clipboard.
- Изпращате го на потребителя по WhatsApp / Viber / SMS / телефон.
- Бутон „Отмени" → анулира заявката, ако е била грешна.

### Ръчно задаване на парола (телефонна заявка)

В същата страница: панел „Ръчно задаване на парола (клиент)".

- Избирате клиент.
- Въвеждате новата парола.
- (Препоръчително) Оставете отметката „Изискай клиентът да смени паролата при следващ вход".
- Готово — клиентът може да влезе с тази парола; при login системата веднага ще го задължи да я смени.

### Миграция на legacy клиенти (без парола)

```bash
cd /app/backend
python -m scripts.migrate_customers_to_password --out /tmp/temp_pw.csv
```

Получавате CSV с email + временна парола за всеки клиент без `password_hash`.
Раздавате паролите ръчно. След това **изтрийте CSV-то**.

---

## Технически детайли

| Параметър                       | Стойност                                  |
|---------------------------------|-------------------------------------------|
| Hashing                         | bcrypt, 12 rounds                         |
| Access token                    | JWT, HttpOnly cookie, 60 мин              |
| Refresh token                   | JWT, HttpOnly cookie, 7 дни               |
| 2FA temp_token (между стъпките) | JWT, 5 мин, в response body (не cookie)   |
| Password reset token            | `secrets.token_urlsafe(32)`, 1 час, единичeн |
| Brute-force lockout             | 5 неуспеха / 15 мин → 30 мин lockout      |
| Password policy                 | ≥8 символа, ≥1 буква, ≥1 цифра            |
| TOTP алгоритъм                  | RFC 6238, 6 цифри, ±1 прозорец            |
| Audit log                       | login_success/failure, password_changed, totp_setup_started/completed/verify_failure, password_reset_* |

## Endpoints

| Метод | Път                                                      | Достъп       |
|-------|----------------------------------------------------------|--------------|
| POST  | `/api/auth/client/login`                                 | публичен     |
| POST  | `/api/auth/client/forgot-password`                       | публичен     |
| POST  | `/api/auth/client/reset-password`                        | публичен (по token) |
| POST  | `/api/auth/client/change-password`                       | client       |
| POST  | `/api/auth/staff/login`                                  | публичен     |
| POST  | `/api/auth/staff/setup-totp`                             | temp_token   |
| POST  | `/api/auth/staff/verify-totp`                            | temp_token   |
| POST  | `/api/auth/staff/forgot-password`                        | публичен     |
| POST  | `/api/auth/staff/reset-password`                         | публичен (по token) |
| POST  | `/api/auth/staff/change-password`                        | staff        |
| POST  | `/api/auth/2fa/setup`                                    | staff        |
| POST  | `/api/auth/2fa/verify`                                   | staff        |
| GET   | `/api/auth/admin/password-resets`                        | staff        |
| POST  | `/api/auth/admin/password-resets/{id}/cancel`            | staff        |
| POST  | `/api/auth/admin/password-resets/{id}/mark-delivered`    | staff        |
| POST  | `/api/auth/admin/clients/{id}/set-password`              | staff        |
| GET   | `/api/auth/me`                                           | authenticated|
| POST  | `/api/auth/refresh`                                      | refresh cookie |
| POST  | `/api/auth/logout`                                       | publicly safe|
