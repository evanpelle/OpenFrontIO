import { info } from "console";
import { Config } from "../configuration/Config";
import { EventBus } from "../EventBus";
import { Cell, Execution, MutableGame, Game, MutablePlayer, PlayerEvent, PlayerID, PlayerInfo, Player, TerraNullius, Tile, TileEvent, Unit, UnitEvent as UnitEvent, PlayerType, MutableAllianceRequest, AllianceRequestReplyEvent, AllianceRequestEvent, BrokeAllianceEvent, MutableAlliance, Alliance, AllianceExpiredEvent, Nation, UnitType, UnitInfo, TerrainMap, DefenseBonus } from "./Game";
import { createMiniMap, TerrainMapImpl } from "./TerrainMapLoader";
import { PlayerImpl } from "./PlayerImpl";
import { TerraNulliusImpl } from "./TerraNulliusImpl";
import { TileImpl } from "./TileImpl";
import { AllianceRequestImpl } from "./AllianceRequestImpl";
import { AllianceImpl } from "./AllianceImpl";
import { ClientID, GameConfig } from "../Schemas";
import { DisplayMessageEvent, MessageType } from "../../client/graphics/layers/EventsDisplay";
import { UnitImpl } from "./UnitImpl";

export function createGame(terrainMap: TerrainMapImpl, miniMap: TerrainMap, eventBus: EventBus, config: Config, gameConfig: GameConfig): Game {
    return new GameImpl(terrainMap, miniMap, eventBus, config, gameConfig)
}

export type CellString = string

export class GameImpl implements MutableGame {
    private _ticks = 0

    private unInitExecs: Execution[] = []

    // idCounter: PlayerID = 1; // Zero reserved for TerraNullius
    map: TileImpl[][]

    private nations_: Nation[] = []

    _players: Map<PlayerID, PlayerImpl> = new Map<PlayerID, PlayerImpl>
    private execs: Execution[] = []
    private _width: number
    private _height: number
    private _numLandTiles: number
    _terraNullius: TerraNulliusImpl

    allianceRequests: AllianceRequestImpl[] = []
    alliances_: AllianceImpl[] = []


    constructor(
        private _terrainMap: TerrainMapImpl,
        private _miniMap: TerrainMap,
        public eventBus: EventBus,
        private _config: Config,
        private _gameConfig: GameConfig,
    ) {
        this._terraNullius = new TerraNulliusImpl(this)
        this._width = _terrainMap.width();
        this._height = _terrainMap.height();
        this._numLandTiles = _terrainMap.numLandTiles
        this.map = new Array(this._width);
        for (let x = 0; x < this._width; x++) {
            this.map[x] = new Array(this._height);
            for (let y = 0; y < this._height; y++) {
                let cell = new Cell(x, y);
                this.map[x][y] = new TileImpl(this, this._terraNullius, cell, _terrainMap.terrain(cell));
            }
        }
        this.nations_ = _terrainMap.nationMap.nations
            .map(n => new Nation(
                n.name,
                new Cell(n.coordinates[0], n.coordinates[1]),
                n.strength
            ))
    }

    gameConfig(): GameConfig {
        return this._gameConfig
    }

    addFallout(tile: Tile) {
        const ti = tile as TileImpl
        if (tile.hasOwner()) {
            throw Error(`cannot set fallout, tile ${tile} has owner`)
        }
        ti._hasFallout = true
        this.eventBus.emit(new TileEvent(tile))
    }

    addTileDefenseBonus(tile: Tile, unit: Unit, amount: number): DefenseBonus {
        const df = { unit: unit, tile: tile, amount: amount };
        (tile as TileImpl)._defenseBonuses.push(df)
        this.eventBus.emit(new TileEvent(tile))
        return df
    }

    removeTileDefenseBonus(bonus: DefenseBonus): void {
        const t = bonus.tile as TileImpl
        t._defenseBonuses = t._defenseBonuses.filter(db => db != bonus)
        this.eventBus.emit(new TileEvent(bonus.tile))
    }

    units(...types: UnitType[]): UnitImpl[] {
        return Array.from(this._players.values()).flatMap(p => p.units(...types))
    }
    unitInfo(type: UnitType): UnitInfo {
        return this.config().unitInfo(type)
    }
    nations(): Nation[] {
        return this.nations_
    }

    createAllianceRequest(requestor: MutablePlayer, recipient: Player): MutableAllianceRequest {
        if (requestor.isAlliedWith(recipient)) {
            console.log('cannot request alliance, already allied')
            return
        }
        if (recipient.incomingAllianceRequests().find(ar => ar.requestor() == requestor) != null) {
            console.log(`duplicate alliance request from ${requestor.name()}`)
            return
        }
        const correspondingReq = requestor.incomingAllianceRequests().find(ar => ar.requestor() == recipient)
        if (correspondingReq != null) {
            console.log(`got corresponding alliance requests, accepting`)
            correspondingReq.accept()
            return
        }
        const ar = new AllianceRequestImpl(requestor, recipient, this._ticks, this)
        this.allianceRequests.push(ar)
        this.eventBus.emit(new AllianceRequestEvent(ar))
        return ar
    }

