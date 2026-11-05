<?php

namespace App\Models\Concerns;

/**
 * Preserve original MongoDB field names produced by Prisma @map.
 * Write/read/JSON expose the historical camelCase API contract while the
 * stored BSON documents remain untouched. Query columns are mapped at
 * call sites: Eloquent's query builder does not invoke setAttribute().
 */
trait MapsPrismaFields
{
    private function prismaPhysicalKey(string $key): string
    {
        return static::PRISMA_FIELD_MAP[$key] ?? $key;
    }

    public function getAttribute($key)
    {
        return parent::getAttribute(is_string($key) ? $this->prismaPhysicalKey($key) : $key);
    }

    public function setAttribute($key, $value)
    {
        return parent::setAttribute(is_string($key) ? $this->prismaPhysicalKey($key) : $key, $value);
    }

    public function getCasts(): array
    {
        $original = parent::getCasts();
        foreach (static::PRISMA_FIELD_MAP as $apiKey => $mongoKey) {
            if (array_key_exists($apiKey, $original)) {
                $original[$mongoKey] = $original[$apiKey];
                unset($original[$apiKey]);
            }
        }
        return $original;
    }

    public function getCreatedAtColumn()
    {
        return $this->prismaPhysicalKey(parent::getCreatedAtColumn());
    }

    public function getUpdatedAtColumn()
    {
        $column = parent::getUpdatedAtColumn();
        return $column ? $this->prismaPhysicalKey($column) : null;
    }

    public function attributesToArray(): array
    {
        $data = parent::attributesToArray();
        foreach (static::PRISMA_FIELD_MAP as $apiKey => $mongoKey) {
            if (array_key_exists($mongoKey, $data)) {
                $data[$apiKey] = $data[$mongoKey];
                unset($data[$mongoKey]);
            }
        }
        return $data;
    }
}
