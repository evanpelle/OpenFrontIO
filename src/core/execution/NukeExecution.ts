import { nextTick } from "process";
import { Cell, Execution, MutableGame, MutablePlayer, PlayerID, Tile, MutableUnit, UnitType } from "../game/Game";
import { PathFinder } from "../pathfinding/PathFinding";
import { PathFindResultType } from "../pathfinding/AStar";
import { PseudoRandom } from "../PseudoRandom";
import { bfs, dist, distSortUnit, euclideanDist, manhattanDist } from "../Util";

export class NukeExecution implements Execution {

    private player: MutablePlayer

    private active = true

    private mg: MutableGame

    private nuke: MutableUnit
    private dst: Tile

    private pathFinder: PathFinder
    constructor(
        private type: UnitType.AtomBomb | UnitType.HydrogenBomb,
        private senderID: PlayerID,
        private cell: Cell,
    ) { }


    init(mg: MutableGame, ticks: number): void {
        this.mg = mg
        this.pathFinder = PathFinder.Mini(mg, 10_000, () => true)
        this.player = mg.player(this.senderID)
        this.dst = this.mg.tile(this.cell)
    }

    tick(ticks: number): void {
        if (this.nuke == null) {
            const spawn = this.player.canBuild(this.type, this.dst)
            if (spawn == false) {
                console.warn(`cannot build Nuke`)
                this.active = false
                return
            }
            this.nuke = this.player.buildUnit(this.type, 0, spawn)
        }

        for (let i = 0; i < 4; i++) {
            const result = this.pathFinder.nextTile(this.nuke.tile(), this.dst)
            switch (result.type) {
                case PathFindResultType.Completed:
                    this.nuke.move(result.tile)
                    this.detonate()
                    return
                case PathFindResultType.NextTile:
                    this.nuke.move(result.tile)
                    break
                case PathFindResultType.Pending:
                    break
                case PathFindResultType.PathNotFound:
                    console.warn(`nuke cannot find path from ${this.nuke.tile()} to ${this.dst}`)
                    this.active = false
                    return
            }
        }
    }

    private detonate() {
        const magnitude = this.type == UnitType.AtomBomb ? { inner: 20, outer: 40 } : { inner: 160, outer: 180 }
        const rand = new PseudoRandom(this.mg.ticks())
        const tile = this.mg.tile(this.cell)
        const toDestroy = bfs(tile, (n: Tile) => {
            const d = euclideanDist(tile.cell(), n.cell())
            return (d <= magnitude.inner || rand.chance(2)) && d <= magnitude.outer
        })

        const ratio = Object.fromEntries(
            this.mg.players().map(p => [p.id(), (p.troops() + p.workers()) / p.numTilesOwned()])
        )
        const attacked = new Map<MutablePlayer, number>()
        for (const tile of toDestroy) {
            const owner = tile.owner()
            if (owner.isPlayer()) {
                const mp = this.mg.player(owner.id())
                mp.relinquish(tile)
                mp.removeTroops(2 * ratio[mp.id()])
                if (!attacked.has(mp)) {
                    attacked.set(mp, 0)
                }
                const prev = attacked.get(mp)
                attacked.set(mp, prev + 1)
            }
            if (tile.isLand()) {
                this.mg.addFallout(tile)
            }
        }
        for (const [other, tilesDestroyed] of attacked) {
            if (tilesDestroyed > 100) {
                const alliance = this.player.allianceWith(other)
                if (alliance != null) {
                    this.player.breakAlliance(alliance)
                }
            }
        }

        for (const unit of this.mg.units()) {
            if (unit.type() != UnitType.AtomBomb && unit.type() != UnitType.HydrogenBomb) {
                if (euclideanDist(this.cell, unit.tile().cell()) < magnitude.outer) {
                    unit.delete()
                }
            }
        }
        // this.mg.units()
        //     .filter(b => euclideanDist(this.cell, b.tile().cell()) < this.magnitude + 50)
        //     .forEach(b => b.delete())
        this.active = false
        this.nuke.delete()
    }

    owner(): MutablePlayer {
        return null
    }

    isActive(): boolean {
        return this.active
    }

    activeDuringSpawnPhase(): boolean {
        return false
    }

}