import {MutablePlayer, Tile, PlayerInfo, PlayerID, PlayerType, Player, TerraNullius, Cell, Execution, AllianceRequest, MutableAllianceRequest, MutableAlliance, Alliance, Tick, TargetPlayerEvent, EmojiMessage, EmojiMessageEvent, AllPlayers, Currency} from "./Game";
import {ClientID} from "../Schemas";
import {simpleHash} from "../Util";
import {CellString, GameImpl} from "./GameImpl";
import {BoatImpl} from "./BoatImpl";
import {TileImpl} from "./TileImpl";
import {TerraNulliusImpl} from "./TerraNulliusImpl";
import {MessageType} from "../../client/graphics/layers/EventsDisplay";
import {renderTroops} from "../../client/graphics/Utils";

interface Target {
    tick: Tick
    target: Player
}

class Donation {
    constructor(public readonly recipient: Player, public readonly tick: Tick) { }
}

export class PlayerImpl implements MutablePlayer {

    private _currency: number

    isTraitor_ = false

    public _borderTiles: Set<Tile> = new Set();

    public _boats: BoatImpl[] = [];
    public _tiles: Map<CellString, Tile> = new Map<CellString, Tile>();

    private _name: string;

    public pastOutgoingAllianceRequests: AllianceRequest[] = []

    private targets_: Target[] = []

    private outgoingEmojis_: EmojiMessage[] = []

    private sentDonations: Donation[] = []

    constructor(private gs: GameImpl, private readonly playerInfo: PlayerInfo, private _troops) {
        this._name = playerInfo.name;
    }

    name(): string {
        return this._name;
    }

    clientID(): ClientID {
        return this.playerInfo.clientID;
    }

    id(): PlayerID {
        return this.playerInfo.id;
    }

    type(): PlayerType {
        return this.playerInfo.playerType;
    }

    setName(name: string) {
    }

    addBoat(troops: number, tile: Tile, target: Player | TerraNullius): BoatImpl {
        const b = new BoatImpl(this.gs, tile, troops, this, target as PlayerImpl | TerraNulliusImpl);
        this._boats.push(b);
        this.gs.fireBoatUpdateEvent(b, b.tile());
        return b;
    }

    boats(): BoatImpl[] {
        return this._boats;
    }

    sharesBorderWith(other: Player | TerraNullius): boolean {
        for (const border of this._borderTiles) {
            for (const neighbor of border.neighbors()) {
                if (neighbor.owner() == other) {
                    return true;
                }
            }
        }
        return false;
    }
    numTilesOwned(): number {
        return this._tiles.size;
    }

    tiles(): ReadonlySet<Tile> {
        return new Set(this._tiles.values());
    }

    borderTiles(): ReadonlySet<Tile> {
        return this._borderTiles;
    }

    neighbors(): (MutablePlayer | TerraNullius)[] {
        const ns: Set<(MutablePlayer | TerraNullius)> = new Set();
        for (const border of this.borderTiles()) {
            for (const neighbor of border.neighbors()) {
                if (neighbor.isLand() && neighbor.owner() != this) {
                    ns.add((neighbor as TileImpl)._owner);
                }
            }
        }
        return Array.from(ns);
    }

    addTroops(troops: number): void {
        this._troops += Math.floor(troops);
    }
    removeTroops(troops: number): number {
        const toRemove = Math.floor(Math.min(this._troops, troops))
        this._troops -= toRemove;
        return toRemove
    }

    isPlayer(): this is MutablePlayer {return true as const;}
    ownsTile(cell: Cell): boolean {return this._tiles.has(cell.toString());}
    setTroops(troops: number) {this._troops = Math.floor(troops);}
    conquer(tile: Tile) {this.gs.conquer(this, tile);}
    relinquish(tile: Tile) {
        if (tile.owner() != this) {
            throw new Error(`Cannot relinquish tile not owned by this player`);
        }
        this.gs.relinquish(tile);
    }
    info(): PlayerInfo {return this.playerInfo;}
    troops(): number {return this._troops;}
    isAlive(): boolean {return this._tiles.size > 0;}
    executions(): Execution[] {
        return this.gs.executions().filter(exec => exec.owner().id() == this.id());
    }

    incomingAllianceRequests(): MutableAllianceRequest[] {
        return this.gs.allianceRequests.filter(ar => ar.recipient() == this)
    }

    outgoingAllianceRequests(): MutableAllianceRequest[] {
        return this.gs.allianceRequests.filter(ar => ar.requestor() == this)
    }

    alliances(): MutableAlliance[] {
        return this.gs.alliances_.filter(a => a.requestor() == this || a.recipient() == this)
    }

    isAlliedWith(other: Player): boolean {
        if (other == this) {
            return false
        }
        return this.allianceWith(other) != null
    }

