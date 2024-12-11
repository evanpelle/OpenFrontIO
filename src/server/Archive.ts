import { GameConfig, GameID, GameRecord, GameRecordSchema, Turn } from "../core/Schemas";
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';

const storage = new Storage();
const bigquery = new BigQuery();


export async function archive(gameRecord: GameRecord) {
    try {
        // Save metadata to BigQuery
        const row = {
            id: gameRecord.id,
            start: new Date(gameRecord.startTimestampMS),
            end: new Date(gameRecord.endTimestampMS),
            duration_seconds: gameRecord.durationSeconds,
            number_turns: gameRecord.num_turns,
            usernames: gameRecord.usernames,
            game_mode: gameRecord.gameConfig.gameType,
            winner: null,
            difficulty: gameRecord.gameConfig.difficulty,
            map: gameRecord.gameConfig.gameMap,
        };

        await bigquery
            .dataset('game_archive')
            .table('game_results')
            .insert([row]);

        console.log(`wrote game metadata to BigQuery: ${gameRecord.id}`);
        if (gameRecord.turns.length > 0) {
            console.log(`writing game ${gameRecord.id} to gcs`)
            const bucket = storage.bucket("openfront-games");
            const file = bucket.file(gameRecord.id);
            await file.save(JSON.stringify(GameRecordSchema.parse(gameRecord)), {
                contentType: 'application/json'
            });
        }
    } catch (error) {
        console.log(`error archiving game record: ${error}`)
    }
}