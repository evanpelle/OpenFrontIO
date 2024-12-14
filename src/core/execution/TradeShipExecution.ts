import { MessageType } from "../../client/graphics/layers/EventsDisplay";
import { renderNumber } from "../../client/graphics/Utils";
import { AllPlayers, Cell, Execution, MutableGame, MutablePlayer, MutableUnit, Player, PlayerID, Tile, Unit, UnitType } from "../game/Game";
import { PathFinder } from "../pathfinding/PathFinding";
import { PathFindResultType } from "../pathfinding/AStar";
import { SerialAStar } from "../pathfinding/SerialAStar";
import { PseudoRandom } from "../PseudoRandom";
import { bfs, dist, distSortUnit, manhattanDist } from "../Util";

export class TradeShipExecution implements Execution {

    private active = true
    private mg: MutableGame
    private origOwner: MutablePlayer
    private tradeShip: MutableUnit
    private index = 0
    private wasCaptured = false

    constructor(
        private _owner: PlayerID,
        private srcPort: MutableUnit,
        private dstPort: MutableUnit,
        private pathFinder: PathFinder,
        // don't modify
        private path: Tile[]
    ) { }


    init(mg: MutableGame, ticks: number): void {
        this.mg = mg
        this.origOwner = mg.player(this._owner)
    }

    tick(ticks: number): void {
        if (this.tradeShip == null) {
            const spawn = this.origOwner.canBuild(UnitType.TradeShip, this.srcPort.tile())
            if (spawn == false) {
                console.warn(`cannot build trade ship`)
                this.active = false
                return
            }
            this.tradeShip = this.origOwner.buildUnit(UnitType.TradeShip, 0, spawn)
        }

        if (!this.tradeShip.isActive()) {
            this.active = false
            return
        }

        if (this.origOwner != this.tradeShip.owner()) {
            // Store as vairable in case ship is recaptured by previous owner
            this.wasCaptured = true
        }

        if (!this.wasCaptured && (!this.dstPort.isActive() || !this.tradeShip.owner().isAlliedWith(this.dstPort.owner()))) {
            this.tradeShip.delete(false)
            this.active = false
            return
        }

        if (this.wasCaptured) {
            const ports = this.tradeShip.owner().units(UnitType.Port).sort(distSortUnit(this.tradeShip))
            if (ports.length == 0) {
                this.tradeShip.delete(false)
                this.active = false
                return
            }
            const dstPort = ports[0]
            const result = this.pathFinder.nextTile(this.tradeShip.tile(), dstPort.tile())
            switch (result.type) {
                case PathFindResultType.Completed:
                    const gold = this.mg.config().tradeShipGold(this.srcPort, dstPort)
                    this.tradeShip.owner().addGold(gold)
                    this.mg.displayMessage(
                        `Received ${renderNumber(gold)} gold from ship captured from ${this.origOwner.displayName()}`,
                        MessageType.SUCCESS,
                        this.tradeShip.owner().id()
                    )
                    this.tradeShip.delete(false)
                    break
                case PathFindResultType.Pending:
                    // Fire unit event to rerender.
                    this.tradeShip.move(this.tradeShip.tile())
                    break
                case PathFindResultType.NextTile:
                    this.tradeShip.move(result.tile)
                    break
                case PathFindResultType.PathNotFound:
                    console.warn('captured trade ship cannot find route')
                    this.active = false
                    break
            }
            return
        }


        if (this.index >= this.path.length) {
            this.active = false
            const gold = this.mg.config().tradeShipGold(this.srcPort, this.dstPort)
            this.srcPort.owner().addGold(gold)
            this.dstPort.owner().addGold(gold)
            this.mg.displayMessage(
                `Received ${renderNumber(gold)} gold from trade with ${this.srcPort.owner().displayName()}`,
                MessageType.SUCCESS,
                this.dstPort.owner().id()
            )
            this.mg.displayMessage(
                `Received ${renderNumber(gold)} gold from trade with ${this.dstPort.owner().displayName()}`,
                MessageType.SUCCESS,
                this.srcPort.owner().id()
            )
            this.tradeShip.delete(false)
            return
        }
        this.tradeShip.move(this.path[this.index])
        this.index++
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