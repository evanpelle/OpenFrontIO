import { z } from 'zod';
import { Difficulty, GameMap, GameType, PlayerType, UnitType } from './game/Game';

export type GameID = string
export type ClientID = string

export type Intent = SpawnIntent
    | AttackIntent
    | BoatAttackIntent
    | AllianceRequestIntent
    | AllianceRequestReplyIntent
    | BreakAllianceIntent
    | TargetPlayerIntent
    | EmojiIntent
    | ChatIntent
    | DonateIntent
    | TargetTroopRatioIntent
    | BuildUnitIntent

export type AttackIntent = z.infer<typeof AttackIntentSchema>
export type SpawnIntent = z.infer<typeof SpawnIntentSchema>
export type BoatAttackIntent = z.infer<typeof BoatAttackIntentSchema>
export type AllianceRequestIntent = z.infer<typeof AllianceRequestIntentSchema>
export type AllianceRequestReplyIntent = z.infer<typeof AllianceRequestReplyIntentSchema>
export type BreakAllianceIntent = z.infer<typeof BreakAllianceIntentSchema>
export type TargetPlayerIntent = z.infer<typeof TargetPlayerIntentSchema>
export type EmojiIntent = z.infer<typeof EmojiIntentSchema>
export type ChatIntent = z.infer<typeof ChatIntentSchema>
export type DonateIntent = z.infer<typeof DonateIntentSchema>
export type TargetTroopRatioIntent = z.infer<typeof TargetTroopRatioIntentSchema>
export type BuildUnitIntent = z.infer<typeof BuildUnitIntentSchema>

export type Turn = z.infer<typeof TurnSchema>
export type GameConfig = z.infer<typeof GameConfigSchema>

export type ClientMessage = ClientPingMessage | ClientIntentMessage | ClientJoinMessage
export type ServerMessage = ServerSyncMessage | ServerStartGameMessage | ServerPingMessage

export type ServerSyncMessage = z.infer<typeof ServerTurnMessageSchema>
export type ServerStartGameMessage = z.infer<typeof ServerStartGameMessageSchema>
export type ServerPingMessage = z.infer<typeof ServerPingMessageSchema>

export type ClientPingMessage = z.infer<typeof ClientPingMessageSchema>
export type ClientIntentMessage = z.infer<typeof ClientIntentMessageSchema>
export type ClientJoinMessage = z.infer<typeof ClientJoinMessageSchema>

export type GameRecord = z.infer<typeof GameRecordSchema>

const PlayerTypeSchema = z.nativeEnum(PlayerType);

// TODO: create Cell schema

export interface Lobby {
    id: string;
    msUntilStart?: number;
    numClients?: number;
}

const GameConfigSchema = z.object({
    gameMap: z.nativeEnum(GameMap),
    difficulty: z.nativeEnum(Difficulty),
    gameType: z.nativeEnum(GameType)
})

const EmojiSchema = z.string().refine(
    (val) => {
        return /\p{Emoji}/u.test(val);
    },
    {
        message: "Must contain at least one emoji character"
    }
);
const ChatSchema = z.string().refine(
    (val) => {
        return val.length > 0;
        // Can add a regex test here.
    },
    {
        message: "Must contain at least one character"
    }
);


// Zod schemas
const BaseIntentSchema = z.object({
    type: z.enum(['attack', 'spawn', 'boat', 'name', 'targetPlayer', 'emoji', 'chat', 'troop_ratio', 'build_unit']),
    clientID: z.string(),
});

export const AttackIntentSchema = BaseIntentSchema.extend({
    type: z.literal('attack'),
    attackerID: z.string(),
    targetID: z.string().nullable(),
    troops: z.number().nullable(),
    sourceX: z.number().nullable(),
    sourceY: z.number().nullable(),
    targetX: z.number().nullable(),
    targetY: z.number().nullable()
});

export const SpawnIntentSchema = BaseIntentSchema.extend({
    type: z.literal('spawn'),
    playerID: z.string(),
    name: z.string(),
    playerType: PlayerTypeSchema,
    x: z.number(),
    y: z.number(),
})

export const BoatAttackIntentSchema = BaseIntentSchema.extend({
    type: z.literal('boat'),
    attackerID: z.string(),
    targetID: z.string().nullable(),
    troops: z.number().nullable(),
    x: z.number(),
    y: z.number(),
})

