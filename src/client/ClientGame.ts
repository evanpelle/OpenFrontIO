import {Executor} from "../core/execution/ExecutionManager";
import {Cell, MutableGame, PlayerEvent, PlayerID, MutablePlayer, TileEvent, Player, Game, BoatEvent, Tile, PlayerType, GameMap} from "../core/game/Game";
import {createGame} from "../core/game/GameImpl";
import {EventBus} from "../core/EventBus";
import {Config, getConfig} from "../core/configuration/Config";
import {createRenderer, GameRenderer} from "./graphics/GameRenderer";
import {InputHandler, MouseUpEvent, ZoomEvent, DragEvent, MouseDownEvent} from "./InputHandler"
import {ClientID, ClientIntentMessageSchema, ClientJoinMessageSchema, ClientLeaveMessageSchema, ClientMessageSchema, GameID, Intent, ServerMessage, ServerMessageSchema, ServerSyncMessage, Turn} from "../core/Schemas";
import {loadTerrainMap, TerrainMap} from "../core/game/TerrainMapLoader";
import {and, bfs, dist, manhattanDist} from "../core/Util";
import {WinCheckExecution} from "../core/execution/WinCheckExecution";
import {SendAttackIntentEvent, SendSpawnIntentEvent, Transport} from "./Transport";
import {createCanvas} from "./graphics/Utils";
import {DisplayMessageEvent, MessageType} from "./graphics/layers/EventsDisplay";
import {v4 as uuidv4} from 'uuid';


export interface LobbyConfig {
    isLocal: boolean
    playerName: () => string
    gameID: GameID
    ip: string | null
    map: GameMap | null
}

export interface GameConfig {
    map: GameMap
    clientID: ClientID,
    gameID: GameID,
    ip: string | null,
}

export function joinLobby(lobbyConfig: LobbyConfig, onjoin: () => void): () => void {
    const clientID = uuidv4()
    const playerID = uuidv4()
    const eventBus = new EventBus()
    const config = getConfig()
    const transport = new Transport(lobbyConfig.isLocal, eventBus, lobbyConfig.gameID, clientID, playerID, config, lobbyConfig.playerName)

    const onconnect = () => {
        console.log('Joined game lobby!');
        transport.joinGame(clientID, 0)
    };
    const onmessage = (message: ServerMessage) => {
        if (message.type == "start") {
            console.log('lobby: game started')
            onjoin()
            const gameConfig = {
                map: message.config?.gameMap || lobbyConfig.map,
                clientID: clientID,
                gameID: lobbyConfig.gameID,
                ip: lobbyConfig.ip,
            }
            createClientGame(gameConfig, eventBus, transport).then(r => r.start())
        };
    }
    transport.connect(onconnect, onmessage)
    return () => {
        console.log('leaving game')
        transport.leaveGame()
    }
}


export async function createClientGame(gameConfig: GameConfig, eventBus: EventBus, transport: Transport): Promise<GameRunner> {
    const config = getConfig()

    const terrainMap = await loadTerrainMap(gameConfig.map)

    let game = createGame(terrainMap, eventBus, config)
    const canvas = createCanvas()
    let gameRenderer = createRenderer(canvas, game, eventBus, gameConfig.clientID)

    return new GameRunner(
        gameConfig.clientID,
        gameConfig.ip,
        eventBus,
        game,
        gameRenderer,
        new InputHandler(canvas, eventBus),
        new Executor(game, gameConfig.gameID),
        transport,
    )
}

export class GameRunner {
    private myPlayer: Player
    private turns: Turn[] = []
    private isActive = false

    private currTurn = 0

    private intervalID: NodeJS.Timeout

    private isProcessingTurn = false
    private hasJoined = false

    constructor(
        private id: ClientID,
        private clientIP: string | null,
        private eventBus: EventBus,
        private gs: Game,
        private renderer: GameRenderer,
        private input: InputHandler,
        private executor: Executor,
        private transport: Transport,
    ) { }

    public start() {
        console.log('starting client game')
        this.isActive = true
        this.eventBus.on(PlayerEvent, (e) => this.playerEvent(e))
        this.eventBus.on(MouseUpEvent, (e) => this.inputEvent(e))

        this.renderer.initialize()
        this.input.initialize()
        this.gs.addExecution(...this.executor.spawnBots(this.gs.config().numBots()))
        this.gs.addExecution(...this.executor.fakeHumanExecutions())
        this.gs.addExecution(new WinCheckExecution(this.eventBus))

        this.intervalID = setInterval(() => this.tick(), 10);

        const onconnect = () => {
            console.log('Connected to game server!');
            this.transport.joinGame(this.clientIP, this.turns.length)
        };
        const onmessage = (message: ServerMessage) => {
            if (message.type == "start") {
                this.hasJoined = true
                console.log("starting game!")
                for (const turn of message.turns) {
                    if (turn.turnNumber < this.turns.length) {
                        continue
                    }
                    this.turns.push(turn)
                }
            }
            if (message.type == "turn") {
                if (!this.hasJoined) {
                    return
                }
                if (this.turns.length != message.turn.turnNumber) {
                    console.error(`got wrong turn have turns ${this.turns.length}, received turn ${message.turn.turnNumber}`)
                } else {
                    this.turns.push(message.turn)
                }
            }
        };
        this.transport.connect(onconnect, onmessage)

    }

    public stop() {
        clearInterval(this.intervalID)
        this.isActive = false
        this.transport.leaveGame()
    }

    public tick() {
        if (this.currTurn >= this.turns.length || this.isProcessingTurn) {
            return
        }
        this.isProcessingTurn = true
        this.gs.addExecution(...this.executor.createExecs(this.turns[this.currTurn]))
        this.gs.executeNextTick()
        this.renderer.tick()
        this.currTurn++
        this.isProcessingTurn = false
    }

    private playerEvent(event: PlayerEvent) {
        console.log('received new player event!')
        if (event.player.clientID() == this.id) {
            console.log('setting name')
            this.myPlayer = event.player
        }
    }

    private inputEvent(event: MouseUpEvent) {
        if (!this.isActive) {
            return
        }
        const cell = this.renderer.transformHandler.screenToWorldCoordinates(event.x, event.y)
        if (!this.gs.isOnMap(cell)) {
            return
        }
        console.log(`clicked cell ${cell}`)
        const tile = this.gs.tile(cell)
        if (tile.isLand() && !tile.hasOwner() && this.gs.inSpawnPhase()) {
            this.eventBus.emit(new SendSpawnIntentEvent(cell))
            return
        }
        if (this.gs.inSpawnPhase()) {
            return
        }
        if (this.myPlayer == null) {
            return
        }

        const owner = tile.owner()
        const targetID = owner.isPlayer() ? owner.id() : null;

        if (tile.owner() == this.myPlayer) {
            return
        }
        if (tile.owner().isPlayer() && this.myPlayer.isAlliedWith(tile.owner() as Player)) {
            this.eventBus.emit(new DisplayMessageEvent("Cannot attack ally", MessageType.WARN))
            return
        }

        if (tile.isLand()) {
            if (tile.hasOwner()) {
                if (this.myPlayer.sharesBorderWith(tile.owner())) {
                    this.eventBus.emit(new SendAttackIntentEvent(targetID))
                }
            } else {

                outer_loop: for (const t of bfs(tile, and(t => !t.hasOwner() && t.isLand(), dist(tile, 200)))) {
                    for (const n of t.neighbors()) {
                        if (n.owner() == this.myPlayer) {
                            this.eventBus.emit(new SendAttackIntentEvent(targetID))
                            break outer_loop
                        }
                    }
                }
            }
        }
    }
}