import { Executor } from "../core/execution/ExecutionManager";
import { Cell, MutableGame, PlayerEvent, PlayerID, MutablePlayer, TileEvent, Player, Game, UnitEvent, Tile, PlayerType, GameMap, Difficulty, GameType } from "../core/game/Game";
import { createGame } from "../core/game/GameImpl";
import { EventBus } from "../core/EventBus";
import { Config, getConfig } from "../core/configuration/Config";
import { createRenderer, GameRenderer } from "./graphics/GameRenderer";
import { InputHandler, MouseUpEvent, ZoomEvent, DragEvent, MouseDownEvent } from "./InputHandler"
import { ClientID, ClientIntentMessageSchema, ClientJoinMessageSchema, ClientMessageSchema, GameConfig, GameID, Intent, ServerMessage, ServerMessageSchema, ServerSyncMessage, Turn } from "../core/Schemas";
import { createMiniMap, loadTerrainMap, TerrainMapImpl } from "../core/game/TerrainMapLoader";
import { and, bfs, dist, manhattanDist } from "../core/Util";
import { WinCheckExecution } from "../core/execution/WinCheckExecution";
import { SendAttackIntentEvent, SendSpawnIntentEvent, Transport } from "./Transport";
import { createCanvas } from "./graphics/Utils";
import { DisplayMessageEvent, MessageType } from "./graphics/layers/EventsDisplay";
import { v4 as uuidv4 } from 'uuid';
import { WorkerClient } from "../core/worker/WorkerClient";


export interface LobbyConfig {
    gameType: GameType
    playerName: () => string
    gameID: GameID
    ip: string | null
    map: GameMap | null
    difficulty: Difficulty | null
}

export function joinLobby(lobbyConfig: LobbyConfig, onjoin: () => void): () => void {
    const clientID = uuidv4()
    const playerID = uuidv4()
    const eventBus = new EventBus()
    const config = getConfig()

    let gameConfig: GameConfig = null
    if (lobbyConfig.gameType == GameType.Singleplayer) {
        gameConfig = {
            gameType: GameType.Singleplayer,
            gameMap: lobbyConfig.map,
            difficulty: lobbyConfig.difficulty,
        }
    }

    const transport = new Transport(
        lobbyConfig.gameType == GameType.Singleplayer,
        gameConfig,
        eventBus,
        lobbyConfig.gameID,
        lobbyConfig.ip,
        clientID,
        playerID,
        config,
        lobbyConfig.playerName
    )

    const onconnect = () => {
        console.log(`Joined game lobby ${lobbyConfig.gameID}`);
        transport.joinGame(0)
    };
    const onmessage = (message: ServerMessage) => {
        if (message.type == "start") {
            console.log('lobby: game started')
            onjoin()
            createClientGame(message.config, eventBus, transport, lobbyConfig.gameID, clientID).then(r => r.start())
        };
    }
    transport.connect(onconnect, onmessage)
    return () => {
        console.log('leaving game')
        transport.leaveGame()
    }
}


export async function createClientGame(gameConfig: GameConfig, eventBus: EventBus, transport: Transport, gameID: GameID, clientID: ClientID): Promise<GameRunner> {
    const config = getConfig()

    const terrainMap = await loadTerrainMap(gameConfig.gameMap);
    const miniMap = await createMiniMap(terrainMap);

    let game = createGame(terrainMap, miniMap, eventBus, config, gameConfig)

    const worker = new WorkerClient(game, gameConfig.gameMap)
    console.log('going to init path finder')
    await worker.initialize()
    console.log('inited path finder')
    const canvas = createCanvas()
    let gameRenderer = createRenderer(canvas, game, eventBus, clientID)


    console.log(`creating private game got difficulty: ${gameConfig.difficulty}`)

    return new GameRunner(
        clientID,
        eventBus,
        game,
        gameRenderer,
        new InputHandler(canvas, eventBus),
        new Executor(game, gameID, worker),
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
        private clientID: ClientID,
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
        if (this.gs.config().spawnNPCs()) {
            this.gs.addExecution(...this.executor.fakeHumanExecutions())
        }
        this.gs.addExecution(new WinCheckExecution(this.eventBus))

        this.intervalID = setInterval(() => this.tick(), 10);

        const onconnect = () => {
            console.log('Connected to game server!');
            this.transport.joinGame(this.turns.length)
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
                    this.transport.joinGame(0)
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
        try {
            this.gs.executeNextTick()
        } catch (error) {
            const errorText = `Error: ${error.message}\nStack: ${error.stack}`;
            alert("Game crashed!\n Please paste the following your bug report in Discord:\n" + errorText);
        }
        this.renderer.tick()
        this.currTurn++
        this.isProcessingTurn = false
    }

    private playerEvent(event: PlayerEvent) {
        console.log('received new player event!')
        if (event.player.clientID() == this.clientID) {
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
                    this.eventBus.emit(new SendAttackIntentEvent(targetID, this.myPlayer.troops() * this.renderer.uiState.attackRatio))
                }
            } else {
                outer_loop: for (const t of bfs(tile, and(t => !t.hasOwner() && t.isLand(), dist(tile, 200)))) {
                    for (const n of t.neighbors()) {
                        if (n.owner() == this.myPlayer) {
                            this.eventBus.emit(new SendAttackIntentEvent(targetID, this.myPlayer.troops() * this.renderer.uiState.attackRatio))
                            break outer_loop
                        }
                    }
                }
            }
        }
    }
}