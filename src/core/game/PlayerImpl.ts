import { MutablePlayer, Tile, PlayerInfo, PlayerID, PlayerType, Player, TerraNullius, Cell, Execution, AllianceRequest, MutableAllianceRequest, MutableAlliance, Alliance, Tick, TargetPlayerEvent, EmojiMessage, EmojiMessageEvent, AllPlayers, Gold, UnitType, Unit, MutableUnit } from "./Game";
import { ClientID } from "../Schemas";
import { assertNever, bfs, closestOceanShoreFromPlayer, dist, distSortUnit, manhattanDist, manhattanDistWrapped, processName, simpleHash, sourceDstOceanShore } from "../Util";
import { CellString, GameImpl } from "./GameImpl";
import { UnitImpl } from "./UnitImpl";
import { TileImpl } from "./TileImpl";
import { MessageType } from "../../client/graphics/layers/EventsDisplay";
import { renderTroops } from "../../client/graphics/Utils";

interface Target {
    tick: Tick
    target: Player
}

class Donation {
    constructor(public readonly recipient: Player, public readonly tick: Tick) { }
}

export class PlayerImpl implements MutablePlayer {

    public _lastTileChange: number = 0

    private _gold: Gold
    private _troops: number
    private _workers: number
    private _targetTroopRatio: number = 1

    isTraitor_ = false

    public _borderTiles: Set<Tile> = new Set();

    public _units: UnitImpl[] = [];
    public _tiles: Map<CellString, Tile> = new Map<CellString, Tile>();

    private _name: string;
    private _displayName: string;

    public pastOutgoingAllianceRequests: AllianceRequest[] = []

    private targets_: Target[] = []

    private outgoingEmojis_: EmojiMessage[] = []

    private sentDonations: Donation[] = []

    constructor(private gs: GameImpl, private readonly playerInfo: PlayerInfo, startPopulation: number) {
        this._name = playerInfo.name;
        this._targetTroopRatio = 1
        this._troops = startPopulation * this._targetTroopRatio;
        this._workers = startPopulation * (1 - this._targetTroopRatio)
        this._gold = 0
        this._displayName = processName(this._name)

    }

