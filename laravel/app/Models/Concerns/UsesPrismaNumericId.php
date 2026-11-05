<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\DB;
use MongoDB\Operation\FindOneAndUpdate;

trait UsesPrismaNumericId
{
    protected static function bootUsesPrismaNumericId(): void
    {
        static::creating(function ($model): void {
            if ($model->getKey() !== null) {
                return;
            }
            $db = DB::connection('mongodb')->getMongoClient()
                ->selectDatabase((string) config('database.connections.mongodb.database'));
            $collection = $db->selectCollection($model->getTable());
            $last = $collection->findOne(
                ['_id' => ['$type' => 'number']],
                ['sort' => ['_id' => -1], 'projection' => ['_id' => 1]]
            );
            $maxId = (int) ($last['_id'] ?? 0);
            $counters = $db->selectCollection('portfolio_numeric_counters');
            $counters->updateOne(
                ['_id' => $model->getTable()],
                ['$max' => ['value' => $maxId]],
                ['upsert' => true]
            );
            $next = $counters->findOneAndUpdate(
                ['_id' => $model->getTable()],
                ['$inc' => ['value' => 1]],
                ['returnDocument' => FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
            );
            $model->setAttribute('id', (int) $next['value']);
        });
    }
}
