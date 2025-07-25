## Этап сборки React-приложения
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

## Этап запуска через Nginx
FROM nginx:alpine

## Копируем собранное приложение в Nginx
COPY --from=build /app/build /usr/share/nginx/html

## Копируем кастомные настройки Nginx (если нужны)
COPY nginx.conf /etc/nginx/conf.d/default.conf

## Открываем порт 80
EXPOSE 80

## Запускаем Nginx
CMD ["nginx", "-g", "daemon off;"]
