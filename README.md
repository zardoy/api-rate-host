# Backend for Rate Host

## Как завести

1. Создать два .env файла:
   - api/vk-bot/.env с содержимым: (необходимо для работы бота)

        `VK_SUPER_SECRET_TOKEN=`**<токен сообщества>**
   - prisma/.env с содержимым:

        `DATABASE_URL=`<адресс к бд - локалька: `"postgresql://postgres:postgres@localhost:5432/ratehost"`>
        `VK_SECRET_KEY=`<защищенный ключ приложения, нужен для проверки подписи>
2. `yarn start` - у вас должен быть установлен [yarn](https://yarnpkg.com/getting-started/install#global-install) и понятное дело nodeJS.

3. Необходимо завести локальную БД postgres для тестирования. Это можно сделать запуском NPM скрипта `yarn local-postgres`. Однако, необходимо что бы **Docker** был установлен и **запущен**.

## Scripts

- `yarn start` start dev server and graphql playground.
- `yarn test` run tests
