import { GameConfig, GameID, GameRecord, GameRecordSchema, Turn } from "../core/Schemas";
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';

const storage = new Storage();
const bigquery = new BigQuery();


export async function archive(gameRecord: GameRecord) {
    try {
        console.log(`writing game ${gameRecord.id} to gcs`)
        const bucket = storage.bucket("openfront-games");
        const file = bucket.file(gameRecord.id);
        await file.save(JSON.stringify(GameRecordSchema.parse(gameRecord)), {
            contentType: 'application/json'
        });
    } catch (error) {
        console.log(`error writing to gcs: ${error}`)
    }
}