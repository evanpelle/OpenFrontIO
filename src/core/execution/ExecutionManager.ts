import { Cell, Execution, MutableGame, Game, MutablePlayer, PlayerInfo, TerraNullius, Tile, PlayerType, Alliance, AllianceRequestReplyEvent, Difficulty, UnitType } from "../game/Game";
import { AttackIntent, BoatAttackIntentSchema, GameID, Intent, Turn } from "../Schemas";
import { AttackExecution } from "./AttackExecution";
import { SpawnExecution } from "./SpawnExecution";
import { BotSpawner } from "./BotSpawner";
import { TransportShipExecution } from "./TransportShipExecution";
import { PseudoRandom } from "../PseudoRandom";
import { FakeHumanExecution } from "./FakeHumanExecution";
import { processName, sanitize, simpleHash } from "../Util";
import { AllianceRequestExecution } from "./alliance/AllianceRequestExecution";
import { AllianceRequestReplyExecution } from "./alliance/AllianceRequestReplyExecution";
import { BreakAllianceExecution } from "./alliance/BreakAllianceExecution";
import { TargetPlayerExecution } from "./TargetPlayerExecution";
import { EmojiExecution } from "./EmojiExecution";
import { DonateExecution } from "./DonateExecution";
import { NukeExecution } from "./NukeExecution";
import { SetTargetTroopRatioExecution } from "./SetTargetTroopRatioExecution";
import { DestroyerExecution } from "./DestroyerExecution";
import { PortExecution } from "./PortExecution";
import { MissileSiloExecution } from "./MissileSiloExecution";
import { BattleshipExecution } from "./BattleshipExecution";
import { PathFinder } from "../pathfinding/PathFinding";
import { WorkerClient } from "../worker/WorkerClient";
import { DefensePostExecution } from "./DefensePostExecution";
import { CityExecution } from "./CityExecution";



export class Executor {


    // private random = new PseudoRandom(999)
    private random: PseudoRandom = null

    constructor(private gs: Game, private gameID: GameID, private workerClient: WorkerClient) {
        // Add one to avoid id collisions with bots.
        this.random = new PseudoRandom(simpleHash(gameID) + 1)
    }

    createExecs(turn: Turn): Execution[] {
        return turn.intents.map(i => this.createExec(i))
    }

    createExec(intent: Intent): Execution {
        switch (intent.type) {
            case "attack": {
                const source: Cell | null = intent.sourceX != null && intent.sourceY != null
                    ? new Cell(intent.sourceX, intent.sourceY)
                    : null;
                const target: Cell | null = intent.targetX != null && intent.targetY != null
                    ? new Cell(intent.targetX, intent.targetY)
                    : null;
                return new AttackExecution(
                    intent.troops,
                    intent.attackerID,
                    intent.targetID,
                    source,
                    target,
                );
            }
            case "spawn":
                return new SpawnExecution(
                    new PlayerInfo(sanitize(intent.name), intent.playerType, intent.clientID, intent.playerID),
                    new Cell(intent.x, intent.y)
                );
            case "boat":
                return new TransportShipExecution(
                    intent.attackerID,
                    intent.targetID,
                    new Cell(intent.x, intent.y),
                    intent.troops
                );
            case "allianceRequest":
                return new AllianceRequestExecution(intent.requestor, intent.recipient);
            case "allianceRequestReply":
                return new AllianceRequestReplyExecution(intent.requestor, intent.recipient, intent.accept);
            case "breakAlliance":
                return new BreakAllianceExecution(intent.requestor, intent.recipient);
            case "targetPlayer":
                return new TargetPlayerExecution(intent.requestor, intent.target);
            case "emoji":
                return new EmojiExecution(intent.sender, intent.recipient, intent.emoji);
            case "donate":
                return new DonateExecution(intent.sender, intent.recipient, intent.troops);
            case "troop_ratio":
                return new SetTargetTroopRatioExecution(intent.player, intent.ratio);
            case "build_unit":
                switch (intent.unit) {
                    case UnitType.AtomBomb:
                    case UnitType.HydrogenBomb:
                        return new NukeExecution(intent.unit, intent.player, new Cell(intent.x, intent.y))
                    case UnitType.Destroyer:
                        return new DestroyerExecution(intent.player, new Cell(intent.x, intent.y))
                    case UnitType.Battleship:
                        return new BattleshipExecution(intent.player, new Cell(intent.x, intent.y))
                    case UnitType.Port:
                        return new PortExecution(intent.player, new Cell(intent.x, intent.y), this.workerClient)
                    case UnitType.MissileSilo:
                        return new MissileSiloExecution(intent.player, new Cell(intent.x, intent.y))
                    case UnitType.DefensePost:
                        return new DefensePostExecution(intent.player, new Cell(intent.x, intent.y))
                    case UnitType.City:
                        return new CityExecution(intent.player, new Cell(intent.x, intent.y))
                    default:
                        throw Error(`unit type ${intent.unit} not supported`)
                }
            default:
                throw new Error(`intent type ${intent} not found`);
        }
    }

    spawnBots(numBots: number): Execution[] {
        return new BotSpawner(this.gs, this.gameID).spawnBots(numBots).map(i => this.createExec(i))
    }

    fakeHumanExecutions(): Execution[] {
        const execs = []
        for (const nation of this.gs.nations()) {
            execs.push(new FakeHumanExecution(
                this.workerClient,
                new PlayerInfo(
                    nation.name,
                    PlayerType.FakeHuman,
                    null,
                    this.random.nextID()
                ),
                nation.cell,
                nation.strength * this.gs.config().difficultyModifier(this.gs.gameConfig().difficulty)
            ))
        }
        return execs
    }

}