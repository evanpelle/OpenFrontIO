import { ClientID } from "../Schemas";
import { TerraNullius, Cell, PlayerID } from "./Game";
import { GameImpl } from "./GameImpl";
import { TileRef } from "./GameMap";

export class TerraNulliusImpl implements TerraNullius {
  constructor() {}
  smallID(): number {
    return 0;
  }
  clientID(): ClientID {
    return "TERRA_NULLIUS_CLIENT_ID";
  }

  id(): PlayerID {
    return null;
  }

  isPlayer(): false {
    return false as const;
  }
}