    allianceWith(other: Player): MutableAlliance | null {
        return this.alliances().find(a => a.recipient() == other || a.requestor() == other)
    }

    recentOrPendingAllianceRequestWith(other: Player): boolean {
        const hasPending = this.incomingAllianceRequests().find(ar => ar.requestor() == other) != null
            || this.outgoingAllianceRequests().find(ar => ar.recipient() == other) != null
        if (hasPending) {
            return true
        }

        const recent = this.pastOutgoingAllianceRequests
            .filter(ar => ar.recipient() == other)
            .sort((a, b) => b.createdAt() - a.createdAt())

        if (recent.length == 0) {
            return false
        }

        const delta = this.gs.ticks() - recent[0].createdAt()

        return delta < this.gs.config().allianceRequestCooldown()
    }

    breakAlliance(alliance: Alliance): void {
        this.gs.breakAlliance(this, alliance)
    }


    isTraitor(): boolean {
        return this.isTraitor_
    }

    createAllianceRequest(recipient: Player): MutableAllianceRequest {
        if (this.isAlliedWith(recipient)) {
            throw new Error(`cannot create alliance request, already allies`)
        }
        return this.gs.createAllianceRequest(this, recipient)
    }

    canTarget(other: Player): boolean {
        if (this.isAlliedWith(other)) {
            return false
        }
        for (const t of this.targets_) {
            if (this.gs.ticks() - t.tick < this.gs.config().targetCooldown()) {
                return false
            }
        }
        return true
    }

    target(other: Player): void {
        this.targets_.push({tick: this.gs.ticks(), target: other})
        this.gs.eventBus.emit(new TargetPlayerEvent(this, other))
    }

    targets(): PlayerImpl[] {
        return this.targets_
            .filter(t => this.gs.ticks() - t.tick < this.gs.config().targetDuration())
            .map(t => t.target as PlayerImpl)
    }

    transitiveTargets(): MutablePlayer[] {
        const ts = this.alliances().map(a => a.other(this)).flatMap(ally => ally.targets())
        ts.push(...this.targets())
        return [...new Set(ts)]
    }

    sendEmoji(recipient: Player | typeof AllPlayers, emoji: string): void {
        if (recipient == this) {
            throw Error(`Cannot send emoji to oneself: ${this}`)
        }
        const msg = new EmojiMessage(this, recipient, emoji, this.gs.ticks())
        this.outgoingEmojis_.push(msg)
        this.gs.eventBus.emit(new EmojiMessageEvent(msg))
    }

    outgoingEmojis(): EmojiMessage[] {
        return this.outgoingEmojis_
            .filter(e => this.gs.ticks() - e.createdAt < this.gs.config().emojiMessageDuration())
            .sort((a, b) => b.createdAt - a.createdAt)
    }

    canSendEmoji(recipient: Player | typeof AllPlayers): boolean {
        const prevMsgs = this.outgoingEmojis_.filter(msg => msg.recipient == recipient)
        for (const msg of prevMsgs) {
            if (this.gs.ticks() - msg.createdAt < this.gs.config().emojiMessageCooldown()) {
                return false
            }
        }
        return true
    }

    canDonate(recipient: Player): boolean {
        if (!this.isAlliedWith(recipient)) {
            return false
        }
        for (const donation of this.sentDonations) {
            if (donation.recipient == recipient) {
                if (this.gs.ticks() - donation.tick < this.gs.config().donateCooldown()) {
                    return false
                }
            }
        }
        return true
    }

    donate(recipient: MutablePlayer, troops: number): void {
        this.sentDonations.push(new Donation(recipient, this.gs.ticks()))
        recipient.addTroops(this.removeTroops(troops))
        this.gs.displayMessage(`Sent ${renderTroops(troops)} troops to ${recipient.name()}`, MessageType.INFO, this.id())
        this.gs.displayMessage(`Recieved ${renderTroops(troops)} troops from ${this.name()}`, MessageType.SUCCESS, recipient.id())
    }

    currency(): Currency {
        return this._currency
    }

    addCurrency(toAdd: Currency): void {
        this._currency += toAdd
    }

    removeCurrency(toRemove: Currency): void {
        if (toRemove > this._currency) {
            throw Error(`cannot remove ${toRemove} from ${this} because only has ${this._currency}`)
        }
        this._currency -= toRemove
    }

    hash(): number {
        return simpleHash(this.id()) * (this.troops() + this.numTilesOwned());
    }
    toString(): string {
        return `Player:{name:${this.info().name},clientID:${this.info().clientID},isAlive:${this.isAlive()},troops:${this._troops},numTileOwned:${this.numTilesOwned()}}]`;
    }
}
