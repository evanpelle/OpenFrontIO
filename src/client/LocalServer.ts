import { Config } from "../core/configuration/Config";
import { ClientMessage, ClientMessageSchema, GameConfig, GameID, GameRecordSchema, Intent, ServerMessage, ServerStartGameMessageSchema, ServerTurnMessageSchema, Turn } from "../core/Schemas";
import { CreateGameRecord, generateGameID } from "../core/Util";

export class LocalServer {


    private turns: Turn[] = []
    private intents: Intent[] = []
    private startedAt: number

    private endTurnIntervalID

    private gameID: GameID

    constructor(private config: Config, private gameConfig: GameConfig, private clientConnect: () => void, private clientMessage: (message: ServerMessage) => void) {
        this.gameID = generateGameID()
    }

    start() {
        this.startedAt = Date.now()
        this.endTurnIntervalID = setInterval(() => this.endTurn(), this.config.turnIntervalMs());
        this.clientConnect()
        this.clientMessage(ServerStartGameMessageSchema.parse({
            type: "start",
            config: this.gameConfig,
            turns: [],
        }))
    }

    onMessage(message: string) {
        const clientMsg: ClientMessage = ClientMessageSchema.parse(JSON.parse(message))
        if (clientMsg.type == "intent") {
            this.intents.push(clientMsg.intent)
        }
    }

    private endTurn() {
        const pastTurn: Turn = {
            turnNumber: this.turns.length,
            gameID: this.gameID,
            intents: this.intents
        }
        this.turns.push(pastTurn)
        this.intents = []
        this.clientMessage({
            type: "turn",
            turn: pastTurn
        })
    }

    public endGame() {
        console.log('local server ending game')
        clearInterval(this.endTurnIntervalID)
        const record = CreateGameRecord(this.gameID, this.gameConfig, this.turns, this.startedAt, Date.now())
        // Clear turns because beacon only supports up to 64kb
        record.turns = []
        // For unload events, sendBeacon is the only reliable method
        const blob = new Blob([JSON.stringify(GameRecordSchema.parse(record))], {
            type: 'application/json'
        });
        navigator.sendBeacon('/archive_singleplayer_game', blob);
    }
}