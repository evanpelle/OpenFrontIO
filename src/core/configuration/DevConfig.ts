import { GameType, Player, PlayerInfo, UnitInfo, UnitType } from "../game/Game";
import { DefaultConfig } from "./DefaultConfig";

export const devConfig = new class extends DefaultConfig {
    unitInfo(type: UnitType): UnitInfo {
        const info = super.unitInfo(type)
        const oldCost = info.cost
        info.cost = (p: Player) => oldCost(p) / 1000000
        return info
    }
    maxUnitCost(): number {
        return 10000
    }

    percentageTilesOwnedToWin(): number {
        return 95
    }
    numSpawnPhaseTurns(gameType: GameType): number {
        return 40
        // return 100
    }
    gameCreationRate(): number {
        return 10 * 1000
    }
    lobbyLifetime(): number {
        return 10 * 1000
    }
    turnIntervalMs(): number {
        return 100
    }
    tradeShipSpawnRate(): number {
        return 10
    }
    boatMaxDistance(): number {
        return 5000
    }

    numBots(): number {
        return 0
    }
    spawnNPCs(): boolean {
        return false
    }

}