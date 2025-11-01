# 🚀 Швидкий деплой на Vercel

## Крок 1: Підготовка

```bash
# Переконайтесь що всі файли збережені
git add .
git commit -m "Ready for deployment with fallback API"
git push
```

## Крок 2: Деплой

```bash
# Встановіть Vercel CLI (якщо ще не встановлено)
npm i -g vercel

# Залогіньтесь
vercel login

# Деплой на production
vercel --prod
```

## Крок 3: Перевірка

1. **Відкрийте deployed URL** (Vercel покаже його після деплою)

2. **Перевірте API в Vercel Dashboard:**
   - Відкрийте Vercel Dashboard
   - Project → Deployments → Latest
   - Function Logs
   - Шукайте логи з `[API]`
   - Має бути:
     ```
     [API] Fetching schedule from poe.pl.ua
     [API] Environment: Vercel
     [API] Trying direct fetch...
     ```
   - Перевірте який метод спрацював (direct/proxy1/proxy2)

3. **Якщо бачите fallback дані:**
   - Перегляньте логи - там буде точна причина
   - Fallback механізм має спрацювати через один з proxy
   - Якщо всі 3 методи не працюють - перевірте:
     - Чи доступний poe.pl.ua (відкрийте в браузері)
     - Чи працюють proxy сервіси
     - Логи помилок у Vercel

4. **Протестуйте PWA:**
   - Встановіть на телефон
   - Увімкніть сповіщення
   - Надішліть тестове сповіщення
   - Перевірте чи працюють кнопки

## Крок 4: Оновлення домену (опціонально)

```bash
# В Vercel Dashboard:
# Project → Settings → Domains
# Додайте свій домен
```

## Що було виправлено для Vercel:

✅ **API Fallback механізм** - 3 способи завантаження даних
✅ **Збільшено timeout** до 30 секунд
✅ **Детальне логування** всіх спроб та помилок
✅ **CORS proxy** через allorigins.win та corsproxy.io
✅ **Сповіщення зі звуком** через Web Audio API
✅ **Працюючі кнопки** в PWA з touch-manipulation

## Якщо щось не працює:

1. **Перевірте логи Vercel** - там буде точна причина
2. **Прочитайте DEPLOYMENT.md** - детальна інструкція
3. **Перевірте README.md** - основна документація

## Корисні команди:

```bash
# Перевірка build локально
npm run build

# Запуск production версії локально
npm start

# Перевірка API
curl https://your-domain.vercel.app/api/schedule

# Перегляд логів Vercel CLI
vercel logs
```

Все готово! 🎉
