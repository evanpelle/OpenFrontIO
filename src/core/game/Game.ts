import { Config } from "../configuration/Config"
import { GameEvent } from "../EventBus"
import { ClientID, GameConfig, GameID } from "../Schemas"
import { MessageType } from "../../client/graphics/layers/EventsDisplay"
import { SearchNode } from "../pathfinding/AStar"

export type PlayerID = string
export type Tick = number
export type Gold = number

export const AllPlayers = "AllPlayers" as const;

export enum Difficulty {
    Easy = 1,
    Medium = 3,
    Hard = 9,
    Impossible = 18,
}

export enum GameMap {
    World,
    Europe,
    Mena,
    NorthAmerica,
    Oceania
}

export enum GameType {
    Singleplayer,
    Public,
    Private,
}

export interface UnitInfo {
    cost: (player: Player) => Gold
    // Determines if its owner changes when its tile is conquered.
    territoryBound: boolean
}

export enum UnitType {
    TransportShip = "Transport",
    Destroyer = "Destroyer",
    Battleship = "Battleship",
    Shell = "Shell",
    Port = "Port",
    AtomBomb = "Atom Bomb",
    HydrogenBomb = "Hydrogen Bomb",
    TradeShip = "Trade Ship",
    MissileSilo = "Missile Silo",
    DefensePost = "Defense Post",
    City = "City"
}

export class Nation {
    constructor(
        public readonly name: string,
        public readonly cell: Cell,
        public readonly strength: number,
    ) { }
}

export class EmojiMessage {
    constructor(
        public readonly sender: Player,
        public readonly recipient: Player | typeof AllPlayers,
        public readonly emoji: string,
        public readonly createdAt: Tick
    ) { }
}

export class Cell {

    private strRepr: string

    constructor(
        public readonly x,
        public readonly y
    ) {
        this.strRepr = `Cell[${this.x},${this.y}]`
    }

    toString(): string { return this.strRepr }
}

export enum TerrainType {
    Plains,
    Highland,
    Mountain,
    Lake,
    Ocean
}

export enum PlayerType {
    Bot = "BOT",
    Human = "HUMAN",
    FakeHuman = "FAKEHUMAN",
}

export interface ExecutionView {
    isActive(): boolean
    // TODO: remove owner
    owner(): Player
    activeDuringSpawnPhase(): boolean
}

export interface Execution extends ExecutionView {
    init(mg: MutableGame, ticks: number): void
    tick(ticks: number): void
    owner(): MutablePlayer
}

export interface AllianceRequest {
    requestor(): Player
    recipient(): Player
    createdAt(): Tick
}

export interface MutableAllianceRequest extends AllianceRequest {
    accept(): void
    reject(): void
}

export interface Alliance {
    requestor(): Player
    recipient(): Player
    createdAt(): Tick
    other(player: Player): Player
}

export interface MutableAlliance extends Alliance {
    expire(): void
    other(player: Player): MutablePlayer
}

export class PlayerInfo {
    constructor(
        public readonly name: string,
        public readonly playerType: PlayerType,
        // null if bot.
        public readonly clientID: ClientID | null,
        public readonly id: PlayerID
    ) { }
}

export interface TerrainMap {
    terrain(cell: Cell): TerrainTile
    neighbors(terrainTile: TerrainTile): TerrainTile[]
    width(): number
    height(): number
}

export interface TerrainTile extends SearchNode {
    terrainType(): TerrainType
}

export interface DefenseBonus {
    // Unit providing the defense bonus
    unit: Unit
    amount: number
    tile: Tile
}

export interface Tile extends SearchNode {
    isLand(): boolean
    isShore(): boolean
    isOceanShore(): boolean
    isWater(): boolean
    isShorelineWater(): boolean
    isOcean(): boolean
    isLake(): boolean
    terrain(): TerrainType
    magnitude(): number
    owner(): Player | TerraNullius
    hasOwner(): boolean
    isBorder(): boolean
    borders(other: Player | TerraNullius): boolean
    isInterior(): boolean
    cell(): Cell
    neighbors(): Tile[]
    neighborsWrapped(): Tile[]
    onShore(): boolean

    defenseBonuses(): DefenseBonus[]
    // defense bonus against this player
    defenseBonus(player: Player): number
    hasFallout(): boolean
}

export interface Unit {
    type(): UnitType
    troops(): number
    tile(): Tile
    owner(): Player
    isActive(): boolean
    info(): UnitInfo
}

export interface MutableUnit extends Unit {
    move(tile: Tile): void
    owner(): MutablePlayer
    setTroops(troops: number): void
    delete(): void
}

export interface TerraNullius {
    ownsTile(cell: Cell): boolean
    isPlayer(): false
    id(): PlayerID // always zero, maybe make it TerraNulliusID?
    clientID(): ClientID
}

