import { Cell, Execution, MutableGame, MutablePlayer, MutableUnit, Player, PlayerID, Tile, Unit, UnitType } from "../game/Game";

export class MissileSiloExecution implements Execution {

    private active = true
    private mg: MutableGame
    private player: MutablePlayer
    private silo: MutableUnit

    constructor(
        private _owner: PlayerID,
        private cell: Cell
    ) { }


    init(mg: MutableGame, ticks: number): void {
        this.mg = mg
        this.player = mg.player(this._owner)
    }

    tick(ticks: number): void {
        if (this.silo == null) {
            const tile = this.mg.tile(this.cell)
            if (!this.player.canBuild(UnitType.MissileSilo, tile)) {
                console.warn(`player ${this.player} cannot build port at ${this.cell}`)
                this.active = false
                return
            }
            this.silo = this.player.buildUnit(UnitType.MissileSilo, 0, tile)
        }
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