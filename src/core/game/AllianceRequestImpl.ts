import { AllianceRequest, Player, Tick } from "./Game";
import { AllianceRequestUpdate } from "./GameUpdates";
import { GameUpdateType } from "./GameUpdates";
import { GameImpl } from "./GameImpl";

export class AllianceRequestImpl implements AllianceRequest {
  constructor(
    private requestor_: Player,
    private recipient_: Player,
    private tickCreated: number,
    private game: GameImpl,
  ) {}

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }

  createdAt(): Tick {
    return this.tickCreated;
  }

  accept(): void {
    this.game.acceptAllianceRequest(this);
  }
  reject(): void {
    this.game.rejectAllianceRequest(this);
  }

  toUpdate(): AllianceRequestUpdate {
    return {
      type: GameUpdateType.AllianceRequest,
      requestorID: this.requestor_.smallID(),
      recipientID: this.recipient_.smallID(),
      createdAt: this.tickCreated,
    };
  }
}