    name(): string {
        return this._name;
    }
    displayName(): string {
        return this._displayName
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


    units(...types: UnitType[]): UnitImpl[] {
        if (types.length == 0) {
            return this._units
        }
        const ts = new Set(types)
        return this._units.filter(u => ts.has(u.type()));
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

    isPlayer(): this is MutablePlayer { return true as const; }
    ownsTile(cell: Cell): boolean { return this._tiles.has(cell.toString()); }
    setTroops(troops: number) { this._troops = Math.floor(troops); }
    conquer(tile: Tile) { this.gs.conquer(this, tile); }
    relinquish(tile: Tile) {
        if (tile.owner() != this) {
            throw new Error(`Cannot relinquish tile not owned by this player`);
        }
        this.gs.relinquish(tile);
    }
    info(): PlayerInfo { return this.playerInfo; }
    isAlive(): boolean { return this._tiles.size > 0; }
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
        if (other == this) {
            return null
        }
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
        this.targets_.push({ tick: this.gs.ticks(), target: other })
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

    gold(): Gold {
        return this._gold
    }

    addGold(toAdd: Gold): void {
        this._gold += toAdd
    }

    removeGold(toRemove: Gold): void {
        if (toRemove > this._gold) {
            throw Error(`Player ${this} does not enough gold (${toRemove} vs ${this._gold}))`)
        }
        this._gold -= toRemove
    }

    population(): number {
        return this._troops + this._workers
    }
    workers(): number {
        return Math.max(1, this._workers)
    }
    addWorkers(toAdd: number): void {
        this._workers += toAdd
    }
    removeWorkers(toRemove: number): void {
        this._workers = Math.max(1, this._workers - toRemove)
    }

    targetTroopRatio(): number {
        return this._targetTroopRatio
    }

    setTargetTroopRatio(target: number): void {
        if (target < 0 || target > 1) {
            throw new Error(`invalid targetTroopRatio ${target} set on player ${PlayerImpl}`)
        }
        this._targetTroopRatio = target
    }

    troops(): number { return this._troops; }

    addTroops(troops: number): void {
        if (troops < 0) {
            this.removeTroops(-1 * troops)
            return
        }
        this._troops += Math.floor(troops);
    }
    removeTroops(troops: number): number {
        if (troops <= 1) {
            return 0
        }
        const toRemove = Math.floor(Math.min(this._troops - 1, troops))
        this._troops -= toRemove;
        return toRemove
    }

    captureUnit(unit: MutableUnit): void {
        if (unit.owner() == this) {
            throw new Error(`Cannot capture unit, ${this} already owns ${unit}`)
        }
        const prev = unit.owner();
        (prev as PlayerImpl)._units = (prev as PlayerImpl)._units.filter(u => u != unit);
        (unit as UnitImpl)._owner = this
        this._units.push(unit as UnitImpl)
        this.gs.fireUnitUpdateEvent(unit, unit.tile())
        this.gs.displayMessage(`${unit.type()} captured by ${this.displayName()}`, MessageType.ERROR, prev.id())
        this.gs.displayMessage(`Captured ${unit.type()} from ${prev.displayName()}`, MessageType.SUCCESS, this.id())
    }

    buildUnit(type: UnitType, troops: number, spawnTile: Tile): UnitImpl {
        const cost = this.gs.unitInfo(type).cost(this)
        const b = new UnitImpl(type, this.gs, spawnTile, troops, this);
        this._units.push(b);
        this.removeGold(cost)
        this.removeTroops(troops)
        this.gs.fireUnitUpdateEvent(b, b.tile());
        return b;
    }


    canBuild(unitType: UnitType, targetTile: Tile): Tile | false {
        const cost = this.gs.unitInfo(unitType).cost(this)
        if (!this.isAlive() || this.gold() < cost) {
            return false
        }
        switch (unitType) {
            case UnitType.AtomBomb:
            case UnitType.HydrogenBomb:
                return this.nukeSpawn(targetTile)
            case UnitType.Port:
                return this.portSpawn(targetTile)
            case UnitType.Destroyer:
            case UnitType.Battleship:
                return this.warshipSpawn(targetTile)
            case UnitType.Shell:
                return targetTile
            case UnitType.MissileSilo:
                return this.landBasedStructureSpawn(targetTile)
            case UnitType.DefensePost:
                return this.landBasedStructureSpawn(targetTile)
            case UnitType.TransportShip:
                return this.transportShipSpawn(targetTile)
            case UnitType.TradeShip:
                return this.tradeShipSpawn(targetTile)
            case UnitType.City:
                return this.landBasedStructureSpawn(targetTile)
            default:
                assertNever(unitType)
        }
    }

    nukeSpawn(tile: Tile): Tile | false {
        const spawns = this.units(UnitType.MissileSilo).map(u => u as Unit).sort(distSortUnit(tile))
        if (spawns.length == 0) {
            return false
        }
        return spawns[0].tile()
    }

    portSpawn(tile: Tile): Tile | false {
        const spawns = Array.from(bfs(tile, dist(tile, 20)))
            .filter(t => t.owner() == this && t.isOceanShore())
            .sort((a, b) => manhattanDist(a.cell(), tile.cell()) - manhattanDist(b.cell(), tile.cell()))
        if (spawns.length == 0) {
            return false
        }
        return spawns[0]
    }

    warshipSpawn(tile: Tile): Tile | false {
        if (!tile.isOcean()) {
            return false
        }
        const spawns = this.units(UnitType.Port)
            .filter(u => manhattanDist(u.tile().cell(), tile.cell()) < this.gs.config().boatMaxDistance())
            .sort((a, b) => manhattanDist(a.tile().cell(), tile.cell()) - manhattanDist(b.tile().cell(), tile.cell()))
        if (spawns.length == 0) {
            return false
        }
        return spawns[0].tile()
    }

    landBasedStructureSpawn(tile: Tile): Tile | false {
        if (tile.owner() != this) {
            return false
        }
        return tile
    }

    transportShipSpawn(targetTile: Tile): Tile | false {
        if (!targetTile.isOceanShore()) {
            return false
        }
        const spawn = closestOceanShoreFromPlayer(this, targetTile, this.gs.width())
        if (spawn == null) {
            return false
        }
        return spawn
    }

    tradeShipSpawn(targetTile: Tile): Tile | false {
        const spawns = this.units(UnitType.Port).filter(u => u.tile() == targetTile)
        if (spawns.length == 0) {
            return false
        }
        return spawns[0].tile()
    }
    lastTileChange(): Tick {
        return this._lastTileChange
    }

    hash(): number {
        return simpleHash(this.id()) * (this.population() + this.numTilesOwned()) + this._units.reduce((acc, unit) => acc + unit.hash(), 0)
    }
    toString(): string {
        return `Player:{name:${this.info().name},clientID:${this.info().clientID},isAlive:${this.isAlive()},troops:${this._troops},numTileOwned:${this.numTilesOwned()}}]`;
    }
}
