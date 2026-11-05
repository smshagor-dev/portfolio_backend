FROM php:8.2-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git unzip libonig-dev libzip-dev libicu-dev libxml2-dev \
    && docker-php-ext-install pdo_mysql mbstring zip intl bcmath opcache dom \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY . .
ENV COMPOSER_ALLOW_SUPERUSER=1
RUN composer install --no-interaction --prefer-dist --no-progress --no-dev --optimize-autoloader \
    && mkdir -p storage/app/imports storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
CMD ["php-fpm"]
