import { Config } from "../configuration/Config"
import { Execution, MutableGame, MutablePlayer, Player, PlayerID, TerraNullius, Tile } from "../game/Game"
import { bfs, calculateBoundingBox, getMode, inscribed, simpleHash } from "../Util"
import { GameImpl } from "../game/GameImpl"

export class PlayerExecution implements Execution {

    private readonly ticksPerClusterCalc = 10

    private player: MutablePlayer
    private config: Config
    private lastCalc = 0
    private mg: MutableGame
    private active = true

    constructor(private playerID: PlayerID) {
    }

    activeDuringSpawnPhase(): boolean {
        return false
    }

    init(mg: MutableGame, ticks: number) {
        this.mg = mg
        this.config = mg.config()
        this.player = mg.player(this.playerID)
        this.lastCalc = ticks + (simpleHash(this.player.name()) % this.ticksPerClusterCalc)
    }

    tick(ticks: number) {
        this.player.units().forEach(u => {
            const tileOwner = u.tile().owner()
            if (u.info().territoryBound) {
                if (tileOwner.isPlayer()) {
                    if (tileOwner != this.player) {
                        this.mg.player(tileOwner.id()).captureUnit(u)
                    }
                } else {
                    u.delete()
                }
            }
        })

        if (!this.player.isAlive()) {
            this.player.units().forEach(u => u.delete())
            this.active = false
            return
        }


        const popInc = this.config.populationIncreaseRate(this.player)
        this.player.addWorkers(popInc * (1 - this.player.targetTroopRatio()))// (1 - this.player.targetTroopRatio()))
        this.player.addTroops(popInc * this.player.targetTroopRatio())
        this.player.addGold(this.config.goldAdditionRate(this.player))
        const adjustRate = this.config.troopAdjustmentRate(this.player)
        this.player.addTroops(adjustRate)
        this.player.removeWorkers(adjustRate)

        const alliances = Array.from(this.player.alliances())
        for (const alliance of alliances) {
            if (this.mg.ticks() - alliance.createdAt() > this.mg.config().allianceDuration()) {
                alliance.expire()
            }
        }


        if (ticks - this.lastCalc > this.ticksPerClusterCalc) {
            this.lastCalc = ticks
            if (ticks - this.player.lastTileChange() < this.ticksPerClusterCalc) {
                const start = performance.now()
                this.removeClusters()
                const end = performance.now()
                if (end - start > 1000) {
                    console.log(`player ${this.player.name()}, took ${end - start}ms`)
                }
            }
        }
    }

    private removeClusters() {
        const clusters = this.calculateClusters()
        // if (clusters.length <= 1) {
        //     return
        // }
        clusters.sort((a, b) => b.size - a.size);

        const main = clusters.shift()
        const surroundedBy = this.surroundedBySamePlayer(main)
        if (surroundedBy && !this.player.isAlliedWith(surroundedBy)) {
            this.removeCluster(main)
        }

        for (const cluster of clusters) {
            if (this.isSurrounded(cluster)) {
                this.removeCluster(cluster)
            }
        }
    }

    private surroundedBySamePlayer(cluster: Set<Tile>): false | Player {
        const enemies = new Set<Player>()
        for (const tile of cluster) {
            if (tile.isOceanShore() || tile.neighbors().find(n => !n.hasOwner())) {
                return false
            }
            tile.neighbors()
                .filter(n => n.hasOwner() && n.owner() != this.player)
                .forEach(p => enemies.add(p.owner() as Player))
            if (enemies.size != 1) {
                return false
            }
        }
        if (enemies.size != 1) {
            return false
        }
        return Array.from(enemies)[0]
    }

    private isSurrounded(cluster: Set<Tile>): boolean {
        let enemyTiles = new Set<Tile>()
        for (const tile of cluster) {
            if (tile.isOceanShore()) {
                return false
            }
            tile.neighbors()
                .filter(n => n.hasOwner() && n.owner() != this.player)
                .forEach(n => enemyTiles.add(n))
        }
        if (enemyTiles.size == 0) {
            return false
        }
        const enemyBox = calculateBoundingBox(enemyTiles)
        const clusterBox = calculateBoundingBox(cluster)
        return inscribed(enemyBox, clusterBox)
    }

    private removeCluster(cluster: Set<Tile>) {
        const arr = Array.from(cluster)
        const mode = getMode(arr.flatMap(t => t.neighbors()).filter(t => t.hasOwner() && t.owner() != this.player).map(t => t.owner().id()))
        if (!this.mg.hasPlayer(mode)) {
            console.warn('mode is not found')
            return
        }
        const firstTile = arr[0]
        const filter = (n: Tile): boolean => n.owner() == firstTile.owner()
        const tiles = bfs(firstTile, filter)

        const modePlayer = this.mg.player(mode)
        if (modePlayer == null) {
            console.warn('mode player is null')
        }
        for (const tile of tiles) {
            modePlayer.conquer(tile)
        }
    }

    private calculateClusters(): Set<Tile>[] {
        const seen = new Set<Tile>()
        const border = this.player.borderTiles()
        const clusters: Set<Tile>[] = []
        for (const tile of border) {
            if (seen.has(tile)) {
                continue
            }

            const cluster = new Set<Tile>()
            const queue: Tile[] = [tile]
            seen.add(tile)
            let loops = 0;
            while (queue.length > 0) {
                loops += 1
                const curr = queue.shift()
                cluster.add(curr)

                const neighbors = (this.mg as GameImpl).neighborsWithDiag(curr)
                for (const neighbor of neighbors) {
                    if (neighbor.isBorder() && border.has(neighbor)) {
                        if (!seen.has(neighbor)) {
                            queue.push(neighbor)
                            seen.add(neighbor)
                        }
                    }
                }
            }
            clusters.push(cluster)
        }
        return clusters
    }

    owner(): MutablePlayer {
        return this.player
    }

    isActive(): boolean {
        return this.active
    }
}