    acceptAllianceRequest(request: AllianceRequestImpl) {
        this.allianceRequests = this.allianceRequests.filter(ar => ar != request)
        const alliance = new AllianceImpl(this, request.requestor() as PlayerImpl, request.recipient() as PlayerImpl, this._ticks)
        this.alliances_.push(alliance);
        (request.requestor() as PlayerImpl).pastOutgoingAllianceRequests.push(request)
        this.eventBus.emit(new AllianceRequestReplyEvent(request, true))
    }

    rejectAllianceRequest(request: AllianceRequestImpl) {
        this.allianceRequests = this.allianceRequests.filter(ar => ar != request);
        (request.requestor() as PlayerImpl).pastOutgoingAllianceRequests.push(request)
        this.eventBus.emit(new AllianceRequestReplyEvent(request, false))
    }

    numLandTiles(): number {
        return this._numLandTiles
    }
    hasPlayer(id: PlayerID): boolean {
        return this._players.has(id)
    }
    config(): Config {
        return this._config
    }

    inSpawnPhase(): boolean {
        return this._ticks <= this.config().numSpawnPhaseTurns(this._gameConfig.gameType)
    }

    ticks(): number {
        return this._ticks
    }

    executeNextTick() {
        this.execs.forEach(e => {
            if (e.isActive() && (!this.inSpawnPhase() || e.activeDuringSpawnPhase())) {
                e.tick(this._ticks)
            }
        })
        const inited: Execution[] = []
        const unInited: Execution[] = []
        this.unInitExecs.forEach(e => {
            if (!this.inSpawnPhase() || e.activeDuringSpawnPhase()) {
                e.init(this, this._ticks)
                inited.push(e)
            } else {
                unInited.push(e)
            }
        })

        this.removeInactiveExecutions()

        this.execs.push(...inited)
        this.unInitExecs = unInited
        this._ticks++
        if (this._ticks % 100 == 0) {
            let hash = 1;
            this._players.forEach(p => {
                hash += p.hash()
            })
            console.log(`tick ${this._ticks}: hash ${hash}`)
        }
    }

    terraNullius(): TerraNullius {
        return this._terraNullius
    }

    removeInactiveExecutions(): void {
        const activeExecs: Execution[] = []
        for (const exec of this.execs) {
            if (this.inSpawnPhase()) {
                if (exec.activeDuringSpawnPhase()) {
                    if (exec.isActive()) {
                        activeExecs.push(exec)
                    }
                } else {
                    activeExecs.push(exec)
                }
            } else {
                if (exec.isActive()) {
                    activeExecs.push(exec)
                }
            }
        }
        this.execs = activeExecs
    }

    players(): MutablePlayer[] {
        return Array.from(this._players.values()).filter(p => p.isAlive())
    }

    executions(): Execution[] {
        return [...this.execs, ...this.unInitExecs]
    }

    addExecution(...exec: Execution[]) {
        this.unInitExecs.push(...exec)
    }

    removeExecution(exec: Execution) {
        this.execs = this.execs.filter(execution => execution !== exec)
        this.unInitExecs = this.unInitExecs.filter(execution => execution !== exec)
    }

    width(): number {
        return this._width
    }

    height(): number {
        return this._height
    }

    forEachTile(fn: (tile: Tile) => void): void {
        for (let x = 0; x < this._width; x++) {
            for (let y = 0; y < this._height; y++) {
                fn(this.tile(new Cell(x, y)))
            }
        }
    }

    playerView(id: PlayerID): MutablePlayer {
        return this.player(id)
    }

    addPlayer(playerInfo: PlayerInfo, manpower: number): MutablePlayer {
        let player = new PlayerImpl(this, playerInfo, manpower)
        this._players.set(playerInfo.id, player)
        this.eventBus.emit(new PlayerEvent(player))
        return player
    }

    player(id: PlayerID | null): MutablePlayer {
        if (!this._players.has(id)) {
            throw new Error(`Player with id ${id} not found`)
        }
        return this._players.get(id)
    }

    playerByClientID(id: ClientID): MutablePlayer | null {
        for (const [pID, player] of this._players) {
            if (player.clientID() == id) {
                return player
            }
        }
        return null
    }


    tile(cell: Cell): Tile {
        this.assertIsOnMap(cell)
        return this.map[cell.x][cell.y]
    }

    isOnMap(cell: Cell): boolean {
        return cell.x >= 0
            && cell.x < this._width
            && cell.y >= 0
            && cell.y < this._height
    }

    neighbors(tile: Tile): Tile[] {
        const x = tile.cell().x
        const y = tile.cell().y
        const ns: TileImpl[] = []
        if (y > 0) {
            ns.push(this.map[x][y - 1])
        }
        if (y < this._height - 1) {
            ns.push(this.map[x][y + 1])
        }
        if (x > 0) {
            ns.push(this.map[x - 1][y])
        }
        if (x < this._width - 1) {
            ns.push(this.map[x + 1][y])
        }
        return ns
    }