export const UpdateNameIntentSchema = BaseIntentSchema.extend({
    type: z.literal('updateName'),
    name: z.string(),
})

export const AllianceRequestIntentSchema = BaseIntentSchema.extend({
    type: z.literal('allianceRequest'),
    requestor: z.string(),
    recipient: z.string(),
})

export const AllianceRequestReplyIntentSchema = BaseIntentSchema.extend({
    type: z.literal('allianceRequestReply'),
    requestor: z.string(), // The one who made the original alliance request
    recipient: z.string(),
    accept: z.boolean(),
})

export const BreakAllianceIntentSchema = BaseIntentSchema.extend({
    type: z.literal('breakAlliance'),
    requestor: z.string(), // The one who made the original alliance request
    recipient: z.string(),
})

export const TargetPlayerIntentSchema = BaseIntentSchema.extend({
    type: z.literal('targetPlayer'),
    requestor: z.string(),
    target: z.string(),
})

export const EmojiIntentSchema = BaseIntentSchema.extend({
    type: z.literal('emoji'),
    sender: z.string(),
    recipient: z.string(),
    emoji: EmojiSchema,
})
export const ChatIntentSchema = BaseIntentSchema.extend({
    type: z.literal('chat'),
    sender: z.string(),
    recipient: z.string(),
    chat: ChatSchema,
})

export const DonateIntentSchema = BaseIntentSchema.extend({
    type: z.literal('donate'),
    sender: z.string(),
    recipient: z.string(),
    troops: z.number().nullable(),
})

export const TargetTroopRatioIntentSchema = BaseIntentSchema.extend({
    type: z.literal('troop_ratio'),
    player: z.string(),
    ratio: z.number().min(0).max(1),
})

export const BuildUnitIntentSchema = BaseIntentSchema.extend({
    type: z.literal('build_unit'),
    player: z.string(),
    unit: z.nativeEnum(UnitType),
    x: z.number(),
    y: z.number(),
})

const IntentSchema = z.union([
    AttackIntentSchema,
    SpawnIntentSchema,
    BoatAttackIntentSchema,
    AllianceRequestIntentSchema,
    AllianceRequestReplyIntentSchema,
    BreakAllianceIntentSchema,
    TargetPlayerIntentSchema,
    EmojiIntentSchema,
    ChatIntentSchema,
    DonateIntentSchema,
    TargetTroopRatioIntentSchema,
    BuildUnitIntentSchema,
]);

export const TurnSchema = z.object({
    turnNumber: z.number(),
    gameID: z.string(),
    intents: z.array(IntentSchema)
})

// Server

const ServerBaseMessageSchema = z.object({
    type: z.string()
})

export const ServerTurnMessageSchema = ServerBaseMessageSchema.extend({
    type: z.literal('turn'),
    turn: TurnSchema,
})

export const ServerPingMessageSchema = ServerBaseMessageSchema.extend({
    type: z.literal('ping')
})

export const ServerStartGameMessageSchema = ServerBaseMessageSchema.extend({
    type: z.literal('start'),
    // Turns the client missed if they are late to the game.
    turns: z.array(TurnSchema),
    config: GameConfigSchema
})


export const ServerMessageSchema = z.union([ServerTurnMessageSchema, ServerStartGameMessageSchema, ServerPingMessageSchema]);


// Client

const ClientBaseMessageSchema = z.object({
    type: z.string(),
    clientID: z.string(),
    gameID: z.string(),
})

export const ClientPingMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('ping'),
})

export const ClientIntentMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('intent'),
    intent: IntentSchema
})

export const ClientJoinMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('join'),
    clientIP: z.string().nullable(),
    lastTurn: z.number() // The last turn the client saw.
})

export const ClientMessageSchema = z.union([ClientPingMessageSchema, ClientIntentMessageSchema, ClientJoinMessageSchema]);

export const GameRecordSchema = z.object({
    id: z.string(),
    gameConfig: GameConfigSchema,
    startTimestampMS: z.number(),
    endTimestampMS: z.number(),
    durationSeconds: z.number(),
    date: z.string(),
    usernames: z.array(z.string()),
    num_turns: z.number(),
    turns: z.array(TurnSchema)
})