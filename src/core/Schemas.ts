import {z} from 'zod';
import {GameMap, PlayerType} from './game/Game';

export type GameID = string
export type ClientID = string

export type Intent = SpawnIntent
    | AttackIntent
    | BoatAttackIntent
    | UpdateNameIntent
    | AllianceRequestIntent
    | AllianceRequestReplyIntent
    | BreakAllianceIntent
    | TargetPlayerIntent
    | EmojiIntent
    | DonateIntent
    | NukeIntent

export type AttackIntent = z.infer<typeof AttackIntentSchema>
export type SpawnIntent = z.infer<typeof SpawnIntentSchema>
export type BoatAttackIntent = z.infer<typeof BoatAttackIntentSchema>
export type UpdateNameIntent = z.infer<typeof UpdateNameIntentSchema>
export type AllianceRequestIntent = z.infer<typeof AllianceRequestIntentSchema>
export type AllianceRequestReplyIntent = z.infer<typeof AllianceRequestReplyIntentSchema>
export type BreakAllianceIntent = z.infer<typeof BreakAllianceIntentSchema>
export type TargetPlayerIntent = z.infer<typeof TargetPlayerIntentSchema>
export type EmojiIntent = z.infer<typeof EmojiIntentSchema>
export type DonateIntent = z.infer<typeof DonateIntentSchema>
export type NukeIntent = z.infer<typeof NukeIntentSchema>

export type Turn = z.infer<typeof TurnSchema>
export type GameConfig = z.infer<typeof GameConfigSchema>

export type ClientMessage = ClientIntentMessage | ClientJoinMessage | ClientLeaveMessage
export type ServerMessage = ServerSyncMessage | ServerStartGameMessage

export type ServerSyncMessage = z.infer<typeof ServerTurnMessageSchema>
export type ServerStartGameMessage = z.infer<typeof ServerStartGameMessageSchema>


export type ClientIntentMessage = z.infer<typeof ClientIntentMessageSchema>
export type ClientJoinMessage = z.infer<typeof ClientJoinMessageSchema>
export type ClientLeaveMessage = z.infer<typeof ClientLeaveMessageSchema>

const PlayerTypeSchema = z.nativeEnum(PlayerType);

// TODO: create Cell schema

export interface Lobby {
    id: string;
    msUntilStart?: number;
    numClients?: number;
}

const GameConfigSchema = z.object({
    gameMap: z.nativeEnum(GameMap)
})

const EmojiSchema = z.string().refine(
    (val) => {
        return /\p{Emoji}/u.test(val);
    },
    {
        message: "Must contain at least one emoji character"
    }
);
// Zod schemas
const BaseIntentSchema = z.object({
    type: z.enum(['attack', 'spawn', 'boat', 'name', 'targetPlayer', 'emoji']),
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

export const DonateIntentSchema = BaseIntentSchema.extend({
    type: z.literal('donate'),
    sender: z.string(),
    recipient: z.string(),
    troops: z.number().nullable(),
})

export const NukeIntentSchema = BaseIntentSchema.extend({
    type: z.literal('nuke'),
    sender: z.string(),
    x: z.number(),
    y: z.number(),
    magnitude: z.number().nullable(),
})

const IntentSchema = z.union([
    AttackIntentSchema,
    SpawnIntentSchema,
    BoatAttackIntentSchema,
    UpdateNameIntentSchema,
    AllianceRequestIntentSchema,
    AllianceRequestReplyIntentSchema,
    BreakAllianceIntentSchema,
    TargetPlayerIntentSchema,
    EmojiIntentSchema,
    DonateIntentSchema,
    NukeIntentSchema,
]);

const TurnSchema = z.object({
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

export const ServerStartGameMessageSchema = ServerBaseMessageSchema.extend({
    type: z.literal('start'),
    // Turns the client missed if they are late to the game.
    turns: z.array(TurnSchema),
    config: GameConfigSchema
})


export const ServerMessageSchema = z.union([ServerTurnMessageSchema, ServerStartGameMessageSchema]);


// Client

const ClientBaseMessageSchema = z.object({
    type: z.string()
})

export const ClientIntentMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('intent'),
    clientID: z.string(),
    gameID: z.string(),
    intent: IntentSchema
})

export const ClientJoinMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('join'),
    clientID: z.string(),
    clientIP: z.string().nullable(),
    gameID: z.string(),
    lastTurn: z.number() // The last turn the client saw.
})

export const ClientLeaveMessageSchema = ClientBaseMessageSchema.extend({
    type: z.literal('leave'),
    clientID: z.string(),
    gameID: z.string(),
})

export const ClientMessageSchema = z.union([ClientIntentMessageSchema, ClientJoinMessageSchema, ClientLeaveMessageSchema]);