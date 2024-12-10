import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { EventBus, GameEvent } from "../../../core/EventBus";
import {
  AllianceExpiredEvent,
  AllianceRequestEvent,
  AllianceRequestReplyEvent,
  AllPlayers,
  BrokeAllianceEvent,
  EmojiMessageEvent,
  Game,
  Player,
  PlayerID,
  TargetPlayerEvent,
  UnitEvent
} from "../../../core/game/Game";
import { ClientID } from "../../../core/Schemas";
import { Layer } from "./Layer";
import { SendAllianceReplyIntentEvent } from "../../Transport";
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { onlyImages, sanitize } from '../../../core/Util';

export enum MessageType {
  SUCCESS,
  INFO,
  WARN,
  ERROR,
}

export class DisplayMessageEvent implements GameEvent {
  constructor(
    public readonly message: string,
    public readonly type: MessageType,
    public readonly playerID: PlayerID | null = null
  ) { }
}

interface Event {
  description: string;
  unsafeDescription?: boolean
  buttons?: {
    text: string;
    className: string;
    action: () => void;
  }[];
  type: MessageType;
  highlight?: boolean;
  createdAt: number;
  onDelete?: () => void;
}

@customElement('events-display')
export class EventsDisplay extends LitElement implements Layer {
  public eventBus: EventBus;
  public game: Game;
  public clientID: ClientID;

  private events: Event[] = [];

  static styles = css`
    :host {
      display: block;
      position: fixed;
      bottom: 10px;
      right: 10px;
      z-index: 1000;
      max-width: 400px;
    }

    .events-table {
      width: 100%;
      border-collapse: collapse;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
      font-size: 1.2em;
    }

    .events-table th,
    .events-table td {
      padding: 15px;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.0);
      z-index: 1000;
    }

    .events-table th {
      background-color: rgba(0, 0, 0, 0.0);
      font-size: 1.2em;
      text-transform: uppercase;
    }

    .events-table tr:hover {
      background-color: rgba(255, 255, 255, 0.0);
    }

    .btn {
      display: inline-block;
      padding: 8px 16px;
      margin: 5px 10px 5px 0;
      background-color: #4CAF50;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      transition: background-color 0.3s;
      border: none;
      cursor: pointer;
    }

    .btn:hover {
      background-color: #45a049;
    }

    .btn-info {
      background-color: #2196F3;
    }

    .btn-info:hover {
      background-color: #0b7dda;
    }

    .success td { color: rgb(120, 255, 140); }
    .info td { color: rgb(230, 230, 230); }
    .warn td { color: rgb(255, 220, 80) }
    .error td { color: rgb(255, 100, 100); }

    .button-container {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    @media (max-width: 600px) {
      :host {
        bottom: auto;
        top: 10px;
        right: 10px;
        left: 10px;
        max-width: calc(100% - 20px);
      }

      .events-table th,
      .events-table td {
        padding: 10px;
      }
      
      .btn {
        display: block;
        margin: 5px 0;
        width: 100%;
      }

      .button-container {
        flex-direction: column;
      }
    }
  `;

  constructor() {
    super();
    this.events = [];
  }

  init() {
    this.eventBus.on(AllianceRequestEvent, a => this.onAllianceRequestEvent(a));
    this.eventBus.on(AllianceRequestReplyEvent, a => this.onAllianceRequestReplyEvent(a));
    this.eventBus.on(DisplayMessageEvent, e => this.onDisplayMessageEvent(e));
    this.eventBus.on(BrokeAllianceEvent, e => this.onBrokeAllianceEvent(e));
    this.eventBus.on(AllianceExpiredEvent, e => this.onAllianceExpiredEvent(e));
    this.eventBus.on(TargetPlayerEvent, e => this.onTargetPlayerEvent(e));
    this.eventBus.on(EmojiMessageEvent, e => this.onEmojiMessageEvent(e));
  }

  tick() {
    let remainingEvents = this.events.filter(event => {
      const shouldKeep = this.game.ticks() - event.createdAt < 50;
      if (!shouldKeep && event.onDelete) {
        event.onDelete();
      }
      return shouldKeep;
    });

    if (remainingEvents.length > 5) {
      remainingEvents = remainingEvents.slice(-5);
    }

    if (this.events.length !== remainingEvents.length) {
      this.events = remainingEvents;
      this.requestUpdate()
    }
  }

  private addEvent(event: Event) {
    this.events = [...this.events, event];
    this.requestUpdate()
  }

  private removeEvent(index: number) {
    this.events = [
      ...this.events.slice(0, index),
      ...this.events.slice(index + 1)
    ];
  }

