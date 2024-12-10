import { MessageType } from "../../client/graphics/layers/EventsDisplay";
import { simpleHash } from "../Util";
import { MutableUnit, Tile, TerraNullius, UnitType, Player, UnitInfo } from "./Game";
import { GameImpl } from "./GameImpl";
import { PlayerImpl } from "./PlayerImpl";
import { TerraNulliusImpl } from "./TerraNulliusImpl";


export class UnitImpl implements MutableUnit {
    private _active = true;

    constructor(
        private _type: UnitType,
        private g: GameImpl,
        private _tile: Tile,
        private _troops: number,
        public _owner: PlayerImpl,
    ) { }

    type(): UnitType {
        return this._type
    }

    move(tile: Tile): void {
        if (tile == null) {
            throw new Error("tile cannot be null")
        }
        const oldTile = this._tile;
        this._tile = tile;
        this.g.fireUnitUpdateEvent(this, oldTile);
    }
    setTroops(troops: number): void {
        this._troops = troops;
    }
    troops(): number {
        return this._troops;
    }
    tile(): Tile {
        return this._tile;
    }
    owner(): PlayerImpl {
        return this._owner;
    }

    info(): UnitInfo {
        return this.g.unitInfo(this._type)
    }

    setOwner(newOwner: Player): void {
        const oldOwner = this._owner
        this._owner = newOwner as PlayerImpl
        this.g.fireUnitUpdateEvent(this, this.tile())
        this.g.displayMessage(
            `Your ${this.type()} was captured by ${newOwner.displayName()}`,
            MessageType.ERROR,
            oldOwner.id()
        )
    }

    delete(): void {
        if (!this.isActive()) {
            throw new Error(`cannot delete ${this} not active`)
        }
        this._owner._units = this._owner._units.filter(b => b != this);
        this._active = false;
        this.g.fireUnitUpdateEvent(this, this._tile);
        if (this.type() != UnitType.AtomBomb && this.type() != UnitType.HydrogenBomb) {
            this.g.displayMessage(`Your ${this.type()} was destroyed`, MessageType.ERROR, this.owner().id())
        }
    }
    isActive(): boolean {
        return this._active;
    }

    hash(): number {
        return this.tile().cell().x + this.tile().cell().y + simpleHash(this.type())
    }
}