export interface Player {
    info(): PlayerInfo
    name(): string
    displayName(): string
    clientID(): ClientID
    id(): PlayerID
    type(): PlayerType
    units(...types: UnitType[]): Unit[]
    ownsTile(cell: Cell): boolean
    isAlive(): boolean
    borderTiles(): ReadonlySet<Tile>
    isPlayer(): this is Player
    neighbors(): (Player | TerraNullius)[]
    numTilesOwned(): number
    tiles(): ReadonlySet<Tile>
    sharesBorderWith(other: Player | TerraNullius): boolean
    incomingAllianceRequests(): AllianceRequest[]
    outgoingAllianceRequests(): AllianceRequest[]
    alliances(): Alliance[]
    isAlliedWith(other: Player): boolean
    allianceWith(other: Player): Alliance | null
    // Includes recent requests that  are in cooldown
    // TODO: why can't I have "canSendAllyRequest" function instead?
    recentOrPendingAllianceRequestWith(other: Player): boolean
    isTraitor(): boolean
    canTarget(other: Player): boolean
    // Targets for this player
    targets(): Player[]
    // Targets of player and all allies.
    transitiveTargets(): Player[]
    toString(): string
    canSendEmoji(recipient: Player | typeof AllPlayers): boolean
    outgoingEmojis(): EmojiMessage[]
    canDonate(recipient: Player): boolean
    gold(): Gold
    // Population = troops + workers
    population(): number
    workers(): number
    // Number between 0, 1
    targetTroopRatio(): number
    troops(): number

    // If can build returns the spawn tile, false otherwise
    canBuild(type: UnitType, targetTile: Tile): Tile | false
}

export interface MutablePlayer extends Player {
    conquer(tile: Tile): void
    relinquish(tile: Tile): void
    executions(): Execution[]
    neighbors(): (MutablePlayer | TerraNullius)[]
    units(...types: UnitType[]): MutableUnit[]
    incomingAllianceRequests(): MutableAllianceRequest[]
    outgoingAllianceRequests(): MutableAllianceRequest[]
    alliances(): MutableAlliance[]
    allianceWith(other: Player): MutableAlliance | null
    breakAlliance(alliance: Alliance): void
    createAllianceRequest(recipient: Player): MutableAllianceRequest
    target(other: Player): void
    targets(): MutablePlayer[]
    transitiveTargets(): MutablePlayer[]
    sendEmoji(recipient: Player | typeof AllPlayers, emoji: string): void
    donate(recipient: MutablePlayer, troops: number): void

    addGold(toAdd: Gold): void
    removeGold(toRemove: Gold): void

    addWorkers(toAdd: number): void
    removeWorkers(toRemove: number): void
    setTargetTroopRatio(target: number): void
    setTroops(troops: number): void
    addTroops(troops: number): void
    removeTroops(troops: number): number

    buildUnit(type: UnitType, troops: number, tile: Tile): MutableUnit
    captureUnit(unit: MutableUnit): void
}

export interface Game {
    // Throws exception is player not found
    player(id: PlayerID): Player
    playerByClientID(id: ClientID): Player | null
    hasPlayer(id: PlayerID): boolean
    players(): Player[]
    tile(cell: Cell): Tile
    isOnMap(cell: Cell): boolean
    neighbors(cell: Cell | Tile): Tile[]
    width(): number
    height(): number
    numLandTiles(): number
    forEachTile(fn: (tile: Tile) => void): void
    executions(): ExecutionView[]
    terraNullius(): TerraNullius
    executeNextTick(): void
    ticks(): Tick
    inSpawnPhase(): boolean
    addExecution(...exec: Execution[]): void
    nations(): Nation[]
    config(): Config
    gameConfig(): GameConfig
    displayMessage(message: string, type: MessageType, playerID: PlayerID | null): void
    units(...types: UnitType[]): Unit[]
    unitInfo(type: UnitType): UnitInfo
    terrainMap(): TerrainMap
    terrainMiniMap(): TerrainMap
}

export interface MutableGame extends Game {
    player(id: PlayerID): MutablePlayer
    playerByClientID(id: ClientID): MutablePlayer | null
    players(): MutablePlayer[]
    addPlayer(playerInfo: PlayerInfo, manpower: number): MutablePlayer
    executions(): Execution[]
    units(...types: UnitType[]): MutableUnit[]
    addTileDefenseBonus(tile: Tile, unit: Unit, amount: number): DefenseBonus
    removeTileDefenseBonus(bonus: DefenseBonus): void
    addFallout(tile: Tile)
}

export class TileEvent implements GameEvent {
    constructor(public readonly tile: Tile) { }
}

export class PlayerEvent implements GameEvent {
    constructor(public readonly player: Player) { }
}

export class UnitEvent implements GameEvent {
    constructor(public readonly unit: Unit, public oldTile: Tile) { }
}

export class AllianceRequestEvent implements GameEvent {
    constructor(public readonly allianceRequest: AllianceRequest) { }
}

export class AllianceRequestReplyEvent implements GameEvent {
    constructor(public readonly allianceRequest: AllianceRequest, public readonly accepted: boolean) { }
}

export class BrokeAllianceEvent implements GameEvent {
    constructor(public readonly traitor: Player, public readonly betrayed: Player) { }
}

export class AllianceExpiredEvent implements GameEvent {
    constructor(public readonly player1: Player, public readonly player2: Player) { }
}

export class TargetPlayerEvent implements GameEvent {
    constructor(public readonly player: Player, public readonly target: Player) { }
}

export class EmojiMessageEvent implements GameEvent {
    constructor(public readonly message: EmojiMessage) { }
}

