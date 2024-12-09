import { Difficulty, GameType, Gold, Player, PlayerID, PlayerInfo, TerraNullius, Tick, Tile, Unit, UnitInfo, UnitType } from "../game/Game";
import { Colord, colord } from "colord";
import { devConfig } from "./DevConfig";
import { defaultConfig } from "./DefaultConfig";
import { GameID } from "../Schemas";

export enum GameEnv {
	Dev,
	Prod
}

export function getConfig(): Config {
	// TODO: 'prod' not found in prod env
	if (process.env.GAME_ENV == 'dev') {
		console.log('Using dev config')
		return devConfig
	} else {
		console.log('Using prod config')
		return defaultConfig
	}
}

export function getGameEnv(): GameEnv {
	return GameEnv.Prod
}

export interface Config {
	theme(): Theme;
	percentageTilesOwnedToWin(): number
	turnIntervalMs(): number
	gameCreationRate(): number
	lobbyLifetime(): number
	numBots(): number
	spawnNPCs(): boolean
	numSpawnPhaseTurns(gameType: GameType): number

	startManpower(playerInfo: PlayerInfo): number
	populationIncreaseRate(player: Player): number
	goldAdditionRate(player: Player): number
	troopAdjustmentRate(player: Player): number
	attackTilesPerTick(attacker: Player, defender: Player | TerraNullius, numAdjacentTilesWithEnemy: number): number
	attackLogic(attackTroops: number, attacker: Player, defender: Player | TerraNullius, tileToConquer: Tile): {
		attackerTroopLoss: number,
		defenderTroopLoss: number,
		tilesPerTickUsed: number
	}
	attackAmount(attacker: Player, defender: Player | TerraNullius): number
	maxPopulation(player: Player): number
	cityPopulationIncrease(): number
	boatAttackAmount(attacker: Player, defender: Player | TerraNullius): number
	boatMaxDistance(): number
	boatMaxNumber(): number
	allianceDuration(): Tick
	allianceRequestCooldown(): Tick
	targetDuration(): Tick
	targetCooldown(): Tick
	emojiMessageCooldown(): Tick
	emojiMessageDuration(): Tick
	donateCooldown(): Tick
	defaultDonationAmount(sender: Player): number
	unitInfo(type: UnitType): UnitInfo
	tradeShipGold(src: Unit, dst: Unit): Gold
	tradeShipSpawnRate(): number
	defensePostRange(): number
	defensePostDefenseBonus(): number
	falloutDefenseModifier(): number
	difficultyModifier(difficulty: Difficulty): number
}

export interface Theme {
	playerInfoColor(id: PlayerID): Colord;
	territoryColor(playerInfo: PlayerInfo): Colord;
	borderColor(playerInfo: PlayerInfo): Colord;
	defendedBorderColor(playerInfo: PlayerInfo): Colord;
	terrainColor(tile: Tile): Colord;
	backgroundColor(): Colord;
	falloutColor(): Colord
	font(): string;
}

