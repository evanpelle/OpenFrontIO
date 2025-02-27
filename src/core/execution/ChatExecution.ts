import {AllPlayers, Execution, MutableGame, MutablePlayer, PlayerID} from "../game/Game";

export class ChatExecution implements Execution {

    private requestor: MutablePlayer
    private recipient: MutablePlayer | typeof AllPlayers

    private active = true

    constructor(
        private senderID: PlayerID,
        private recipientID: PlayerID | typeof AllPlayers,
        private message: string
    ) { }


    init(mg: MutableGame, ticks: number): void {
        this.requestor = mg.player(this.senderID)
        this.recipient = this.recipientID == AllPlayers ? AllPlayers : mg.player(this.recipientID)
    }

    tick(ticks: number): void {
        if (this.requestor.canSendChat(this.recipient)) {
            this.requestor.sendChat(this.recipient, this.message)
        } else {
            console.warn(`cannot send message from ${this.requestor} to ${this.recipient}`)
        }
        this.active = false
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