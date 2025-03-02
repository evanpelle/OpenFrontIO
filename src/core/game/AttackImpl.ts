import { Attack, Player, TerraNullius } from "./Game";
import { TileRef } from "./GameMap";
import { PlayerImpl } from "./PlayerImpl";

export class AttackImpl implements Attack {
  private _isActive = true;

  constructor(
    private _target: Player | TerraNullius,
    private _attacker: Player,
    private _troops: number,
    private _sourceTile: TileRef | null,
  ) {}

  sourceTile(): TileRef | null {
    return this._sourceTile;
  }

  target(): Player | TerraNullius {
    return this._target;
  }
  attacker(): Player {
    return this._attacker;
  }
  troops(): number {
    return this._troops;
  }
  setTroops(troops: number) {
    this._troops = troops;
  }

  isActive() {
    return this._isActive;
  }

  delete() {
    if (this._target.isPlayer()) {
      (this._target as PlayerImpl)._incomingAttacks = (
        this._target as PlayerImpl
      )._incomingAttacks.filter((a) => a != this);
    }

    (this._attacker as PlayerImpl)._outgoingAttacks = (
      this._attacker as PlayerImpl
    )._outgoingAttacks.filter((a) => a != this);

    this._isActive = false;
  }
}
