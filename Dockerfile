FROM php:8.2-fpm

RUN apt-get update && apt-get install -y --no-install-recommends \
    $PHPIZE_DEPS git unzip libonig-dev libzip-dev libicu-dev libxml2-dev libsqlite3-dev libssl-dev \
    && pecl install mongodb \
    && docker-php-ext-enable mongodb \
    && docker-php-ext-install ftp pdo_sqlite mbstring zip intl bcmath opcache dom xml xmlreader xmlwriter \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY . .
ENV COMPOSER_ALLOW_SUPERUSER=1

ARG INSTALL_DEV_DEPS=0
RUN if [ "$INSTALL_DEV_DEPS" = "1" ]; then \
        composer install --no-interaction --prefer-dist --no-progress --optimize-autoloader; \
    else \
        composer install --no-interaction --prefer-dist --no-progress --no-dev --optimize-autoloader; \
    fi \
    && mkdir -p storage/app/imports storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 9000
CMD ["php-fpm"]
