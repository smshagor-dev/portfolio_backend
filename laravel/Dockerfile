FROM php:8.2-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libonig-dev libzip-dev libicu-dev libpng-dev \
    && docker-php-ext-install pdo_mysql mbstring zip intl bcmath opcache \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html

COPY composer.json ./
RUN composer install --no-interaction --no-scripts --prefer-dist --no-progress --no-dev || true

COPY . .
RUN composer install --no-interaction --prefer-dist --no-progress --no-dev \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
CMD ["php-fpm"]