  shouldTransform(): boolean {
    return false;
  }

  renderLayer(): void { }

  onDisplayMessageEvent(event: DisplayMessageEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (event.playerID != null && (!myPlayer || myPlayer.id() !== event.playerID)) {
      return;
    }

    this.addEvent({
      description: event.message,
      createdAt: this.game.ticks(),
      highlight: true,
      type: event.type,
      unsafeDescription: true,
    });
  }

  onAllianceRequestEvent(event: AllianceRequestEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || event.allianceRequest.recipient() !== myPlayer) {
      return;
    }

    this.addEvent({
      description: `${event.allianceRequest.requestor().name()} requests an alliance!`,
      buttons: [
        {
          text: "Accept",
          className: "btn",
          action: () => this.eventBus.emit(new SendAllianceReplyIntentEvent(event.allianceRequest, true)),
        },
        {
          text: "Reject",
          className: "btn btn-info",
          action: () => this.eventBus.emit(new SendAllianceReplyIntentEvent(event.allianceRequest, false)),
        }
      ],
      highlight: true,
      type: MessageType.INFO,
      createdAt: this.game.ticks(),
      onDelete: () => this.eventBus.emit(new SendAllianceReplyIntentEvent(event.allianceRequest, false))
    });
  }

  onAllianceRequestReplyEvent(event: AllianceRequestReplyEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || event.allianceRequest.requestor() !== myPlayer) {
      return;
    }

    this.addEvent({
      description: `${event.allianceRequest.recipient().name()} ${event.accepted ? "accepted" : "rejected"} your alliance request`,
      type: event.accepted ? MessageType.SUCCESS : MessageType.ERROR,
      highlight: true,
      createdAt: this.game.ticks(),
    });
  }

  onBrokeAllianceEvent(event: BrokeAllianceEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    if (!event.betrayed.isTraitor() && event.traitor === myPlayer) {
      this.addEvent({
        description: `You broke your alliance with ${event.betrayed.name()}, making you a TRAITOR`,
        type: MessageType.ERROR,
        highlight: true,
        createdAt: this.game.ticks(),
      });
    } else if (event.betrayed === myPlayer) {
      this.addEvent({
        description: `${event.traitor.name()}, broke their alliance with you`,
        type: MessageType.ERROR,
        highlight: true,
        createdAt: this.game.ticks(),
      });
    }
  }

  onAllianceExpiredEvent(event: AllianceExpiredEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    const other = event.player1 === myPlayer ? event.player2 : event.player2 === myPlayer ? event.player1 : null;
    if (!other || !myPlayer.isAlive() || !other.isAlive()) return;

    this.addEvent({
      description: `Your alliance with ${other.name()} expired`,
      type: MessageType.WARN,
      highlight: true,
      createdAt: this.game.ticks(),
    });
  }

  onTargetPlayerEvent(event: TargetPlayerEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer || !myPlayer.isAlliedWith(event.player)) return;

    this.addEvent({
      description: `${event.player.name()} requests you attack ${event.target.name()}`,
      type: MessageType.INFO,
      highlight: true,
      createdAt: this.game.ticks(),
    });
  }

  onEmojiMessageEvent(event: EmojiMessageEvent) {
    const myPlayer = this.game.playerByClientID(this.clientID);
    if (!myPlayer) return;

    if (event.message.recipient === myPlayer) {
      this.addEvent({
        description: `${event.message.sender.displayName()}:${event.message.emoji}`,
        type: MessageType.INFO,
        highlight: true,
        createdAt: this.game.ticks(),
      });
    } else if (event.message.sender === myPlayer && event.message.recipient !== AllPlayers) {
      this.addEvent({
        description: `Sent ${event.message.recipient.displayName()}: ${event.message.emoji}`,
        unsafeDescription: true,
        type: MessageType.INFO,
        highlight: true,
        createdAt: this.game.ticks(),
      });
    }
  }

  render() {
    if (this.events.length === 0) {
      return html``;
    }

    return html`
      <table class="events-table">
        <tbody>
          ${this.events.map((event, index) => html`
            <tr class="${event.highlight ? 'highlight' : ''} ${MessageType[event.type].toLowerCase()}">
              <td>
                ${event.unsafeDescription ? unsafeHTML(onlyImages(event.description)) : event.description}
                ${event.buttons ? html`
                  <div class="button-container">
                    ${event.buttons.map(btn => html`
                      <button 
                        class="${btn.className}"
                        @click=${() => {
        btn.action();
        this.removeEvent(index);
        this.requestUpdate()
      }}
                      >
                        ${btn.text}
                      </button>
                    `)}
                  </div>
                ` : ''}
              </td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }
}