    neighborsWithDiag(tile: Tile): Tile[] {
        const x = tile.cell().x
        const y = tile.cell().y
        const ns: TileImpl[] = []
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue // Skip the center tile
                const newX = x + dx
                const newY = y + dy
                if (newX >= 0 && newX < this._width && newY >= 0 && newY < this._height) {
                    ns.push(this.map[newX][newY])
                }
            }
        }
        return ns
    }

    private assertIsOnMap(cell: Cell) {
        if (!this.isOnMap(cell)) {
            throw new Error(`cell ${cell.toString()} is not on map`)
        }
    }

    conquer(owner: PlayerImpl, tile: Tile): void {
        const tileImpl = tile as TileImpl
        let previousOwner = tileImpl._owner
        if (previousOwner.isPlayer()) {
            previousOwner._lastTileChange = this._ticks
            previousOwner._tiles.delete(tile.cell().toString())
            previousOwner._borderTiles.delete(tile)
            tileImpl._isBorder = false
        }
        tileImpl._owner = owner
        owner._tiles.set(tile.cell().toString(), tile)
        owner._lastTileChange = this._ticks
        this.updateBorders(tile)
        tileImpl._hasFallout = false
        this.eventBus.emit(new TileEvent(tile))
    }

    relinquish(tile: Tile) {
        if (!tile.hasOwner()) {
            throw new Error(`Cannot relinquish tile because it is unowned: cell ${tile.cell().toString()}`)
        }
        if (tile.isWater()) {
            throw new Error("Cannot relinquish water")
        }

        const tileImpl = tile as TileImpl
        let previousOwner = tileImpl._owner as PlayerImpl
        previousOwner._lastTileChange = this._ticks
        previousOwner._tiles.delete(tile.cell().toString())
        previousOwner._borderTiles.delete(tile)
        tileImpl._isBorder = false

        tileImpl._owner = this._terraNullius
        this.updateBorders(tile)
        this.eventBus.emit(new TileEvent(tile))
    }

    private updateBorders(tile: Tile) {
        const tiles: TileImpl[] = []
        tiles.push(tile as TileImpl)
        tile.neighbors().forEach(t => tiles.push(t as TileImpl))

        for (const t of tiles) {
            if (!t.hasOwner()) {
                t._isBorder = false
                continue
            }
            if (this.isBorder(t)) {
                (t.owner() as PlayerImpl)._borderTiles.add(t);
                t._isBorder = true
            } else {
                (t.owner() as PlayerImpl)._borderTiles.delete(t);
                t._isBorder = false
            }
        }
    }

    isBorder(tile: Tile): boolean {
        if (!tile.hasOwner()) {
            return false
        }
        for (const neighbor of tile.neighbors()) {
            let bordersEnemy = tile.owner() != neighbor.owner()
            if (bordersEnemy) {
                return true
            }
        }
        return false
    }

    public fireUnitUpdateEvent(boat: Unit, oldTile: Tile) {
        this.eventBus.emit(new UnitEvent(boat, oldTile))
    }

    public breakAlliance(breaker: Player, alliance: Alliance) {
        let other: Player = null
        if (alliance.requestor() == breaker) {
            other = alliance.recipient()
        } else {
            other = alliance.requestor()
        }
        if (!breaker.isAlliedWith(other)) {
            throw new Error(`${breaker} not allied with ${other}, cannot break alliance`)
        }
        if (!other.isTraitor()) {
            (breaker as PlayerImpl).isTraitor_ = true
        }

        const breakerSet = new Set(breaker.alliances())
        const alliances = other.alliances().filter(a => breakerSet.has(a))
        if (alliances.length != 1) {
            throw new Error(`must have exactly one alliance, have ${alliances.length}`)
        }
        this.alliances_ = this.alliances_.filter(a => a != alliances[0])
        this.eventBus.emit(new BrokeAllianceEvent(breaker, other))
    }

    public expireAlliance(alliance: Alliance) {
        const p1Set = new Set(alliance.recipient().alliances())
        const alliances = alliance.requestor().alliances().filter(a => p1Set.has(a))
        if (alliances.length != 1) {
            throw new Error(`cannot expire alliance: must have exactly one alliance, have ${alliances.length}`)
        }
        this.alliances_ = this.alliances_.filter(a => a != alliances[0])
        this.eventBus.emit(new AllianceExpiredEvent(alliance.requestor(), alliance.recipient()))
    }

    public terrainMap(): TerrainMapImpl {
        return this._terrainMap
    }

    public terrainMiniMap(): TerrainMap {
        return this._miniMap
    }

    displayMessage(message: string, type: MessageType, playerID: PlayerID | null): void {
        this.eventBus.emit(new DisplayMessageEvent(message, type, playerID))
    }

}